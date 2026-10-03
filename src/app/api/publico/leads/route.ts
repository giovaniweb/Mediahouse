import { NextRequest, NextResponse } from "next/server"
import { randomUUID } from "node:crypto"
import { z } from "zod"
import { prismaBase } from "@/lib/prisma"
import { consumirLimitePublico, hashDoIp } from "@/lib/limite-publico"

// POST /api/publico/leads — formulário de interesse da landing (/comecar).
//
// Contato da PLATAFORMA, não de uma empresa: quem preenche ainda não é cliente
// de ninguém. A rota só insere — sem RETURNING e sem SELECT — porque o role
// público tem INSERT e nunca leitura da lista (migration 20260929095000).
const schema = z.object({
  nome: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  telefone: z.string().trim().min(10).max(30),
  empresa: z.string().trim().min(2).max(160),
  mensagem: z.string().trim().max(1500).optional(),
  origem: z.string().max(150).optional(),
  campanha: z.string().max(150).optional(),
  consentimento: z.literal(true),
  // Armadilha para robô: campo escondido que pessoa não preenche.
  website: z.string().max(200).optional(),
})

export async function POST(req: NextRequest) {
  if (Number(req.headers.get("content-length")) > 12000) {
    return NextResponse.json({ error: "Formulário muito longo." }, { status: 413 })
  }
  // Limite no banco: 5 envios a cada 15 minutos por IP. Sem segredo para o
  // HMAC, todo mundo divide o mesmo balde — mais restritivo, nunca menos.
  const ipHash = hashDoIp(req.headers)
  if (!(await consumirLimitePublico(`lead:${ipHash ?? "desconhecido"}`, 5, 15 * 60))) {
    return NextResponse.json({ error: "Muitas tentativas. Aguarde alguns minutos." }, { status: 429 })
  }
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Confira os campos e autorize o contato para continuar." }, { status: 400 })
  }
  const d = parsed.data
  if (d.website) return NextResponse.json({ ok: true }, { status: 201 })
  await prismaBase.$executeRaw`
    INSERT INTO leads_comerciais (id, nome, email, telefone, empresa, mensagem, origem, campanha, ip_hash)
    VALUES (${randomUUID()}, ${d.nome}, ${d.email.toLowerCase()}, ${d.telefone}, ${d.empresa},
            ${d.mensagem || null}, ${d.origem || null}, ${d.campanha || null}, ${ipHash})`
  return NextResponse.json({ ok: true }, { status: 201 })
}

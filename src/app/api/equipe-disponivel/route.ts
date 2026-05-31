import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET /api/equipe-disponivel?papel=captacao|edicao
// Lista unificada e deduplicada de pessoas atribuíveis a um papel.
//   captacao → Videomakers + Editores(fazCaptacao) + Usuarios(social)
//   edicao   → Editores + Videomakers(podeEditar) + Usuarios(social)
// Cada opção: { value: token, label, subtitle, tipoContrato, origem }
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const papel = req.nextUrl.searchParams.get("papel") === "edicao" ? "edicao" : "captacao"

  type Opcao = {
    value: string
    label: string
    subtitle: string
    tipoContrato: string
    origem: "vm" | "ed" | "user"
    usuarioId: string | null
  }

  const opcoes: Opcao[] = []
  // Dedup: pessoas com usuarioId aparecem uma vez (fonte primária do papel primeiro)
  const usuariosVistos = new Set<string>()
  const nomesVistos = new Set<string>()

  function add(o: Opcao) {
    if (o.usuarioId) {
      if (usuariosVistos.has(o.usuarioId)) return
      usuariosVistos.add(o.usuarioId)
    } else {
      const key = o.label.trim().toLowerCase()
      if (nomesVistos.has(key)) return
      nomesVistos.add(key)
    }
    opcoes.push(o)
  }

  if (papel === "captacao") {
    // Fonte primária: Videomakers
    const vms = await prisma.videomaker.findMany({
      where: { status: { not: "inativo" }, emListaNegra: false },
      select: { id: true, nome: true, cidade: true, tipoContrato: true, usuarioId: true },
      orderBy: { nome: "asc" },
    })
    for (const v of vms) {
      add({
        value: `vm:${v.id}`,
        label: v.nome,
        subtitle: v.cidade ?? "",
        tipoContrato: v.tipoContrato,
        origem: "vm",
        usuarioId: v.usuarioId,
      })
    }
    // Editores que captam
    const eds = await prisma.editor.findMany({
      where: { fazCaptacao: true, status: "ativo" },
      select: { id: true, nome: true, cidade: true, tipoContrato: true, usuarioId: true },
      orderBy: { nome: "asc" },
    })
    for (const e of eds) {
      add({
        value: `ed:${e.id}`,
        label: e.nome,
        subtitle: e.cidade ?? "",
        tipoContrato: e.tipoContrato,
        origem: "ed",
        usuarioId: e.usuarioId,
      })
    }
  } else {
    // Fonte primária: Editores
    const eds = await prisma.editor.findMany({
      where: { status: "ativo" },
      select: { id: true, nome: true, especialidade: true, tipoContrato: true, usuarioId: true },
      orderBy: { nome: "asc" },
    })
    for (const e of eds) {
      add({
        value: `ed:${e.id}`,
        label: e.nome,
        subtitle: e.especialidade?.[0] ?? "",
        tipoContrato: e.tipoContrato,
        origem: "ed",
        usuarioId: e.usuarioId,
      })
    }
    // Videomakers que editam
    const vms = await prisma.videomaker.findMany({
      where: { podeEditar: true, status: { not: "inativo" } },
      select: { id: true, nome: true, cidade: true, tipoContrato: true, usuarioId: true },
      orderBy: { nome: "asc" },
    })
    for (const v of vms) {
      add({
        value: `vm:${v.id}`,
        label: v.nome,
        subtitle: v.cidade ?? "",
        tipoContrato: v.tipoContrato,
        origem: "vm",
        usuarioId: v.usuarioId,
      })
    }
  }

  // Usuários social (comuns aos dois papéis)
  const socials = await prisma.usuario.findMany({
    where: { tipo: "social", status: "ativo" },
    select: { id: true, nome: true },
    orderBy: { nome: "asc" },
  })
  for (const u of socials) {
    add({
      value: `user:${u.id}`,
      label: u.nome,
      subtitle: "Social media",
      tipoContrato: "interno",
      origem: "user",
      usuarioId: u.id,
    })
  }

  opcoes.sort((a, b) => a.label.localeCompare(b.label, "pt-BR"))
  return NextResponse.json({ opcoes })
}

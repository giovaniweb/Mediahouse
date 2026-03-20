/**
 * Script para criar contas de acesso (Usuario) para videomakers e editores já cadastrados
 * Uso: npx tsx scripts/criar-contas-profissionais.ts
 *
 * Senha padrão: nuflow + últimos 4 dígitos do telefone
 * Notifica via WhatsApp após criar a conta
 */

import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "@prisma/client"
import pg from "pg"
import bcrypt from "bcryptjs"
import dotenv from "dotenv"
import path from "path"

dotenv.config({ path: path.join(__dirname, "../.env.local") })

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool as any)
const prisma = new PrismaClient({ adapter } as any)

function gerarSenhaPadrao(telefone: string | null | undefined): string {
  if (!telefone) return "nuflow0000"
  const digits = telefone.replace(/\D/g, "")
  const last4 = digits.slice(-4) || "0000"
  return `nuflow${last4}`
}

function gerarEmailFallback(nome: string): string {
  const slug = nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
  return `${slug}@nuflow.local`
}

// WhatsApp send function (direct, without the app's whatsapp lib)
async function sendWhatsapp(telefone: string, mensagem: string) {
  const config = await prisma.configWhatsapp.findFirst({ where: { ativo: true } })
  if (!config) return false

  let numero = telefone.replace(/\D/g, "")
  if (numero.length === 10 || numero.length === 11) numero = "55" + numero

  try {
    const res = await fetch(`${config.instanceUrl}/message/sendText/${config.instanceId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: config.apiKey },
      body: JSON.stringify({
        number: numero,
        textMessage: { text: mensagem },
        options: { delay: 1200, presence: "composing" },
      }),
      signal: AbortSignal.timeout(15000),
    })
    return res.ok
  } catch {
    return false
  }
}

async function main() {
  console.log("🔄 Criando contas de acesso para profissionais existentes")
  console.log("─".repeat(60))

  // ─── Videomakers Externos ────────────────────────────────────
  const videomakers = await prisma.videomaker.findMany({
    where: { usuarioId: null }, // só os que ainda não têm conta
    select: { id: true, nome: true, email: true, telefone: true, status: true },
  })

  console.log(`\n📹 Videomakers externos sem conta: ${videomakers.length}`)

  let vmCriados = 0
  for (const vm of videomakers) {
    if (vm.status === "inativo") {
      console.log(`  ⏭️ ${vm.nome} — inativo, pulando`)
      continue
    }

    const emailLogin = vm.email || gerarEmailFallback(vm.nome)
    const senha = gerarSenhaPadrao(vm.telefone)
    const senhaHash = await bcrypt.hash(senha, 12)

    // Verificar se email já existe
    const existe = await prisma.usuario.findUnique({ where: { email: emailLogin } })
    if (existe) {
      // Vincular se não vinculado
      if (!existe.id) continue
      await (prisma.videomaker as any).update({
        where: { id: vm.id },
        data: { usuarioId: existe.id },
      })
      console.log(`  🔗 ${vm.nome} — vinculado a usuario existente (${emailLogin})`)
      continue
    }

    try {
      const usuario = await prisma.usuario.create({
        data: { nome: vm.nome, email: emailLogin, telefone: vm.telefone, tipo: "videomaker", senhaHash },
      })

      await (prisma.videomaker as any).update({
        where: { id: vm.id },
        data: { usuarioId: usuario.id },
      })

      // Criar permissões
      await prisma.permissaoUsuario.create({
        data: {
          usuarioId: usuario.id,
          verDashboard: true, verDemandas: true, verAgenda: true,
          verAprovacoes: false, verProdutos: false, verVideomakers: false,
          verEquipe: false, verCustos: false, verIA: false, verAlertas: false,
          verRelatorios: false, verUsuarios: false, verConfiguracoes: false, verIdeias: false,
          criarDemanda: false, editarDemanda: false, excluirDemanda: false,
          moverKanban: false, verTodasDemandas: false, verKanban: true,
          gerenciarUsuarios: false, gerenciarConfig: false,
        },
      })

      // Notificar via WhatsApp
      if (vm.telefone) {
        const msg =
          `Olá, ${vm.nome}! 👋\n\n` +
          `Seu acesso ao *NuFlow* foi criado:\n\n` +
          `🔗 *Link:* ${process.env.NEXTAUTH_URL || "https://nuflow.app"}/login\n` +
          `📧 *Login:* ${emailLogin}\n` +
          `🔑 *Senha:* ${senha}\n\n` +
          `Você também pode entrar usando seu número de telefone.\n\n` +
          `Recomendamos alterar sua senha no primeiro acesso. 🔒`

        const sent = await sendWhatsapp(vm.telefone, msg)
        console.log(`  ✅ ${vm.nome} — ${emailLogin} / ${senha} ${sent ? "📱 WhatsApp ✓" : "📱 WhatsApp ✗"}`)
      } else {
        console.log(`  ✅ ${vm.nome} — ${emailLogin} / ${senha} (sem telefone)`)
      }
      vmCriados++
    } catch (e: any) {
      console.log(`  ❌ ${vm.nome} — ${e.message?.slice(0, 60)}`)
    }
  }

  // ─── Editores (Videomakers Internos) ─────────────────────────
  const editores = await prisma.editor.findMany({
    where: { usuarioId: null },
    select: { id: true, nome: true, email: true, telefone: true, whatsapp: true, status: true },
  })

  console.log(`\n✂️ Editores (VM internos) sem conta: ${editores.length}`)

  let edCriados = 0
  for (const ed of editores) {
    if (ed.status === "inativo") {
      console.log(`  ⏭️ ${ed.nome} — inativo, pulando`)
      continue
    }

    const telefone = ed.whatsapp || ed.telefone
    const emailLogin = ed.email || gerarEmailFallback(ed.nome)
    const senha = gerarSenhaPadrao(telefone)
    const senhaHash = await bcrypt.hash(senha, 12)

    const existe = await prisma.usuario.findUnique({ where: { email: emailLogin } })
    if (existe) {
      await (prisma.editor as any).update({
        where: { id: ed.id },
        data: { usuarioId: existe.id },
      })
      console.log(`  🔗 ${ed.nome} — vinculado a usuario existente (${emailLogin})`)
      continue
    }

    try {
      const usuario = await prisma.usuario.create({
        data: { nome: ed.nome, email: emailLogin, telefone, tipo: "editor", senhaHash },
      })

      await (prisma.editor as any).update({
        where: { id: ed.id },
        data: { usuarioId: usuario.id },
      })

      // Criar permissões
      await prisma.permissaoUsuario.create({
        data: {
          usuarioId: usuario.id,
          verDashboard: true, verDemandas: true, verAgenda: true,
          verAprovacoes: false, verProdutos: false, verVideomakers: false,
          verEquipe: false, verCustos: false, verIA: false, verAlertas: false,
          verRelatorios: false, verUsuarios: false, verConfiguracoes: false, verIdeias: false,
          criarDemanda: false, editarDemanda: false, excluirDemanda: false,
          moverKanban: false, verTodasDemandas: false, verKanban: true,
          gerenciarUsuarios: false, gerenciarConfig: false,
        },
      })

      if (telefone) {
        const msg =
          `Olá, ${ed.nome}! 👋\n\n` +
          `Seu acesso ao *NuFlow* foi criado:\n\n` +
          `🔗 *Link:* ${process.env.NEXTAUTH_URL || "https://nuflow.app"}/login\n` +
          `📧 *Login:* ${emailLogin}\n` +
          `🔑 *Senha:* ${senha}\n\n` +
          `Você também pode entrar usando seu número de telefone.\n\n` +
          `Recomendamos alterar sua senha no primeiro acesso. 🔒`

        const sent = await sendWhatsapp(telefone, msg)
        console.log(`  ✅ ${ed.nome} — ${emailLogin} / ${senha} ${sent ? "📱 WhatsApp ✓" : "📱 WhatsApp ✗"}`)
      } else {
        console.log(`  ✅ ${ed.nome} — ${emailLogin} / ${senha} (sem telefone)`)
      }
      edCriados++
    } catch (e: any) {
      console.log(`  ❌ ${ed.nome} — ${e.message?.slice(0, 60)}`)
    }
  }

  console.log("\n" + "─".repeat(60))
  console.log(`✅ Videomakers: ${vmCriados} contas criadas`)
  console.log(`✅ Editores: ${edCriados} contas criadas`)
  console.log(`📊 Total: ${vmCriados + edCriados} novas contas`)

  await pool.end()
  process.exit(0)
}

main().catch((e) => {
  console.error("Fatal:", e)
  process.exit(1)
})

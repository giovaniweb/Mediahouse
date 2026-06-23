// S11 — cria uma SEGUNDA organização apenas de teste ("Empresa Teste") com dados
// isolados mínimos para validar o isolamento multiempresa ponta a ponta.
// Idempotente. NÃO é cliente real. Rodar da raiz:  node prisma/seed-org-teste.mjs
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import bcrypt from "bcryptjs"
import crypto from "crypto"
import dotenv from "dotenv"
dotenv.config({ path: ".env.local" })

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

const SLUG = "empresa-teste"
const EMAIL_ADMIN = "teste-admin@nuflow.local"

async function main() {
  // 1. Organização de teste
  let org = await prisma.organizacao.findUnique({ where: { slug: SLUG } })
  if (!org) {
    org = await prisma.organizacao.create({ data: { nome: "Empresa Teste", slug: SLUG } })
    console.log("✅ Org de teste criada:", org.id)
  } else {
    console.log("• Org de teste já existe:", org.id)
  }

  // 2. Usuário admin da org de teste (NÃO super-admin) + membership papel=admin.
  // Senha vem de TEST_ORG_ADMIN_PASSWORD; se ausente, gera aleatória forte.
  // A senha NUNCA é impressa nem persistida — só o hash bcrypt vai ao banco.
  const senhaEnv = process.env.TEST_ORG_ADMIN_PASSWORD
  const origemSenha = senhaEnv ? "TEST_ORG_ADMIN_PASSWORD" : "aleatória forte (não exibida)"
  let admin = await prisma.usuario.findUnique({ where: { email: EMAIL_ADMIN } })
  if (!admin) {
    let senha = senhaEnv || crypto.randomBytes(32).toString("base64url")
    const senhaHash = await bcrypt.hash(senha, 12)
    senha = ""
    admin = await prisma.usuario.create({
      data: { nome: "Admin Teste", email: EMAIL_ADMIN, tipo: "admin", senhaHash, superAdmin: false },
    })
    console.log(`✅ Usuário admin de teste criado: ${admin.id} (senha: ${origemSenha})`)
  } else {
    // Se a senha foi fornecida via env, atualiza o hash (rotação controlada).
    if (senhaEnv) {
      const senhaHash = await bcrypt.hash(senhaEnv, 12)
      await prisma.usuario.update({ where: { id: admin.id }, data: { senhaHash } })
      console.log(`• Usuário admin de teste já existe: ${admin.id} — senha atualizada via TEST_ORG_ADMIN_PASSWORD`)
    } else {
      console.log(`• Usuário admin de teste já existe: ${admin.id} — senha mantida (defina TEST_ORG_ADMIN_PASSWORD para rotacionar)`)
    }
  }
  await prisma.usuarioOrganizacao.upsert({
    where: { usuarioId_organizacaoId: { usuarioId: admin.id, organizacaoId: org.id } },
    update: { papel: "admin" },
    create: { usuarioId: admin.id, organizacaoId: org.id, papel: "admin" },
  })
  console.log("✅ Membership admin garantida na org de teste")

  // 3. Editor interno (org-scoped) — só deve existir para a org de teste
  let editor = await prisma.editor.findFirst({ where: { organizacaoId: org.id, nome: "[TESTE] Editor Interno" } })
  if (!editor) {
    editor = await prisma.editor.create({
      data: { organizacaoId: org.id, nome: "[TESTE] Editor Interno", status: "ativo", tipoContrato: "interno" },
    })
    console.log("✅ Editor de teste criado:", editor.id)
  } else {
    console.log("• Editor de teste já existe:", editor.id)
  }

  // 4. Demanda (org-scoped)
  let demanda = await prisma.demanda.findFirst({ where: { organizacaoId: org.id, codigo: "TST-0001" } })
  if (!demanda) {
    demanda = await prisma.demanda.create({
      data: {
        organizacaoId: org.id,
        codigo: "TST-0001",
        titulo: "[TESTE] Demanda da Empresa Teste",
        descricao: "Demanda isolada criada para validar o isolamento multiempresa.",
        departamento: "outros",
        tipoVideo: "outro",
        cidade: "N/A",
        prioridade: "normal",
        statusInterno: "aguardando_aprovacao_interna",
        statusVisivel: "entrada",
        solicitanteId: admin.id,
      },
    })
    console.log("✅ Demanda de teste criada:", demanda.id)
  } else {
    console.log("• Demanda de teste já existe:", demanda.id)
  }

  // 4b. Conteúdo de GROWTH (area="design" interno, departamento="growth") — org-scoped
  let growth = await prisma.demanda.findFirst({ where: { organizacaoId: org.id, codigo: "TST-GRW-001" } })
  if (!growth) {
    growth = await prisma.demanda.create({
      data: {
        organizacaoId: org.id,
        codigo: "TST-GRW-001",
        titulo: "[TESTE] Conteúdo Growth da Empresa Teste",
        descricao: "Conteúdo de Growth isolado para validar o módulo Growth multiempresa.",
        departamento: "growth",
        area: "design",
        tipoVideo: "post",
        cidade: "N/A",
        prioridade: "normal",
        statusInterno: "aguardando_triagem",
        statusVisivel: "entrada",
        solicitanteId: admin.id,
      },
    })
    console.log("✅ Conteúdo Growth de teste criado:", growth.id)
  } else {
    console.log("• Conteúdo Growth de teste já existe:", growth.id)
  }

  // 5. Cobertura (org-scoped)
  let cobertura = await prisma.eventoCobertura.findFirst({ where: { organizacaoId: org.id, titulo: "[TESTE] Cobertura Empresa Teste" } })
  if (!cobertura) {
    const agora = new Date()
    cobertura = await prisma.eventoCobertura.create({
      data: {
        organizacaoId: org.id,
        titulo: "[TESTE] Cobertura Empresa Teste",
        slug: `teste-cobertura-${Date.now().toString(36)}`,
        tipo: "outro",
        status: "planejamento",
        dataInicio: agora,
        dataFim: agora,
        totalDias: 1,
        createdById: admin.id,
      },
    })
    console.log("✅ Cobertura de teste criada:", cobertura.id)
  } else {
    console.log("• Cobertura de teste já existe:", cobertura.id)
  }

  // 6. Custo (org-scoped) vinculado a um videomaker GLOBAL existente (sem alterar o videomaker)
  const vm = await prisma.videomaker.findFirst({ select: { id: true, nome: true } })
  if (vm) {
    const jaCusto = await prisma.custoVideomaker.findFirst({ where: { organizacaoId: org.id, demandaId: demanda.id } })
    if (!jaCusto) {
      await prisma.custoVideomaker.create({
        data: {
          organizacaoId: org.id,
          videomakerId: vm.id,
          demandaId: demanda.id,
          tipo: "projeto",
          valor: 123.45,
          descricao: "[TESTE] Custo isolado da Empresa Teste",
          dataReferencia: new Date(),
          pago: false,
          statusPagamento: "pendente_nf",
        },
      })
      console.log(`✅ Custo de teste criado (videomaker global '${vm.nome}' reaproveitado, não alterado)`)
    } else {
      console.log("• Custo de teste já existe")
    }
  } else {
    console.log("• Nenhum videomaker global no banco — custo de teste pulado")
  }

  console.log("\n🏁 Seed da org de teste concluído. Org:", org.id, "| admin:", admin.id)
}

main()
  .catch((e) => { console.error("❌ Erro no seed:", e); process.exit(1) })
  .finally(() => prisma.$disconnect())

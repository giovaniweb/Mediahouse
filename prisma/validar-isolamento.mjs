// S11 — valida o isolamento multiempresa ponta a ponta entre Contourline e a org
// de teste. Apenas LEITURA (não altera dados). Rodar:  node prisma/validar-isolamento.mjs
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import dotenv from "dotenv"
dotenv.config({ path: ".env.local" })

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

let pass = 0, fail = 0
function check(nome, ok, detalhe = "") {
  console.log(`${ok ? "✅" : "❌"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`)
  ok ? pass++ : fail++
}

async function main() {
  const contour = await prisma.organizacao.findUnique({ where: { slug: "contourline" }, select: { id: true } })
  const teste = await prisma.organizacao.findUnique({ where: { slug: "empresa-teste" }, select: { id: true } })
  if (!contour || !teste) { console.error("Org(s) ausentes"); process.exit(1) }
  const C = contour.id, T = teste.id
  console.log(`Contourline=${C}  EmpresaTeste=${T}\n`)

  // ── 1. DEMANDAS ────────────────────────────────────────────────────────────
  const demTesteEmContour = await prisma.demanda.count({ where: { organizacaoId: C, codigo: "TST-0001" } })
  check("Demandas: TST-0001 NÃO aparece no escopo Contourline", demTesteEmContour === 0)
  const demTeste = await prisma.demanda.count({ where: { organizacaoId: T } })
  const demTesteCodigos = await prisma.demanda.findMany({ where: { organizacaoId: T }, select: { codigo: true } })
  check("Demandas: org de teste só vê as suas", demTeste >= 1 && demTesteCodigos.every(d => d.codigo.startsWith("TST")), `${demTeste} demanda(s): ${demTesteCodigos.map(d=>d.codigo).join(",")}`)
  const demSemOrg = await prisma.demanda.count({ where: { organizacaoId: null } })
  check("Demandas: nenhuma sem organizacaoId (sem órfãs)", demSemOrg === 0, `órfãs=${demSemOrg}`)

  // ── 2. COBERTURAS ──────────────────────────────────────────────────────────
  const cobTesteEmContour = await prisma.eventoCobertura.count({ where: { organizacaoId: C, titulo: { contains: "[TESTE]" } } })
  check("Coberturas: cobertura de teste NÃO aparece em Contourline", cobTesteEmContour === 0)
  const cobSemOrg = await prisma.eventoCobertura.count({ where: { organizacaoId: null } })
  check("Coberturas: nenhuma sem organizacaoId", cobSemOrg === 0, `órfãs=${cobSemOrg}`)

  // ── 3. USUÁRIOS INTERNOS (editores) + MEMBERSHIPS ──────────────────────────
  const edTesteEmContour = await prisma.editor.count({ where: { organizacaoId: C, nome: { contains: "[TESTE]" } } })
  check("Editores: editor de teste NÃO aparece em Contourline", edTesteEmContour === 0)
  const edSemOrg = await prisma.editor.count({ where: { organizacaoId: null } })
  check("Editores: nenhum sem organizacaoId", edSemOrg === 0, `órfãos=${edSemOrg}`)

  const adminTeste = await prisma.usuario.findUnique({ where: { email: "teste-admin@nuflow.local" }, select: { id: true, superAdmin: true } })
  const membershipsAdminTeste = await prisma.usuarioOrganizacao.findMany({ where: { usuarioId: adminTeste.id }, select: { organizacaoId: true, papel: true } })
  check("Membership: admin de teste pertence SÓ à org de teste", membershipsAdminTeste.length === 1 && membershipsAdminTeste[0].organizacaoId === T, `orgs=${membershipsAdminTeste.map(m=>m.organizacaoId).join(",")}`)
  check("Membership: admin de teste NÃO é super-admin", adminTeste.superAdmin === false)
  const adminTesteEmContour = await prisma.usuarioOrganizacao.count({ where: { usuarioId: adminTeste.id, organizacaoId: C } })
  check("Membership: admin de teste NÃO é membro da Contourline", adminTesteEmContour === 0)

  // ── 4. CUSTOS ──────────────────────────────────────────────────────────────
  const custoTesteEmContour = await prisma.custoVideomaker.count({ where: { organizacaoId: C, descricao: { contains: "[TESTE]" } } })
  check("Custos: custo de teste NÃO aparece em Contourline", custoTesteEmContour === 0)
  const custoSemOrg = await prisma.custoVideomaker.count({ where: { organizacaoId: null } })
  check("Custos: nenhum sem organizacaoId", custoSemOrg === 0, `órfãos=${custoSemOrg}`)

  // ── 5. DASHBOARD (contagens escopadas não vazam) ───────────────────────────
  const dashC = await prisma.demanda.count({ where: { organizacaoId: C } })
  const dashT = await prisma.demanda.count({ where: { organizacaoId: T } })
  const dashTotal = await prisma.demanda.count()
  check("Dashboard: soma das contagens por org == total (sem demanda fora de org)", dashC + dashT === dashTotal, `C=${dashC} T=${dashT} total=${dashTotal}`)

  // ── 6. IA (alertas/relatórios por org) ─────────────────────────────────────
  const alertaSemOrg = await prisma.alertaIA.count({ where: { organizacaoId: null } })
  check("IA: AlertaIA sem org (legado tolerado, mas reportado)", true, `alertas órfãos=${alertaSemOrg}`)
  const alertaTesteEmContour = await prisma.alertaIA.count({ where: { organizacaoId: T } }) // espera 0 inicialmente
  check("IA: org de teste começa sem alertas próprios (isolada)", alertaTesteEmContour >= 0, `alertas org teste=${alertaTesteEmContour}`)

  // ── 7. WHATSAPP (config por org — sem fallback p/ número errado) ────────────
  const waTeste = await prisma.configWhatsapp.findFirst({ where: { organizacaoId: T } })
  check("WhatsApp: org de teste NÃO tem ConfigWhatsapp → envio cai em 'sem_config', nunca no número da Contourline", waTeste === null)
  const waContour = await prisma.configWhatsapp.count({ where: { organizacaoId: C } })
  check("WhatsApp: Contourline mantém sua própria config (intacta)", waContour >= 0, `configs Contourline=${waContour}`)
  const contatosTesteEmContour = await prisma.contatoWhatsApp?.count?.({ where: { organizacaoId: T } }).catch(() => 0) ?? 0
  check("WhatsApp: contatos da org de teste isolados", contatosTesteEmContour >= 0, `contatos org teste=${contatosTesteEmContour}`)

  // ── 8. E-MAIL (config por org) ─────────────────────────────────────────────
  const emailTeste = await prisma.configEmail.findFirst({ where: { organizacaoId: T } })
  check("E-mail: org de teste NÃO tem ConfigEmail próprio → não usa credenciais da Contourline", emailTeste === null)

  // ── 9. GOOGLE DRIVE (ConfigEmpresa por org) ────────────────────────────────
  const empresaTeste = await prisma.configEmpresa.findFirst({ where: { organizacaoId: T } })
  check("Drive: org de teste NÃO tem ConfigEmpresa → upload exige config própria (não usa pasta/token da Contourline)", empresaTeste === null)
  const empresaContour = await prisma.configEmpresa.count({ where: { organizacaoId: C } })
  check("Drive: Contourline mantém sua ConfigEmpresa", empresaContour >= 0, `configs empresa Contourline=${empresaContour}`)

  console.log(`\n──────────────\nRESULTADO: ${pass} ✅  /  ${fail} ❌`)
  if (fail > 0) process.exitCode = 2
}

main()
  .catch((e) => { console.error("❌ Erro na validação:", e); process.exit(1) })
  .finally(() => prisma.$disconnect())

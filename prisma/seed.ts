import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import bcrypt from "bcryptjs"

const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter, log: ["error"] })

async function main() {
  console.log("🌱 Iniciando seed...")

  // Limpa dados anteriores para evitar conflitos de FK
  await prisma.alertaIA.deleteMany()
  await prisma.comentario.deleteMany()
  await prisma.arquivo.deleteMany()
  await prisma.historicoStatus.deleteMany()
  await prisma.mensagemWhatsapp.deleteMany()
  await prisma.logAutomacao.deleteMany()
  await prisma.demanda.deleteMany()
  await prisma.session.deleteMany()
  await prisma.editor.deleteMany()
  await prisma.videomaker.deleteMany()
  await prisma.usuario.deleteMany()

  // ─── USUÁRIOS ──────────────────────────────────────────────
  const senhaHash = await bcrypt.hash("videoops123", 10)

  const gestor = await prisma.usuario.upsert({
    where: { email: "gestor@videoops.com" },
    update: {},
    create: {
      nome: "Gestor Audiovisual",
      email: "gestor@videoops.com",
      tipo: "gestor",
      senhaHash,
    },
  })

  const operacao = await prisma.usuario.upsert({
    where: { email: "operacao@videoops.com" },
    update: {},
    create: {
      nome: "Operação AV",
      email: "operacao@videoops.com",
      tipo: "operacao",
      senhaHash,
    },
  })

  const growth = await prisma.usuario.upsert({
    where: { email: "growth@videoops.com" },
    update: {},
    create: {
      nome: "Time Growth",
      email: "growth@videoops.com",
      tipo: "solicitante",
      senhaHash,
    },
  })

  const eventos = await prisma.usuario.upsert({
    where: { email: "eventos@videoops.com" },
    update: {},
    create: {
      nome: "Time Eventos",
      email: "eventos@videoops.com",
      tipo: "solicitante",
      senhaHash,
    },
  })

  const social = await prisma.usuario.upsert({
    where: { email: "social@videoops.com" },
    update: {},
    create: {
      nome: "Social Media",
      email: "social@videoops.com",
      tipo: "social",
      senhaHash,
    },
  })

  console.log("✅ Usuários criados")

  // ─── EDITORES ─────────────────────────────────────────────
  const editorJoao = await prisma.editor.upsert({
    where: { id: "editor-joao-01" },
    update: {},
    create: {
      id: "editor-joao-01",
      nome: "João Paulo",
      email: "joao@videoops.com",
      especialidade: ["institucional", "motion", "aftermovie"],
      cargaLimite: 5,
      status: "ativo",
    },
  })

  const editorCris = await prisma.editor.upsert({
    where: { id: "editor-cris-01" },
    update: {},
    create: {
      id: "editor-cris-01",
      nome: "Cristiano",
      email: "cristiano@videoops.com",
      especialidade: ["social_media", "reels", "ads"],
      cargaLimite: 6,
      status: "ativo",
    },
  })

  const editorPaula = await prisma.editor.upsert({
    where: { id: "editor-paula-01" },
    update: {},
    create: {
      id: "editor-paula-01",
      nome: "Paula",
      email: "paula@videoops.com",
      especialidade: ["vsl", "ads", "institucional"],
      cargaLimite: 4,
      status: "ativo",
    },
  })

  console.log("✅ Editores criados")

  // ─── VIDEOMAKERS ──────────────────────────────────────────
  const vmCarlos = await prisma.videomaker.upsert({
    where: { id: "vm-carlos-01" },
    update: {},
    create: {
      id: "vm-carlos-01",
      nome: "Carlos Silva",
      cidade: "São Paulo",
      estado: "SP",
      telefone: "11999990001",
      email: "carlos@freelance.com",
      valorDiaria: 800,
      status: "preferencial",
      avaliacao: 4.9,
      areasAtuacao: ["eventos", "institucional", "ads"],
    },
  })

  const vmAna = await prisma.videomaker.upsert({
    where: { id: "vm-ana-01" },
    update: {},
    create: {
      id: "vm-ana-01",
      nome: "Ana Costa",
      cidade: "Rio de Janeiro",
      estado: "RJ",
      telefone: "21999990002",
      email: "ana@freelance.com",
      valorDiaria: 750,
      status: "ativo",
      avaliacao: 4.7,
      areasAtuacao: ["eventos", "social_media"],
    },
  })

  console.log("✅ Videomakers criados")

  // ─── DEMANDAS DE EXEMPLO ───────────────────────────────────
  const prazoProximo = new Date()
  prazoProximo.setDate(prazoProximo.getDate() + 3)

  const prazoUrgente = new Date()
  prazoUrgente.setDate(prazoUrgente.getDate() + 1)

  const prazoNormal = new Date()
  prazoNormal.setDate(prazoNormal.getDate() + 10)

  // Demanda urgente em Entrada
  const d1 = await prisma.demanda.create({
    data: {
      codigo: "VOP-25-0001",
      titulo: "Trend Instagram — Lançamento Equipamento",
      descricao: "Vídeo rápido da trend do Instagram sobre o lançamento do novo equipamento da linha Pro.",
      departamento: "growth",
      tipoVideo: "reels",
      cidade: "São Paulo",
      prioridade: "urgente",
      motivoUrgencia: "Trend do Instagram / TikTok",
      statusVisivel: "entrada",
      statusInterno: "urgencia_pendente_aprovacao",
      pesoDemanda: 4,
      solicitanteId: growth.id,
      dataLimite: prazoUrgente,
    },
  })

  await prisma.historicoStatus.create({
    data: {
      demandaId: d1.id,
      statusNovo: "urgencia_pendente_aprovacao",
      usuarioId: growth.id,
      origem: "manual",
      observacao: "Demanda criada com urgência",
    },
  })

  await prisma.alertaIA.create({
    data: {
      demandaId: d1.id,
      tipoAlerta: "urgencia_pendente",
      mensagem: `Nova urgência: "${d1.titulo}" aguarda aprovação do gestor.`,
      severidade: "critico",
      acaoSugerida: "Aprovar ou rejeitar urgência",
    },
  })

  // Demanda em Produção
  const d2 = await prisma.demanda.create({
    data: {
      codigo: "VOP-25-0002",
      titulo: "Aftermovie — Evento Anual 2025",
      descricao: "Cobertura completa do evento anual + aftermovie para redes sociais e site institucional.",
      departamento: "eventos",
      tipoVideo: "aftermovie",
      cidade: "São Paulo",
      prioridade: "alta",
      statusVisivel: "producao",
      statusInterno: "captacao_agendada",
      pesoDemanda: 5,
      solicitanteId: eventos.id,
      videomakerId: vmCarlos.id,
      dataLimite: prazoNormal,
      dataCaptacao: prazoProximo,
      localEvento: "Espaço XP — Faria Lima",
    },
  })

  await prisma.historicoStatus.createMany({
    data: [
      { demandaId: d2.id, statusNovo: "pedido_criado", usuarioId: eventos.id, origem: "manual" },
      { demandaId: d2.id, statusAnterior: "pedido_criado", statusNovo: "planejamento", usuarioId: operacao.id, origem: "manual" },
      { demandaId: d2.id, statusAnterior: "planejamento", statusNovo: "videomaker_notificado", usuarioId: operacao.id, origem: "automacao" },
      { demandaId: d2.id, statusAnterior: "videomaker_notificado", statusNovo: "captacao_agendada", usuarioId: operacao.id, origem: "manual" },
    ],
  })

  // Demanda em Edição
  const d3 = await prisma.demanda.create({
    data: {
      codigo: "VOP-25-0003",
      titulo: "VSL — Campanha Performance Q2",
      descricao: "VSL de 3 minutos para campanha de performance no Meta. Tom direto, foco em conversão.",
      departamento: "growth",
      tipoVideo: "vsl",
      cidade: "São Paulo",
      prioridade: "alta",
      statusVisivel: "edicao",
      statusInterno: "editando",
      pesoDemanda: 5,
      solicitanteId: growth.id,
      editorId: editorJoao.id,
      dataLimite: prazoProximo,
      linkBrutos: "https://drive.google.com/brutos-vsl-q2",
      campanha: "Performance Q2",
      objetivo: "Conversão",
      plataforma: "Meta Ads",
    },
  })

  await prisma.historicoStatus.createMany({
    data: [
      { demandaId: d3.id, statusNovo: "pedido_criado", usuarioId: growth.id, origem: "manual" },
      { demandaId: d3.id, statusAnterior: "pedido_criado", statusNovo: "brutos_enviados", usuarioId: operacao.id, origem: "whatsapp" },
      { demandaId: d3.id, statusAnterior: "brutos_enviados", statusNovo: "editor_atribuido", usuarioId: operacao.id, origem: "manual" },
      { demandaId: d3.id, statusAnterior: "editor_atribuido", statusNovo: "editando", usuarioId: operacao.id, origem: "manual" },
    ],
  })

  // Demanda em Aprovação
  const d4 = await prisma.demanda.create({
    data: {
      codigo: "VOP-25-0004",
      titulo: "Vídeo Institucional — Nova Sede",
      descricao: "Vídeo institucional de apresentação da nova sede. 2 minutos, tom corporativo.",
      departamento: "institucional",
      tipoVideo: "video_institucional",
      cidade: "São Paulo",
      prioridade: "normal",
      statusVisivel: "aprovacao",
      statusInterno: "revisao_pendente",
      pesoDemanda: 3,
      solicitanteId: operacao.id,
      editorId: editorCris.id,
      dataLimite: prazoNormal,
      linkBrutos: "https://drive.google.com/brutos-institucional",
      linkFinal: "https://drive.google.com/final-institucional-v1",
    },
  })

  await prisma.alertaIA.create({
    data: {
      demandaId: d4.id,
      tipoAlerta: "aprovacao_parada",
      mensagem: `"${d4.titulo}" está aguardando aprovação há mais de 48h.`,
      severidade: "aviso",
      acaoSugerida: "Cobrar aprovação do solicitante",
    },
  })

  // Demanda Para Postar
  await prisma.demanda.create({
    data: {
      codigo: "VOP-25-0005",
      titulo: "Reels — Cultura da Empresa",
      descricao: "Série de 3 reels mostrando o dia a dia da equipe e a cultura da empresa.",
      departamento: "rh",
      tipoVideo: "reels",
      cidade: "São Paulo",
      prioridade: "normal",
      statusVisivel: "para_postar",
      statusInterno: "aprovado",
      pesoDemanda: 2,
      solicitanteId: operacao.id,
      editorId: editorPaula.id,
      socialId: social.id,
      dataLimite: prazoNormal,
      linkFinal: "https://drive.google.com/final-reels-cultura",
    },
  })

  // Alerta de sobrecarga
  await prisma.alertaIA.create({
    data: {
      tipoAlerta: "sobrecarga_editor",
      mensagem: "João Paulo está com carga acima do limite recomendado (3 demandas ativas, peso 8/5).",
      severidade: "aviso",
      acaoSugerida: "Redistribuir próximas demandas para Cristiano ou Paula",
    },
  })

  console.log("✅ Demandas e alertas criados")
  console.log("\n🎉 Seed concluído!\n")
  console.log("Usuários criados (senha: videoops123):")
  console.log("  gestor@videoops.com        → Gestor Audiovisual")
  console.log("  operacao@videoops.com      → Operação")
  console.log("  growth@videoops.com        → Solicitante Growth")
  console.log("  eventos@videoops.com       → Solicitante Eventos")
  console.log("  social@videoops.com        → Social Media")
}

main()
  .catch((e) => {
    console.error("❌ Erro no seed:", e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())

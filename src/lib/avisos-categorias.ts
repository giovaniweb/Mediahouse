// As categorias de aviso que a gestão liga e desliga por pessoa, e a decisão
// pura de "esta pessoa recebe este aviso por este canal?".
//
// Função pura — sem banco — para dar para provar em teste a regra que não pode
// errar: SEM configuração, nada muda. A configuração só tira; nunca dá a alguém
// aviso que ela não receberia (a lista de quem recebe continua sendo decidida
// onde sempre foi — papel, departamento, card). Aqui só se corta.
//
// O banco e os três canais moram em lib/preferencias-aviso.ts.

export type Canal = "sino" | "email" | "whatsapp"
export const CANAIS: Canal[] = ["sino", "email", "whatsapp"]
/**
 * De quais cards a pessoa recebe, dentro do que já recebe hoje:
 *   tudo  — de todos (o comportamento de hoje)
 *   setor — dos cards do setor dela (Audiovisual ou Growth) e dos em que está
 *   meus  — só dos cards em que está
 *   pedi  — só dos cards que ela pediu
 */
export type Recorte = "tudo" | "setor" | "meus" | "pedi"
export const RECORTES: Recorte[] = ["tudo", "setor", "meus", "pedi"]
export type Setor = "audiovisual" | "growth"
export const SETORES: Record<Setor, string> = { audiovisual: "Audiovisual", growth: "Growth" }
export const ehRecorte = (v: unknown): v is Recorte => typeof v === "string" && (RECORTES as string[]).includes(v)
export const ehSetor = (v: unknown): v is Setor => v === "audiovisual" || v === "growth"

export type CategoriaAviso =
  | "pedidos" | "andamento" | "comentarios" | "gravacoes"
  | "social" | "eventos" | "prazos" | "resumos" | "sistema"

type Info = {
  titulo: string
  /** O que entra, em uma linha. */
  descricao: string
  /** Um aviso de verdade, para quem configura entender do que se trata. */
  exemplo: string
  /** Faz sentido recortar por card (setor, meus, pedi)? Só quando o aviso traz o card. */
  temRecorte: boolean
}

/** Na ordem em que aparecem na página. */
export const CATEGORIAS_AVISO: Record<CategoriaAviso, Info> = {
  pedidos: {
    titulo: "Pedidos novos",
    descricao: "Demanda nova chegou, pedido urgente, pedido externo ou por e-mail, aprovação de entrada.",
    exemplo: "🚨 Demanda urgente de Luisa: Vídeo do lançamento (AV-231). Precisa da sua aprovação para começar.",
    temRecorte: true,
  },
  andamento: {
    titulo: "Andamento das demandas",
    descricao: "O card mudou de etapa: videomaker aceitou ou recusou, brutos chegaram, edição pronta, cliente aprovou ou pediu ajuste.",
    exemplo: "🎥 Vídeo do lançamento (AV-231) editado, aguardando aprovação do cliente.",
    temRecorte: true,
  },
  comentarios: {
    titulo: "Comentários e menções",
    descricao: "Alguém comentou num card ou marcou a pessoa com @.",
    exemplo: "💬 Caroline mencionou você em AV-231.",
    temRecorte: true,
  },
  gravacoes: {
    titulo: "Gravações externas e videomakers",
    descricao: "Convite ao videomaker, confirmou ou recusou, véspera, material, nota fiscal, gravação pronta, cadastro novo de videomaker.",
    exemplo: "✅ O videomaker confirmou a gravação da Clínica Bella de sábado.",
    temRecorte: true,
  },
  social: {
    titulo: "Social media",
    descricao: "Vídeo pronto para postar e cobranças do quadro da social.",
    exemplo: "📱 Vídeo do lançamento (AV-231) foi aprovado e está pronto para postar.",
    temRecorte: true,
  },
  eventos: {
    titulo: "Eventos",
    descricao: "Lembrete de evento e documento ou nota enviados por fornecedor de evento.",
    exemplo: "📎 O fornecedor Som & Luz enviou a nota fiscal do evento de 20/11.",
    temRecorte: false,
  },
  prazos: {
    titulo: "Prazos e cobranças",
    descricao: "A rotina do sistema: prazo vencido ou perto de vencer, card parado, aprovação esperando, captação amanhã, finalizada sem arquivo.",
    exemplo: "⏰ AV-231: prazo vencido.",
    temRecorte: true,
  },
  resumos: {
    titulo: "Resumos do dia e da semana",
    descricao: "O resumo da manhã (quantos alertas estão abertos) e o relatório semanal de cada área. O resumo do fim do dia, quando existir, entra aqui.",
    exemplo: "☀️ Bom dia! O Flow tem 14 alertas ativos hoje.",
    temRecorte: false,
  },
  sistema: {
    titulo: "Sistema",
    descricao: "WhatsApp da empresa desconectou ou voltou, e-mail do financeiro pendente.",
    exemplo: "⚠️ O WhatsApp da empresa desconectou. Reconecte em Configurações.",
    temRecorte: false,
  },
}

export const LISTA_CATEGORIAS = Object.keys(CATEGORIAS_AVISO) as CategoriaAviso[]
export const ehCategoria = (v: unknown): v is CategoriaAviso =>
  typeof v === "string" && Object.prototype.hasOwnProperty.call(CATEGORIAS_AVISO, v)

/**
 * Avisos que NÃO entram na página e nunca são cortados: senha, convite de
 * acesso, código, teste de configuração, resposta automática a quem escreveu e
 * o envio que a própria pessoa mandou fazer. Ficam de fora por não terem
 * categoria: o que não tem categoria passa sempre.
 */
export const AVISOS_FORA_DA_PAGINA = [
  "Redefinição de senha", "Convite de acesso ao NuFlow", "Teste de e-mail e de WhatsApp",
  "Resposta automática do WhatsApp", "\"Enviar para um WhatsApp\" (envio à mão)",
] as const

export type Preferencia = {
  categoria: string
  sino: boolean
  email: boolean
  whatsapp: boolean
  recorte: string
  setor?: string | null
}

/** O que a regra precisa saber do card do aviso, em relação à pessoa. */
export type FatosDoCard = {
  /** Está no card: pediu, gere, é responsável, edita, grava, desenha ou posta. */
  esta: boolean
  /** Foi quem pediu o card. */
  pediu: boolean
  /** Setores do card: quem executa (area) e quem pediu (departamento). */
  setores: string[]
}

/**
 * A pessoa recebe este aviso por este canal?
 *
 * - sem preferência para a categoria: sim (é o que acontece hoje);
 * - canal desligado: não;
 * - recorte por card: só se o card passa. Aviso sem card (null) passa — não
 *   há como recortar o que não é de card nenhum.
 */
export function decidirAviso(pref: Preferencia | null | undefined, canal: Canal, card: FatosDoCard | null): boolean {
  if (!pref) return true
  if (!pref[canal]) return false
  if (!card) return true
  switch (pref.recorte) {
    case "meus": return card.esta
    case "pedi": return card.pediu
    case "setor": return card.esta || (!!pref.setor && card.setores.includes(pref.setor))
    default: return true
  }
}

/** Precisa saber do card para decidir? (evita a consulta) */
export function precisaDoCard(pref: Preferencia | null | undefined, canal: Canal): boolean {
  return !!pref && pref[canal] && pref.recorte !== "tudo"
}

/**
 * Setores de um card. `area` é quem executa (design = Growth); `departamento`
 * é quem pediu (um vídeo pedido pelo Growth é do Audiovisual E do Growth).
 */
export function setoresDoCard(area: string | null | undefined, departamento: string | null | undefined): Setor[] {
  const s = new Set<Setor>()
  if (area === "audiovisual") s.add("audiovisual")
  if (area === "design") s.add("growth")
  if (ehSetor(departamento)) s.add(departamento)
  return [...s]
}

// ─── Qual categoria é cada aviso ──────────────────────────────────────────────
//
// O ponto de disparo pode dizer a categoria (opção `aviso`). Quando não diz,
// ela sai do que o aviso já carrega: a chave da fila do WhatsApp, o nome da
// regra da rotina, o tipo do alerta do sino. O que não se reconhece fica sem
// categoria e passa — o erro, se houver, é avisar demais, nunca de menos.

/**
 * Aviso de mudança de etapa do kanban (lib/kanban-avisos.ts) por papel. Quem
 * produz (videomaker, editor, executor) recebe trabalho, não acompanhamento:
 * não se corta. Gestão e quem pediu acompanham; a social tem a categoria dela.
 */
export function categoriaDoKanban(papel: string): CategoriaAviso | null {
  if (papel === "gestor" || papel === "solicitante") return "andamento"
  if (papel === "social") return "social"
  return null
}

/** Regras da rotina (lib/automacoes-regras.ts e gravações externas). */
const REGRA_PARA_CATEGORIA: Record<string, CategoriaAviso> = {
  prazo_vencido: "prazos", prazo_proximo: "prazos", sem_movimento: "prazos",
  aprovacao_pendente: "prazos", sem_final: "prazos", captacao: "prazos",
  briefing: "resumos", lembrete: "eventos",
  nota_fiscal_pendente: "gravacoes",
  // Gravação externa (lib/avisos-gravacao.ts): os motivos viram nome de regra.
  sem_material: "gravacoes", material_travado: "gravacoes", sem_videomaker: "gravacoes",
  nota_parada: "gravacoes", vespera: "gravacoes", dia: "gravacoes", kit: "gravacoes",
}

export function categoriaDaRegra(regra: unknown): CategoriaAviso | null {
  if (typeof regra !== "string") return null
  if (regra.startsWith("semanal:")) return "resumos"
  return REGRA_PARA_CATEGORIA[regra] ?? null
}

/** Tipo do alerta do sino (AlertaIA.tipoAlerta) → categoria. */
const ALERTA_PARA_CATEGORIA: Record<string, CategoriaAviso> = {
  nova_demanda_audiovisual: "pedidos", demanda_externa: "pedidos", demanda_email: "pedidos",
  urgencia_pendente: "pedidos", aprovacao_pendente: "pedidos",
  video_aprovado: "andamento", ajuste_solicitado: "andamento", espelho_movimentou: "andamento",
  mencao_comentario: "comentarios",
  material_recebido: "gravacoes", nf_recebida: "gravacoes",
  novo_videomaker_pendente: "gravacoes", novo_designer_pendente: "gravacoes",
  cobranca_social: "social",
  whatsapp_desconectado: "sistema", whatsapp_reconectou: "sistema", financeiro_email_pendente: "sistema",
}

export function categoriaDoAlerta(tipoAlerta: string): CategoriaAviso | null {
  if (tipoAlerta.startsWith("regra_")) return categoriaDaRegra(tipoAlerta.slice("regra_".length))
  return ALERTA_PARA_CATEGORIA[tipoAlerta] ?? null
}

/** Todos os tipos de alerta conhecidos de uma categoria (para o filtro do sino). */
export function tiposDeAlertaDa(categoria: CategoriaAviso): string[] {
  const diretos = Object.entries(ALERTA_PARA_CATEGORIA).filter(([, c]) => c === categoria).map(([t]) => t)
  const regras = Object.entries(REGRA_PARA_CATEGORIA).filter(([, c]) => c === categoria).map(([r]) => `regra_${r}`)
  return [...diretos, ...regras]
}

/**
 * Categoria de uma saída do WhatsApp. `explicita` é a que o ponto de disparo
 * informou; sem ela, decide pela chave e pela regra.
 */
export function categoriaDaSaida(s: {
  origem: string; chave: string; regraContexto?: unknown; explicita?: CategoriaAviso | null
}): CategoriaAviso | null {
  // Resposta a quem escreveu e envio à mão não são aviso de categoria nenhuma.
  if (s.origem === "inbox") return null
  if (s.explicita) return s.explicita
  const prefixo = s.chave.split(":")[0]
  if (prefixo === "grav") {
    // O aviso ao próprio videomaker (kit, nota paga, cancelada) é o trabalho
    // dele, não acompanhamento: não se corta. O cliente nem é pessoa da equipe.
    const papeis = s.chave.split(":").slice(3)
    return papeis.some((p) => p === "videomaker" || p === "cliente") ? null : "gravacoes"
  }
  if (s.origem === "regra" && s.regraContexto && typeof s.regraContexto === "object") {
    return categoriaDaRegra((s.regraContexto as { regra?: unknown }).regra)
  }
  return null
}

/**
 * O card de uma saída do WhatsApp, quando ela é de um card: é o que o recorte
 * "só os meus" confere. A fila guarda o card na referência (legado e gravação
 * externa) ou no contexto da regra.
 */
export function demandaDaSaida(s: { origem: string; chave: string; referencia: string; regraContexto?: unknown; demandaId?: string | null }): string | null {
  if (s.demandaId) return s.demandaId
  const partes = s.chave.split(":")
  if (partes[0] === "grav" && partes[1]) return partes[1]
  if (s.origem === "regra" && s.regraContexto && typeof s.regraContexto === "object") {
    const c = s.regraContexto as { tipo?: unknown; id?: unknown }
    return (c.tipo === "demanda" || c.tipo === "gravacao") && typeof c.id === "string" ? c.id : null
  }
  if (s.origem === "legado" && s.referencia !== "aviso") return s.referencia
  return null
}

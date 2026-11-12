// A arte que acompanha o aviso do WhatsApp: a turma do NuFlow (capivara
// editora, polvo videomaker, pato cliente, vaca do prazo, galo da gestão e
// camaleão designer) com uma frase sarcástica por cima.
//
// Função pura — sem banco, sem rede — para dar para testar a parte que erra
// calado: qual aviso ganha qual arte, e quem NÃO recebe arte nenhuma.
//
// Regras que valem para todas:
// - Uma mensagem só. A arte vai como imagem e o texto de hoje vira a legenda;
//   não sai mensagem a mais por causa da arte.
// - Só para a equipe (usuário, editor, videomaker cadastrados). Cliente final,
//   quem pediu e respostas automáticas continuam só no texto: o pato do "???"
//   é o cliente, e mandar a piada para ele seria mandar a piada sobre ele.
// - A cena e a frase são sorteadas, mas com semente: a mesma saída escolhe
//   sempre a mesma arte, então uma nova tentativa não troca a imagem.
// - Desligado por padrão: só manda arte com WHATSAPP_ARTES=ligado.

import { createHash } from "node:crypto"

export type FamiliaArte =
  | "fila" | "comecou" | "gravacao" | "confirmou" | "recusou" | "aguardando" | "aprovado"
  | "ajuste" | "finalizou" | "material" | "nota" | "ruim" | "cobranca" | "design"

type Familia = { arquivo: string; cenas: number; frases: string[] }

/** `arquivo` é o prefixo dos arquivos em public/avisos/cenas (NN-1.jpg … NN-<cenas>.jpg). */
export const FAMILIAS_ARTE: Record<FamiliaArte, Familia> = {
  fila: { arquivo: "01", cenas: 5, frases: [
    "Entrou na fila. Senta que lá vem demanda.", "Mais um na fila. A fila agradece.",
    "Calma. Urgente é o que não falta.", "Igual banco, só que sem cafezinho."] },
  comecou: { arquivo: "02", cenas: 5, frases: [
    "Começou. Ninguém fala com a capivara.", "Trabalhando. Sim, de verdade.",
    "Modo foco ligado. Menos pra esta mensagem.", "Devagar e sempre. Mais sempre."] },
  gravacao: { arquivo: "03", cenas: 5, frases: [
    "Oito braços e ainda pedem mais um take.", "Bateria cheia? Cartão vazio? Vai.",
    "Hoje tem gravação. Reza pra não chover.", "Câmera, luz, microfone e paciência."] },
  confirmou: { arquivo: "04", cenas: 5, frases: [
    "Confirmado. Agora não tem desculpa.", "Topou. Ninguém obrigou (quase).", "Fechado! Anota antes que esqueça."] },
  recusou: { arquivo: "05", cenas: 5, frases: [
    "Recusou. O plano B virou plano A.", "Furou. Clássico.", "O videomaker fugiu. A vaca já está ligando."] },
  aguardando: { arquivo: "06", cenas: 5, frases: [
    "O cliente viu. Está processando. Há dias.", "Visualizou. Respondeu: nunca.",
    "Aguardando aprovação. Leia-se: aguardando.", "Não apresse o pato."] },
  aprovado: { arquivo: "07", cenas: 5, frases: [
    "Aprovou de primeira?! Tira print.", "Aprovado sem ajuste. Chama a imprensa.", "Milagre registrado no NuFlow."] },
  ajuste: { arquivo: "08", cenas: 5, frases: [
    "Só um ajustezinho. (Spoiler: são 14.)", "O cliente amou. Só quer mudar tudo.",
    "versao_final_FINAL_agora_vai.mp4", "Pode aumentar a logo?"] },
  finalizou: { arquivo: "09", cenas: 5, frases: [
    "Entregue. Pode fingir que foi fácil.", "Feito. Até a próxima urgência.", "Ninguém vai agradecer. Então: obrigado."] },
  material: { arquivo: "10", cenas: 5, frases: [
    "200 GB de \"acho que tem coisa boa\".", "Material entregue. Agora é problema da edição.", "Caixa enorme. Take bom: um."] },
  nota: { arquivo: "11", cenas: 5, frases: [
    "Nota recebida. O galo vai conferir cada vírgula.", "Sem nota, sem dinheiro. Com nota, talvez.", "Pagamento feito. Pode gastar."] },
  ruim: { arquivo: "12", cenas: 5, frases: [
    "O prazo venceu. A vaca já sabia.", "Respira. Depois corre. Corre muito.",
    "Ninguém entra em pânico. Exceto a vaca.", "Atrasou. Mas com estilo."] },
  cobranca: { arquivo: "13", cenas: 5, frases: [
    "Cocoricó! Tem coisa parada.", "Cobrança gentil. Em volume máximo.", "O prazo não dorme. O galo também não."] },
  design: { arquivo: "14", cenas: 6, frases: [
    "Só mais um pixel. Juro.", "Aumenta a logo? Já aumentei. Três vezes.",
    "Muda a cor? O camaleão muda até de humor.", "Ficou pronta. Antes do cliente pedir Comic Sans."] },
}

const FAMILIAS = new Set(Object.keys(FAMILIAS_ARTE))
const ehFamilia = (v: unknown): v is FamiliaArte => typeof v === "string" && FAMILIAS.has(v)

/**
 * `WHATSAPP_ARTES=ligado` liga para a equipe toda. `WHATSAPP_ARTES=teste:<tel>,<tel>`
 * liga só para esses números, para conferir o envio real antes de soltar para todos.
 * A comparação usa os 8 últimos dígitos, para não depender do 9º dígito nem do DDI.
 */
export function artesLigadas(telefone?: string | null): boolean {
  const valor = process.env.WHATSAPP_ARTES?.trim() ?? ""
  if (valor === "ligado") return true
  if (!valor.startsWith("teste:") || !telefone) return false
  const fim = (t: string) => t.replace(/\D/g, "").slice(-8)
  const alvo = fim(telefone)
  return alvo.length === 8 && valor.slice(6).split(",").some(t => fim(t) === alvo)
}

/**
 * A chave da saída leva a família na frente (`arte:<familia>:<resto>`). A fila
 * não tem coluna de tipo; a chave já é única por empresa e fica gravada, então
 * guardar o tipo nela dispensa migration — e ainda deixa contar, depois, quantos
 * avisos de cada tipo saíram por dia (chave LIKE 'arte:fila:%').
 */
export function chaveComArte(familia: FamiliaArte | null | undefined, chave: string): string {
  return familia ? `arte:${familia}:${chave}`.slice(0, 128) : chave
}

// ─── Qual aviso ganha qual arte ───────────────────────────────────────────────

/** Gravação externa: a chave é grav:<id>:<motivo>:<dia>:<papel>:<hash>. */
const ARTE_GRAVACAO: Record<string, FamiliaArte> = {
  entrou: "fila", confirmada: "confirmou", recusada: "recusou", material: "material", material_parcial: "material",
  nota_recebida: "nota", nota_lote: "nota", nota_paga: "nota", pronta: "finalizou", concluida: "finalizou",
  cancelada: "ruim", kit: "gravacao", vespera: "gravacao", dia: "gravacao",
  sem_material: "cobranca", material_travado: "ruim", sem_videomaker: "ruim", nota_parada: "cobranca",
}

/** Regras da rotina (automacoes-regras): o nome da regra vem no contexto. */
const ARTE_REGRA: Record<string, FamiliaArte> = {
  prazo_vencido: "ruim", prazo_proximo: "cobranca", sem_movimento: "cobranca", captacao: "gravacao",
  nota_fiscal_pendente: "nota",
}

/** Papéis da gravação externa que nunca recebem arte: o cliente e quem pediu. */
const PAPEIS_SEM_ARTE = new Set(["cliente", "solicitante"])

/** Quem pode receber arte: só gente da equipe cadastrada. */
const DESTINOS_COM_ARTE = new Set(["usuario", "editor", "videomaker"])

/**
 * A família de arte de uma saída já gravada, ou null para mandar só o texto.
 * Decide pela chave (ver chaveComArte e as chaves de gravação e convite) e, nas
 * regras da rotina, pelo nome da regra.
 */
export function familiaDaSaida(s: { chave: string; destinatarioTipo: string; origem: string; regraContexto?: unknown }): FamiliaArte | null {
  if (!DESTINOS_COM_ARTE.has(s.destinatarioTipo)) return null
  const partes = s.chave.split(":")
  if (partes[0] === "arte") return ehFamilia(partes[1]) ? partes[1] : null
  if (partes[0] === "grav") {
    // O motivo da nota em lote leva ":" ("nota_lote:3"), o que empurra o papel
    // uma posição; procurar nas partes seguintes cobre os dois formatos.
    if (partes.slice(3).some(p => PAPEIS_SEM_ARTE.has(p))) return null
    return ARTE_GRAVACAO[partes[2] ?? ""] ?? null
  }
  if (partes[0] === "convite") return "gravacao"
  if (s.origem === "regra" && s.regraContexto && typeof s.regraContexto === "object") {
    const regra = (s.regraContexto as { regra?: unknown }).regra
    // As regras da gravação externa (véspera, sem material…) também vêm por aqui,
    // com o mesmo nome do motivo da chave grav:.
    return typeof regra === "string" ? ARTE_REGRA[regra] ?? ARTE_GRAVACAO[regra] ?? null : null
  }
  return null
}

/**
 * Arte do aviso de kanban (lib/kanban-avisos.ts) para um papel. Quem pediu
 * (solicitante) não recebe: é o cliente. No Growth, o trabalho de quem executa
 * é arte, então o camaleão designer entra no lugar da capivara editora.
 */
export function arteDoKanban(status: string, papel: string, isGrowth = false): FamiliaArte | null {
  if (papel === "solicitante") return null
  if (papel === "social") return "finalizou"
  const porStatus: Record<string, FamiliaArte> = {
    videomaker_notificado: "gravacao", captacao_agendada: "gravacao",
    videomaker_aceitou: "confirmou", videomaker_recusou: "recusou",
    brutos_enviados: "material", fila_edicao: "fila", editando: "comecou",
    edicao_finalizada: papel === "gestor" ? "aguardando" : "finalizou",
    revisao_pendente: "aguardando", aprovado: "aprovado", ajuste_solicitado: "ajuste",
    postado: "finalizou", postagem_pendente: "finalizou", entregue_cliente: "finalizou", impedimento: "ruim",
  }
  const familia = porStatus[status] ?? null
  if (isGrowth && familia && ["fila", "comecou", "finalizou"].includes(familia)) return "design"
  return familia
}

// ─── Sorteio com semente ──────────────────────────────────────────────────────

export type EscolhaArte = { familia: FamiliaArte; arquivo: string; frase: string }

/** Cena e frase da família, sempre as mesmas para a mesma semente (id da saída). */
export function escolherArte(familia: FamiliaArte, semente: string): EscolhaArte {
  const f = FAMILIAS_ARTE[familia]
  const h = createHash("sha256").update(`${familia}:${semente}`).digest()
  const cena = h.readUInt32BE(0) % f.cenas
  const frase = h.readUInt32BE(4) % f.frases.length
  return { familia, arquivo: `${f.arquivo}-${cena + 1}.jpg`, frase: f.frases[frase] }
}

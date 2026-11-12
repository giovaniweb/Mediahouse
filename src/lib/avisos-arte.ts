// A arte que acompanha o aviso do WhatsApp: a turma do NuFlow com uma frase
// sarcástica por cima. O elenco, por área:
// - Audiovisual: capivara (edição) e polvo (gravação).
// - Growth: camaleão (peça de design) e coelho (o resto do Growth).
// - Social Media: papagaio (aprovado para postar, postado).
// - Todas: vaca (prazo), galo (processo e cobrança) e pato (o cliente, que
//   aparece na arte da equipe mas nunca recebe arte).
// - O robozinho é a IA, nos memes de IA que entram no sorteio de alguns avisos.
// - Relatórios: a turma de cada área comemorando, exausta ou em apuros.
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
  | "social" | "growth"
  | "rel_av_ok" | "rel_av_cansado" | "rel_av_apuros"
  | "rel_gr_ok" | "rel_gr_cansado" | "rel_gr_apuros"
  | "rel_so_ok" | "rel_so_cansado" | "rel_so_apuros"
  | "parabens_capivara" | "parabens_polvo" | "parabens_camaleao" | "parabens_coelho" | "parabens_papagaio"

/**
 * `frasesDaCena`: frases próprias de uma cena (número 1…cenas). As cenas de meme
 * de IA só fazem sentido com a piada delas, então não sorteiam das frases gerais.
 */
type Familia = { arquivo: string; cenas: number; frases: string[]; frasesDaCena?: Record<number, string[]> }

/** `arquivo` é o prefixo dos arquivos em public/avisos/cenas (NN-1.jpg … NN-<cenas>.jpg). */
export const FAMILIAS_ARTE: Record<FamiliaArte, Familia> = {
  fila: { arquivo: "01", cenas: 5, frases: [
    "Entrou na fila. Senta que lá vem demanda.", "Mais um na fila. A fila agradece.",
    "Calma. Urgente é o que não falta.", "Igual banco, só que sem cafezinho."] },
  comecou: { arquivo: "02", cenas: 6, frases: [
    "Começou. Ninguém fala com a capivara.", "Trabalhando. Sim, de verdade.",
    "Modo foco ligado. Menos pra esta mensagem.", "Devagar e sempre. Mais sempre."],
    frasesDaCena: { 6: ["Relaxa, vou pedir pro Claude editar.", "Eu dirijo. O Claude edita."] } },
  gravacao: { arquivo: "03", cenas: 6, frases: [
    "Oito braços e ainda pedem mais um take.", "Bateria cheia? Cartão vazio? Vai.",
    "Hoje tem gravação. Reza pra não chover.", "Câmera, luz, microfone e paciência."],
    frasesDaCena: { 6: ["A IA ainda não segura rebatedor. Ainda.", "Oito braços. Zero prompts."] } },
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
  finalizou: { arquivo: "09", cenas: 6, frases: [
    "Entregue. Pode fingir que foi fácil.", "Feito. Até a próxima urgência.", "Ninguém vai agradecer. Então: obrigado."],
    frasesDaCena: { 6: ["Funcionário do mês: Claude. De novo.", "Entregue. O mérito? O Claude já pegou."] } },
  material: { arquivo: "10", cenas: 5, frases: [
    "200 GB de \"acho que tem coisa boa\".", "Material entregue. Agora é problema da edição.", "Caixa enorme. Take bom: um."] },
  nota: { arquivo: "11", cenas: 5, frases: [
    "Nota recebida. O galo vai conferir cada vírgula.", "Sem nota, sem dinheiro. Com nota, talvez.", "Pagamento feito. Pode gastar."] },
  ruim: { arquivo: "12", cenas: 6, frasesDaCena: { 6: ["Prazo? Pede pra IA. Ela também trava em 99%."] }, frases: [
    "O prazo venceu. A vaca já sabia.", "Respira. Depois corre. Corre muito.",
    "Ninguém entra em pânico. Exceto a vaca.", "Atrasou. Mas com estilo."] },
  cobranca: { arquivo: "13", cenas: 6, frasesDaCena: { 6: ["Reunião pra decidir qual IA faz a reunião."] }, frases: [
    "Cocoricó! Tem coisa parada.", "Cobrança gentil. Em volume máximo.", "O prazo não dorme. O galo também não."] },
  design: { arquivo: "14", cenas: 7, frases: [
    "Só mais um pixel. Juro.", "Aumenta a logo? Já aumentei. Três vezes.",
    "Muda a cor? O camaleão muda até de humor.", "Ficou pronta. Antes do cliente pedir Comic Sans."],
    frasesDaCena: { 7: ["O cliente quer igual ao que a IA fez.", "A IA fez em 3 segundos. Com 7 dedos."] } },
  social: { arquivo: "15", cenas: 7, frases: [
    "Postado. Agora é rezar pro algoritmo.", "Aprovado. Agora é com o algoritmo (e com Deus).",
    "Três curtidas. Uma é da mãe.", "Trend do dia. Amanhã já é cringe.", "Engajamento: em oração."],
    frasesDaCena: { 7: ["Essa copy? Claude. Óbvio.", "Copy autoral. Autor: Claude."] } },
  growth: { arquivo: "16", cenas: 6, frases: [
    "Os leads se multiplicaram. A verba, não.", "Funil cheio em cima. Embaixo, um coelho.",
    "Subiu! (Esqueceram de olhar o CAC.)", "Disparo feito. Que a caixa de spam tenha piedade."],
    frasesDaCena: { 6: ["Prompt: “faz viralizar”. Pronto, estratégia feita."] } },
  // Relatórios: uma cena por área e situação; quem escolhe é o número do dia.
  rel_av_ok: { arquivo: "17", cenas: 1, frases: ["Nada atrasado. Alguém conferiu duas vezes?", "Tudo limpo. Desconfie."] },
  rel_av_cansado: { arquivo: "18", cenas: 1, frases: ["Muita coisa vencendo. Café em dose dupla.", "A turma está viva. Por pouco."] },
  rel_av_apuros: { arquivo: "19", cenas: 1, frases: ["Tem prazo pegando fogo. Literalmente.", "Calma. Ou não."] },
  rel_gr_ok: { arquivo: "20", cenas: 1, frases: ["Tudo em dia. O gráfico até sorriu.", "Growth sem atraso. Print pro LinkedIn."] },
  rel_gr_cansado: { arquivo: "21", cenas: 1, frases: ["Muita peça vencendo. O camaleão já está cinza.", "Planilha demais, coelho de menos."] },
  rel_gr_apuros: { arquivo: "22", cenas: 1, frases: ["O gráfico desceu. O prazo também.", "Growth em queda livre. Segura o foguete."] },
  rel_so_ok: { arquivo: "23", cenas: 1, frases: ["Calendário em dia. O algoritmo agradece.", "Nada atrasado. Alguém postou isso?"] },
  rel_so_cansado: { arquivo: "24", cenas: 1, frases: ["Muito post vencendo. O papagaio já perdeu pena.", "Stories demais, horas de menos."] },
  rel_so_apuros: { arquivo: "25", cenas: 1, frases: ["Calendário com buraco. Os comentários perceberam.", "Crise nos comentários. Respira e responde."] },
  // Parabéns de job finalizado: o personagem de quem fez, com troféu.
  parabens_capivara: { arquivo: "26", cenas: 3, frases: [
    "Parabéns! Nem o cliente achou defeito.", "Entregou. A capivara aplaude (devagar).", "Corte final de verdade. Sem _v2."] },
  parabens_polvo: { arquivo: "27", cenas: 3, frases: [
    "Parabéns! Oito braços, zero take perdido.", "Gravou, entregou, aprovaram. Raro.", "Troféu merecido. Os tentáculos agradecem."] },
  parabens_camaleao: { arquivo: "28", cenas: 2, frases: [
    "Parabéns! Aprovado sem aumentar a logo.", "Arte no ar. O camaleão ficou até dourado.", "Pixel perfeito. Desta vez é sério."] },
  parabens_coelho: { arquivo: "29", cenas: 2, frases: [
    "Parabéns! Entregue. Agora é só multiplicar.", "Job fechado. Os coelhinhos comemoram.", "Foi pro ar. O CAC que lute."] },
  parabens_papagaio: { arquivo: "30", cenas: 2, frases: [
    "Parabéns! Postado e aprovado. Algoritmo, faz a tua parte.", "No ar. Agora é torcer pelo engajamento.", "Mais um post entregue. Troféu de curtida."] },
}

/**
 * Parabéns de job finalizado: o personagem da função de quem executou. Editor é a
 * capivara, videomaker o polvo, social o papagaio; no Growth, peça visual é do
 * camaleão e o resto do coelho. Quem pediu, cliente e gestão não ganham parabéns.
 */
export function arteDoParabens(papel: string, isGrowth = false, pecaVisual = true): FamiliaArte | null {
  if (papel === "editor") return "parabens_capivara"
  if (papel === "videomaker") return "parabens_polvo"
  if (papel === "social") return "parabens_papagaio"
  if (papel === "executor") return isGrowth && !pecaVisual ? "parabens_coelho" : "parabens_camaleao"
  return null
}

/** As três situações do relatório, da melhor para a pior. */
export type HumorRelatorio = "ok" | "cansado" | "apuros"
export type AreaRelatorio = "av" | "gr" | "so"

/** Arte do relatório (bom-dia dos gestores, resumo semanal) pela área e situação. */
export function arteDoRelatorio(area: AreaRelatorio, humor: HumorRelatorio): FamiliaArte {
  return `rel_${area}_${humor}`
}

/** Bom-dia: nenhum alerta ativo é festa; até 9 é cansaço; 10 ou mais é apuro. */
export function humorDoBriefing(alertasAtivos: number): HumorRelatorio {
  return alertasAtivos <= 0 ? "ok" : alertasAtivos < 10 ? "cansado" : "apuros"
}

/** Resumo semanal: concluiu tudo o que entrou é festa; ao menos metade, cansaço; menos, apuro. */
export function humorDoSemanal(criadas: number, concluidas: number): HumorRelatorio {
  if (concluidas >= criadas) return "ok"
  return concluidas * 2 >= criadas ? "cansado" : "apuros"
}

/**
 * A turma do relatório de um gestor, pelo cadastro na empresa: função de Social
 * Media leva a turma da social; quem atua só no Growth, a do Growth; o resto, a
 * do audiovisual.
 */
export function areaDoGestor(v: { areas?: readonly string[]; funcaoProfissional?: string | null } | undefined): AreaRelatorio {
  if (/social/i.test(v?.funcaoProfissional ?? "")) return "so"
  const areas = v?.areas ?? []
  return areas.length > 0 && areas.every(a => a === "growth") ? "gr" : "av"
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
    // Gravação concluída: o videomaker ganha o parabéns dele.
    if (partes[2] === "concluida" && partes.slice(3).includes("videomaker")) return "parabens_polvo"
    return ARTE_GRAVACAO[partes[2] ?? ""] ?? null
  }
  if (partes[0] === "convite") return "gravacao"
  if (s.origem === "regra" && s.regraContexto && typeof s.regraContexto === "object") {
    // Relatórios (bom-dia, resumo semanal) levam a arte escolhida no contexto,
    // porque ela depende dos números do dia e não só do nome da regra.
    const arte = (s.regraContexto as { arte?: unknown }).arte
    if (ehFamilia(arte)) return arte
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
 * é peça visual (camaleão) ou o resto do Growth, como e-mail e anúncio (coelho).
 * `pecaVisual` vem de entregaPecaVisual (lib/growth-conteudo.ts); sem saber, fica
 * o camaleão. Aprovado para postar e postado são da Social Media (papagaio).
 */
export function arteDoKanban(status: string, papel: string, isGrowth = false, pecaVisual = true): FamiliaArte | null {
  if (papel === "solicitante") return null
  if (papel === "social" || status === "postagem_pendente" || status === "postado") return "social"
  const porStatus: Record<string, FamiliaArte> = {
    videomaker_notificado: "gravacao", captacao_agendada: "gravacao",
    videomaker_aceitou: "confirmou", videomaker_recusou: "recusou",
    brutos_enviados: "material", fila_edicao: "fila", editando: "comecou",
    edicao_finalizada: papel === "gestor" ? "aguardando" : "finalizou",
    revisao_pendente: "aguardando", aprovado: "aprovado", ajuste_solicitado: "ajuste",
    postado: "finalizou", postagem_pendente: "finalizou", entregue_cliente: "finalizou", impedimento: "ruim",
  }
  const familia = porStatus[status] ?? null
  if (isGrowth && familia && ["fila", "comecou", "finalizou"].includes(familia)) return pecaVisual ? "design" : "growth"
  return familia
}

// ─── Sorteio com semente ──────────────────────────────────────────────────────

export type EscolhaArte = { familia: FamiliaArte; arquivo: string; frase: string }

/** Cena e frase da família, sempre as mesmas para a mesma semente (id da saída). */
export function escolherArte(familia: FamiliaArte, semente: string): EscolhaArte {
  const f = FAMILIAS_ARTE[familia]
  const h = createHash("sha256").update(`${familia}:${semente}`).digest()
  const cena = h.readUInt32BE(0) % f.cenas + 1
  const frases = f.frasesDaCena?.[cena] ?? f.frases
  return { familia, arquivo: `${f.arquivo}-${cena}.jpg`, frase: frases[h.readUInt32BE(4) % frases.length] }
}

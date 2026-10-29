// As etapas do quadro de Gravações Externas.
//
// Pedido de 28/10/2026: o quadro (antes "Jobs") usava as seis colunas do
// audiovisual — Entrada, Produção, Edição… — e tudo o que acontece antes da
// edição caía em "Produção": achar o videomaker, agendar, gravar, esperar o
// drive. A planilha CONTROLE VIDEOMAKER existia porque o quadro não dizia em
// que pé cada gravação estava (61 linhas "Agendado" com data passada, nunca
// atualizadas). As colunas agora são as etapas da gravação, na ordem em que a
// Débora acompanha.
//
// Cinco, não seis (pedido do Giovani no mesmo dia): "Gravado, falta o
// material" saiu de coluna. Do agendado o card vai direto para a edição ou,
// se veio editado, para o envio. O que a coluna mostrava virou etiqueta: a
// gravação agendada cuja data passou sem material chegar (`faltaOMaterial`).
//
// Nada novo no banco: a etapa é DERIVADA do `statusInterno`, como a fase em
// job-fase.ts. A nota e o pagamento do videomaker não são etapa — correm em
// paralelo desde que o material chega (decisão do Giovani: "mandou o arquivo,
// editado ou bruto, já tem que enviar a nota") e aparecem no card.
//
// Sem import de runtime do Prisma: este módulo vai para o navegador.
import type { StatusInterno } from "@prisma/client"
import { momentoDoJob } from "./ficha-do-job"
import { proximaAcao, responsavelAtual, type JobParaLeitura, type Responsavel } from "./job-fase"

export type EtapaDaGravacao = "a_agendar" | "agendado" | "em_edicao" | "para_enviar" | "concluido"

export const ETAPAS: { id: EtapaDaGravacao; rotulo: string; dica: string }[] = [
  { id: "a_agendar",   rotulo: "A agendar",              dica: "Achar o videomaker e confirmar dia e hora." },
  { id: "agendado",    rotulo: "Agendado",               dica: "Videomaker confirmado, até o material chegar." },
  { id: "em_edicao",   rotulo: "Em edição",              dica: "Só o que não veio editado pelo videomaker." },
  { id: "para_enviar", rotulo: "Para enviar ao cliente", dica: "Pronto: editado aqui ou pelo videomaker." },
  { id: "concluido",   rotulo: "Concluído",              dica: "Enviado ao cliente. Encerrado sem entrega também fica aqui." },
]

export const ROTULO_DA_ETAPA = Object.fromEntries(ETAPAS.map((e) => [e.id, e.rotulo])) as Record<EtapaDaGravacao, string>

/**
 * StatusInterno → etapa. `Record` completo: status novo no enum sem etapa não
 * compila — e o teste enumera o enum em runtime.
 */
export const ETAPA_DO_STATUS: Record<StatusInterno, EtapaDaGravacao> = {
  // Ninguém confirmou ainda. O convite enviado e sem resposta continua aqui:
  // a gravação só está agendada quando o videomaker aceita.
  pedido_criado:                "a_agendar",
  aguardando_aprovacao_interna: "a_agendar",
  aguardando_triagem:           "a_agendar",
  urgencia_pendente_aprovacao:  "a_agendar",
  urgencia_aprovada:            "a_agendar",
  planejamento:                 "a_agendar",
  videomaker_recusou:           "a_agendar",
  videomaker_notificado:        "a_agendar",

  // Gravou e ainda não mandou: continua agendado, com a etiqueta
  // "Falta o material" (faltaOMaterial).
  videomaker_aceitou:           "agendado",
  captacao_agendada:            "agendado",
  captacao_realizada:           "agendado",

  // Material recebido e nosso para editar. A revisão e o ajuste ainda são
  // edição: o vídeo não está pronto para o cliente.
  brutos_enviados:              "em_edicao",
  editor_atribuido:             "em_edicao",
  fila_edicao:                  "em_edicao",
  editando:                     "em_edicao",
  revisao_pendente:             "em_edicao",
  ajuste_solicitado:            "em_edicao",
  impedimento:                  "em_edicao",

  edicao_finalizada:            "para_enviar",
  aprovado:                     "para_enviar",
  postagem_pendente:            "para_enviar",

  postado:                      "concluido",
  entregue_cliente:             "concluido",
  contagem_15_dias_iniciada:    "concluido",
  lembrete_15_dias_enviado:     "concluido",
  expirado:                     "concluido",
  encerrado:                    "concluido",
}

export function etapaDaGravacao(job: { statusInterno: string }): EtapaDaGravacao {
  return ETAPA_DO_STATUS[job.statusInterno as StatusInterno] ?? "a_agendar"
}

const ordem = (e: EtapaDaGravacao) => ETAPAS.findIndex((x) => x.id === e)

/**
 * O status que soltar o card na etapa aplica.
 *
 * Só "Em edição" depende de onde o card vem: chegando do agendado, é o
 * material que chegou (`brutos_enviados`, que pede o link do drive e a nota do
 * videomaker); voltando de "Para enviar", é edição de novo (`editando`).
 * "Para enviar" vale para os dois caminhos — editado aqui ou pelo videomaker.
 */
export function statusAoSoltar(destino: EtapaDaGravacao, origem: EtapaDaGravacao): StatusInterno {
  switch (destino) {
    case "a_agendar":   return "planejamento"
    case "agendado":    return "captacao_agendada"
    case "em_edicao":   return ordem(origem) < ordem("em_edicao") ? "brutos_enviados" : "editando"
    case "para_enviar": return "aprovado"
    case "concluido":   return "entregue_cliente"
  }
}

/** Etapas em que o card só entra com o videomaker escalado. */
export const PEDE_VIDEOMAKER: EtapaDaGravacao[] = ["agendado"]

/**
 * Agendado, mas o dia já passou (ou o videomaker marcou que gravou) e o
 * material não chegou. É o que a coluna "Gravado" mostrava — e o que a
 * planilha escondia: a linha ficava "Agendado" para sempre.
 */
export function faltaOMaterial(
  job: { statusInterno: string; dataCaptacao?: string | Date | null; dataEvento?: string | Date | null },
  hoje: string,
): boolean {
  if (etapaDaGravacao(job) !== "agendado") return false
  if (job.statusInterno === "captacao_realizada") return true
  const dia = momentoDoJob(job)?.dia
  return !!dia && dia < hoje
}

/**
 * O material do videomaker chegou nesta mudança? É quando a nota dele é pedida.
 *
 * Antes só `brutos_enviados` pedia. O material editado pelo videomaker vai
 * direto do agendado para "Para enviar", sem passar por brutos — e a nota tem
 * que ser pedida do mesmo jeito. Encerrar sem entrega não conta.
 */
export function materialChegouAgora(de: string, para: string): boolean {
  if (para === "encerrado" || para === "expirado") return false
  const antes = ordem(etapaDaGravacao({ statusInterno: de }))
  const depois = ordem(etapaDaGravacao({ statusInterno: para }))
  return antes <= ordem("agendado") && depois >= ordem("em_edicao")
}

// ── Quem edita ───────────────────────────────────────────────────────────────
//
// Combinado no agendamento (decisão do Giovani, 28/10/2026): o brief já sai
// dizendo ao videomaker se ele edita, e a etiqueta no card diz para onde o
// material vai quando chegar — "Em edição" só recebe o que é nosso.

export type EdicaoDaGravacao = "videomaker" | "equipe" | "sem_edicao"

export const EDICAO: { id: EdicaoDaGravacao; rotulo: string; brief: string }[] = [
  { id: "equipe",     rotulo: "Nós editamos",     brief: "Mande só os brutos: a edição é nossa." },
  { id: "videomaker", rotulo: "Videomaker edita", brief: "Você entrega o vídeo editado, no modelo combinado." },
  { id: "sem_edicao", rotulo: "Sem edição",       brief: "O cliente recebe os brutos, sem edição." },
]

export function ehEdicaoDaGravacao(v: unknown): v is EdicaoDaGravacao {
  return EDICAO.some((e) => e.id === v)
}

export function rotuloDaEdicao(v: string | null | undefined): string | null {
  return EDICAO.find((e) => e.id === v)?.rotulo ?? null
}

// ── Nota e pagamento do videomaker ───────────────────────────────────────────
//
// Corre em paralelo às etapas: a nota é pedida quando o material chega
// (materialChegouAgora) e o card mostra em que pé ela está até o pagamento.
// Vem de CustoVideomaker.statusPagamento e NotaFiscalUpload.status, que a API
// só devolve para quem vê custos ou aprova pagamentos — sem eles, null.

export type PagamentoDoCard = {
  statusInterno: string
  videomakerId?: string | null
  custos?: { statusPagamento: string; pago: boolean }[] | null
  notasFiscais?: { status: string }[] | null
}

export type EtapaDaNota = "falta" | "contestada" | "recebida" | "compras" | "paga"
export type SituacaoDaNota = { etapa: EtapaDaNota; texto: string; tom: "falta" | "andamento" | "ok" | "alerta" }

/**
 * Em que pé está a nota. O caminho é o da casa (Giovani, 29/10/2026): o
 * videomaker manda a nota, a Débora encaminha ao setor de compras, compras
 * paga. `aguardando_pagamento` é "enviada para compras" — não há aprovação de
 * pagamento no meio, nem valor ou PIX a conferir aqui.
 */
export function situacaoDaNota(job: PagamentoDoCard): SituacaoDaNota | null {
  if (!job.custos || !job.notasFiscais || !job.videomakerId) return null
  const custos = job.custos, notas = job.notasFiscais
  if (custos.some((c) => c.pago || c.statusPagamento === "pago")) return { etapa: "paga", texto: "Nota paga", tom: "ok" }
  if (custos.some((c) => c.statusPagamento === "aguardando_pagamento")) return { etapa: "compras", texto: "Enviada para compras", tom: "andamento" }
  if (custos.some((c) => c.statusPagamento === "contestado")) return { etapa: "contestada", texto: "Nota a refazer", tom: "alerta" }
  if (custos.some((c) => c.statusPagamento === "nf_enviada") || notas.some((n) => n.status === "enviada" || n.status === "aprovada")) {
    return { etapa: "recebida", texto: "Nota recebida", tom: "andamento" }
  }
  // Antes do material, a nota ainda não foi pedida — não é falta.
  if (ordem(etapaDaGravacao(job)) <= ordem("agendado")) return null
  if (job.statusInterno === "encerrado" && custos.length === 0 && notas.length === 0) return null
  return { etapa: "falta", texto: "Falta a nota", tom: "falta" }
}

// ── Próximo passo (card aberto) ──────────────────────────────────────────────
//
// Pedido do Giovani (28/10/2026): o card aberto mostra só o passo da vez, e o
// campo aparece quando chega a hora — contratou o videomaker, aparece o lugar
// do link do material; chegou o material, aparece a nota. Nada de todos os
// campos de uma vez. A nota corre ao lado (situacaoDaNota), não é passo.

export type PassoDaGravacao = "escalar" | "confirmar" | "material" | "edicao" | "enviar" | "concluido"

export function passoDaGravacao(job: { statusInterno: string; videomakerId?: string | null }): PassoDaGravacao {
  switch (etapaDaGravacao(job)) {
    case "a_agendar":   return job.videomakerId ? "confirmar" : "escalar"
    case "agendado":    return "material"
    case "em_edicao":   return "edicao"
    case "para_enviar": return "enviar"
    case "concluido":   return "concluido"
  }
}

/**
 * A frase de "próxima ação" do card no quadro de Gravações Externas. A de
 * job-fase.ts fala a língua do audiovisual ("Aguardando publicação" no vídeo
 * aprovado), e aqui aprovado é "Enviar ao cliente". Na edição, ela continua
 * valendo: revisão, ajuste e impedimento dizem mais que "Em edição".
 */
export function acaoDaGravacao(job: JobParaLeitura & { dataCaptacao?: string | Date | null; dataEvento?: string | Date | null }, hoje: string): string {
  switch (passoDaGravacao(job)) {
    case "escalar":   return "Escalar o videomaker"
    case "confirmar": return "Aguardando o videomaker confirmar"
    case "material":  return faltaOMaterial(job, hoje) ? "Cobrar o material do videomaker" : "Aguardando a gravação"
    case "edicao":    return proximaAcao(job)
    case "enviar":    return "Enviar ao cliente"
    case "concluido": return "Enviado ao cliente"
  }
}

/**
 * De quem é a vez, no quadro e no card aberto. Igual a responsavelAtual, menos
 * no "Para enviar ao cliente": ali a vez é da gestão, que manda ao cliente, não
 * da social — em gravação externa não há publicação no meio.
 */
export function vezNaGravacao(job: JobParaLeitura & { gestor?: { nome: string } | null }): Responsavel {
  return passoDaGravacao(job) === "enviar"
    ? { papel: "Admin", nome: job.gestor?.nome ?? null }
    : responsavelAtual(job)
}

// ── Linha do tempo (card aberto) ─────────────────────────────────────────────
//
// Pedido do Giovani (29/10/2026), depois de abrir os cards na prévia: "ainda
// confuso; se tivesse um step, uma timeline". Duas trilhas no topo da ficha: a
// do vídeo (pedido → envio ao cliente) e a da nota do videomaker, que só
// aparece quando o material chega. O passo "agora" é o do PassoDaGravacao.

export type EstadoDoPasso = "feito" | "agora" | "depois" | "pulado"
export type PassoDaTrilha = { id: string; rotulo: string; estado: EstadoDoPasso; detalhe: string | null }

type JobDaLinha = PagamentoDoCard & {
  createdAt?: string | Date | null
  finalizadaEm?: string | Date | null
  dataCaptacao?: string | Date | null
  dataEvento?: string | Date | null
  edicaoPor?: string | null
  videomaker?: { nome: string } | null
  editor?: { nome: string } | null
  historicos?: { statusNovo: string; createdAt: string | Date }[] | null
}

const diaCurto = (v: string | Date | null | undefined) => {
  const dia = momentoDoJob({ dataCaptacao: v ?? null })?.dia
  return dia ? `${dia.slice(8, 10)}/${dia.slice(5, 7)}` : null
}
const nome1 = (n?: string | null) => n?.trim().split(/\s+/)[0] ?? null

/** Quando o material chegou: a primeira mudança do histórico que passou do agendado. */
function chegadaDoMaterial(job: JobDaLinha): string | Date | null {
  const h = [...(job.historicos ?? [])].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  return h.find((x) => (ETAPA_DO_STATUS as Record<string, EtapaDaGravacao>)[x.statusNovo] && ordem(etapaDaGravacao({ statusInterno: x.statusNovo })) >= ordem("em_edicao"))?.createdAt ?? null
}

export function trilhaDoVideo(job: JobDaLinha, hoje: string): PassoDaTrilha[] {
  const passo = passoDaGravacao(job)
  const gravou = passo !== "escalar" && passo !== "confirmar" && (passo !== "material" || faltaOMaterial(job, hoje))
  const atual =
    passo === "escalar" || passo === "confirmar" ? 1
    : passo === "material" ? (gravou ? 3 : 2)
    : passo === "edicao" ? 4
    : passo === "enviar" ? 5
    : 6
  const semNossaEdicao = job.edicaoPor === "videomaker" || job.edicaoPor === "sem_edicao"
  const quando = momentoDoJob(job)
  const estado = (i: number): EstadoDoPasso => (i < atual ? "feito" : i === atual ? "agora" : "depois")
  return [
    { id: "pedido", rotulo: "Pedido", estado: "feito", detalhe: diaCurto(job.createdAt) },
    { id: "videomaker", rotulo: "Videomaker", estado: estado(1), detalhe: nome1(job.videomaker?.nome) ?? (atual === 1 ? "escalar" : null) },
    { id: "gravacao", rotulo: "Gravação", estado: estado(2), detalhe: quando ? `${quando.dia.slice(8, 10)}/${quando.dia.slice(5, 7)}` : null },
    { id: "material", rotulo: "Material", estado: estado(3), detalhe: atual > 3 ? diaCurto(chegadaDoMaterial(job)) : atual === 3 ? "falta chegar" : null },
    {
      id: "edicao",
      rotulo: "Edição",
      // Veio editado ou vai sem edição: o passo existe, mas não é nosso.
      estado: semNossaEdicao && atual > 4 ? "pulado" : semNossaEdicao && atual <= 4 ? "depois" : estado(4),
      detalhe: semNossaEdicao ? rotuloDaEdicao(job.edicaoPor) : nome1(job.editor?.nome),
    },
    { id: "envio", rotulo: "Envio ao cliente", estado: estado(5), detalhe: atual === 6 ? diaCurto(job.finalizadaEm) : null },
  ]
}

/** A trilha da nota, ou null antes de o material chegar (a nota ainda não foi pedida). */
export function trilhaDaNota(job: JobDaLinha): PassoDaTrilha[] | null {
  const nota = situacaoDaNota(job)
  if (!nota) return null
  const atual = { falta: 1, contestada: 1, recebida: 2, compras: 3, paga: 4 }[nota.etapa]
  const estado = (i: number): EstadoDoPasso => (i < atual ? "feito" : i === atual ? "agora" : "depois")
  return [
    { id: "pedida", rotulo: "Pedida", estado: "feito", detalhe: "WhatsApp" },
    { id: "recebida", rotulo: "Recebida", estado: estado(1), detalhe: nota.etapa === "contestada" ? "a refazer" : null },
    { id: "compras", rotulo: "Enviada para compras", estado: estado(2), detalhe: null },
    { id: "paga", rotulo: "Paga", estado: estado(3), detalhe: null },
  ]
}

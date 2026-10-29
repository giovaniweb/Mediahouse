// Quem recebe o quê nas Gravações Externas, e com que texto — sem banco, para
// testar de verdade (tests/unit/avisos-gravacao.spec.ts). Quem envia é
// lib/avisos-gravacao.ts.
//
// A tabela é a que o Giovani aprovou em 29/10/2026:
//
//   operação (quem tem "Opera Gravações Externas", a Débora): o dia a dia —
//     entrou para agendar, confirmou, recusou, material, nota, pronta;
//   gestão (admin, gestor, quem recebe tudo): só quando trava — recusa,
//     sem videomaker perto da data, material atrasado, nota parada;
//   videomaker: véspera, a colinha no dia (do kit), cobrança do material,
//     pagamento feito;
//   cliente: confirmou o agendamento e o vídeo pronto;
//   quem pediu: entregue.
//
// Textos na regra de lib/whatsapp.ts: a primeira linha diz o que aconteceu e o
// que fazer, no máximo um emoji, o código junto do nome, o link sozinho.
import { diasEntre, somarDias } from "./datas"
import { momentoDoJob, rotuloDoMomento } from "./ficha-do-job"
import { etapaDaGravacao, levarDaGravacao, materialChegouAgora } from "./etapas-da-gravacao"

export type EventoDaGravacao =
  | "entrou" | "confirmada" | "recusada" | "material" | "nota_recebida" | "pronta" | "concluida" | "nota_paga"
export type RegraDaGravacao = "vespera" | "dia" | "sem_material" | "material_travado" | "sem_videomaker" | "nota_parada"
export type PapelDoAviso = "operacao" | "gestao" | "videomaker" | "cliente" | "solicitante"
export type Mensagens = Partial<Record<PapelDoAviso, string>>

export type DadosDoAviso = {
  codigo: string
  titulo: string
  statusInterno: string
  clienteFinalNome?: string | null
  edicaoPor?: string | null
  tipoGravacao?: string | null
  temBrinde?: boolean | null
  brinde?: string | null
  levar?: string | null
  dataCaptacao?: string | Date | null
  dataEvento?: string | Date | null
  localGravacao?: string | null
  localEvento?: string | null
  linkFinal?: string | null
  videomakerId?: string | null
  videomaker?: { nome: string } | null
  /** O link do convite: é por ele que o videomaker entrega. */
  linkEntrega?: string | null
  /** A colinha do dia, já preenchida (lib/kit-videomaker.ts). Sem ela, o dia não avisa. */
  colinha?: string | null
  /** A página de acompanhamento de quem pediu (lib/acompanhamento-gravacao.ts). */
  linkAcompanhamento?: string | null
}

const cliente = (d: DadosDoAviso) => d.clienteFinalNome?.trim() || d.titulo
const ref = (d: DadosDoAviso) => `${cliente(d)} (${d.codigo})`
const nome1 = (d: DadosDoAviso) => d.videomaker?.nome?.trim().split(/\s+/)[0] ?? "O videomaker"
const quando = (d: DadosDoAviso) => {
  const m = momentoDoJob(d)
  return m ? rotuloDoMomento(m) : "data a confirmar"
}
const onde = (d: DadosDoAviso) => d.localGravacao?.trim() || d.localEvento?.trim() || null

export function mensagensDoEvento(evento: EventoDaGravacao, d: DadosDoAviso): Mensagens {
  switch (evento) {
    case "entrou":
      return { operacao: `📋 Nova gravação para agendar: ${ref(d)}, ${quando(d)}.\n\nEscale o videomaker no NuFlow.` }
    case "confirmada":
      return {
        operacao: `✅ ${nome1(d)} confirmou a gravação de ${ref(d)}, ${quando(d)}.`,
        cliente: [
          `Olá! Sua gravação está confirmada: ${quando(d)}, com ${d.videomaker?.nome ?? "o nosso videomaker"}.`,
          onde(d) && `Local: ${onde(d)}`,
          "Qualquer mudança, fale com a nossa equipe.",
        ].filter(Boolean).join("\n"),
      }
    case "recusada": {
      const texto = `⚠️ ${nome1(d)} recusou a gravação de ${ref(d)}, ${quando(d)}.\n\nEscale outro videomaker.`
      return { operacao: texto, gestao: texto }
    }
    case "material":
      return {
        operacao: `📁 Material recebido de ${ref(d)}. ${d.statusInterno === "aprovado" ? "Pronto para enviar ao cliente." : "Vai para a edição."}`,
      }
    case "nota_recebida":
      return { operacao: `🧾 A nota de ${nome1(d)} chegou: ${ref(d)}.\n\nEnvie para compras no NuFlow.` }
    case "pronta":
      return { operacao: `🎬 Vídeo pronto: ${ref(d)}.\n\nEnvie ao cliente e marque como enviado.` }
    case "concluida":
      return {
        ...(d.linkFinal ? { cliente: `Olá! O vídeo da sua gravação está pronto:\n${d.linkFinal}` } : {}),
        solicitante: [`✔️ Gravação entregue ao cliente: ${ref(d)}.`, d.linkAcompanhamento && `Acompanhamento:\n${d.linkAcompanhamento}`].filter(Boolean).join("\n\n"),
      }
    case "nota_paga":
      return { videomaker: `💸 Pagamento feito: gravação ${ref(d)}. Obrigado pelo trabalho!` }
  }
}

/**
 * Os avisos de quando a gravação é cancelada (lib/cancelar-gravacao.ts). O
 * videomaker convidado ou confirmado fica sabendo — ele separou a agenda — e,
 * se cobra pelo cancelamento, recebe junto o link para mandar a nota da taxa.
 * A operação fica com o motivo.
 */
export function mensagensDoCancelamento(d: DadosDoAviso, c: { motivo: string; avisaVideomaker: boolean; linkNota?: string | null }): Mensagens {
  const texto = `❌ Gravação cancelada: ${ref(d)}, ${quando(d)}.`
  return {
    ...(c.avisaVideomaker ? {
      videomaker: c.linkNota ? `${texto}\n\nMande a nota da taxa de cancelamento por aqui:\n${c.linkNota}` : `${texto} Pode liberar a sua agenda.`,
    } : {}),
    operacao: [texto, `Motivo: ${c.motivo}`, c.linkNota && "O videomaker cobra o cancelamento: a nota dele foi pedida."].filter(Boolean).join("\n"),
  }
}

/**
 * Os avisos de calendário que valem hoje. Cada um sai uma vez no dia em que
 * vale (a rotina roda de manhã); os de trava saem só no dia em que travou,
 * para não virar cobrança diária na cabeça de quem só quer saber do problema.
 */
export function regrasDaGravacao(
  d: DadosDoAviso,
  hoje: string,
  /** Quando a nota chegou e ainda não foi para compras (dia em São Paulo). */
  notaRecebidaEm?: string | null,
): RegraDaGravacao[] {
  const etapa = etapaDaGravacao(d)
  const dia = momentoDoJob(d)?.dia ?? null
  const regras: RegraDaGravacao[] = []
  if (dia && etapa === "agendado") {
    if (dia === somarDias(hoje, 1)) regras.push("vespera")
    if (dia === hoje && d.statusInterno !== "captacao_realizada") regras.push("dia")
    const depois = diasEntre(dia, hoje)
    if (depois === 1 || depois === 2) regras.push("sem_material")
    if (depois === 3) regras.push("material_travado")
  }
  if (dia && etapa === "a_agendar" && !d.videomakerId) {
    const faltam = diasEntre(hoje, dia)
    if (faltam >= 0 && faltam <= 2) regras.push("sem_videomaker")
  }
  if (notaRecebidaEm && diasEntre(notaRecebidaEm, hoje) === 5) regras.push("nota_parada")
  return regras
}

const EDICAO_NA_VESPERA: Record<string, string> = {
  equipe: "A edição é nossa: depois, mande só os brutos.",
  videomaker: "A edição é sua: depois, mande os brutos e o vídeo pronto.",
  sem_edicao: "Sem edição: depois, mande os brutos.",
}

export function mensagensDaRegra(regra: RegraDaGravacao, d: DadosDoAviso, hoje: string): Mensagens {
  switch (regra) {
    case "vespera": {
      const m = momentoDoJob(d)
      const levar = levarDaGravacao(d)
      return {
        videomaker: [
          `🎥 Amanhã${m?.hora ? `, ${m.hora}` : ""}: gravação em ${cliente(d)} (${d.codigo}).`,
          onde(d),
          levar && `Levar: ${levar}`,
          d.edicaoPor && EDICAO_NA_VESPERA[d.edicaoPor],
          d.linkEntrega && `Entrega depois da gravação:\n${d.linkEntrega}`,
        ].filter(Boolean).join("\n"),
      }
    }
    case "dia":
      // A colinha do kit, no WhatsApp do videomaker na manhã da gravação.
      return d.colinha ? { videomaker: d.colinha } : {}
    case "sem_material":
      return {
        videomaker: [`📁 Falta o material da gravação ${ref(d)}.`, d.linkEntrega && `Entregue pelo link:\n${d.linkEntrega}`].filter(Boolean).join("\n\n"),
        operacao: `📁 ${nome1(d)} ainda não mandou o material de ${ref(d)}.`,
      }
    case "material_travado": {
      const dia = momentoDoJob(d)?.dia
      return { gestao: `⚠️ Gravação travada: ${ref(d)} gravou${dia ? ` há ${diasEntre(dia, hoje)} dias` : ""} e o material não chegou.` }
    }
    case "sem_videomaker":
      return { gestao: `⚠️ Gravação sem videomaker: ${ref(d)}, ${quando(d)}.` }
    case "nota_parada":
      return { gestao: `⚠️ Nota parada: a nota de ${nome1(d)} (${ref(d)}) chegou há 5 dias e não foi para compras.` }
  }
}

/**
 * A mudança de status que vira aviso de gravação. As outras não avisam ninguém
 * por aqui (a edição interna segue com os avisos do editor).
 */
export function eventoDaMudanca(de: string, para: string): EventoDaGravacao | null {
  if (para === "videomaker_aceitou" || (para === "captacao_agendada" && de === "videomaker_notificado")) return "confirmada"
  if (para === "videomaker_recusou") return "recusada"
  if (materialChegouAgora(de, para)) return "material"
  const antes = etapaDaGravacao({ statusInterno: de }), depois = etapaDaGravacao({ statusInterno: para })
  if (antes === "em_edicao" && depois === "para_enviar") return "pronta"
  if (depois === "concluido" && antes !== "concluido" && para !== "encerrado" && para !== "expirado") return "concluida"
  return null
}

// A página de acompanhamento de quem pediu a gravação (Giovani, 29/10/2026:
// "para quem solicitou o videomaker tem uma página de acompanhamento").
//
// É o link público que a demanda já tinha (/d/<token>, o do botão
// Compartilhar), com a cara da gravação: a situação numa frase, quando, onde,
// quem vai e a mesma linha do tempo do card aberto (trilhaDoVideo). A gravação
// já nasce com o link: o pedido público devolve e manda no WhatsApp de quem
// pediu; o pedido de dentro tem o link no Compartilhar do card.
//
// Quem abre não tem conta. Sai daqui só o que quem pediu já sabe ou precisa
// saber: nada de custo, nota, telefone, histórico cru ou nome do editor.
import { randomBytes } from "node:crypto"
import { momentoDoJob, rotuloDoMomento } from "./ficha-do-job"
import { AGUARDANDO_APROVACAO } from "./job-fase"
import {
  etapaDaGravacao,
  faltaOMaterial,
  passoDaGravacao,
  rotuloDaEdicao,
  rotuloDoTipoDeGravacao,
  trilhaDoVideo,
  type PassoDaTrilha,
} from "./etapas-da-gravacao"
import type { StatusInterno } from "@prisma/client"

/** Token novo do link público: o mesmo formato do Compartilhar. */
export function novoTokenPublico(): string {
  return randomBytes(18).toString("base64url")
}

export function linkPublicoDaDemanda(token: string): string {
  const base = (process.env.NEXTAUTH_URL ?? "http://localhost:3000").trim().replace(/\/$/, "")
  return `${base}/d/${token}`
}

export type GravacaoParaAcompanhar = {
  statusInterno: string
  statusVisivel?: string | null
  titulo: string
  clienteFinalNome?: string | null
  tipoGravacao?: string | null
  edicaoPor?: string | null
  videomakerId?: string | null
  videomaker?: { nome: string } | null
  dataCaptacao?: string | Date | null
  dataEvento?: string | Date | null
  localGravacao?: string | null
  localEvento?: string | null
  createdAt?: string | Date | null
  finalizadaEm?: string | Date | null
  historicos?: { statusNovo: string; createdAt: string | Date }[] | null
}

export type AcompanhamentoDaGravacao = {
  cliente: string
  tipo: string | null
  quando: string | null
  onde: string | null
  /** Só depois que o videomaker confirma. */
  videomaker: string | null
  /** A frase que a pessoa veio buscar. */
  situacao: string
  tom: "andamento" | "ok" | "alerta"
  /** null quando não há caminho a mostrar (recusado ou encerrado). */
  trilha: PassoDaTrilha[] | null
}

const SITUACAO: Record<ReturnType<typeof passoDaGravacao>, string> = {
  escalar: "Procurando o videomaker",
  confirmar: "Videomaker convidado, esperando a confirmação",
  material: "Gravação agendada",
  edicao: "Em edição",
  enviar: "Vídeo pronto, falta enviar ao cliente",
  concluido: "Enviado ao cliente",
}

export function acompanhamentoDaGravacao(g: GravacaoParaAcompanhar, hoje: string): AcompanhamentoDaGravacao {
  const m = momentoDoJob(g)
  const etapa = etapaDaGravacao(g)
  const confirmado = etapa !== "a_agendar"
  const base = {
    cliente: g.clienteFinalNome?.trim() || g.titulo,
    tipo: rotuloDoTipoDeGravacao(g.tipoGravacao),
    quando: m ? rotuloDoMomento(m) : null,
    onde: g.localGravacao?.trim() || g.localEvento?.trim() || null,
    videomaker: confirmado ? g.videomaker?.nome ?? null : null,
  }

  // Recusado na aprovação: encerrado sem nunca sair da entrada.
  if (g.statusInterno === "encerrado" && g.statusVisivel === "entrada") return { ...base, situacao: "Pedido não aprovado", tom: "alerta", trilha: null }
  if (g.statusInterno === "encerrado" || g.statusInterno === "expirado") return { ...base, situacao: "Gravação encerrada", tom: "alerta", trilha: null }

  const trilha = trilhaDoVideo(g, hoje).map((p): PassoDaTrilha => {
    // As palavras de dentro viram as de quem acompanha de fora.
    if (p.id === "videomaker" && p.estado !== "feito") return { ...p, detalhe: p.estado === "agora" ? "a confirmar" : null }
    if (p.id === "material" && p.detalhe === "falta chegar") return { ...p, detalhe: "aguardando" }
    if (p.id === "edicao") return { ...p, detalhe: g.edicaoPor === "videomaker" || g.edicaoPor === "sem_edicao" ? rotuloDaEdicao(g.edicaoPor) : null }
    return p
  })

  if (AGUARDANDO_APROVACAO.includes(g.statusInterno as StatusInterno)) {
    return {
      ...base, situacao: "Pedido em análise", tom: "andamento",
      trilha: trilha.map((p) => (p.id === "pedido" ? { ...p, estado: "agora", detalhe: "em análise" } : { ...p, estado: "depois", detalhe: null })),
    }
  }

  const passo = passoDaGravacao(g)
  const situacao = passo === "material" && faltaOMaterial(g, hoje) ? "Gravado, esperando o material" : SITUACAO[passo]
  return { ...base, situacao, tom: passo === "concluido" ? "ok" : "andamento", trilha }
}

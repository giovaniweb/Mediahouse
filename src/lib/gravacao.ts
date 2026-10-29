// O pedido de gravação, em regras puras. Um formulário só monta os dois pedidos:
// o "Quero um videomaker" da área pública (/c/<slug>/gravacao) e o "+ Novo Job"
// de /jobs. O que cada um envia sai daqui, para a descrição e as datas não
// divergirem entre as duas portas.
//
// Sem import de runtime do servidor: este módulo vai para o navegador.
import { hojeEmSaoPaulo, somarDias } from "@/lib/datas"

export type CamposGravacao = {
  cliente: string
  endereco: string
  /** "AAAA-MM-DD" */
  data: string
  /** "HH:MM", horário de Brasília */
  hora: string
  observacao: string
}

/** Quem da equipe acompanha a gravação (só no Novo Job). */
export type Acompanhante = { id: string; nome: string; telefone?: string | null }

/**
 * Horário de Brasília explícito: sem fuso, o servidor (UTC na Vercel) lia
 * "14:00" como 14:00 UTC, e a agenda mostrava 11:00.
 */
export function momentoDaGravacao(data: string, hora: string): string {
  return `${data}T${hora}:00-03:00`
}

export function dataBR(data: string): string {
  return data.split("-").reverse().join("/")
}

/** "Gravação · Clínica Dra. Solange · 24/10" — editável depois no detalhe. */
export function tituloDaGravacao(cliente: string, data: string): string {
  return `Gravação · ${cliente.trim()} · ${dataBR(data).slice(0, 5)}`
}

export function descricaoDaGravacao(c: CamposGravacao, acompanhante?: Acompanhante | null): string {
  return [
    `Gravação em ${c.cliente.trim()}.`,
    `Endereço: ${c.endereco.trim()}`,
    `Data: ${dataBR(c.data)} às ${c.hora} (horário de Brasília)`,
    c.observacao.trim() && `O que gravar: ${c.observacao.trim()}`,
    acompanhante && `Quem acompanha: ${acompanhante.nome}${acompanhante.telefone ? ` · WhatsApp ${whatsappLegivel(acompanhante.telefone)}` : ""}`,
  ].filter(Boolean).join("\n")
}

/**
 * O prazo do job é a própria gravação. Prioridade Normal, a menos que a
 * gravação seja daqui a 2 dias ou menos: aí é Alta. Urgência não sai daqui —
 * ela pede motivo e muda a aprovação, e continua sendo escolha de alguém.
 */
export function prioridadeDaGravacao(data: string, hoje: string = hojeEmSaoPaulo()): "normal" | "alta" {
  return data <= somarDias(hoje, 2) ? "alta" : "normal"
}

/**
 * A cidade sai do fim do endereço ("Rua X, 120, Centro, Curitiba - PR" →
 * "Curitiba"), para o filtro de Região do quadro funcionar sem um campo a mais.
 * Sem vírgula não há como separar a cidade da rua: aí fica "N/A", como no
 * pedido público, e quem quiser corrige no detalhe.
 */
export function cidadeDoEndereco(endereco: string): string {
  const partes = endereco.split(",").map((p) => p.trim()).filter(Boolean)
  for (let i = partes.length - 1; i > 0; i--) {
    // CEP e número não são cidade.
    if (/^[\d\s.-]+$/.test(partes[i])) continue
    const cidade = partes[i].replace(/\s*[-/–]\s*[A-Za-z]{2}$/, "").trim()
    if (cidade.length >= 2) return cidade
  }
  return "N/A"
}

/** "5511987654321" → "(11) 98765-4321". Fora do formato, devolve como veio. */
export function whatsappLegivel(telefone: string | null | undefined): string | null {
  if (!telefone?.trim()) return null
  let n = telefone.replace(/\D/g, "")
  if (n.length >= 12 && n.startsWith("55")) n = n.slice(2)
  if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`
  if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`
  return telefone.trim()
}

export type NovoJob = CamposGravacao & {
  /** Token da equipe (`vm:<id>`) de um videomaker externo; vazio = escalar depois. */
  videomaker: string
  acompanhante: Acompanhante | null
  referencia?: string
  linkBrutos: string
  produtoIds: string[]
}

/**
 * O POST /api/demandas do "+ Novo Job". É uma cobertura do audiovisual
 * (departamento "eventos", tipo cobertura_evento) — nunca "growth", que é o
 * que o modal de vídeo grava.
 */
export function corpoDoNovoJob(j: NovoJob, hoje: string = hojeEmSaoPaulo()) {
  const quando = new Date(momentoDaGravacao(j.data, j.hora)).toISOString()
  return {
    titulo: tituloDaGravacao(j.cliente, j.data),
    descricao: descricaoDaGravacao(j, j.acompanhante),
    area: "audiovisual" as const,
    departamento: "eventos",
    tipoVideo: "cobertura_evento",
    cobertura: true,
    cidade: cidadeDoEndereco(j.endereco),
    prioridade: prioridadeDaGravacao(j.data, hoje),
    // Prazo como meia-noite UTC do dia, como o resto dos prazos.
    dataLimite: new Date(j.data).toISOString(),
    dataEvento: quando,
    dataCaptacao: quando,
    localEvento: j.endereco.trim(),
    localGravacao: j.endereco.trim(),
    clienteFinalNome: j.cliente.trim(),
    ...(j.acompanhante ? { responsavelIds: [j.acompanhante.id] } : {}),
    ...(j.videomaker ? { videomakerId: j.videomaker } : {}),
    ...(j.referencia ? { referencia: j.referencia } : {}),
    ...(j.linkBrutos.trim() ? { linkBrutos: j.linkBrutos.trim() } : {}),
    produtoIds: j.produtoIds,
    aprovarAoCriar: true,
  }
}

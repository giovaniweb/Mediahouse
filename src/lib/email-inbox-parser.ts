export interface DadosEmailViagem {
  solicitanteNome?: string
  motivoViagem?: string
  viajanteNome?: string
  clienteEvento?: string
  enderecoCompleto?: string
  dataAgendamentoRaw?: string
  dataAgendamentoIso?: string
  duracaoHoras?: number
  equipamento?: string
  precisaVideomaker?: boolean
  precisaCaixaMineira?: boolean
  observacoes?: string
  cidade?: string
  estado?: string
}

export interface EmailParseResult {
  template: "solicitacao_viagem" | "generico"
  confidence: number
  missing: string[]
  eligibleForDemand: boolean
  fields: DadosEmailViagem
  demand: {
    titulo: string
    descricao: string
    departamento: "audiovisual"
    tipoVideo: string
    cidade: string
    dataEvento: string | null
    localEvento: string | null
    localGravacao: string | null
    nomeSolicitante: string | null
  }
}

const LABELS: Record<string, keyof DadosEmailViagem> = {
  "NOME COMPLETO DO SOLICITANTE": "solicitanteNome",
  "MOTIVO DA VIAGEM": "motivoViagem",
  "NOME COMPLETO DO VIAJANTE": "viajanteNome",
  "NOME DO CLIENTE/EVENTO": "clienteEvento",
  "ENDERECO COMPLETO": "enderecoCompleto",
  "DATA E HORARIO DO AGENDAMENTO": "dataAgendamentoRaw",
  "EQUIPAMENTO": "equipamento",
  "PRECISA DE VIDEOMAKER": "precisaVideomaker",
  "PRECISA DE CAIXA MINEIRA": "precisaCaixaMineira",
  "OBSERVACOES GERAIS": "observacoes",
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[?：]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
}

export function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<(br|\/p|\/div|\/li|\/tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCharCode(Number(code)))
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function parseBoolean(value?: string): boolean | undefined {
  if (!value) return undefined
  const normalized = normalize(value)
  if (/^(SIM|S|YES|TRUE)\b/.test(normalized)) return true
  if (/^(NAO|N|NO|FALSE)\b/.test(normalized)) return false
  return undefined
}

function extractLocation(address?: string): { cidade?: string; estado?: string } {
  if (!address) return {}
  const cepPattern = /,\s*([^,]+?)\s*[–—-]\s*([A-Z]{2})\s*,?\s*CEP\b/i
  const cepMatch = address.match(cepPattern)
  if (cepMatch) return { cidade: cepMatch[1].trim(), estado: cepMatch[2].toUpperCase() }

  const statePattern = /,\s*([^,]+?)\s*[–—-]\s*([A-Z]{2})(?:\s|,|$)/i
  const stateMatch = address.match(statePattern)
  if (stateMatch) return { cidade: stateMatch[1].trim(), estado: stateMatch[2].toUpperCase() }
  return {}
}

function extractDate(raw: string | undefined, receivedAt: Date): {
  iso?: string
  duration?: number
} {
  if (!raw) return {}
  const match = raw.match(
    /(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?.*?(\d{1,2})(?::|h)?(\d{2})?\s*(?:h|hs|horas)?/i
  )
  const durationMatch = raw.match(/(?:media|m[eé]dia|duracao|dura[cç][aã]o)\s+de\s+(\d+(?:[.,]\d+)?)\s*h/i)
  const duration = durationMatch ? Number(durationMatch[1].replace(",", ".")) : undefined
  if (!match) return { duration }

  const day = Number(match[1])
  const month = Number(match[2])
  let year = match[3] ? Number(match[3]) : receivedAt.getFullYear()
  if (year < 100) year += 2000
  const hour = Number(match[4])
  const minute = Number(match[5] ?? "0")

  let date = new Date(
    `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00-03:00`
  )
  if (!match[3] && date.getTime() < receivedAt.getTime() - 30 * 24 * 60 * 60 * 1000) {
    year += 1
    date = new Date(
      `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00-03:00`
    )
  }
  return Number.isNaN(date.getTime()) ? { duration } : { iso: date.toISOString(), duration }
}

function formatDateLabel(iso?: string): string {
  if (!iso) return "data a confirmar"
  const date = new Date(iso)
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
  }).format(date)
}

export function parseInboundEmail(
  subject: string,
  bodyText: string,
  receivedAt = new Date()
): EmailParseResult {
  const rawValues: Partial<Record<keyof DadosEmailViagem, string>> = {}
  let currentKey: keyof DadosEmailViagem | null = null

  for (const rawLine of bodyText.replace(/\r/g, "").split("\n")) {
    const line = rawLine.trim()
    if (!line) continue
    if (/e-mail gerado automaticamente via microsoft forms/i.test(line)) {
      currentKey = null
      continue
    }

    const separator = line.indexOf(":")
    if (separator >= 0) {
      const possibleKey = LABELS[normalize(line.slice(0, separator))]
      if (possibleKey) {
        currentKey = possibleKey
        rawValues[possibleKey] = line.slice(separator + 1).trim()
        continue
      }
    }

    if (currentKey) {
      rawValues[currentKey] = [rawValues[currentKey], line].filter(Boolean).join("\n")
    }
  }

  const date = extractDate(rawValues.dataAgendamentoRaw, receivedAt)
  const location = extractLocation(rawValues.enderecoCompleto)
  const fields: DadosEmailViagem = {
    solicitanteNome: rawValues.solicitanteNome,
    motivoViagem: rawValues.motivoViagem,
    viajanteNome: rawValues.viajanteNome,
    clienteEvento: rawValues.clienteEvento,
    enderecoCompleto: rawValues.enderecoCompleto,
    dataAgendamentoRaw: rawValues.dataAgendamentoRaw,
    dataAgendamentoIso: date.iso,
    duracaoHoras: date.duration,
    equipamento: rawValues.equipamento,
    precisaVideomaker: parseBoolean(rawValues.precisaVideomaker),
    precisaCaixaMineira: parseBoolean(rawValues.precisaCaixaMineira),
    observacoes: rawValues.observacoes,
    ...location,
  }

  const recognized = Object.values(fields).filter((value) => value !== undefined && value !== "").length
  const isTravelRequest =
    /SOLICITA[CÇ][AÃ]O DE VIAGENS|NOVA SOLICITA[CÇ][AÃ]O DE VIAGENS/i.test(subject) ||
    recognized >= 4
  const required: Array<keyof DadosEmailViagem> = [
    "solicitanteNome",
    "clienteEvento",
    "enderecoCompleto",
    "dataAgendamentoRaw",
  ]
  const missing = required.filter((key) => !fields[key]).map((key) => key)
  if (fields.precisaVideomaker === undefined) missing.push("precisaVideomaker")

  const client = fields.clienteEvento || subject || "Solicitação recebida por e-mail"
  const title = `Captação — ${client} — ${formatDateLabel(fields.dataAgendamentoIso)}`
  const description = [
    `Solicitação recebida automaticamente por e-mail.`,
    fields.solicitanteNome ? `Solicitante: ${fields.solicitanteNome}` : null,
    fields.viajanteNome ? `Viajante: ${fields.viajanteNome}` : null,
    fields.motivoViagem ? `Motivo da viagem: ${fields.motivoViagem}` : null,
    fields.clienteEvento ? `Cliente/evento: ${fields.clienteEvento}` : null,
    fields.dataAgendamentoRaw ? `Agendamento: ${fields.dataAgendamentoRaw}` : null,
    fields.duracaoHoras ? `Duração estimada: ${fields.duracaoHoras}h` : null,
    fields.equipamento ? `Equipamento: ${fields.equipamento}` : null,
    fields.precisaVideomaker !== undefined
      ? `Precisa de videomaker: ${fields.precisaVideomaker ? "Sim" : "Não"}`
      : null,
    fields.precisaCaixaMineira !== undefined
      ? `Precisa de caixa mineira: ${fields.precisaCaixaMineira ? "Sim" : "Não"}`
      : null,
    fields.enderecoCompleto ? `Endereço: ${fields.enderecoCompleto}` : null,
    fields.observacoes ? `Observações: ${fields.observacoes}` : null,
  ].filter(Boolean).join("\n")

  return {
    template: isTravelRequest ? "solicitacao_viagem" : "generico",
    confidence: Math.min(1, recognized / 10),
    missing,
    eligibleForDemand: isTravelRequest && missing.length === 0 && fields.precisaVideomaker === true,
    fields,
    demand: {
      titulo: title.slice(0, 180),
      descricao: description || bodyText.slice(0, 5000),
      departamento: "audiovisual",
      tipoVideo: fields.precisaVideomaker ? "captacao_externa" : "solicitacao_operacional",
      cidade: fields.cidade
        ? `${fields.cidade}${fields.estado ? ` / ${fields.estado}` : ""}`
        : "A confirmar",
      dataEvento: fields.dataAgendamentoIso ?? null,
      localEvento: fields.enderecoCompleto ?? null,
      localGravacao: fields.enderecoCompleto ?? null,
      nomeSolicitante: fields.solicitanteNome ?? null,
    },
  }
}

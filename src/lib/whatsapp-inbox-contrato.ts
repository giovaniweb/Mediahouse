// Envelope recebido pelo emissor Evolution 2.3.7 (referência, não versão homologada).
// Não persistir o envelope bruto: pode conter apikey, base64 e URLs privadas.
export type ConteudoEntrada = {
  remoteJid: string; remoteJidAlt: string | null; pushName: string;
  enviadoEm: string | null; texto: string; tipo: string; midia: { mimetype: string; fileName: string } | null
}
export const objeto = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {}
const texto = (v: unknown, max: number) => typeof v === "string" ? v.slice(0,max) : ""
export function normalizarEntrada(data: unknown): { ignorado: string } | { providerMessageId: string; conteudo: ConteudoEntrada } {
  const d = objeto(data), key = objeto(d.key), m = objeto(d.message)
  if (key.fromMe === true) return { ignorado: "mensagem_propria" }
  if (key.fromMe !== false) throw new Error("origem_invalida")
  const jid = texto(key.remoteJid,160)
  if (jid.endsWith("@g.us") || jid === "status@broadcast") return { ignorado: "grupo_ou_status" }
  if (!jid || typeof key.id !== "string" || !key.id || key.id.length>128) throw new Error("identificador_invalido")
  let tipo = "text", midia: ConteudoEntrada["midia"] = null, caption = ""
  for (const [campo,nome] of [["audioMessage","audio"],["imageMessage","image"],["videoMessage","video"],["documentMessage","document"]]) {
    if (!m[campo]) continue
    const media = objeto(m[campo])
    tipo = nome; caption = texto(media.caption,8000)
    midia = { mimetype: texto(media.mimetype,100), fileName: texto(media.fileName,200) }
    break
  }
  const conteudo = texto(m.conversation ?? objeto(m.extendedTextMessage).text ?? objeto(m.buttonsResponseMessage).selectedDisplayText ??
    objeto(objeto(m.listResponseMessage).singleSelectReply).selectedRowId ?? caption,8000).trim()
  if (!conteudo && !midia) return { ignorado: "conteudo_nao_suportado" }
  const segundos = d.messageTimestamp === undefined ? null : Number(d.messageTimestamp)
  if (segundos!==null && (!Number.isSafeInteger(segundos) || segundos<=0 || segundos>8_640_000_000_000)) throw new Error("data_invalida")
  const enviadoEm = segundos===null ? null : new Date(segundos*1000).toISOString()
  return { providerMessageId: key.id, conteudo: { remoteJid: jid, remoteJidAlt: texto(key.remoteJidAlt,160) || null,
    enviadoEm, pushName: texto(d.pushName,100), texto: conteudo, tipo, midia } }
}

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

const PREFIXO = "nuflow-secret:"
function chave(id: string): Buffer {
  if (!/^[a-zA-Z0-9_-]{1,32}$/.test(id)) throw new Error("Versão de chave inválida")
  let chaves: unknown
  try { chaves = JSON.parse(process.env.INTEGRATION_ENCRYPTION_KEYS || "{}") }
  catch { throw new Error("Chaves de integração inválidas") }
  const valor = chaves && typeof chaves === "object" && Object.hasOwn(chaves, id)
    ? (chaves as Record<string, unknown>)[id] : undefined
  if (typeof valor !== "string" || !/^[A-Za-z0-9+/]{43}=$/.test(valor)) throw new Error("Chave de integração indisponível")
  const bytes = Buffer.from(valor, "base64")
  if (bytes.length !== 32 || bytes.toString("base64") !== valor) throw new Error("Chave de integração inválida")
  return bytes
}
export function validarChaveIntegracao() {
  const id = process.env.INTEGRATION_ENCRYPTION_KEY_ID || ""
  chave(id)
  return id
}
function contexto(organizacaoId: string) {
  if (!organizacaoId) throw new Error("Empresa obrigatória para credencial")
  return Buffer.from(JSON.stringify(["google-drive-refresh", organizacaoId]))
}
export function cifrarTokenDrive(token: string, organizacaoId: string): string {
  if (!token) throw new Error("Token vazio")
  const id = validarChaveIntegracao()
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", chave(id), iv)
  cipher.setAAD(contexto(organizacaoId))
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()])
  return `${PREFIXO}1:${id}:${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${ciphertext.toString("base64url")}`
}
export function tokenDriveCifrado(token: string) { return token.startsWith(PREFIXO) }
export function lerTokenDrive(token: string, organizacaoId: string): string {
  contexto(organizacaoId)
  // Compatibilidade temporária com tokens legados; somente leitura no servidor.
  if (!tokenDriveCifrado(token)) return token
  const [prefixo, versao, id, iv, tag, ciphertext, extra] = token.split(":")
  if (prefixo !== "nuflow-secret" || versao !== "1" || extra !== undefined || !ciphertext
      || !/^[A-Za-z0-9_-]{16}$/.test(iv ?? "") || !/^[A-Za-z0-9_-]{22}$/.test(tag ?? "")
      || !/^[A-Za-z0-9_-]+$/.test(ciphertext)) throw new Error("Credencial de integração inválida")
  const decipher = createDecipheriv("aes-256-gcm", chave(id), Buffer.from(iv, "base64url"))
  decipher.setAAD(contexto(organizacaoId))
  decipher.setAuthTag(Buffer.from(tag, "base64url"))
  try { return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8") }
  catch { throw new Error("Credencial de integração ilegível") }
}

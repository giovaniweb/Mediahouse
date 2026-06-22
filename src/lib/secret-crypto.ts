import crypto from "node:crypto"

function encryptionKey(): Buffer {
  const source = process.env.EMAIL_ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET
  if (!source) {
    throw new Error("Configure EMAIL_ENCRYPTION_KEY ou NEXTAUTH_SECRET para proteger credenciais de e-mail.")
  }
  return crypto.createHash("sha256").update(source).digest()
}

export function encryptSecret(value: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv, tag, encrypted].map((part) => part.toString("base64url")).join(".")
}

export function decryptSecret(value: string): string {
  const [ivRaw, tagRaw, encryptedRaw] = value.split(".")
  if (!ivRaw || !tagRaw || !encryptedRaw) {
    throw new Error("Credencial criptografada em formato inválido.")
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivRaw, "base64url")
  )
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"))
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64url")),
    decipher.final(),
  ]).toString("utf8")
}

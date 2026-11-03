import crypto from "node:crypto"

// Cifra dos dados sensíveis em repouso: chave PIX, dados bancários, segredo do
// webhook do WhatsApp, token do e-mail de entrada e o conteúdo da fila do WhatsApp.
//
// Até 07/10/2026 a chave saía de EMAIL_ENCRYPTION_KEY ou, sem ela, do
// NEXTAUTH_SECRET — o segredo do login. Trocar o segredo do login (por exemplo,
// para derrubar todas as sessões) deixava ilegível todo PIX gravado.
//
// Agora há uma chave própria, CHAVE_CIFRA_DADOS:
//   - com ela, tudo o que é gravado sai no formato novo ("v2." na frente);
//   - o que já está gravado no formato antigo continua legível pela chave antiga
//     (EMAIL_ENCRYPTION_KEY ou NEXTAUTH_SECRET, nessa ordem, como o código antigo);
//   - cada dado salvo de novo é regravado com a chave nova, e lib/recifrar.ts
//     passa o resto de uma vez.
// Só depois do recifrar completo o segredo do login pode ser trocado sem perda.
//
// Sem CHAVE_CIFRA_DADOS tudo segue como antes, no formato antigo: o deploy deste
// código não muda nada até a variável existir na Vercel.

const PREFIXO_NOVO = "v2."
const TAMANHO_MINIMO_CHAVE = 32
let avisouFallback = false
let avisouFraca = false

function derivar(segredo: string, rotulo: string): Buffer {
  return crypto.createHash("sha256").update(rotulo + segredo).digest()
}

/** A chave própria, se configurada e forte o bastante. Fraca é ignorada (com aviso). */
function chaveNova(): Buffer | null {
  const s = process.env.CHAVE_CIFRA_DADOS?.trim()
  if (!s) return null
  if (s.length < TAMANHO_MINIMO_CHAVE) {
    if (!avisouFraca) {
      avisouFraca = true
      console.error(`[secret-crypto] CHAVE_CIFRA_DADOS tem menos de ${TAMANHO_MINIMO_CHAVE} caracteres e foi ignorada.`)
    }
    return null
  }
  return derivar(s, "nuflow:dados:v2:")
}

/** As chaves do formato antigo, na ordem em que o código antigo as escolhia. */
function chavesAntigas(): Buffer[] {
  const fontes = [process.env.EMAIL_ENCRYPTION_KEY, process.env.NEXTAUTH_SECRET]
    .filter((s): s is string => !!s)
  return [...new Set(fontes)].map((s) => derivar(s, ""))
}

/** A chave nova está ativa? (o /api/health e o recifrar perguntam isto) */
export function chaveNovaAtiva(): boolean {
  return chaveNova() !== null
}

/** O valor ainda está no formato antigo (precisa recifrar)? */
export function cifradoNoFormatoAntigo(valor: string): boolean {
  return !valor.startsWith(PREFIXO_NOVO)
}

function cifrar(valor: string, chave: Buffer): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv("aes-256-gcm", chave, iv)
  const encrypted = Buffer.concat([cipher.update(valor, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv, tag, encrypted].map((part) => part.toString("base64url")).join(".")
}

function decifrar(partes: string, chave: Buffer): string {
  const [ivRaw, tagRaw, encryptedRaw] = partes.split(".")
  if (!ivRaw || !tagRaw || !encryptedRaw) throw new Error("Credencial criptografada em formato inválido.")
  const decipher = crypto.createDecipheriv("aes-256-gcm", chave, Buffer.from(ivRaw, "base64url"))
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"))
  return Buffer.concat([decipher.update(Buffer.from(encryptedRaw, "base64url")), decipher.final()]).toString("utf8")
}

export function encryptSecret(value: string): string {
  const nova = chaveNova()
  if (nova) return PREFIXO_NOVO + cifrar(value, nova)
  const [antiga] = chavesAntigas()
  if (!antiga) throw new Error("Configure CHAVE_CIFRA_DADOS para proteger os dados sensíveis.")
  if (!avisouFallback) {
    avisouFallback = true
    console.warn("[secret-crypto] CHAVE_CIFRA_DADOS ausente — cifrando com a chave antiga (ligada ao segredo do login).")
  }
  return cifrar(value, antiga)
}

export function decryptSecret(value: string): string {
  if (!cifradoNoFormatoAntigo(value)) {
    const nova = chaveNova()
    if (!nova) throw new Error("Dado cifrado com CHAVE_CIFRA_DADOS, mas a chave não está configurada.")
    return decifrar(value.slice(PREFIXO_NOVO.length), nova)
  }
  // Formato antigo: a primeira chave antiga que abrir. O GCM recusa a errada.
  const antigas = chavesAntigas()
  if (!antigas.length) throw new Error("Sem chave antiga para ler dado cifrado no formato anterior.")
  let erro: unknown
  for (const chave of antigas) {
    try { return decifrar(value, chave) } catch (e) { erro = e }
  }
  throw erro
}

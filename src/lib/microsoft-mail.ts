import crypto from "node:crypto"
import { prisma } from "@/lib/prisma"
import { decryptSecret, encryptSecret } from "@/lib/secret-crypto"

const GRAPH_BASE = "https://graph.microsoft.com/v1.0"
const SCOPES = ["offline_access", "User.Read", "Mail.Read", "Mail.Read.Shared"]

interface OAuthStatePayload {
  organizacaoId: string
  usuarioId: string
  exp: number
  nonce: string
}

interface MicrosoftTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type: string
  scope?: string
}

export interface MicrosoftProfile {
  id: string
  displayName?: string
  mail?: string
  userPrincipalName?: string
}

export interface MicrosoftMailMessage {
  id: string
  internetMessageId?: string | null
  conversationId?: string | null
  subject?: string | null
  receivedDateTime: string
  body?: { contentType?: "text" | "html"; content?: string }
  bodyPreview?: string
  hasAttachments?: boolean
  from?: { emailAddress?: { name?: string; address?: string } }
  toRecipients?: Array<{ emailAddress?: { name?: string; address?: string } }>
}

function microsoftConfig() {
  const clientId = process.env.MICROSOFT_CLIENT_ID
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET
  const tenantId = process.env.MICROSOFT_TENANT_ID || "common"
  if (!clientId || !clientSecret) {
    throw new Error("Configure MICROSOFT_CLIENT_ID e MICROSOFT_CLIENT_SECRET.")
  }
  return { clientId, clientSecret, tenantId }
}

function stateSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) throw new Error("NEXTAUTH_SECRET não configurado.")
  return secret
}

function callbackUrl(origin: string): string {
  return `${origin.replace(/\/$/, "")}/api/email-inbox/callback`
}

export function createMicrosoftOAuthState(
  organizacaoId: string,
  usuarioId: string
): string {
  const payload: OAuthStatePayload = {
    organizacaoId,
    usuarioId,
    exp: Date.now() + 10 * 60 * 1000,
    nonce: crypto.randomBytes(16).toString("hex"),
  }
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url")
  const signature = crypto
    .createHmac("sha256", stateSecret())
    .update(encoded)
    .digest("base64url")
  return `${encoded}.${signature}`
}

export function verifyMicrosoftOAuthState(state: string): OAuthStatePayload {
  const [encoded, signature] = state.split(".")
  if (!encoded || !signature) throw new Error("Estado OAuth inválido.")
  const expected = crypto
    .createHmac("sha256", stateSecret())
    .update(encoded)
    .digest("base64url")
  const valid =
    signature.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  if (!valid) throw new Error("Assinatura OAuth inválida.")

  const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as OAuthStatePayload
  if (!payload.organizacaoId || !payload.usuarioId || payload.exp < Date.now()) {
    throw new Error("Estado OAuth expirado ou incompleto.")
  }
  return payload
}

export function microsoftAuthorizationUrl(params: {
  origin: string
  organizacaoId: string
  usuarioId: string
}): string {
  const { clientId, tenantId } = microsoftConfig()
  const query = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: callbackUrl(params.origin),
    response_mode: "query",
    scope: SCOPES.join(" "),
    state: createMicrosoftOAuthState(params.organizacaoId, params.usuarioId),
    prompt: "select_account",
  })
  return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${query}`
}

async function tokenRequest(
  body: URLSearchParams,
  tenantId = microsoftConfig().tenantId
): Promise<MicrosoftTokenResponse> {
  const res = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(20000),
    }
  )
  const json = await res.json().catch(() => ({})) as MicrosoftTokenResponse & {
    error?: string
    error_description?: string
  }
  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || `Microsoft OAuth HTTP ${res.status}`)
  }
  return json
}

export async function exchangeMicrosoftCode(
  code: string,
  origin: string
): Promise<MicrosoftTokenResponse> {
  const { clientId, clientSecret, tenantId } = microsoftConfig()
  return tokenRequest(new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: callbackUrl(origin),
    scope: SCOPES.join(" "),
  }), tenantId)
}

export async function getMicrosoftProfile(accessToken: string): Promise<MicrosoftProfile> {
  const res = await fetch(`${GRAPH_BASE}/me?$select=id,displayName,mail,userPrincipalName`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`Microsoft Graph /me retornou HTTP ${res.status}`)
  return res.json() as Promise<MicrosoftProfile>
}

export async function refreshMicrosoftAccessToken(config: {
  id: string
  tenantId: string | null
  refreshTokenCriptografado: string | null
}): Promise<string> {
  if (!config.refreshTokenCriptografado) {
    throw new Error("Caixa Microsoft não possui refresh token.")
  }
  const { clientId, clientSecret, tenantId: envTenantId } = microsoftConfig()
  const refreshToken = decryptSecret(config.refreshTokenCriptografado)
  const token = await tokenRequest(new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: SCOPES.join(" "),
  }), config.tenantId || envTenantId)

  if (token.refresh_token && token.refresh_token !== refreshToken) {
    await prisma.configEmailEntrada.update({
      where: { id: config.id },
      data: { refreshTokenCriptografado: encryptSecret(token.refresh_token) },
    })
  }
  return token.access_token
}

export async function fetchMicrosoftMessages(
  accessToken: string,
  since: Date
): Promise<MicrosoftMailMessage[]> {
  const params = new URLSearchParams({
    "$select": [
      "id",
      "internetMessageId",
      "conversationId",
      "subject",
      "from",
      "toRecipients",
      "receivedDateTime",
      "body",
      "bodyPreview",
      "hasAttachments",
    ].join(","),
    "$filter": `receivedDateTime ge ${since.toISOString()}`,
    "$orderby": "receivedDateTime asc",
    "$top": "50",
  })
  let nextUrl: string | null = `${GRAPH_BASE}/me/mailFolders/inbox/messages?${params}`
  const messages: MicrosoftMailMessage[] = []
  let page = 0

  while (nextUrl && page < 20) {
    const res = await fetch(nextUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Prefer: 'outlook.body-content-type="text"',
      },
      signal: AbortSignal.timeout(30000),
    })
    const json = await res.json().catch(() => ({})) as {
      value?: MicrosoftMailMessage[]
      "@odata.nextLink"?: string
      error?: { message?: string }
    }
    if (!res.ok) {
      throw new Error(json.error?.message || `Microsoft Graph mensagens HTTP ${res.status}`)
    }
    messages.push(...(json.value ?? []))
    nextUrl = json["@odata.nextLink"] ?? null
    page += 1
  }

  if (nextUrl) {
    throw new Error("A sincronização excedeu 1.000 mensagens. Refine os filtros da caixa.")
  }
  return messages
}

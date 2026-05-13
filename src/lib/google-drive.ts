/**
 * Google Drive — upload de vídeos finais
 *
 * Estratégia de autenticação (em ordem de prioridade):
 * 1. OAuth2 com conta pessoal (refresh_token salvo em ConfigEmpresa)
 * 2. Service Account JWT (fallback — só funciona em Google Workspace Shared Drives)
 *
 * Fluxo de upload: backend cria sessão resumável → browser PUT direto ao Google
 * (sem passar pelo Vercel) → sem limite de tamanho.
 */

import crypto from "crypto"
import { prisma } from "@/lib/prisma"

// ── Cache do access_token (válido por ~1 hora) ──────────────────────────────
let cachedToken: { token: string; expiresAt: number } | null = null

// ── OAuth2 — conta pessoal ───────────────────────────────────────────────────

/**
 * Tenta obter access_token usando o refresh_token OAuth2 salvo em ConfigEmpresa.
 * Retorna null se não houver refresh_token configurado.
 */
async function getAccessTokenFromOAuth(): Promise<string | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) return null

  const config = await prisma.configEmpresa.findFirst({
    select: { googleRefreshToken: true },
  })
  if (!config?.googleRefreshToken) return null

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: config.googleRefreshToken,
      grant_type: "refresh_token",
    }),
  })

  if (!res.ok) {
    console.error("[google-drive] Falha ao renovar OAuth2 token:", await res.text())
    return null
  }

  const { access_token } = (await res.json()) as { access_token?: string }
  return access_token ?? null
}

// ── Service Account JWT (fallback) ──────────────────────────────────────────

/** Gera o JWT de service account e troca por um access_token do Google OAuth2. */
async function getAccessTokenFromServiceAccount(): Promise<string> {
  const now = Math.floor(Date.now() / 1000)

  // Reutiliza token se ainda válido (margem de 5 minutos)
  if (cachedToken && cachedToken.expiresAt > now + 300) {
    return cachedToken.token
  }

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY

  if (!email || !rawKey) {
    throw new Error(
      "Credenciais Google ausentes. Configure GOOGLE_CLIENT_ID+SECRET (OAuth2) ou GOOGLE_SERVICE_ACCOUNT_EMAIL+KEY (.env)."
    )
  }

  const privateKey = rawKey.replace(/\\n/g, "\n")
  const jwt = criarJWT(email, privateKey, now)

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Falha ao obter token Google (service account): ${err}`)
  }

  const { access_token, expires_in } = (await res.json()) as {
    access_token: string
    expires_in: number
  }

  cachedToken = { token: access_token, expiresAt: now + (expires_in ?? 3600) }
  return access_token
}

/** Tenta OAuth2 primeiro; cai para service account se necessário. */
export async function getAccessToken(): Promise<string> {
  const oauthToken = await getAccessTokenFromOAuth()
  if (oauthToken) return oauthToken
  return getAccessTokenFromServiceAccount()
}

/** Cria um JWT RS256 para autenticação de service account. */
function criarJWT(email: string, privateKey: string, now: number): string {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url")
  const payload = Buffer.from(
    JSON.stringify({
      iss: email,
      scope: "https://www.googleapis.com/auth/drive",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    })
  ).toString("base64url")

  const sign = crypto.createSign("RSA-SHA256")
  sign.update(`${header}.${payload}`)
  const signature = sign.sign(privateKey, "base64url")

  return `${header}.${payload}.${signature}`
}

// ── API pública ─────────────────────────────────────────────────────────────

export interface DriveUploadSession {
  /** URL de upload resumável — o browser faz PUT diretamente aqui */
  sessionUri: string
  /** ID do arquivo no Drive */
  fileId: string
  /** URL pública para visualização */
  publicUrl: string
}

/**
 * Cria uma sessão de upload resumável no Google Drive.
 *
 * 1. Cria o metadata do arquivo (atribui fileId + define pasta).
 * 2. Cria a sessão de upload (retorna sessionUri).
 * 3. Torna o arquivo acessível por qualquer pessoa com o link.
 *
 * O browser então faz PUT direto em sessionUri com o arquivo, sem passar pelo Vercel.
 */
export async function criarSessaoUploadDrive(opts: {
  fileName: string
  fileSize: number
  contentType: string
}): Promise<DriveUploadSession> {
  // Prioridade: banco (configurado pelo admin) > variável de ambiente
  const config = await prisma.configEmpresa.findFirst({
    select: { googleDriveFolderId: true },
  })
  const folderId = config?.googleDriveFolderId || process.env.GOOGLE_DRIVE_FOLDER_ID
  if (!folderId) {
    throw new Error("Pasta do Google Drive não configurada. Acesse Configurações → Google Drive.")
  }

  const token = await getAccessToken()

  // ── Passo 1: Cria o arquivo com metadata (sem conteúdo) → garante fileId ──
  // O endpoint de upload resumável nem sempre devolve o id no body; criar
  // o arquivo primeiro com POST simples é a forma confiável de obter o id.
  const createRes = await fetch(
    "https://www.googleapis.com/drive/v3/files",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: opts.fileName,
        parents: [folderId],
        mimeType: opts.contentType,
      }),
    }
  )

  if (!createRes.ok) {
    const err = await createRes.text()
    throw new Error(`Falha ao criar arquivo no Drive: ${err}`)
  }

  const createData = (await createRes.json().catch(() => ({} as { id?: string }))) as { id?: string }
  const fileId = createData.id ?? ""
  if (!fileId) {
    throw new Error("Google Drive não retornou ID do arquivo criado.")
  }

  // ── Passo 2: Inicia sessão de upload resumável para o arquivo criado ──────
  const sessionRes = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=resumable`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Upload-Content-Type": opts.contentType,
        "X-Upload-Content-Length": String(opts.fileSize),
      },
      body: JSON.stringify({}),
    }
  )

  if (!sessionRes.ok) {
    const err = await sessionRes.text()
    // Limpar arquivo vazio criado no passo 1
    await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => null)
    throw new Error(`Falha ao iniciar sessão de upload Drive: ${err}`)
  }

  const sessionUri = sessionRes.headers.get("Location")
  if (!sessionUri) {
    throw new Error("Google Drive não retornou Location header para a sessão de upload.")
  }

  // ── Passo 3: Tornar público antes do upload (URL já conhecida) ────────────
  await tornarPublico(fileId, token)

  const publicUrl = `https://drive.google.com/file/d/${fileId}/view?usp=sharing`

  return { sessionUri, fileId, publicUrl }
}

/** Define permissão "anyone → reader" no arquivo Drive. */
async function tornarPublico(fileId: string, token: string): Promise<void> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ role: "reader", type: "anyone" }),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error(`[google-drive] Falha ao tornar público fileId=${fileId}:`, err)
  }
}

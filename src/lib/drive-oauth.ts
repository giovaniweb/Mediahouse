import { createHash, randomBytes } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { comOrg } from "@/lib/org-contexto"

export const DRIVE_STATE_COOKIE = "drive_oauth_state"
export const DRIVE_STATE_TTL = 600
export type AtorDrive = { usuarioId: string; organizacaoId: string }
export function hashEstadoDrive(state: string) { return createHash("sha256").update(state).digest("hex") }
export function origemDrive() {
  const origem = new URL(process.env.NEXTAUTH_URL || (process.env.NODE_ENV === "production" ? "" : "http://localhost:3000"))
  if (origem.username || origem.password || origem.search || origem.hash || origem.pathname !== "/"
      || (origem.protocol !== "https:" && !(origem.protocol === "http:" && ["localhost", "127.0.0.1"].includes(origem.hostname)))) {
    throw new Error("Origem OAuth inválida")
  }
  return origem.origin
}
export async function criarEstadoDrive(ator: AtorDrive) {
  const state = randomBytes(32).toString("base64url")
  await comOrg(ator.organizacaoId, () => prisma.oAuthDriveEstado.create({
    data: { hash: hashEstadoDrive(state), usuarioId: ator.usuarioId, organizacaoId: ator.organizacaoId, expiraEm: new Date(Date.now() + DRIVE_STATE_TTL * 1000) },
  }))
  return state
}
export async function consumirEstadoDrive(state: string, ator: AtorDrive) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(state)) return false
  const agora = new Date()
  const resultado = await comOrg(ator.organizacaoId, () => prisma.oAuthDriveEstado.updateMany({
    where: { hash: hashEstadoDrive(state), usuarioId: ator.usuarioId, organizacaoId: ator.organizacaoId, consumidoEm: null, expiraEm: { gt: agora } },
    data: { consumidoEm: agora },
  }))
  return resultado.count === 1
}

// Os links da área pública nas páginas do servidor: o host vem do pedido.
// Ver lib/subdominio.ts para a regra (mesma no navegador e no proxy).
import { headers } from "next/headers"
import { linksDaArea, type LinksDaArea } from "@/lib/subdominio"

export async function linksDaAreaNoServidor(slug: string): Promise<LinksDaArea> {
  const h = await headers()
  const host = h.get("x-forwarded-host") ?? h.get("host")
  const protocolo = h.get("x-forwarded-proto")?.split(",")[0]?.trim() || "http"
  return linksDaArea(slug, host, protocolo)
}

import { arteCompartilhamento, TAMANHO_ARTE } from "@/lib/arte-compartilhamento"

// A mesma arte de opengraph-image.tsx, para quem lê a tag do X/Twitter. O
// desenho mora em src/lib/arte-compartilhamento.tsx.
export const alt = "NuFlow: pedidos, agenda e aprovações num só lugar"
export const size = TAMANHO_ARTE
export const contentType = "image/png"

export default function Image() {
  return arteCompartilhamento()
}

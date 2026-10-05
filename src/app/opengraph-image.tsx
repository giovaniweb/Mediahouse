import { arteCompartilhamento, TAMANHO_ARTE } from "@/lib/arte-compartilhamento"

// A prévia de nuflow.space no WhatsApp e nas redes. O desenho mora em
// src/lib/arte-compartilhamento.tsx.
export const alt = "NuFlow: pedidos, agenda e aprovações num só lugar"
export const size = TAMANHO_ARTE
export const contentType = "image/png"

export default function Image() {
  return arteCompartilhamento()
}

// O símbolo do NuFlow, num lugar só: a onda que segue até o ponto.
//
// É irmão do símbolo do Cutflow (a mesma onda, cortada por um traço): mesma
// espessura, mesmas pontas redondas, uma cor só. O ponto é o mesmo do
// "NuFlow." — o pedido percorre o fluxo e chega na entrega.
//
// Daqui saem o componente de logo, a arte de compartilhamento e os ícones de
// public/ (scripts/gerar-icones-marca.mjs). Mudou aqui, rode o script.

/** Caixa de desenho, já sem a sobra: o traço ocupa a largura toda. */
export const CAIXA = "4 4 56 56"
export const ONDA = "M9 35c4-8 7-11 10-11 6 0 8 16 15 16 4.5 0 7.5-4 10-10"
export const PONTO = { cx: 53, cy: 24, r: 4.6 }
export const TRACO = 5
export const LILAS = "#8b5cf6"
/** O lilás claro do ponto de "NuFlow." sobre fundo escuro. */
export const LILAS_CLARO = "#b9a2ff"
export const FUNDO = "#0b0c11"

/** O símbolo como SVG solto — para os ícones e o favicon. */
export function simboloSvg({ tamanho, traco = TRACO, cor = LILAS }: { tamanho: number; traco?: number; cor?: string }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${tamanho}" height="${tamanho}" viewBox="${CAIXA}">`
    + `<path d="${ONDA}" fill="none" stroke="${cor}" stroke-width="${traco}" stroke-linecap="round" stroke-linejoin="round"/>`
    + `<circle cx="${PONTO.cx}" cy="${PONTO.cy}" r="${PONTO.r}" fill="${cor}"/></svg>`
}

// Qual empresa o worker de mídia atende agora (Onda 2A; revisão do #142).
//
// A função do banco `empresas_com_midia_pendente` devolve as empresas com mídia
// na fila, da espera mais antiga para a mais nova, mas no máximo 100 e sem
// página seguinte. Antes o worker pedia 20 e parava nelas: se as 20 mais antigas
// estivessem com a conversão desligada ou acima da franquia, ele voltava sem
// trabalho para sempre e as empresas elegíveis depois delas nunca eram vistas.
//
// Agora: primeiro as da lista, na ordem da espera. Se a lista veio cheia (pode
// haver mais), segue pelas empresas ativas em páginas, pulando as já vistas, até
// achar uma elegível com trabalho. Lista incompleta = não há mais ninguém com
// mídia na fila, e o worker não percorre as empresas à toa a cada pedido.
// Sem migration nova: a função do banco ficou como estava.

export const LIMITE_PENDENTES = 100 // o teto da própria função do banco
export const PAGINA_EMPRESAS = 100

export type DepsEscolha<J> = {
  pendentes: (limite: number) => Promise<string[]>
  /** Empresas ativas por id, depois de `depois`. */
  ativas: (depois: string | undefined, take: number) => Promise<string[]>
  permitida: (org: string) => Promise<boolean>
  reivindicar: (org: string) => Promise<J | null>
}

export async function escolherTrabalho<J>(d: DepsEscolha<J>): Promise<J | null> {
  const vistas = new Set<string>()
  const tentar = async (org: string) => {
    vistas.add(org)
    if (!await d.permitida(org)) return null
    return d.reivindicar(org)
  }
  const pendentes = await d.pendentes(LIMITE_PENDENTES)
  for (const org of pendentes) {
    const job = await tentar(org)
    if (job) return job
  }
  if (pendentes.length < LIMITE_PENDENTES) return null

  let depois: string | undefined
  for (;;) {
    const pagina = await d.ativas(depois, PAGINA_EMPRESAS)
    for (const org of pagina) {
      if (vistas.has(org)) continue
      const job = await tentar(org)
      if (job) return job
    }
    if (pagina.length < PAGINA_EMPRESAS) return null
    depois = pagina[pagina.length - 1]
  }
}

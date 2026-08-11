// Prazos com ano implausível entram por digitação: um dígito a menos no campo
// de data ("0026-06-29" em vez de "2026-06-29") passava direto e virava um
// prazo no ano 26. O registro nasce atrasado em dois mil anos, aparece como
// "ATRASADA 730000d" no card e distorce qualquer contagem.
//
// Duas demandas em produção entraram assim (VOP-26-5333 no ano 0026 e
// VOP-26-1740 no ano 0001) antes desta checagem existir.

export const ANO_MINIMO = 2000
export const ANO_MAXIMO = 2100

/** true quando a data é válida e cai numa faixa que faz sentido para um prazo. */
export function dataPrazoPlausivel(valor: string | Date | null | undefined): boolean {
  if (valor === null || valor === undefined || valor === "") return true // ausência é permitida
  const d = valor instanceof Date ? valor : new Date(valor)
  if (Number.isNaN(d.getTime())) return false
  const ano = d.getUTCFullYear()
  return ano >= ANO_MINIMO && ano <= ANO_MAXIMO
}

export const MSG_DATA_INVALIDA = `Data inválida — o ano precisa estar entre ${ANO_MINIMO} e ${ANO_MAXIMO}. Confira se não faltou um dígito.`

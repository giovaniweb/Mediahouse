// Qual texto de `detalhesEntrega` é a copy do criativo.
//
// `detalhesEntrega` é um Json chaveado pelo LABEL do campo, então descobrir a
// copy é adivinhar pela chave. A adivinhação ingênua (`/copy|legenda|caption/i`)
// estava errada e a conta chegou na tela do cliente: num carrossel, a primeira
// chave que casava era "Copy pronta?" e o cliente via a copy do criativo como o
// texto literal "Sim".
//
// Regra: a chave precisa parecer copy E não parecer pergunta/status sobre a
// copy. Demandas antigas com "Copy pronta?" caem no fallback da descrição, que
// é honesto — elas nunca tiveram copy gravada.

const PARECE_COPY = /copy|legenda|caption/i
const PARECE_STATUS = /status|pronta|precisa|\?$/i

export function extrairCopy(
  detalhes?: Record<string, unknown> | null,
  descricao?: string | null
): string {
  if (detalhes) {
    for (const [chave, valor] of Object.entries(detalhes)) {
      if (!PARECE_COPY.test(chave) || PARECE_STATUS.test(chave.trim())) continue
      if (typeof valor === "string" && valor.trim()) return valor
    }
  }
  return descricao ?? ""
}

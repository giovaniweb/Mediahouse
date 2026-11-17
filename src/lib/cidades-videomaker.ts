// Cidade base + cidades que o videomaker atende (16/11/2026).
//
// O cadastro aceitava uma cidade só, e o Kevew Felix se cadastrou uma vez para
// cada cidade que atende (Itaperuna, Guarapari...), com o mesmo telefone. O
// número repetido deixava a identificação do WhatsApp ambígua e todo aviso para
// ele era descartado. Agora `cidade` é a base e `cidadesAtendidas` a lista das
// outras; a busca, o filtro e a escala olham as duas.
//
// Sem import de runtime: este módulo vai para o navegador (formulários e
// lista) e para as rotas.

export const MAX_CIDADES_ATENDIDAS = 30
const MAX_TAMANHO = 80

/** Espaços aparados e juntados. Vazio ou de uma letra = null. */
export function limparCidade(texto: unknown): string | null {
  if (typeof texto !== "string") return null
  const t = texto.replace(/\s+/g, " ").trim().slice(0, MAX_TAMANHO).trim()
  return t.length >= 2 ? t : null
}

/** Chave de comparação: sem acento, minúscula, sem "/ UF" ou ", UF" no fim. */
export function chaveCidade(texto: string): string {
  return texto
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s*[,/-]\s*[a-z]{2}$/, "")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * A lista que se grava: aceita array ou texto separado por vírgula, ponto e
 * vírgula ou linha; tira repetidas (sem diferenciar acento, maiúscula ou a UF
 * no fim) e a própria base. Mantém a ordem em que vieram.
 */
export function listaDeCidades(entrada: unknown, base?: string | null): string[] {
  const pedacos = Array.isArray(entrada)
    ? entrada
    : typeof entrada === "string" ? entrada.split(/[,;\n]/) : []
  const vistas = new Set<string>()
  const chaveBase = base ? chaveCidade(base) : null
  if (chaveBase) vistas.add(chaveBase)
  const saida: string[] = []
  for (const p of pedacos) {
    const c = limparCidade(p)
    if (!c) continue
    const k = chaveCidade(c)
    if (!k || vistas.has(k)) continue
    vistas.add(k)
    saida.push(c)
    if (saida.length >= MAX_CIDADES_ATENDIDAS) break
  }
  return saida
}

/**
 * Junta cidades novas às que o videomaker já atende. A base dele fica onde
 * está; a cidade nova que for igual à base não entra.
 */
export function acrescentarCidades(
  atual: { cidade?: string | null; cidadesAtendidas?: string[] | null },
  novas: (string | null | undefined)[],
): string[] {
  return listaDeCidades([...(atual.cidadesAtendidas ?? []), ...novas], atual.cidade)
}

/** Todas as cidades do videomaker, a base primeiro. */
export function todasAsCidades(vm: { cidade?: string | null; cidadesAtendidas?: string[] | null }): string[] {
  const base = limparCidade(vm.cidade)
  return [...(base ? [base] : []), ...listaDeCidades(vm.cidadesAtendidas ?? [], base)]
}

/** Atende esta cidade? Igualdade pela chave (base ou atendidas). */
export function atendeCidade(vm: { cidade?: string | null; cidadesAtendidas?: string[] | null }, cidade: string): boolean {
  const alvo = chaveCidade(cidade)
  if (!alvo) return true
  return todasAsCidades(vm).some(c => chaveCidade(c) === alvo)
}

/** Texto curto para card e lista de escolha: "Itaperuna · atende Guarapari, Campos". */
export function textoDasCidades(vm: { cidade?: string | null; estado?: string | null; cidadesAtendidas?: string[] | null }, comEstado = false): string {
  const base = [limparCidade(vm.cidade), comEstado ? vm.estado?.trim() || null : null].filter(Boolean).join(", ")
  const outras = listaDeCidades(vm.cidadesAtendidas ?? [], vm.cidade)
  if (!outras.length) return base
  return base ? `${base} · atende ${outras.join(", ")}` : `Atende ${outras.join(", ")}`
}

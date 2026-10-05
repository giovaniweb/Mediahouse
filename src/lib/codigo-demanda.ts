import { randomInt } from "node:crypto"

// Código visível das demandas e eventos: PREFIXO-AA-#### (ex.: VOP-26-4821,
// VOP-EXT-26-1077). O número é sorteado entre 1000 e 9999 e a coluna `codigo` é
// UNIQUE no banco inteiro — não por empresa.
//
// Sorteio puro colide: com ~280 códigos VOP-26 em setembro/2026, ~3% das
// criações batiam num número já usado, e o `create` estourava P2002 → 500 na
// cara de quem criava. Daí a regra: sorteia, tenta gravar e, se o banco
// recusar por código repetido, sorteia de novo.
//
// Por que não conferir antes com findUnique: com RLS ligado a consulta só
// enxerga a própria empresa, mas o índice UNIQUE vale para todas. A única
// resposta confiável é a do próprio INSERT.

/** Quantas vezes sortear antes de desistir. Com 10% dos números do ano ocupados,
 * a chance de esgotar é 1 em 100 mil; com os ~3% de setembro/2026, menos de 1
 * em 30 milhões. */
export const TENTATIVAS_CODIGO = 5

type Opcoes = {
  tentativas?: number
  /** Devolve o número do código. Os testes trocam para forçar colisão. */
  sortear?: () => number
  agora?: () => Date
}

const sortearNumero = () => randomInt(1000, 10000)

export function sortearCodigo(prefixo: string, agora = new Date(), sortear = sortearNumero): string {
  const ano = agora.getFullYear().toString().slice(-2)
  return `${prefixo}-${ano}-${sortear()}`
}

/**
 * O erro é o P2002 da coluna `codigo`? Outro campo único repetido não é caso de
 * novo sorteio e precisa subir como está.
 */
export function ehColisaoDeCodigo(e: unknown): boolean {
  if (!e || typeof e !== "object" || (e as { code?: unknown }).code !== "P2002") return false
  const meta = (e as { meta?: Record<string, unknown> }).meta ?? {}
  // Onde o campo aparece depende do motor e do papel no banco (conferido contra
  // Postgres 17 em 04/10/2026):
  // - motor clássico do Prisma: meta.target = ["codigo"] (ou o nome do índice);
  // - Prisma 7 com adapter-pg, conectado como dono: driverAdapterError.cause
  //   .constraint.fields = ["codigo"];
  // - o mesmo, conectado como app_user (RLS): NÃO vem campo nenhum — a mensagem
  //   do Prisma diz "(not available)". Só sobra o nome do índice na mensagem
  //   original do Postgres: unique constraint "demandas_codigo_key".
  const causa = (meta.driverAdapterError as { cause?: Record<string, unknown> } | undefined)?.cause
  const restricao = causa?.constraint as { fields?: unknown; index?: unknown } | undefined
  const indiceNaMensagem = /unique constraint "([^"]+)"/.exec(String(causa?.originalMessage ?? ""))?.[1]
  const candidatos = [meta.target, restricao?.fields, restricao?.index, indiceNaMensagem]
  for (const c of candidatos) {
    if (Array.isArray(c) && c.includes("codigo")) return true
    if (typeof c === "string" && /(^|_)codigo(_|$)/.test(c)) return true
  }
  return false
}

/**
 * Cria o registro com um código sorteado e, se o número já existir, tenta de
 * novo com outro. `criar` precisa ser uma gravação isolada — fora de
 * `$transaction` interativa, porque no Postgres a transação que levou o erro
 * não aceita mais comando nenhum.
 */
export async function criarComCodigoUnico<T>(
  prefixo: string,
  criar: (codigo: string) => PromiseLike<T>,
  opcoes: Opcoes = {}
): Promise<T> {
  const tentativas = opcoes.tentativas ?? TENTATIVAS_CODIGO
  const sortear = opcoes.sortear ?? sortearNumero
  for (let tentativa = 1; ; tentativa++) {
    const codigo = sortearCodigo(prefixo, opcoes.agora?.() ?? new Date(), sortear)
    try {
      return await criar(codigo)
    } catch (e) {
      if (!ehColisaoDeCodigo(e)) throw e
      if (tentativa >= tentativas) {
        // Na prática só acontece com boa parte dos números do ano já usada: é o
        // sinal para aumentar o número de dígitos do código.
        throw new Error(
          `Não foi possível gerar um código livre com o prefixo ${prefixo} em ${tentativas} tentativas — ` +
            "os números do ano podem estar se esgotando.",
          { cause: e }
        )
      }
      // Fica no log para medir quando o espaço de 9000 por ano começa a apertar.
      console.warn(`[codigo] ${codigo} já existe — sorteando outro (tentativa ${tentativa + 1}/${tentativas})`)
    }
  }
}

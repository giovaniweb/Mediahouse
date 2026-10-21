import { prisma } from "@/lib/prisma"
import { comOrg } from "@/lib/org-contexto"

// Código visível das demandas e eventos: PREFIXO[-TIPO]-AA-#### (ex.: GH-26-0001,
// GH-EXT-26-0002). Desde a Onda 2A (21/10/2026), por empresa:
//
// - o PREFIXO é da empresa (organizacoes.prefixoCodigo; a Contourline e quem já
//   existia ficaram com VOP);
// - o NÚMERO sai de um contador da empresa por ano (contadores_codigo), em
//   sequência, sem o teto de 9 mil números por ano do sorteio antigo;
// - a unicidade é por (organizacaoId, codigo).
//
// Os códigos antigos (VOP-26-4821, sorteados entre 1000 e 9999) ficaram como
// estavam. Como a numeração nova da Contourline também é VOP, ela vai passar por
// números já usados pelo sorteio: o banco recusa o repetido e o contador anda
// mais um. Por isso o laço de tentativas continua, com folga maior.
//
// Por que não conferir antes com findUnique: com RLS ligado a consulta só
// enxerga a própria empresa e o evento (eventos_gestao.codigo) ainda é único na
// plataforma. A única resposta confiável é a do próprio INSERT.

/** Quantas vezes tentar antes de desistir. Cobre a Contourline atravessando a
 * faixa 1000–9999, onde ~7% dos números de 2026 já foram sorteados. */
export const TENTATIVAS_CODIGO = 30

/** Tipos de código: o pedido interno não tem, os outros vêm depois do prefixo. */
export type TipoCodigo = "" | "EXT" | "EVT" | "DEM" | "ART"

const PREFIXO_VALIDO = /^[A-Z]{2,5}$/

export function prefixoValido(p: unknown): p is string {
  return typeof p === "string" && PREFIXO_VALIDO.test(p)
}

/** Sugestão de prefixo pelo nome: a sigla que abre o nome ("GH Produções" → "GH"),
 * as iniciais das palavras ("Estúdio da Ana" → "EA") ou as primeiras letras
 * quando o nome é uma palavra só ("Contourline" → "CON"). */
export function sugerirPrefixo(nome: string): string {
  const sigla = nome.trim().split(/\s+/)[0]?.normalize("NFD").replace(/[̀-ͯ]/g, "") ?? ""
  if (/^[A-Z]{2,5}$/.test(sigla)) return sigla
  const palavras = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z\s]/g, " ")
    .split(/\s+/)
    .filter((p) => p.length > 0 && !["DE", "DA", "DO", "DAS", "DOS", "E", "LTDA", "ME", "SA"].includes(p))
  if (palavras.length === 0) return "NF"
  const iniciais = palavras.map((p) => p[0]).join("")
  if (iniciais.length >= 2) return iniciais.slice(0, 4)
  return palavras[0].slice(0, 3).padEnd(2, "X")
}

export function montarCodigo(prefixo: string, tipo: TipoCodigo, ano: number, numero: number): string {
  const aa = String(ano % 100).padStart(2, "0")
  return `${prefixo}${tipo ? `-${tipo}` : ""}-${aa}-${String(numero).padStart(4, "0")}`
}

/**
 * O erro é o P2002 da coluna `codigo`? Outro campo único repetido não é caso de
 * novo número e precisa subir como está.
 */
export function ehColisaoDeCodigo(e: unknown): boolean {
  if (!e || typeof e !== "object" || (e as { code?: unknown }).code !== "P2002") return false
  const meta = (e as { meta?: Record<string, unknown> }).meta ?? {}
  // Onde o campo aparece depende do motor e do papel no banco (conferido contra
  // Postgres 17 em 04/10/2026):
  // - motor clássico do Prisma: meta.target = ["codigo"] (ou o nome do índice);
  // - Prisma 7 com adapter-pg, conectado como dono: driverAdapterError.cause
  //   .constraint.fields = ["codigo"] (ou ["organizacaoId", "codigo"]);
  // - o mesmo, conectado como app_user (RLS): NÃO vem campo nenhum — a mensagem
  //   do Prisma diz "(not available)". Só sobra o nome do índice na mensagem
  //   original do Postgres: unique constraint "demandas_organizacaoId_codigo_key".
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
 * Cria o registro com o código que `gerar` devolve e, se ele já existir, pede
 * outro. `criar` precisa ser uma gravação isolada — fora de `$transaction`
 * interativa, porque no Postgres a transação que levou o erro não aceita mais
 * comando nenhum.
 */
export async function criarComCodigoUnico<T>(
  gerar: () => string | PromiseLike<string>,
  criar: (codigo: string) => PromiseLike<T>,
  tentativas = TENTATIVAS_CODIGO
): Promise<T> {
  for (let tentativa = 1; ; tentativa++) {
    const codigo = await gerar()
    try {
      return await criar(codigo)
    } catch (e) {
      if (!ehColisaoDeCodigo(e)) throw e
      if (tentativa >= tentativas) {
        throw new Error(`Não foi possível gerar um código livre em ${tentativas} tentativas (último: ${codigo}).`, { cause: e })
      }
      console.warn(`[codigo] ${codigo} já existe — tentando o próximo (tentativa ${tentativa + 1}/${tentativas})`)
    }
  }
}

/** O prefixo da empresa; sem prefixo gravado, derivado do slug. */
async function prefixoDaEmpresa(organizacaoId: string): Promise<string> {
  const org = await comOrg(organizacaoId, () =>
    prisma.organizacao.findUnique({ where: { id: organizacaoId }, select: { prefixoCodigo: true, slug: true } })
  )
  if (prefixoValido(org?.prefixoCodigo)) return org.prefixoCodigo
  return sugerirPrefixo((org?.slug ?? "").replace(/-/g, " "))
}

/** Próximo número da empresa no ano. Um UPSERT só: dois pedidos ao mesmo tempo
 * nunca recebem o mesmo número. */
export async function proximoNumero(organizacaoId: string, ano: number, db: Pick<typeof prisma, "$queryRaw"> = prisma): Promise<number> {
  const [linha] = await comOrg(organizacaoId, () =>
    db.$queryRaw<{ ultimo: number }[]>`
      INSERT INTO contadores_codigo ("organizacaoId", ano, ultimo, "updatedAt")
      VALUES (${organizacaoId}, ${ano}, 1, CURRENT_TIMESTAMP)
      ON CONFLICT ("organizacaoId", ano)
      DO UPDATE SET ultimo = contadores_codigo.ultimo + 1, "updatedAt" = CURRENT_TIMESTAMP
      RETURNING ultimo`
  )
  if (!linha) throw new Error("Contador de código indisponível")
  return Number(linha.ultimo)
}

type Opcoes = {
  agora?: () => Date
  /** Os testes trocam o banco por funções. */
  prefixo?: () => Promise<string>
  numero?: (ano: number) => Promise<number>
}

/** Cria a demanda (ou evento) com o próximo código livre da empresa. */
export async function criarComCodigoDaEmpresa<T>(
  organizacaoId: string,
  tipo: TipoCodigo,
  criar: (codigo: string) => PromiseLike<T>,
  opcoes: Opcoes = {}
): Promise<T> {
  const prefixo = await (opcoes.prefixo ?? (() => prefixoDaEmpresa(organizacaoId)))()
  const ano = (opcoes.agora?.() ?? new Date()).getFullYear() % 100
  const numero = opcoes.numero ?? ((a: number) => proximoNumero(organizacaoId, a))
  return criarComCodigoUnico(async () => montarCodigo(prefixo, tipo, ano, await numero(ano)), criar)
}

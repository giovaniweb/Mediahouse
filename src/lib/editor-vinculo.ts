// Leituras do vínculo empresa↔editor.
//
// `Editor` é o perfil da REDE — sob RLS, legível por qualquer organização. O
// combinado comercial não é: salário, diária, carga alocada e bloqueio vivem em
// `EditorOrganizacao`, uma linha por empresa; CPF, endereço, PIX e banco vivem
// em `EditorDadosFiscais`, também por empresa e com os dois últimos cifrados.
//
// Espelha src/lib/videomaker-vinculo.ts de propósito: o padrão já está provado
// em produção desde a Fase A, e repetir a forma conhecida é mais barato de
// revisar do que inventar uma abstração para os dois.
//
// Enquanto a Fase B não termina, `editores.organizacaoId` ainda existe. Ler por
// ele é o que `scripts/auditar-perfil-global.mjs` chama de regra `escopo` — vai
// sumir. O escopo correto passa a ser `vinculos: { some: { organizacaoId } }`.

import { prisma } from "@/lib/prisma"
import { decryptSecret } from "@/lib/secret-crypto"

/**
 * Salário que ESTA empresa paga. `null` quando não há vínculo ou não há valor —
 * e null é diferente de zero de propósito, para o chamador poder avisar em vez
 * de registrar R$ 0 em silêncio. Foi esse zero calado que encheu a base de
 * custos zerados no lado do videomaker.
 */
export async function salarioDaEmpresa(
  editorId: string,
  organizacaoId: string
): Promise<number | null> {
  const v = await prisma.editorOrganizacao.findUnique({
    where: { organizacaoId_editorId: { organizacaoId, editorId } },
    select: { salario: true },
  })
  return v?.salario ?? null
}

/** Carga máxima que ESTA empresa aloca. Sem vínculo, cai no padrão do schema. */
export async function cargaLimiteDaEmpresa(
  editorId: string,
  organizacaoId: string
): Promise<number | null> {
  const v = await prisma.editorOrganizacao.findUnique({
    where: { organizacaoId_editorId: { organizacaoId, editorId } },
    select: { cargaLimite: true },
  })
  return v?.cargaLimite ?? null
}

/** Ids dos editores que ESTA empresa bloqueou. Bloqueio de uma não alcança a outra. */
export async function bloqueadosDaEmpresa(organizacaoId: string): Promise<string[]> {
  const vinculos = await prisma.editorOrganizacao.findMany({
    where: { organizacaoId, emListaNegra: true },
    select: { editorId: true },
  })
  return vinculos.map((v) => v.editorId)
}

/** Ids dos editores vinculados a ESTA empresa — substitui o filtro por organizacaoId. */
export async function editoresDaEmpresa(
  organizacaoId: string,
  opcoes?: { apenasAtivos?: boolean }
): Promise<string[]> {
  const vinculos = await prisma.editorOrganizacao.findMany({
    where: {
      organizacaoId,
      ...(opcoes?.apenasAtivos ? { status: "ativo", emListaNegra: false } : {}),
    },
    select: { editorId: true },
  })
  return vinculos.map((v) => v.editorId)
}

/**
 * Vínculo completo de UM editor com esta empresa. Devolve `null` quando não há
 * vínculo — que é também a resposta para "esta empresa não enxerga essa pessoa".
 */
export async function vinculoDaEmpresa(editorId: string, organizacaoId: string) {
  return prisma.editorOrganizacao.findUnique({
    where: { organizacaoId_editorId: { organizacaoId, editorId } },
    select: {
      salario: true, valorDiaria: true, cargaLimite: true, status: true,
      observacoes: true, emListaNegra: true, listaNegraMotivo: true, tipoContrato: true,
    },
  })
}

/** Vínculos completos, em lote — evita N+1 nas listas de equipe e produção. */
export async function vinculosDaEmpresa(editorIds: string[], organizacaoId: string) {
  if (editorIds.length === 0) return new Map<string, { salario: number | null; cargaLimite: number; status: string; emListaNegra: boolean }>()
  const vinculos = await prisma.editorOrganizacao.findMany({
    where: { organizacaoId, editorId: { in: [...new Set(editorIds)] } },
    select: { editorId: true, salario: true, cargaLimite: true, status: true, emListaNegra: true },
  })
  return new Map(vinculos.map((v) => [v.editorId, {
    salario: v.salario ?? null, cargaLimite: v.cargaLimite, status: v.status, emListaNegra: v.emListaNegra,
  }]))
}

export type FiscaisDaEmpresa = {
  cpfCnpj: string | null
  razaoSocial: string | null
  nomeFantasia: string | null
  representante: string | null
  endereco: string | null
  chavePix: string | null
  dadosBancarios: string | null
}

// Dado cifrado que não decifra não pode derrubar a tela nem o e-mail do
// financeiro: devolve nulo e registra.
function decifrarOuNulo(valor: string | null | undefined): string | null {
  if (!valor) return null
  try {
    return decryptSecret(valor)
  } catch (e) {
    console.error("[editor-vinculo] Falha ao decifrar dado fiscal:", e)
    return null
  }
}

/** Dados fiscais que ESTA empresa guarda, decifrados. */
export async function fiscaisDaEmpresa(
  editorId: string,
  organizacaoId: string
): Promise<FiscaisDaEmpresa | null> {
  const f = await prisma.editorDadosFiscais.findUnique({
    where: { organizacaoId_editorId: { organizacaoId, editorId } },
  })
  if (!f) return null
  return {
    cpfCnpj: f.cpfCnpj ?? null,
    razaoSocial: f.razaoSocial ?? null,
    nomeFantasia: f.nomeFantasia ?? null,
    representante: f.representante ?? null,
    endereco: f.endereco ?? null,
    chavePix: decifrarOuNulo(f.chavePix),
    dadosBancarios: decifrarOuNulo(f.dadosBancarios),
  }
}

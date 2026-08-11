import { prisma } from "@/lib/prisma"

// Departamento era um enum do Prisma. A tela de Configurações → Parâmetros
// deixava cadastrar um departamento novo ("CRM", "Sistema"), gravava em
// ConfigParametro e a demanda era recusada na hora de salvar, porque o valor
// não existia no enum. A tela aceitava e o sistema rejeitava.
//
// Agora ConfigParametro (grupo "departamentos") é a fonte da verdade, por
// empresa. Este módulo é o único ponto que resolve e valida esses valores.

export const GRUPO = "departamentos"

/**
 * Os valores que existiam no enum. Servem para duas coisas: semear uma empresa
 * que ainda não tem parâmetros e garantir que demandas antigas continuem
 * válidas mesmo se alguém desativar o departamento na tela.
 */
export const DEPARTAMENTOS_LEGADOS: { valor: string; label: string }[] = [
  { valor: "growth", label: "Growth" },
  { valor: "eventos", label: "Eventos" },
  { valor: "institucional", label: "Institucional" },
  { valor: "rh", label: "RH" },
  { valor: "audiovisual", label: "Audiovisual" },
  { valor: "outros", label: "Outros" },
]

/** Normaliza um rótulo digitado ("Sistemas / TI") num valor interno ("sistemas_ti"). */
export function normalizarValor(entrada: string): string {
  return entrada
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

/**
 * Departamentos ativos da empresa. Empresa sem nenhum parâmetro cadastrado cai
 * nos legados — assim uma organização nova nasce funcionando em vez de ficar
 * sem nenhuma opção no formulário.
 */
export async function listarDepartamentos(organizacaoId: string | null | undefined) {
  if (!organizacaoId) return DEPARTAMENTOS_LEGADOS
  const linhas = await prisma.configParametro.findMany({
    where: { organizacaoId, grupo: GRUPO, ativo: true },
    orderBy: [{ ordem: "asc" }, { label: "asc" }],
    select: { valor: true, label: true },
  })
  return linhas.length > 0 ? linhas : DEPARTAMENTOS_LEGADOS
}

/**
 * Um departamento é aceito se estiver cadastrado na empresa OU for um dos
 * legados. A segunda parte importa: desativar "eventos" na tela não pode fazer
 * as 20 demandas que já usam esse valor pararem de salvar.
 */
export async function departamentoValido(
  valor: string | null | undefined,
  organizacaoId: string | null | undefined
): Promise<boolean> {
  if (!valor) return false
  if (DEPARTAMENTOS_LEGADOS.some((d) => d.valor === valor)) return true
  if (!organizacaoId) return false
  const achado = await prisma.configParametro.count({
    where: { organizacaoId, grupo: GRUPO, valor, ativo: true },
  })
  return achado > 0
}

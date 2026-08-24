// Gravação de dado PRIVADO de editor no lugar certo.
//
// O perfil `Editor` é da REDE e vai ser legível por qualquer organização sob
// RLS, então só pode conter o que é público. Salário, diária, carga alocada,
// bloqueio e dados fiscais são de UMA empresa e vão para `EditorOrganizacao` e
// `EditorDadosFiscais`.
//
// Espelha src/lib/videomaker-dados.ts. A lição que originou aquele helper vale
// aqui: no videomaker, três caminhos de escrita continuaram gravando no perfil
// global depois da R4.1 — inclusive um que salvava a chave PIX em TEXTO PURO.
// Enquanto existir um só, apagar as colunas quebra a operação.
import { prisma } from "@/lib/prisma"
import { encryptSecret } from "@/lib/secret-crypto"

/** `undefined` = "não enviado" e nunca vira UPDATE — senão edição parcial apaga o resto. */
function limparIndefinidos<T extends Record<string, unknown>>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>
}

/** Cifra só o que tem conteúdo. String vazia é ausência, não segredo. */
export function cifrarOuNulo(valor: unknown): string | null {
  if (typeof valor !== "string" || !valor) return null
  return encryptSecret(valor)
}

export type ComercialEditor = {
  salario?: number | null
  valorDiaria?: number | null
  cargaLimite?: number
  observacoes?: string | null
  emListaNegra?: boolean
  listaNegraMotivo?: string | null
  status?: "ativo" | "inativo"
  tipoContrato?: string
}

export type FiscalEditor = {
  cpfCnpj?: string | null
  razaoSocial?: string | null
  nomeFantasia?: string | null
  representante?: string | null
  endereco?: string | null
  /** Recebido em claro; é cifrado aqui dentro. */
  chavePix?: string | null
  /** Recebido em claro; é cifrado aqui dentro. */
  dadosBancarios?: string | null
}

/**
 * Grava comercial e fiscal na organização informada, criando o vínculo se não
 * existir. Sem `organizacaoId` não escreve nada e devolve `false` — o chamador
 * decide se isso é erro; o que não pode é cair no perfil global de novo.
 *
 * O vínculo é criado mesmo sem dado comercial: é ele que mantém o perfil visível
 * para a empresa quando a pessoa é interna (Política B da RLS). No videomaker
 * isso apareceu como um interno sem vínculo que sumiria de todas as telas.
 */
export async function gravarDadosPrivadosEditor(params: {
  editorId: string
  organizacaoId: string | null | undefined
  comercial?: ComercialEditor
  fiscal?: FiscalEditor
  tipoContrato?: string
}): Promise<boolean> {
  const { editorId, organizacaoId, comercial, fiscal, tipoContrato } = params
  if (!organizacaoId) {
    console.warn("[editor-dados] Sem organização — dado privado NÃO gravado para", editorId)
    return false
  }

  const com = limparIndefinidos({ ...(comercial ?? {}) } as Record<string, unknown>)
  await prisma.editorOrganizacao.upsert({
    where: { organizacaoId_editorId: { organizacaoId, editorId } },
    create: { organizacaoId, editorId, ...(tipoContrato ? { tipoContrato } : {}), ...com },
    update: com,
  })

  if (fiscal) {
    const fis = limparIndefinidos({
      cpfCnpj: fiscal.cpfCnpj,
      razaoSocial: fiscal.razaoSocial,
      nomeFantasia: fiscal.nomeFantasia,
      representante: fiscal.representante,
      endereco: fiscal.endereco,
      chavePix: fiscal.chavePix !== undefined ? cifrarOuNulo(fiscal.chavePix) : undefined,
      dadosBancarios: fiscal.dadosBancarios !== undefined ? cifrarOuNulo(fiscal.dadosBancarios) : undefined,
    } as Record<string, unknown>)
    if (Object.keys(fis).length > 0) {
      await prisma.editorDadosFiscais.upsert({
        where: { organizacaoId_editorId: { organizacaoId, editorId } },
        create: { organizacaoId, editorId, ...fis },
        update: fis,
      })
    }
  }

  return true
}

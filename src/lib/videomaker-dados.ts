// Gravação de dado PRIVADO de videomaker no lugar certo.
//
// O perfil `Videomaker` é global — é a rede de profissionais compartilhada entre
// as empresas, e vai virar o marketplace legível por qualquer organização sob
// RLS. Por isso ele só pode conter o que é público: nome, cidade, habilidades,
// portfólio, nota agregada.
//
// O que é de UMA empresa mora em duas tabelas por organização:
//   - VideomakerOrganizacao   → diária negociada, observação interna, lista negra
//   - VideomakerDadosFiscais  → CPF/CNPJ, endereço, PIX e banco (os dois últimos cifrados)
//
// A R4.1 arrumou a tela de edição e parou ali. Três caminhos continuavam
// gravando no perfil global: o cadastro público, a criação pelo admin e o fluxo
// de pagamento (este último gravava a chave PIX em TEXTO PURO). Enquanto existir
// um só desses, apagar as colunas do perfil global quebra a operação — daí este
// helper existir antes do DROP, e não depois.
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

export type ComercialVideomaker = {
  valorDiaria?: number | null
  observacoes?: string | null
  emListaNegra?: boolean
  listaNegraMotivo?: string | null
  status?: string
  tipoContrato?: string
  podeEditar?: boolean
}

export type FiscalVideomaker = {
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
 */
export async function gravarDadosPrivadosVideomaker(params: {
  videomakerId: string
  organizacaoId: string | null | undefined
  comercial?: ComercialVideomaker
  fiscal?: FiscalVideomaker
  /** Repassado ao criar o vínculo, para o perfil não nascer com o padrão errado. */
  tipoContrato?: string
}): Promise<boolean> {
  const { videomakerId, organizacaoId, comercial, fiscal, tipoContrato } = params
  if (!organizacaoId) {
    console.warn("[videomaker-dados] Sem organização — dado privado NÃO gravado para", videomakerId)
    return false
  }

  const com = limparIndefinidos({ ...(comercial ?? {}) } as Record<string, unknown>)
  // O vínculo é criado mesmo sem dado comercial: é ele que mantém o perfil
  // visível para a empresa quando o profissional é interno (Política B da RLS).
  await prisma.videomakerOrganizacao.upsert({
    where: { organizacaoId_videomakerId: { organizacaoId, videomakerId } },
    create: { organizacaoId, videomakerId, ...(tipoContrato ? { tipoContrato } : {}), ...com },
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
      await prisma.videomakerDadosFiscais.upsert({
        where: { organizacaoId_videomakerId: { organizacaoId, videomakerId } },
        create: { organizacaoId, videomakerId, ...fis },
        update: fis,
      })
    }
  }

  return true
}

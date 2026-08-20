// Leituras do vínculo empresa↔videomaker.
//
// O perfil `Videomaker` é global — a rede de profissionais é compartilhada entre
// as empresas. O que NÃO é compartilhado é o combinado comercial: a diária que
// cada empresa negociou e o bloqueio que cada empresa decidiu. Isso vive em
// `VideomakerOrganizacao`, uma linha por empresa.
//
// A R4.1 moveu esses campos para o vínculo e corrigiu a tela de edição, mas
// vários leitores continuaram consultando as colunas antigas do perfil global.
// Duas consequências, ambas em produção:
//
//   1. O custo lançado ao finalizar uma demanda usava a diária global — a
//      negociada ficava ignorada, e quem tinha o global vazio recebia custo R$ 0.
//   2. A lista negra global tinha ZERO registros, então bloquear alguém não o
//      tirava da tela de equipe nem da triagem da IA. Pior: se alguém marcasse
//      ali, o profissional sumiria para TODAS as empresas.
//
// Este módulo é a única porta para esses dois dados. Ler `videomaker.valorDiaria`
// ou `videomaker.emListaNegra` direto é bug — as colunas serão apagadas.

import { prisma } from "@/lib/prisma"
import { decryptSecret } from "@/lib/secret-crypto"

/**
 * Diária que ESTA empresa negociou com o profissional.
 *
 * Devolve `null` quando não há vínculo ou quando o vínculo não tem valor — e
 * `null` é diferente de zero de propósito: quem chama precisa poder distinguir
 * "combinamos R$ 0" de "não há combinado", que era exatamente a confusão que
 * fazia custo entrar como R$ 0 sem ninguém perceber.
 *
 * O perfil global NUNCA é consultado aqui. Para fins financeiros ele não existe.
 */
export async function diariaDaEmpresa(
  videomakerId: string,
  organizacaoId: string
): Promise<number | null> {
  const vinculo = await prisma.videomakerOrganizacao.findUnique({
    where: { organizacaoId_videomakerId: { organizacaoId, videomakerId } },
    select: { valorDiaria: true },
  })
  return vinculo?.valorDiaria ?? null
}

/**
 * Ids dos profissionais que ESTA empresa bloqueou.
 *
 * Bloqueio é estritamente por empresa: se a Contourline barra alguém, ele segue
 * disponível para as outras. Use o retorno em `id: { notIn: [...] }` — devolver
 * a lista de excluídos (em vez de filtrar dentro) mantém o filtro visível na
 * consulta de quem chama, em vez de escondido numa camada.
 */
export async function bloqueadosDaEmpresa(organizacaoId: string): Promise<string[]> {
  const vinculos = await prisma.videomakerOrganizacao.findMany({
    where: { organizacaoId, emListaNegra: true },
    select: { videomakerId: true },
  })
  return vinculos.map((v) => v.videomakerId)
}

/**
 * Diárias de vários profissionais de uma vez.
 *
 * Existe porque as telas de custo e relatório listam dezenas de linhas: uma
 * consulta por linha viraria N+1 no lugar exato onde a página já é a mais
 * pesada do sistema. Quem não tem vínculo simplesmente não aparece no Map —
 * ausência continua distinguível de zero.
 */
export async function diariasDaEmpresa(
  videomakerIds: string[],
  organizacaoId: string
): Promise<Map<string, number | null>> {
  if (videomakerIds.length === 0) return new Map()
  const vinculos = await prisma.videomakerOrganizacao.findMany({
    where: { organizacaoId, videomakerId: { in: [...new Set(videomakerIds)] } },
    select: { videomakerId: true, valorDiaria: true },
  })
  return new Map(vinculos.map((v) => [v.videomakerId, v.valorDiaria ?? null]))
}

/** Dados fiscais já decifrados. `chavePix` e `dadosBancarios` vêm cifrados do banco. */
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
// financeiro: devolve nulo e registra. Mesmo contrato do decifrarOuNulo que já
// existia dentro de api/videomakers/[id].
function decifrarOuNulo(valor: string | null | undefined): string | null {
  if (!valor) return null
  try {
    return decryptSecret(valor)
  } catch (e) {
    console.error("[videomaker-vinculo] Falha ao decifrar dado fiscal:", e)
    return null
  }
}

/**
 * Dados fiscais que ESTA empresa guarda do profissional, decifrados.
 *
 * São de quem contrata, não da rede: a Contourline não vê o PIX que o
 * profissional deu para outra empresa. Devolve `null` quando não há registro.
 */
export async function fiscaisDaEmpresa(
  videomakerId: string,
  organizacaoId: string
): Promise<FiscaisDaEmpresa | null> {
  const f = await prisma.videomakerDadosFiscais.findUnique({
    where: { organizacaoId_videomakerId: { organizacaoId, videomakerId } },
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

/** Versão em lote de `fiscaisDaEmpresa`, pelo mesmo motivo de N+1. */
export async function fiscaisDaEmpresaEmLote(
  videomakerIds: string[],
  organizacaoId: string
): Promise<Map<string, FiscaisDaEmpresa>> {
  if (videomakerIds.length === 0) return new Map()
  const linhas = await prisma.videomakerDadosFiscais.findMany({
    where: { organizacaoId, videomakerId: { in: [...new Set(videomakerIds)] } },
  })
  return new Map(
    linhas.map((f) => [
      f.videomakerId,
      {
        cpfCnpj: f.cpfCnpj ?? null,
        razaoSocial: f.razaoSocial ?? null,
        nomeFantasia: f.nomeFantasia ?? null,
        representante: f.representante ?? null,
        endereco: f.endereco ?? null,
        chavePix: decifrarOuNulo(f.chavePix),
        dadosBancarios: decifrarOuNulo(f.dadosBancarios),
      },
    ])
  )
}

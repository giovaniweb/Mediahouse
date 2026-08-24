import { prisma } from "@/lib/prisma"

// Rastro de quem mexeu na demanda.
//
// HistoricoStatus só registrava mudança de STATUS — e já com autor: são 1.439
// linhas em produção, 1.425 com usuarioId, 718 delas movimentações de kanban.
// O que faltava era o resto: quem editou o título, quem trocou o prazo, quem
// assumiu a demanda. Nada disso deixava rastro, e é o que o time pediu ("quem
// editou e arrastou, quem pegou a demanda pra executar").
//
// `statusNovo` é String (não enum), então dá para marcar o TIPO do evento sem
// migração. Estes valores nunca colidem com um status real — a tela os traduz
// para frases em vez de rótulo de coluna.
export { EVENTO_EDICAO, EVENTO_RESPONSAVEL } from "@/lib/status"
import { EVENTO_EDICAO, EVENTO_RESPONSAVEL } from "@/lib/status"

/**
 * Campos cuja alteração vale contar, com o nome que a pessoa reconhece.
 *
 * A lista precisa espelhar o `updateData` do PUT de demanda: `registrarEdicao`
 * compara chave a chave, então campo que nunca chega ao update jamais é detectado.
 * Saíram daqui `tipoVideo`, `departamento`, `localEvento`, `dataEvento` e
 * `detalhesEntrega` — cinco entradas que pareciam rastreadas e eram inalcançáveis.
 * Entraram os campos que o update aceita e passavam despercebidos: entregas,
 * postagem e impedimento.
 *
 * Campos de pessoa (videomaker, editor, responsável) NÃO entram aqui: este
 * registro guarda só o nome do campo, e para eles é preciso saber quem entrou —
 * ver `registrarTrocaExecutor` e `registrarTrocaResponsavel`.
 */
const CAMPOS_RASTREADOS: Record<string, string> = {
  titulo: "título",
  descricao: "descrição",
  dataLimite: "prazo",
  dataCaptacao: "data de captação",
  prioridade: "prioridade",
  cidade: "cidade",
  classificacao: "classificação",
  linhaProjetoId: "linha/projeto",
  linkBrutos: "link dos brutos",
  linkFinal: "link do vídeo final",
  linkPostagem: "link da postagem",
  linkCliente: "link do cliente",
  localGravacao: "local de gravação",
  motivoImpedimento: "motivo do impedimento",
}

function mesmoValor(a: unknown, b: unknown): boolean {
  if (a instanceof Date || b instanceof Date) {
    const ta = a instanceof Date ? a.getTime() : a ? new Date(a as string).getTime() : null
    const tb = b instanceof Date ? b.getTime() : b ? new Date(b as string).getTime() : null
    return ta === tb
  }
  if (typeof a === "object" || typeof b === "object") return JSON.stringify(a) === JSON.stringify(b)
  return (a ?? null) === (b ?? null)
}

/**
 * Compara o antes e o depois e grava UMA linha resumindo o que mudou. Uma linha
 * por edição, não uma por campo: quem lê o histórico quer "Fulano editou título e
 * prazo", não três entradas seguidas do mesmo instante.
 *
 * Nunca lança — histórico é registro, não pode derrubar a edição que o gerou.
 */
export async function registrarEdicao(
  demandaId: string,
  usuarioId: string,
  antes: Record<string, unknown> | null,
  depois: Record<string, unknown>,
  statusAtual: string
) {
  if (!antes) return
  // `depois` é o objeto de update, que carrega TODAS as chaves possíveis — as não
  // enviadas vêm como undefined, e o Prisma as ignora. Tratá-las como alteração
  // fazia uma edição de dois campos ser registrada como sete.
  const mudou = Object.keys(CAMPOS_RASTREADOS).filter(
    (campo) => depois[campo] !== undefined && !mesmoValor(antes[campo], depois[campo])
  )
  if (mudou.length === 0) return

  const nomes = mudou.map((c) => CAMPOS_RASTREADOS[c])
  const lista =
    nomes.length === 1 ? nomes[0]
    : `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`

  await prisma.historicoStatus.create({
    data: {
      demandaId,
      statusAnterior: statusAtual,
      statusNovo: EVENTO_EDICAO,
      usuarioId,
      origem: "manual",
      observacao: `Editou ${lista}`,
    },
  }).catch((e) => console.error("[Histórico] Falha ao registrar edição:", e))
}

/**
 * Quem passou a executar a demanda — videomaker (captação) ou editor.
 *
 * Não dá para usar CAMPOS_RASTREADOS aqui: `registrarEdicao` grava só o NOME do
 * campo ("Editou videomaker"), e a pergunta da equipe é "quem pegou a demanda
 * pra executar" — precisa do nome da pessoa. Por isso este registro segue o
 * formato de `registrarTrocaResponsavel`, que guarda quem entrou e quem saiu.
 *
 * Antes desta função, atribuir videomaker ou editor não deixava rastro nenhum.
 */
export async function registrarTrocaExecutor(
  demandaId: string,
  usuarioId: string,
  papel: "videomaker" | "editor",
  idAntes: string | null,
  idDepois: string | null,
  statusAtual: string,
  organizacaoId: string
) {
  if ((idAntes ?? null) === (idDepois ?? null)) return

  const rotulo = papel === "videomaker" ? "Videomaker" : "Editor"

  // Busca escopada por organização: o id vem da própria demanda, mas resolver
  // nome sem escopo abriria a porta para um chamador futuro passar um id de
  // outra empresa e ver o nome dela no histórico.
  //
  // Os dois modelos são escopados de formas diferentes: Editor tem coluna
  // própria, enquanto Videomaker é rede compartilhada de parceiros e se liga à
  // empresa por VideomakerOrganizacao.
  const nomeDe = async (id: string | null): Promise<string> => {
    if (!id) return ""
    const registro = papel === "videomaker"
      ? await prisma.videomaker.findFirst({
          where: { id, vinculos: { some: { organizacaoId } } },
          select: { nome: true },
        }).catch(() => null)
      : await prisma.editor.findFirst({
          where: { id, vinculos: { some: { organizacaoId } } },
          select: { nome: true },
        }).catch(() => null)
    return registro?.nome ?? "(removido)"
  }

  const [antes, depois] = await Promise.all([nomeDe(idAntes), nomeDe(idDepois)])

  const texto = depois
    ? antes ? `${rotulo}: ${antes} → ${depois}` : `${rotulo} atribuído: ${depois}`
    : `${rotulo} removido (era ${antes})`

  await prisma.historicoStatus.create({
    data: {
      demandaId,
      statusAnterior: statusAtual,
      statusNovo: EVENTO_RESPONSAVEL,
      usuarioId,
      origem: "manual",
      observacao: texto,
    },
  }).catch((e) => console.error("[Histórico] Falha ao registrar executor:", e))
}

/** Quem assumiu (ou saiu de) uma demanda. */
export async function registrarTrocaResponsavel(
  demandaId: string,
  usuarioId: string,
  nomesAntes: string[],
  nomesDepois: string[],
  statusAtual: string
) {
  const antes = [...nomesAntes].sort().join(", ")
  const depois = [...nomesDepois].sort().join(", ")
  if (antes === depois) return

  const texto = depois
    ? antes ? `Responsável: ${antes} → ${depois}` : `Assumiu: ${depois}`
    : `Removeu o responsável (era ${antes})`

  await prisma.historicoStatus.create({
    data: {
      demandaId,
      statusAnterior: statusAtual,
      statusNovo: EVENTO_RESPONSAVEL,
      usuarioId,
      origem: "manual",
      observacao: texto,
    },
  }).catch((e) => console.error("[Histórico] Falha ao registrar responsável:", e))
}

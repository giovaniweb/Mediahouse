// Pacote inicial de toda empresa nova (Onda 2A, 21/10/2026).
//
// Antes, a empresa nascia vazia: sem departamentos, tipos de demanda, checklists
// nem linha, e os parâmetros só eram semeados no primeiro GET de Configurações.
// Agora ela nasce com a ESTRUTURA que a Contourline usa hoje — os nomes das
// listas, nunca os dados dela (demandas, pessoas, produtos, clientes).
//
// De onde veio cada lista (leitura de produção de 21/10/2026, só a estrutura):
// - departamentos, tipos de criativo, habilidades e áreas: iguais aos ativos na
//   Contourline;
// - tipos de vídeo: os 7 que a Contourline deixou ativos ("Webinar/live" virou
//   o valor `webinar_live`; o resto é igual);
// - checklists: os modelos padrão do NuFlow (/api/checklist-templates/seed) que
//   batem com esses tipos, já sem o Google Drive, que saiu do produto em 03/10;
// - uma linha "Geral", para a social e o Growth terem onde pendurar o pedido.
//
// A semente é idempotente: rodar de novo não duplica nem sobrescreve o que a
// empresa já editou.
import type { Prisma } from "@prisma/client"

type Tx = Prisma.TransactionClient
type Parametro = { grupo: string; valor: string; label: string }

const lista = (grupo: string, itens: [string, string][]): Parametro[] =>
  itens.map(([valor, label]) => ({ grupo, valor, label }))

export const PARAMETROS_INICIAIS: Parametro[] = [
  ...lista("departamentos", [
    ["growth", "Growth"], ["eventos", "Eventos"], ["institucional", "Institucional"],
    ["rh", "RH"], ["audiovisual", "Audiovisual"], ["outros", "Outros"],
  ]),
  ...lista("tipos_video", [
    ["webinar_live", "Webinar/live"], ["reels", "Reels"], ["youtube", "YouTube"],
    ["apresentacao_equipamento", "Apresentação de Equipamento"], ["video_institucional", "Institucional"],
    ["treinamento", "Treinamento"], ["outro", "Outro"],
  ]),
  ...lista("tipos_criativo", [
    ["post", "Post"], ["carrossel", "Carrossel"], ["story", "Story"], ["material_grafico", "Material Gráfico"],
    ["anuncio", "Anúncio"], ["email_marketing", "E-mail Marketing"], ["landing_page", "Landing Page"],
    ["landing_copy", "Copy de Landing"], ["apresentacao", "Apresentação"],
    ["atualizacao_materiais", "Atualização de Materiais"], ["administrativo", "Administrativo"], ["design", "Design (geral)"],
  ]),
  ...lista("habilidades", [
    ["edicao", "Edição"], ["captacao_camera", "Captação com câmera"], ["captacao_celular", "Captação com celular"],
    ["fotos", "Fotos"], ["3d", "3D"], ["ia_maker", "IA Maker"], ["motion_graphics", "Motion Graphics"],
    ["colorização", "Colorização"], ["drone", "Drone"], ["entrevista", "Entrevista"], ["live", "Live/Transmissão"],
    ["animacao", "Animação"], ["podcast", "Podcast"], ["roteiro", "Roteiro"], ["trilha_sonora", "Trilha Sonora"],
  ]),
  ...lista("areas_atuacao", [
    ["eventos", "Eventos"], ["institucional", "Institucional"], ["ads", "Ads / Publicidade"],
    ["social_media", "Social Media"], ["reels", "Reels"], ["documentario", "Documentário"], ["live", "Live"],
  ]),
]

export const CHECKLISTS_INICIAIS: { nome: string; tipoVideo: string | null; papel: string; itens: string[] }[] = [
  { nome: "Geral", tipoVideo: null, papel: "geral",
    itens: ["Captar", "Baixar", "Decupar", "Editar", "Subir para aprovação", "Enviar para o cliente", "Postar"] },
  { nome: "Reels", tipoVideo: "reels", papel: "geral",
    itens: ["Captar", "Baixar", "Editar", "Subir para aprovação", "Postar"] },
  { nome: "Social Media", tipoVideo: null, papel: "social",
    itens: ["Baixar vídeo aprovado", "Postar (collab com cliente)"] },
]

export const LINHA_INICIAL = "Geral"

/** Grava o pacote na empresa, dentro da transação de quem chama. */
export async function semearPacoteInicial(tx: Tx, organizacaoId: string) {
  // A ordem conta por grupo, como a tela de Parâmetros mostra.
  const ordem = new Map<string, number>()
  const parametros = await tx.configParametro.createMany({
    data: PARAMETROS_INICIAIS.map((p) => {
      const n = ordem.get(p.grupo) ?? 0
      ordem.set(p.grupo, n + 1)
      return { organizacaoId, ...p, ordem: n }
    }),
    skipDuplicates: true,
  })

  let checklists = 0
  for (const modelo of CHECKLISTS_INICIAIS) {
    const existe = await tx.checklistTemplate.findFirst({ where: { organizacaoId, nome: modelo.nome }, select: { id: true } })
    if (existe) continue
    await tx.checklistTemplate.create({
      data: {
        organizacaoId, nome: modelo.nome, tipoVideo: modelo.tipoVideo, papel: modelo.papel,
        itens: { create: modelo.itens.map((texto, i) => ({ texto, ordem: i })) },
      },
    })
    checklists++
  }

  const linhas = await tx.linhaProjeto.createMany({
    data: [{ organizacaoId, nome: LINHA_INICIAL, descricao: "Linha padrão. Renomeie ou crie as linhas da empresa." }],
    skipDuplicates: true,
  })

  return { parametros: parametros.count, checklists, linhas: linhas.count }
}

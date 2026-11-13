// Escopo "minhas demandas" — quais demandas uma pessoa considera suas.
//
// "Responsável" no NuFlow está espalhado por várias dimensões (herança de como o
// produto cresceu): a M2M de responsáveis, a coluna derivada, o videomaker e o
// editor do audiovisual, o designer e o social do Growth, o gestor e o
// solicitante. Quem se organiza por "o que é meu" espera ver todas elas.
import { prisma } from "@/lib/prisma"
import { permissoesEfetivas } from "@/lib/permissoes-server"
import type { Prisma } from "@prisma/client"
import type { Session } from "next-auth"
import { ehGestor } from "@/lib/papel"
import { escopoComEspelho } from "@/lib/compartilhamento"

// Monta o filtro de demandas ligadas a um usuário dentro de uma organização.
// Resolve os espelhos profissionais (Videomaker/Editor/Designer têm id próprio,
// diferente do id de Usuario) antes de montar o OR.
export async function filtroMinhasDemandas(
  usuarioId: string,
  organizacaoId: string
): Promise<Prisma.DemandaWhereInput> {
  const [videomaker, editor, designer] = await Promise.all([
    prisma.videomaker.findFirst({ where: { usuarioId }, select: { id: true } }),
    prisma.editor.findFirst({ where: { usuarioId, vinculos: { some: { organizacaoId } } }, select: { id: true } }),
    prisma.designer.findFirst({ where: { usuarioId, vinculos: { some: { organizacaoId } } }, select: { id: true } }),
  ])

  const alternativas: Prisma.DemandaWhereInput[] = [
    { responsaveis: { some: { usuarioId } } },
    { responsavelId: usuarioId },
    { gestorId: usuarioId },
    { solicitanteId: usuarioId },
    { socialId: usuarioId },
  ]
  if (videomaker) {
    alternativas.push({ videomakerId: videomaker.id })
    // O card de outra empresa que a empresa ATIVA mandou ele fazer (o X da GH
    // na gravação da Contourline). A linha de `executor_espelho` é desta
    // empresa e some quando o espelho é revogado.
    alternativas.push({ executoresEspelho: { some: { organizacaoId, videomakerId: videomaker.id } } })
  }
  if (editor) alternativas.push({ editorId: editor.id })
  if (designer) alternativas.push({ designerId: designer.id })

  return { OR: alternativas }
}

// Até onde a pessoa enxerga as demandas da empresa: `null` é tudo (a trava por
// área fica com a rota); um filtro é "só as minhas". A gestão vê tudo; os
// demais, pelo `verTodasDemandas` EFETIVO — o registro explícito, ou o preset
// do papel quando não há registro. Sem como determinar, só as próprias.
//
// Antes a lista lia só o registro explícito e aplicava o filtro quando ele
// existia: quem não tinha registro não caía em filtro nenhum e via a empresa
// inteira. E a ficha, a edição e a exclusão nem perguntavam — conferiam a
// empresa, não a pessoa.
export async function escopoDeDemandas(
  usuarioId: string,
  organizacaoId: string,
  gestor: boolean
): Promise<Prisma.DemandaWhereInput | null> {
  if (gestor) return null
  const vinculo = await permissoesEfetivas(usuarioId, organizacaoId)
  if (vinculo?.permissoes.verTodasDemandas) return null
  return filtroMinhasDemandas(usuarioId, organizacaoId)
}

// A mesma regra para um card só. Quem chama responde 404 quando é `false`,
// como para um card que não existe: "sem permissão" contaria que ele existe.
export async function demandaNoEscopo(
  usuarioId: string,
  organizacaoId: string,
  gestor: boolean,
  demandaId: string
): Promise<boolean> {
  const escopo = await escopoDeDemandas(usuarioId, organizacaoId, gestor)
  if (!escopo) return true
  return (await prisma.demanda.count({ where: { AND: [{ id: demandaId }, escopo] } })) > 0
}

/**
 * A área em que a pessoa fica presa, ou null. A separação entre as pessoas é
 * por ÁREA, e a área vem do vínculo: quem atua só no audiovisual ou só no
 * Growth fica no seu quadro; quem atua nos dois, ou não tem área definida, não
 * é trancado (o escopo de "minhas demandas" já cobre esse caso). Gestão vê tudo.
 */
export async function areaTravadaDaPessoa(
  usuarioId: string,
  organizacaoId: string,
  gestor: boolean
): Promise<"audiovisual" | "design" | null> {
  if (gestor) return null
  const membership = await prisma.usuarioOrganizacao.findUnique({
    where: { usuarioId_organizacaoId: { usuarioId, organizacaoId } },
    select: { areas: true },
  })
  const areas = membership?.areas ?? []
  const veAudiovisual = areas.includes("audiovisual")
  const veGrowth = areas.includes("growth")
  if (veAudiovisual && !veGrowth) return "audiovisual"
  if (veGrowth && !veAudiovisual) return "design"
  return null
}

/**
 * Tudo o que a pessoa vê no quadro, num filtro só: a empresa (e o que ela
 * executa por espelhamento), a área do vínculo e "minhas demandas" quando não
 * tem `verTodasDemandas`. São as mesmas peças que GET /api/demandas monta; o
 * assistente (MCP) da pessoa usa esta, para ler nem mais nem menos do que ela
 * leria na tela.
 *
 * O gestor de eventos não tem regra própria: vale a caixinha "Ver Todas
 * Demandas", como para os outros papéis. De 03/06 a 04/11/2026 ele só via os
 * cards ligados a um evento, mesmo com a caixinha marcada; na Contourline, que
 * não tem nenhum, a Mariana (gestora de eventos, 39 pedidos abertos) via o
 * quadro vazio.
 */
export async function oQueAPessoaVe(session: Session, organizacaoId: string): Promise<Prisma.DemandaWhereInput> {
  return oQueOUsuarioVe(session.user.id, organizacaoId, ehGestor(session))
}

/**
 * A mesma regra sem sessão, para rotina que fala com a pessoa (o resumo do fim
 * do dia): `gestor` é o papel dela NA empresa (admin ou gestor no vínculo).
 */
export async function oQueOUsuarioVe(usuarioId: string, organizacaoId: string, gestor: boolean): Promise<Prisma.DemandaWhereInput> {
  const [area, minhas] = await Promise.all([
    areaTravadaDaPessoa(usuarioId, organizacaoId, gestor),
    escopoDeDemandas(usuarioId, organizacaoId, gestor),
  ])
  const and: Prisma.DemandaWhereInput[] = [escopoComEspelho(organizacaoId)]
  if (area) and.push({ area })
  if (minhas) and.push(minhas)
  return { AND: and }
}

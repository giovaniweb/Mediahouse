import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { comOrg } from "@/lib/org-contexto"
import { permissoesEfetivas } from "@/lib/permissoes-server"
import { BASE_FALSE, type PermissaoKey } from "@/lib/permissoes"
import { filtroMinhasDemandas } from "@/lib/escopo-demanda"
import { identidadeWhatsApp, telefoneCompleto } from "@/lib/whatsapp-identidade"
import { validarInputFerramenta } from "@/lib/ia-tool-input"

type Principal = { tipo: "usuario"; usuarioId: string } | { tipo: "sistema"; agente: "alertas" | "prazos" | "vistoria" } | { tipo: "whatsapp"; telefone: string; mediaUrl?: string }
export type ContextoFerramenta = Readonly<{ organizacaoId: string; principal: Readonly<Principal> }>
const emitidos = new WeakSet<object>()
function emitir(organizacaoId: string, principal: Principal): ContextoFerramenta {
  if (!organizacaoId) throw new Error("Empresa obrigatória")
  const ctx = Object.freeze({ organizacaoId, principal: Object.freeze(principal) })
  emitidos.add(ctx)
  return ctx
}
// Fábricas chamadas exclusivamente por adaptadores autenticados, nunca a partir
// dos argumentos do modelo. Capacidades são relidas no banco a cada execução.
export const contextoUsuario = (organizacaoId: string, usuarioId: string) => emitir(organizacaoId, { tipo: "usuario", usuarioId })
export const contextoSistema = (organizacaoId: string, agente: "alertas" | "prazos" | "vistoria") => emitir(organizacaoId, { tipo: "sistema", agente })
export function contextoWhatsApp(organizacaoId: string, replyJid: string, mediaUrl?: string) {
  const telefone = telefoneCompleto(replyJid)
  if (!telefone) throw new Error("Remetente não verificável")
  return emitir(organizacaoId, { tipo: "whatsapp", telefone, mediaUrl })
}
const politicas: Record<string, PermissaoKey[]> = {
  buscar_demandas: ["verDemandas"], buscar_historico_demanda: ["verDemandas"], buscar_demanda_por_codigo: ["verDemandas"],
  buscar_videomakers: ["verVideomakers", "verTodasDemandas"], buscar_custos: ["verCustos"], buscar_metricas: ["verRelatorios", "verTodasDemandas"],
  buscar_alertas: ["verAlertas"], criar_alerta: ["verAlertas", "verTodasDemandas"],
  buscar_agenda_videomaker: ["verAgenda"], criar_evento_agenda: ["verAgenda"],
  criar_demanda_rascunho: ["criarDemanda"], estruturar_demanda: ["criarDemanda"],
  solicitar_dados_demanda: ["editarDemanda", "gerenciarUsuarios"], vincular_arquivo_demanda: ["editarDemanda"],
  listar_gestores: ["gerenciarUsuarios"], enviar_whatsapp: ["gerenciarUsuarios"],
  salvar_ideia_video: ["verIdeias"], buscar_ideias: ["verIdeias"],
}
const ferramentasSistema = new Set(["buscar_demandas", "buscar_metricas", "buscar_videomakers", "buscar_alertas", "criar_alerta", "buscar_historico_demanda", "listar_gestores", "enviar_whatsapp"])
const publicasWhatsApp = new Set(["enviar_whatsapp", "criar_demanda_rascunho", "estruturar_demanda"])

export async function autorizarFerramenta(nome: string, bruto: unknown, ctx: ContextoFerramenta) {
  if (!ctx || !emitidos.has(ctx)) throw new Error("Contexto verificado obrigatório")
  return comOrg(ctx.organizacaoId, async () => {
    const input = validarInputFerramenta(nome, bruto)
    const { organizacaoId, principal } = ctx
    const empresa = await prisma.organizacao.findFirst({ where: { id: organizacaoId, ativo: true }, select: { id: true } })
    if (!empresa) throw new Error("Empresa indisponível")
    const identidade = principal.tipo === "whatsapp" ? await identidadeWhatsApp(organizacaoId, principal.telefone) : null
    const usuarioId = principal.tipo === "usuario" ? principal.usuarioId : identidade?.usuario?.id
    const vinculo = usuarioId ? await permissoesEfetivas(usuarioId, organizacaoId) : null
    if (usuarioId && !vinculo) throw new Error("Acesso revogado")
    if (principal.tipo === "usuario" && !vinculo?.permissoes.verIA) throw new Error("Sem acesso à IA")
    const sistema = principal.tipo === "sistema"
    const profissional = !!(identidade?.editor || identidade?.videomaker)
    const permissoes = vinculo?.permissoes ?? { ...BASE_FALSE, verDemandas: profissional, verAgenda: profissional, editarDemanda: profissional }
    const publico = principal.tipo === "whatsapp" && publicasWhatsApp.has(nome)
    if (sistema ? !ferramentasSistema.has(nome) : !publico && !politicas[nome]?.every(p => permissoes[p])) throw new Error("Ferramenta não permitida")
    const gestor = vinculo?.papel === "admin" || vinculo?.papel === "gestor"
    let filtro: Prisma.DemandaWhereInput = { organizacaoId }
    if (!sistema && !permissoes.verTodasDemandas) {
      const proprio = usuarioId ? await filtroMinhasDemandas(usuarioId, organizacaoId) : {
        OR: [
          ...(identidade?.videomaker ? [{ videomakerId: identidade.videomaker.id }] : []),
          ...(identidade?.editor ? [{ editorId: identidade.editor.id }] : []),
        ],
      }
      filtro = { organizacaoId, AND: [proprio] }
    }
    // Responder à conversa não associa um ID arbitrário aos registros de envio.
    if (nome === "enviar_whatsapp" && principal.tipo === "whatsapp") delete input.demanda_id
    // IDs e códigos só identificam recurso; jamais carregam autoridade.
    const demandaObrigatoria = ["buscar_historico_demanda", "buscar_demanda_por_codigo", "solicitar_dados_demanda", "vincular_arquivo_demanda"].includes(nome)
    const codigo = input.codigo ?? input.codigo_demanda
    let demandaId: string | undefined
    if (input.demanda_id || codigo || demandaObrigatoria) {
      if (!input.demanda_id && !codigo) throw new Error("Demanda obrigatória")
      const demanda = await prisma.demanda.findFirst({ where: { AND: [filtro, { ...(input.demanda_id ? { id: input.demanda_id as string } : {}), ...(codigo ? { codigo: { equals: codigo as string, mode: "insensitive" as const } } : {}) }] }, select: { id: true } })
      if (!demanda) throw new Error("Demanda indisponível")
      demandaId = demanda.id
      input.demanda_id = demanda.id
    }
    if (["criar_demanda_rascunho", "estruturar_demanda", "salvar_ideia_video"].includes(nome)) {
      const pessoa = usuarioId ? await prisma.usuario.findUnique({ where: { id: usuarioId }, select: { telefone: true, nome: true } }) : null
      const telefone = principal.tipo === "whatsapp" ? principal.telefone : telefoneCompleto(pessoa?.telefone)
      input.telefone_solicitante = telefone ?? undefined
      input.telefone_origem = telefone ?? undefined
      if (pessoa) { input.nome_solicitante = pessoa.nome; input.nome_origem = pessoa.nome }
      if (input.media_url && (principal.tipo !== "whatsapp" || input.media_url !== principal.mediaUrl)) throw new Error("Mídia não autorizada")
    }
    if (nome === "vincular_arquivo_demanda" && (principal.tipo !== "whatsapp" || !principal.mediaUrl || input.url_arquivo !== principal.mediaUrl)) throw new Error("Anexo não pertence à mensagem recebida")
    if (nome === "solicitar_dados_demanda" && principal.tipo !== "usuario") throw new Error("Envio requer gestor no aplicativo")
    if (nome === "enviar_whatsapp") {
      const destinatario = principal.tipo === "whatsapp" && input.telefone === principal.telefone
        ? principal.telefone : telefoneCompleto(input.telefone)
      if (!destinatario) throw new Error("Destinatário inválido")
      if (principal.tipo === "whatsapp") {
        if (destinatario !== principal.telefone) throw new Error("Só é permitido responder à conversa atual")
      } else {
        const alvo = await identidadeWhatsApp(organizacaoId, destinatario)
        const gestorAlvo = alvo.usuario && ["admin", "gestor"].includes(alvo.usuario.tipo)
        let participante = false
        if (demandaId) {
          const alternativas: Prisma.DemandaWhereInput[] = [
            ...(alvo.usuario ? [{ solicitanteId: alvo.usuario.id }, { responsavelId: alvo.usuario.id }, { gestorId: alvo.usuario.id }, { responsaveis: { some: { usuarioId: alvo.usuario.id } } }] : []),
            ...(alvo.videomaker ? [{ videomakerId: alvo.videomaker.id }] : []),
            ...(alvo.editor ? [{ editorId: alvo.editor.id }] : []),
          ]
          participante = !!await prisma.demanda.findFirst({ where: { id: demandaId, organizacaoId, OR: alternativas }, select: { id: true } })
        }
        if (!gestorAlvo && !participante) throw new Error("Destinatário sem vínculo com esta notificação")
      }
      input.telefone = destinatario
    }
    if (["buscar_agenda_videomaker", "criar_evento_agenda"].includes(nome)) {
      const donos = [input.editor_id, input.videomaker_id, input.usuario_id].filter(Boolean)
      if (donos.length > 1) throw new Error("Informe somente um responsável")
      // Busca textual é ambígua e não determina autorização; solicitar ID.
      if (input.nome || input.telefone) throw new Error("Informe o ID do responsável pela agenda")
      if (!donos.length) {
        if (identidade?.editor) input.editor_id = identidade.editor.id
        else if (identidade?.videomaker) input.videomaker_id = identidade.videomaker.id
        else throw new Error("Responsável obrigatório")
      }
      let autorizado = false
      if (input.editor_id) autorizado = !!await prisma.editor.findFirst({ where: { id: input.editor_id as string, vinculos: { some: { organizacaoId, status: "ativo" } }, ...(!gestor ? usuarioId ? { usuarioId } : { AND: [{ id: identidade?.editor?.id ?? "__negado__" }] } : {}) }, select: { id: true } })
      if (input.videomaker_id) autorizado = !!await prisma.videomaker.findFirst({ where: { id: input.videomaker_id as string, vinculos: { some: { organizacaoId, status: { in: ["ativo", "preferencial"] }, emListaNegra: false } }, ...(!gestor ? usuarioId ? { usuarioId } : { AND: [{ id: identidade?.videomaker?.id ?? "__negado__" }] } : {}) }, select: { id: true } })
      if (input.usuario_id) autorizado = !!await prisma.usuario.findFirst({ where: { id: input.usuario_id as string, status: "ativo", organizacoes: { some: { organizacaoId } }, ...(!gestor ? { AND: [{ id: usuarioId ?? "__negado__" }] } : {}) }, select: { id: true } })
      if (!autorizado) throw new Error("Agenda não autorizada")
      if (nome === "criar_evento_agenda") {
        const inicio = Date.parse(input.inicio as string), fim = input.fim ? Date.parse(input.fim as string) : inicio + 7200000
        if (fim <= inicio || fim - inicio > 31 * 86400000 || input.forcar) throw new Error("Intervalo inválido ou conflito exige confirmação fora da IA")
      }
    }
    return { input, organizacaoId, filtro, usuarioId, financeiro: !sistema && permissoes.verCustos, publico: publico && !usuarioId && !profissional }
  })
}

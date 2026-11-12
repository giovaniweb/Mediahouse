import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { comOrg } from "@/lib/org-contexto"
import type { AcaoAuditoria } from "@/lib/auditoria"
import { DOCUMENTOS, type SlugDocumento } from "@/lib/juridico/documentos"

// Record<AcaoAuditoria>: ação nova sem rótulo não compila. Antes nove das 25
// ações (convites, WhatsApp, alertas) apareciam na tela como código cru.
const rotulos: Record<AcaoAuditoria, string> = {
  "convite.criar": "Convite enviado", "convite.responder": "Convite respondido", "convite.entregar": "Material entregue pelo convite",
  "gravacao.cancelar": "Gravação cancelada",
  "demanda.transferir": "Gravação transferida para Demandas",
  "whatsapp.pausar": "Envio de WhatsApp pausado", "whatsapp.retomar": "Envio de WhatsApp retomado", "whatsapp.cancelar": "Envio de WhatsApp cancelado", "whatsapp.retentativa": "Nova tentativa de WhatsApp",
  "alerta.resolver": "Alerta resolvido", "alerta.ignorar": "Alerta ignorado", "alerta.snooze": "Alerta adiado",
  "evento.documento": "Documento do evento alterado", "evento.aprovacao": "Aprovação do evento registrada",
  "acesso.negado": "Acesso bloqueado", "permissoes.alteradas": "Permissões alteradas", "usuario.alterado": "Pessoa atualizada", "usuario.removido": "Acesso da pessoa removido",
  "configuracao.alterada": "Configuração alterada", "trello.conexao": "Conexão Trello", "drive.conexao": "Conexão de pasta externa (desativada)", "arquivo.publicacao": "Publicação no portfólio",
  "manutencao.custos": "Custos retroativos", "manutencao.arquivos": "Arquivos retroativos", "manutencao.credenciais": "Proteção de credenciais", "manutencao.retencao": "Limpeza de detalhes vencidos",
  "ia.mutacao": "Registro criado por ferramenta IA", "ia.envio": "Solicitação de envio pela IA",
  "mcp.leitura": "Consulta pelo assistente (MCP)", "mcp.criar": "Demanda criada pelo assistente (MCP)",
  "mcp.chave": "Chave de assistente (MCP) gerada ou revogada", "mcp.desfazer": "Demanda do assistente (MCP) desfeita",
  "login.recusado": "Login com senha errada", "login.bloqueado": "Login travado por excesso de tentativas",
  "termos.aceite": "Termos e Política de Privacidade aceitos",
  "espelho.mover": "Card de empresa parceira movido",
}
const resultados: Record<string,string> = { intencao: "iniciada", sucesso: "concluída", falha: "falhou", negado: "negada" }

/** A frase da tela: o quê e como terminou. O recurso e o id (para conferir ou buscar) vão à parte. */
export function descreverEventoAuditoria(e: { acao: string; resultado: string; depois?: unknown }): string {
  const rotulo = rotulos[e.acao as AcaoAuditoria] ?? e.acao
  const fim = e.acao === "ia.envio" && e.resultado === "sucesso" ? "aceita pelo provedor" : resultados[e.resultado] ?? e.resultado
  if (e.acao === "termos.aceite") return `${rotulo} · ${fim}${detalheDoAceite(e.depois)}`
  return `${rotulo} · ${fim}`
}

const origensAceite: Record<string, string> = {
  cadastro_videomaker: "no cadastro de videomaker", cadastro_designer: "no cadastro de designer",
  primeiro_acesso: "no primeiro acesso", nova_versao: "na versão nova dos termos",
}
// "— Termos de Uso 1.0, Política de Privacidade 1.0, no primeiro acesso". O
// detalhe some quando o payload vence (90 dias); a prova completa fica em
// aceites_termos, que não expira.
function detalheDoAceite(depois: unknown): string {
  if (!depois || typeof depois !== "object") return ""
  const d = depois as { documentos?: unknown; origem?: unknown }
  const docs = Array.isArray(d.documentos) ? d.documentos.filter((x): x is string => typeof x === "string").map(x => {
    const [slug, versao] = x.split("@")
    return `${DOCUMENTOS[slug as SlugDocumento]?.curto ?? slug} ${versao}`
  }) : []
  const origem = typeof d.origem === "string" ? origensAceite[d.origem] : undefined
  const partes = [docs.join(", "), origem].filter(Boolean)
  return partes.length ? ` — ${partes.join(", ")}` : ""
}

export async function lerAuditoriaSeguranca(organizacaoId: string, sp: URLSearchParams, periodo?: { gte?: Date; lte?: Date }) {
  const pagina = Math.min(10000, Math.max(1, Math.trunc(Number(sp.get("pagina"))) || 1)), porPagina = 50
  const busca = sp.get("busca")?.trim().slice(0,200), atorId = sp.get("usuarioId")
  return comOrg(organizacaoId, async () => {
    const where: Prisma.EventoAuditoriaWhereInput = { organizacaoId,
      ...(periodo ? { createdAt: periodo } : {}), ...(atorId ? { atorId } : {}),
      ...(busca ? { OR: ["acao", "recursoId", "correlationId"].map(k => ({ [k]: { contains: busca, mode: "insensitive" } })) } : {}),
    }
    const [total, rows] = await Promise.all([
      prisma.eventoAuditoria.count({ where }),
      prisma.eventoAuditoria.findMany({ where, take: porPagina, skip: (pagina-1)*porPagina, orderBy: [{ createdAt: "desc" },{ id: "desc" }] }),
    ])
    const pessoas = await prisma.usuario.findMany({ where: { id: { in: rows.filter(r => r.atorTipo === "humano").map(r => r.atorId) }, organizacoes: { some: { organizacaoId } } }, select: { id: true, nome: true } })
    const nomes = new Map(pessoas.map(p => [p.id,p.nome]))
    const eventos = rows.map(({ chave: _chave, ...r }) => ({ ...r, antes: r.payloadExpiraEm > new Date() ? r.antes : null, depois: r.payloadExpiraEm > new Date() ? r.depois : null }))
    const registros = eventos.map(e => ({ id: e.id, statusAnterior: null, statusNovo: e.acao,
      observacao: descreverEventoAuditoria(e), referencia: `${e.recurso} ${e.recursoId}`, origem: e.atorTipo === "humano" ? "manual" : "automacao", createdAt: e.createdAt,
      usuario: { id: e.atorId, nome: nomes.get(e.atorId) ?? (e.atorTipo === "tecnico" ? e.atorId : "Pessoa sem vínculo atual") }, demanda: null }))
    return NextResponse.json({ registros, eventos, total, pagina, porPagina, temMais: pagina*porPagina < total }, { headers: { "Cache-Control": "private, no-store" } })
  })
}

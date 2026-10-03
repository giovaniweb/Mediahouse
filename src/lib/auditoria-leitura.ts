import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { comOrg } from "@/lib/org-contexto"

const rotulos: Record<string,string> = {
  "evento.documento": "Documento do evento alterado", "evento.aprovacao": "Aprovação do evento registrada",
  "acesso.negado": "Acesso bloqueado", "permissoes.alteradas": "Permissões alteradas", "usuario.alterado": "Pessoa atualizada", "usuario.removido": "Acesso da pessoa removido",
  "configuracao.alterada": "Configuração alterada", "trello.conexao": "Conexão Trello", "drive.conexao": "Conexão Google Drive", "arquivo.publicacao": "Publicação no portfólio",
  "manutencao.custos": "Custos retroativos", "manutencao.arquivos": "Arquivos retroativos", "manutencao.credenciais": "Proteção de credenciais", "manutencao.retencao": "Limpeza de detalhes vencidos",
  "ia.mutacao": "Registro criado por ferramenta IA", "ia.envio": "Solicitação de envio pela IA",
}
const resultados: Record<string,string> = { intencao: "iniciada", sucesso: "concluída", falha: "falhou", negado: "negada" }

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
      observacao: `${rotulos[e.acao] ?? e.acao} · ${e.acao === "ia.envio" && e.resultado === "sucesso" ? "aceita pelo provedor" : resultados[e.resultado] ?? e.resultado} · ${e.recurso} ${e.recursoId}`, origem: e.atorTipo === "humano" ? "manual" : "automacao", createdAt: e.createdAt,
      usuario: { id: e.atorId, nome: nomes.get(e.atorId) ?? (e.atorTipo === "tecnico" ? e.atorId : "Pessoa sem vínculo atual") }, demanda: null }))
    return NextResponse.json({ registros, eventos, total, pagina, porPagina, temMais: pagina*porPagina < total }, { headers: { "Cache-Control": "private, no-store" } })
  })
}

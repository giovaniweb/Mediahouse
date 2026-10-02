import { createHash, randomUUID } from "node:crypto"
import { Prisma } from "@prisma/client"
import { BASE_FALSE, PRESETS } from "@/lib/permissoes"

export const ACOES_AUDITORIA = ["manutencao.credenciais", "manutencao.retencao", "ia.mutacao", "ia.envio", "acesso.negado", "permissoes.alteradas", "usuario.alterado", "usuario.removido", "configuracao.alterada", "trello.conexao", "drive.conexao", "arquivo.publicacao", "manutencao.custos", "manutencao.arquivos"] as const
export type AcaoAuditoria = typeof ACOES_AUDITORIA[number]
export type AtorAuditoria = { organizacaoId: string; usuarioId: string } | { organizacaoId: string; tecnico: string }
export function correlacaoAuditoria() { return randomUUID() }

const booleanos = new Set([...Object.keys(BASE_FALSE), "publicado", "conectado", "ativo", "liderAudiovisual", "recebeTodosAvisos"])
const motivos = new Set(["autorizacao_invalida", "recusado", "sem_credenciais", "erro_token", "erro_conta", "erro_conexao"])
const contadores = new Set(["processados", "pulados", "erros", "alterados"])
// Somente nomes de campos, jamais valores fiscais/contato/credenciais.
const campos = new Set(["cnpj", "razaoSocial", "nomeFantasia", "endereco", "bairro", "cidade", "estado", "cep", "email", "telefone", "pixKey", "pixTipo", "observacoesNF", "googleDriveFolderId", "nome", "status", "senhaHash", "categoria", "funcaoProfissional", "areas", "papel", "liderAudiovisual", "recebeTodosAvisos", "boardId", "credenciais", "emailsFinanceiro", "label", "ordem", "ativo", "grupo", "valor"])
export function payloadAuditoria(entrada?: Record<string, unknown>): Prisma.InputJsonObject {
  const saida: Record<string, boolean | number | string | string[]> = {}
  for (const [k,v] of Object.entries(entrada ?? {})) {
    if (booleanos.has(k) && typeof v === "boolean") saida[k] = v
    else if (contadores.has(k) && Number.isSafeInteger(v) && (v as number) >= 0 && (v as number) <= 1000000) saida[k] = v as number
    else if (k === "motivo" && typeof v === "string" && motivos.has(v)) saida[k] = v
    else if (k === "papel" && typeof v === "string" && Object.hasOwn(PRESETS,v)) saida[k] = v
    else if (k === "campos" && Array.isArray(v)) saida[k] = [...new Set(v.filter(x => typeof x === "string" && campos.has(x)))].sort()
  }
  return saida
}

/** Recebe o MESMO tx da escrita de negócio. Não faz rede nem aceita texto livre. */
export async function registrarAuditoria(tx: Pick<Prisma.TransactionClient, "eventoAuditoria">, ator: AtorAuditoria, evento: {
  acao: AcaoAuditoria; recurso: string; recursoId: string;
  resultado?: "intencao" | "sucesso" | "falha" | "negado";
  correlationId: string; antes?: Record<string, unknown>; depois?: Record<string, unknown>
}) {
  const atorTipo = "usuarioId" in ator ? "humano" : "tecnico"
  const atorId = "usuarioId" in ator ? ator.usuarioId : ator.tecnico
  const resultado = evento.resultado ?? "sucesso"
  if (!ACOES_AUDITORIA.includes(evento.acao) || !/^[a-z_]+$/.test(evento.recurso) || evento.recurso.length > 40 || !atorId || atorId.length > 128 || !evento.recursoId || evento.recursoId.length > 128 || !/^[a-zA-Z0-9-]{1,64}$/.test(evento.correlationId)) throw new Error("Evento de auditoria inválido")
  const chave = createHash("sha256").update(JSON.stringify([atorTipo,atorId,evento.correlationId,evento.acao,evento.recurso,evento.recursoId,resultado])).digest("hex")
  return tx.eventoAuditoria.createMany({ data: {
    organizacaoId: ator.organizacaoId, atorTipo, atorId, acao: evento.acao, recurso: evento.recurso, recursoId: evento.recursoId,
    resultado, correlationId: evento.correlationId, chave,
    antes: payloadAuditoria(evento.antes), depois: payloadAuditoria(evento.depois),
    payloadExpiraEm: new Date(Date.now() + 90 * 86400000),
  }, skipDuplicates: true })
}

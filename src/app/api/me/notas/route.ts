import { randomUUID } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAcesso } from "@/lib/acesso"
import { comOrg } from "@/lib/org-contexto"
import { whereDoQuadro } from "@/lib/quadro-do-card-server"
import { caminhoMidia, comToken, subirArquivo } from "@/lib/midia"
import { validarArquivoNF } from "@/lib/nota-fiscal-arquivo"
import { PagamentoInvalido, receberNotaFiscal } from "@/lib/pagamentos"
import { momentoDoJob, rotuloDoMomento } from "@/lib/ficha-do-job"
import { estadoDaNotaDoVideomaker, pedeNota } from "@/lib/notas-do-videomaker"
import { emSegundoPlano } from "@/lib/notificar"
import { avisarGravacao, avisarNotaEmLote } from "@/lib/avisos-gravacao"

// "Minhas notas fiscais" do videomaker logado (lib/notas-do-videomaker.ts):
// GET lista as gravações externas dele que esperam a nota e as já enviadas;
// POST recebe UM arquivo para uma ou várias gravações (a nota do mês cobre
// tudo de uma vez). O envio é tudo ou nada: confere todas antes de subir.

const resposta = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } })

async function doVideomaker() {
  const acesso = await requireAcesso()
  if (acesso instanceof NextResponse) return acesso
  const vm = await prisma.videomaker.findFirst({ where: { usuarioId: acesso.usuarioId }, select: { id: true } })
  return { ...acesso, videomakerId: vm?.id ?? null }
}

function gravacoesDele(organizacaoId: string, videomakerId: string, ids?: string[]) {
  return comOrg(organizacaoId, () => prisma.demanda.findMany({
    where: { organizacaoId, videomakerId, ...(ids ? { id: { in: ids } } : {}), AND: [whereDoQuadro("jobs", organizacaoId)] },
    select: {
      id: true, codigo: true, titulo: true, clienteFinalNome: true, statusInterno: true, dataCaptacao: true, dataEvento: true,
      notasFiscais: { where: { videomakerId }, orderBy: { createdAt: "desc" }, select: { status: true, token: true, url: true } },
      custos: { where: { organizacaoId, videomakerId }, select: { statusPagamento: true, pago: true } },
    },
    orderBy: [{ dataCaptacao: "desc" }, { createdAt: "desc" }],
    take: 300,
  }))
}

export async function GET() {
  const eu = await doVideomaker()
  if (eu instanceof NextResponse) return eu
  if (!eu.videomakerId) return resposta({ paraEnviar: [], enviadas: [] })
  const lista = await gravacoesDele(eu.organizacaoId, eu.videomakerId)
  const paraEnviar = [], enviadas = []
  for (const d of lista) {
    const estado = estadoDaNotaDoVideomaker(d, eu.videomakerId)
    if (!estado) continue
    const m = momentoDoJob(d)
    const base = { id: d.id, codigo: d.codigo, cliente: d.clienteFinalNome?.trim() || d.titulo, quando: m ? rotuloDoMomento(m) : null, estado }
    if (pedeNota(estado)) paraEnviar.push(base)
    else {
      // O arquivo abre com a credencial do próprio envio, sem pedir permissão de custos.
      const nf = d.notasFiscais.find((n) => n.url)
      enviadas.push({ ...base, nota: nf ? comToken(nf.url, nf.token) : null })
    }
  }
  return resposta({ paraEnviar, enviadas: enviadas.slice(0, 50) })
}

export async function POST(req: NextRequest) {
  const eu = await doVideomaker()
  if (eu instanceof NextResponse) return eu
  if (!eu.videomakerId) return resposta({ error: "Seu cadastro de videomaker não foi encontrado." }, 404)
  const { organizacaoId, usuarioId, videomakerId } = { ...eu, videomakerId: eu.videomakerId }
  try {
    const form = await req.formData()
    const ids = z.array(z.string().min(1).max(128)).min(1).max(30).safeParse(JSON.parse(String(form.get("demandaIds") ?? "[]")))
    if (!ids.success) return resposta({ error: "Escolha as gravações desta nota." }, 400)
    const demandaIds = [...new Set(ids.data)]
    const file = form.get("arquivo")
    if (!(file instanceof File)) return resposta({ error: "Arquivo obrigatório" }, 400)
    if (file.size === 0 || file.size > 20 * 1024 * 1024) return resposta({ error: "Envie um arquivo de até 20 MB." }, 400)
    const buffer = await file.arrayBuffer()
    const tipo = validarArquivoNF(file.name, file.type, new Uint8Array(buffer))
    if (!tipo) return resposta({ error: "Arquivo inválido. Envie PDF, PNG ou JPG com conteúdo e extensão correspondentes." }, 400)

    // Tudo ou nada: cada gravação tem de ser dele e estar esperando a nota.
    const alvos = await gravacoesDele(organizacaoId, videomakerId, demandaIds)
    if (alvos.length !== demandaIds.length) return resposta({ error: "Alguma gravação escolhida não é sua." }, 404)
    const fora = alvos.find((d) => !pedeNota(estadoDaNotaDoVideomaker(d, videomakerId)))
    if (fora) return resposta({ error: `A gravação ${fora.codigo} não está esperando nota.` }, 409)

    const caminho = caminhoMidia({ organizacaoId, tipo: "nf", id: `lote-${randomUUID()}`, ext: tipo.ext })
    const url = await subirArquivo(caminho, buffer, tipo.mime)
    if (!url) return resposta({ error: "Não foi possível armazenar a nota fiscal." }, 503)
    await comOrg(organizacaoId, () => prisma.$transaction(async (tx) => {
      for (const d of alvos) {
        // O pedido aberto; a nota a refazer ganha um pedido novo, como em /api/me/nf-token.
        const aberta = await tx.notaFiscalUpload.findFirst({ where: { demandaId: d.id, videomakerId, status: "pendente" }, orderBy: { createdAt: "desc" } })
          ?? await tx.notaFiscalUpload.create({ data: { demandaId: d.id, videomakerId } })
        await receberNotaFiscal(tx, { organizacaoId, notaId: aberta.id, url, nomeArquivo: file.name.slice(0, 255), ator: { organizacaoId, usuarioId } })
      }
    }))
    // A operação fica sabendo: um aviso por nota, não por gravação.
    emSegundoPlano(() => demandaIds.length === 1
      ? avisarGravacao(organizacaoId, demandaIds[0], "nota_recebida", usuarioId)
      : avisarNotaEmLote(organizacaoId, demandaIds, usuarioId), "aviso-gravacao")
    return resposta({ mensagem: demandaIds.length === 1 ? "Nota enviada." : `Nota enviada para ${demandaIds.length} gravações.` })
  } catch (e) {
    if (e instanceof PagamentoInvalido) return resposta({ error: e.message }, e.status)
    if (e instanceof SyntaxError || e instanceof TypeError) return resposta({ error: "Formulário inválido" }, 400)
    throw e
  }
}

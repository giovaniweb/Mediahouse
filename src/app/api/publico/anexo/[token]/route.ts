import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { uploadMedia } from "@/lib/storage"
import { lerTokenAnexo } from "@/lib/anexo-token"
import { checarRateLimit, ipDaRequisicao } from "@/lib/rate-limit"
import { erroDeCampo } from "@/lib/erros-api"

// POST /api/publico/anexo/[token] — anexa UM arquivo a uma demanda criada pelo
// formulário público. Quem preenche não tem sessão, então a autorização vem do
// token assinado devolvido na criação (ver src/lib/anexo-token.ts).
//
// É a única porta de upload sem autenticação do sistema. Cada limite abaixo
// existe para que ela não vire vetor de abuso:
//   1. token assinado, de 30 min, válido para uma demanda só
//   2. limite por IP
//   3. teto de tamanho e lista fechada de tipos, conferidos NO SERVIDOR
//   4. máximo de arquivos por demanda
//
// Um arquivo por requisição: o corpo passa pela função serverless, e vários
// arquivos numa chamada só aumentariam a chance de estourar o limite da
// plataforma sem ganho para quem usa.

export const runtime = "nodejs"

const TAMANHO_MAXIMO = 4 * 1024 * 1024 // 4 MB — abaixo do limite de corpo da Vercel
const MAX_ARQUIVOS_POR_DEMANDA = 5

// Só o que serve como referência visual ou documento de briefing. Sem SVG:
// aceita script embutido e o arquivo é servido de um bucket público.
const TIPOS_ACEITOS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const ip = ipDaRequisicao(req.headers)
  const limite = checarRateLimit(`anexo-publico:${ip}`, 20, 10 * 60 * 1000)
  if (!limite.ok) {
    return NextResponse.json(
      { error: "Muitos envios seguidos. Tente novamente em alguns minutos." },
      { status: 429, headers: { "Retry-After": String(limite.retryAfterSegundos) } }
    )
  }

  const { token } = await params
  const demandaId = lerTokenAnexo(token)
  if (!demandaId) {
    return NextResponse.json(
      { error: "Link de envio expirado. Reenvie o formulário para anexar arquivos." },
      { status: 403 }
    )
  }

  const demanda = await prisma.demanda.findUnique({
    where: { id: demandaId },
    select: { id: true, organizacaoId: true, _count: { select: { arquivos: true } } },
  })
  if (!demanda) return NextResponse.json({ error: "Demanda não encontrada" }, { status: 404 })

  if (demanda._count.arquivos >= MAX_ARQUIVOS_POR_DEMANDA) {
    return erroDeCampo("arquivo", `Máximo de ${MAX_ARQUIVOS_POR_DEMANDA} arquivos por solicitação.`)
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return erroDeCampo("arquivo", "Não foi possível ler o arquivo enviado.")
  }

  const arquivo = form.get("arquivo")
  if (!(arquivo instanceof File)) {
    return erroDeCampo("arquivo", "Nenhum arquivo enviado.")
  }

  if (arquivo.size === 0) return erroDeCampo("arquivo", "O arquivo está vazio.")
  if (arquivo.size > TAMANHO_MAXIMO) {
    return erroDeCampo("arquivo", "O arquivo passa de 4 MB. Envie uma versão menor.")
  }

  // O tipo vem do navegador e não é confiável sozinho — mas combinado com o teto
  // de tamanho e com o bucket sendo só de leitura, é a checagem proporcional aqui.
  const extensao = TIPOS_ACEITOS[arquivo.type]
  if (!extensao) {
    return erroDeCampo("arquivo", "Formato não aceito. Envie imagem (JPG, PNG, WEBP, GIF) ou PDF.")
  }

  const buffer = Buffer.from(await arquivo.arrayBuffer())
  const nomeLimpo = (arquivo.name || `referencia.${extensao}`)
    .replace(/[^\w.\-]/g, "_")
    .slice(-80)

  const url = await uploadMedia(buffer, `publico/${demandaId}/${nomeLimpo}`, arquivo.type)
  if (!url) {
    return NextResponse.json({ error: "Falha ao guardar o arquivo. Tente novamente." }, { status: 502 })
  }

  const registro = await prisma.arquivo.create({
    data: {
      demandaId,
      tipoArquivo: "documento",
      url,
      nomeArquivo: nomeLimpo,
    },
    select: { id: true, nomeArquivo: true, url: true },
  })

  return NextResponse.json({ ok: true, arquivo: registro }, { status: 201 })
}

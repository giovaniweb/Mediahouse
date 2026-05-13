import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { criarSessaoUploadDrive } from "@/lib/google-drive"

// POST /api/admin/sync-drive
// Faz upload em lote para o Google Drive de todos os vídeos finais que ainda estão no Supabase.
// Atualiza Arquivo.url com a URL do Drive, MAS MANTÉM linkFinal como URL do Supabase.
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session || session.user.tipo !== "admin") {
    return NextResponse.json({ error: "Apenas admins podem sincronizar" }, { status: 401 })
  }

  // Buscar demandas finalizadas/para_postar com linkFinal no Supabase
  const demandas = await prisma.demanda.findMany({
    where: {
      statusVisivel: { in: ["finalizado", "para_postar"] },
      linkFinal: { contains: "supabase" },
    },
    include: {
      arquivos: {
        where: { tipoArquivo: "final" },
        orderBy: { sequencia: "asc" },
      },
      produtos: {
        select: { produto: { select: { nome: true } } },
        take: 1,
      },
    },
  })

  const sanitize = (s: string) => s.replace(/[/\\:*?"<>|]/g, "").trim().replace(/\s+/g, "_")

  let processados = 0
  let erros = 0
  const detalhes: { codigo: string; status: "ok" | "erro"; detalhe: string }[] = []

  for (const dem of demandas) {
    // Se não há Arquivo, usa o linkFinal diretamente
    const arquivos = dem.arquivos.length > 0
      ? dem.arquivos
      : [{ id: null, url: dem.linkFinal!, sequencia: 1, thumbnailUrl: null }]

    for (const arq of arquivos) {
      const urlVideo = arq.url
      if (!urlVideo || !urlVideo.includes("supabase")) continue

      try {
        const seq = arq.sequencia ?? 1
        const seqStr = String(seq).padStart(3, "0")

        // Construir nome: [produto]_[titulo]_[codigo]_001.ext
        const parts: string[] = []
        const prod = dem.produtos?.[0]?.produto?.nome
        if (prod) parts.push(sanitize(prod).substring(0, 30))
        parts.push(sanitize(dem.titulo).substring(0, 40))
        parts.push(dem.codigo)
        const ext = urlVideo.split(".").pop()?.split("?")[0] ?? "mp4"
        const fileName = `${parts.join("_")}_${seqStr}.${ext}`

        // Stream: buscar do Supabase
        const supaRes = await fetch(urlVideo)
        if (!supaRes.ok || !supaRes.body) {
          erros++
          detalhes.push({ codigo: dem.codigo, status: "erro", detalhe: `Supabase retornou ${supaRes.status}` })
          continue
        }

        const fileSize = parseInt(supaRes.headers.get("Content-Length") ?? "0")
        if (fileSize <= 0) {
          erros++
          detalhes.push({ codigo: dem.codigo, status: "erro", detalhe: "Content-Length ausente — impossível fazer upload Drive" })
          continue
        }

        const contentType = supaRes.headers.get("Content-Type") ?? "video/mp4"

        // Upload para Drive
        const { sessionUri, publicUrl } = await criarSessaoUploadDrive({ fileName, fileSize, contentType })

        const driveRes = await fetch(sessionUri, {
          method: "PUT",
          headers: {
            "Content-Type":   contentType,
            "Content-Length": String(fileSize),
            "Content-Range":  `bytes 0-${fileSize - 1}/${fileSize}`,
          },
          body: supaRes.body,
          // @ts-ignore
          duplex: "half",
        })

        if (driveRes.status === 200 || driveRes.status === 201) {
          // Atualiza Arquivo.url → Drive URL (para download)
          // NÃO atualiza linkFinal (mantém Supabase para galeria)
          if (arq.id) {
            await prisma.arquivo.update({ where: { id: arq.id }, data: { url: publicUrl } })
          }
          processados++
          detalhes.push({ codigo: dem.codigo, status: "ok", detalhe: `Drive: ${publicUrl}` })
        } else {
          const errText = await driveRes.text().catch(() => "")
          erros++
          detalhes.push({ codigo: dem.codigo, status: "erro", detalhe: `Drive HTTP ${driveRes.status}: ${errText.slice(0, 100)}` })
        }
      } catch (e) {
        erros++
        detalhes.push({
          codigo: dem.codigo,
          status: "erro",
          detalhe: e instanceof Error ? e.message : String(e),
        })
      }
    }
  }

  return NextResponse.json({
    ok: true,
    total: demandas.length,
    processados,
    erros,
    detalhes,
  })
}

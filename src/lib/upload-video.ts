// Envio de um vídeo (final ou brutos) de uma demanda, direto do navegador para
// o armazenamento.
//
// Era o `uploadPresigned` de dentro do DemandaDetalhe. Virou helper em
// 04/11/2026, quando a gravação externa passou a subir o vídeo final no próprio
// card (pedido do Giovani): as duas telas usam o MESMO envio, sem uma cópia
// para cada uma.
//
// Os passos, na ordem:
//   1. vídeo final: confere pelos bytes se ele abre no navegador de quem recebe;
//   2. confere o tamanho que a tela aceita;
//   3. pede a URL assinada (`upload-url`);
//   4. sobe direto para o Supabase, sem passar pela Vercel (limite de 4,5 MB),
//      contando o progresso;
//   5. vídeo final: captura a capa no navegador e sobe junto (falha é silenciosa);
//   6. registra na demanda (`upload-video`): grava o linkFinal/linkBrutos, cria o
//      Arquivo e põe na fila de conversão. Ali o servidor confere de novo o
//      tamanho e o tipo do que chegou (lib/midia-limite).
import { analisarVideoDoUpload } from "./video-compat"

/**
 * O que a tela aceita, em MB. O teto de verdade é do servidor
 * (LIMITE_ARQUIVO_GRANDE_MB, lib/midia-limite) e do bucket; este aviso existe
 * para não subir um arquivo inteiro que vai ser recusado no fim.
 */
export const LIMITE_VIDEO_NA_TELA_MB = 490

export type OpcoesDoEnvio = {
  /** Tipo quando o navegador não diz (o .mkv sai vazio). */
  contentTypeFallback?: string
  /** 0 a 100, enquanto os bytes sobem. */
  onProgress?: (pct: number) => void
  /** Capa capturada do vídeo final (Demandas do audiovisual e gravações). */
  comThumbnail?: boolean
  /** O nome que aparece para quem baixa. Sem ele, o arquivo fica com o nome do caminho. */
  nomeArquivo?: string
  /** Pergunta do vídeo que pode não abrir. Troca-se no teste. */
  confirmar?: (mensagem: string) => boolean
}

/** Sobe e registra. Devolve a URL do NuFlow do arquivo; lança com a frase para a tela. */
export async function enviarVideo(
  demandaId: string,
  file: File,
  tipo: "final" | "brutos",
  opcoes: OpcoesDoEnvio = {},
): Promise<string> {
  const contentType = file.type || opcoes.contentTypeFallback || "video/mp4"

  // Não adianta testar o player daqui: quem envia costuma estar no Mac, onde
  // o Safari toca HEVC sem reclamar — o videomaker vê o vídeo perfeito e sobe
  // tranquilo, e o cliente abre no Chrome e vê preto. Por isso a checagem
  // olha os bytes do arquivo, não o navegador.
  if (tipo === "final") {
    const compat = await analisarVideoDoUpload(file)
    if (!compat.compativel) {
      const confirmar = opcoes.confirmar ?? ((m: string) => window.confirm(m))
      if (!confirmar(`${compat.motivo}\n\n${compat.comoResolver}\n\nEnviar mesmo assim?`)) {
        throw new Error("Envio cancelado — exporte em H.264 / MP4 e tente de novo.")
      }
    }
  }

  if (file.size > LIMITE_VIDEO_NA_TELA_MB * 1024 * 1024) {
    const mb = (file.size / (1024 * 1024)).toFixed(0)
    throw new Error(`Arquivo muito grande (${mb} MB). Limite máximo: ${LIMITE_VIDEO_NA_TELA_MB} MB.`)
  }

  const { uploadUrl, publicUrl } = await pedirUrl(demandaId, tipo, contentType)
  await subir(uploadUrl, file, contentType, opcoes.onProgress)

  let thumbnailUrl: string | undefined
  if (opcoes.comThumbnail && tipo === "final" && file.type.startsWith("video/")) {
    try {
      const capa = await capturarCapa(file)
      if (capa) {
        const destino = await pedirUrl(demandaId, "thumbnail", "image/jpeg")
        await subir(destino.uploadUrl, capa, "image/jpeg")
        thumbnailUrl = destino.publicUrl
      }
    } catch { /* falha silenciosa — a capa não é crítica */ }
  }

  const salvo = await fetch(`/api/demandas/${demandaId}/upload-video`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: publicUrl, tipo,
      ...(thumbnailUrl ? { thumbnailUrl } : {}),
      ...(opcoes.nomeArquivo ? { nomeArquivo: opcoes.nomeArquivo } : {}),
    }),
  })
  if (!salvo.ok) {
    // A conferência do servidor (tamanho, tipo) tem frase própria; o resto é genérico.
    const corpo = await salvo.json().catch(() => ({})) as { error?: string }
    throw new Error(salvo.status === 422 && corpo.error ? corpo.error : "Não foi possível registrar o arquivo. Tente novamente.")
  }
  return publicUrl
}

async function pedirUrl(demandaId: string, tipo: string, contentType: string) {
  const res = await fetch(`/api/demandas/${demandaId}/upload-url?tipo=${tipo}&contentType=${encodeURIComponent(contentType)}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Erro ao gerar URL de upload" })) as { error?: string }
    throw new Error(err.error ?? "Erro ao gerar URL de upload")
  }
  return await res.json() as { uploadUrl: string; publicUrl: string }
}

/** PUT direto no Storage. XMLHttpRequest porque o fetch não conta o progresso da subida. */
function subir(url: string, corpo: Blob, contentType: string, onProgress?: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
      }
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve()
      // A mensagem legível do Supabase vem num JSON; sem ele, o texto ou o código.
      const texto = xhr.responseText ?? ""
      let msg = `HTTP ${xhr.status}`
      if (texto) {
        try { msg = (JSON.parse(texto) as { message?: string }).message ?? texto } catch { msg = texto }
      }
      reject(new Error(`Falha no upload: ${msg}`))
    }
    xhr.onerror = () => reject(new Error("Falha no upload: sem conexão. Tente de novo."))
    xhr.open("PUT", url)
    xhr.setRequestHeader("Content-Type", contentType)
    xhr.send(corpo)
  })
}

/** A capa: um quadro do começo do vídeo, em JPEG, desenhado no navegador. */
function capturarCapa(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video")
    video.preload = "metadata"
    video.muted = true
    video.playsInline = true
    const objectUrl = URL.createObjectURL(file)
    video.src = objectUrl
    const cleanup = () => URL.revokeObjectURL(objectUrl)

    video.addEventListener("loadedmetadata", () => {
      video.currentTime = Math.min(1, (video.duration || 2) * 0.1)
    }, { once: true })

    video.addEventListener("seeked", () => {
      cleanup()
      try {
        const w = Math.min(video.videoWidth || 640, 800)
        const h = Math.round(w * (video.videoHeight || 360) / (video.videoWidth || 640))
        const canvas = document.createElement("canvas")
        canvas.width = w; canvas.height = h
        canvas.getContext("2d")?.drawImage(video, 0, 0, w, h)
        canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.8)
      } catch { resolve(null) }
    }, { once: true })

    video.addEventListener("error", () => { cleanup(); resolve(null) }, { once: true })
  })
}

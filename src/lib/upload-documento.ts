// Anexo de documentos (PDF, Word, Excel, PowerPoint…) numa demanda.
//
// O fluxo tem três passos e é o mesmo em qualquer tela: pedir a URL presigned,
// subir direto para o Supabase e registrar o Arquivo no banco. Ficava só dentro
// do DemandaDetalhe; virou helper quando o modal de criação passou a anexar
// também — a demanda precisa existir antes, então lá o envio acontece depois
// de criada.

/** Extensões que o formulário oferece, alinhadas ao EXT_MAPA da rota de upload. */
export const ACCEPT_DOCUMENTOS =
  ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.png,.jpg,.jpeg,.webp"

/** 25 MB — anexo é referência de briefing, não entrega de material bruto. */
export const TAMANHO_MAXIMO_DOC = 25 * 1024 * 1024

export function documentoMuitoGrande(file: File) {
  return file.size > TAMANHO_MAXIMO_DOC
}

/**
 * Sobe um documento e registra o Arquivo. Lança em caso de falha para o chamador
 * decidir como avisar (toast na tela de detalhe, resumo no modal de criação).
 */
export async function enviarDocumento(
  demandaId: string,
  file: File,
  onProgress?: (pct: number) => void
): Promise<void> {
  const contentType = file.type || "application/octet-stream"

  const urlRes = await fetch(
    `/api/demandas/${demandaId}/upload-url?tipo=documento&contentType=${encodeURIComponent(contentType)}`
  )
  const urlJson = (await urlRes.json().catch(() => ({ error: "Erro ao gerar URL" }))) as {
    uploadUrl?: string
    publicUrl?: string
    error?: string
  }
  if (!urlRes.ok || !urlJson.uploadUrl) throw new Error(urlJson.error ?? "Erro ao gerar URL de upload")

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`HTTP ${xhr.status}`))
    xhr.onerror = () => reject(new Error("Falha na conexão"))
    xhr.open("PUT", urlJson.uploadUrl!)
    xhr.setRequestHeader("Content-Type", contentType)
    xhr.send(file)
  })

  const saveRes = await fetch(`/api/demandas/${demandaId}/upload-video`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: urlJson.publicUrl, tipo: "documento", nomeArquivo: file.name }),
  })
  if (!saveRes.ok) throw new Error("Erro ao salvar documento")
}

/**
 * Sobe os anexos que o formulário de criação segurou na memória. Roda DEPOIS do
 * POST, porque o upload é por demandaId e a demanda precisa existir.
 *
 * Falha de anexo não desfaz a demanda: devolve a lista dos que não subiram para
 * o chamador avisar, já que o arquivo pode ser reenviado na tela de detalhe.
 */
export async function enviarAnexos(demandaId: string, anexos: File[]): Promise<string[]> {
  const falhas: string[] = []
  for (const file of anexos) {
    try {
      await enviarDocumento(demandaId, file)
    } catch {
      falhas.push(file.name)
    }
  }
  return falhas
}

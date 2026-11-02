// Limite de tamanho e tipo dos arquivos, conferido no SERVIDOR (Onda 1, 07/10/2026).
//
// O navegador sobe direto para o Storage (URL assinada), e o limite de 25 MB do
// anexo e de 490 MB do vídeo era conferido só na tela: quem chamasse a URL de
// upload por fora subia o que quisesse. Agora, na hora de REGISTRAR o arquivo,
// o servidor lê o tamanho e os primeiros bytes do que chegou. Passou do limite
// ou não é o que diz ser: o objeto é apagado e o registro, recusado.
//
// O teto de verdade, que impede o arquivo grande de nem subir, é o limite do
// bucket no Supabase (configuração, fora do código). Este é o segundo cadeado.
// O teto dos arquivos grandes ainda está em aberto (ver limiteArquivoGrandeBytes).
import { amostraDaMidia, caminhoDaUrl, partesDaMidia, removerMidia, type TipoMidia } from "@/lib/midia"

const MB = 1024 * 1024

const IMAGENS = ["image/jpeg", "image/png", "image/webp"]
const VIDEOS = ["video/mp4", "video/quicktime", "video/x-msvideo", "video/webm", "video/x-matroska"]
const ZIP = ["application/zip", "application/x-zip-compressed"]
const DOCUMENTOS = [
  "application/pdf",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain", "text/csv",
]

/**
 * Teto dos arquivos grandes (vídeo final e brutos, cobertura, depoimento, kit),
 * em MB. Ainda é decisão do Giovani: a Onda 1 propôs 500 MB, o formulário de
 * vídeo avisa em 490 MB e o armazenamento novo aceita até 5 GB. Enquanto ele não
 * escolhe, o padrão é o do armazenamento (5120 MB), para nada que funciona hoje
 * passar a ser recusado. Escolhido, vira LIMITE_ARQUIVO_GRANDE_MB na Vercel.
 */
export function limiteArquivoGrandeBytes(valor = process.env.LIMITE_ARQUIVO_GRANDE_MB): number {
  const mbs = Number(valor)
  return (Number.isFinite(mbs) && mbs >= 25 && mbs <= 51200 ? Math.floor(mbs) : 5120) * MB
}

/**
 * O que cada pasta do bucket aceita. Tipo conhecido tem que bater com os bytes.
 * `outros` é a pasta do arquivo final e dos brutos: o Growth entrega PSD, AI,
 * Figma, SVG e GIF, que não têm lista fechada. Ali o tipo desconhecido passa,
 * menos programa executável.
 */
export function limitesMidia(): Partial<Record<TipoMidia, { bytes: number; tipos: string[]; outros?: boolean }>> {
  const grande = limiteArquivoGrandeBytes()
  return {
    docs: { bytes: 25 * MB, tipos: [...DOCUMENTOS, ...IMAGENS] },
    thumbnails: { bytes: 10 * MB, tipos: IMAGENS },
    videos: { bytes: grande, tipos: [...VIDEOS, ...ZIP, ...IMAGENS, "application/pdf"], outros: true },
    coberturas: { bytes: grande, tipos: [...VIDEOS, ...IMAGENS] },
    depoimentos: { bytes: grande, tipos: [...VIDEOS, ...IMAGENS] },
    // Kit do videomaker: guia em PDF, vídeo de referência e imagem (os tipos da rota de upload).
    kit: { bytes: grande, tipos: ["application/pdf", "video/mp4", "video/quicktime", "image/jpeg", "image/png"] },
  }
}

/** Programa executável (Windows, Linux, Mac) ou script: nunca entra. */
export function ehExecutavel(b: Uint8Array): boolean {
  return texto(b, "MZ") || comeca(b, [0x7f, 0x45, 0x4c, 0x46]) || texto(b, "#!") ||
    [[0xfe, 0xed, 0xfa, 0xce], [0xfe, 0xed, 0xfa, 0xcf], [0xce, 0xfa, 0xed, 0xfe], [0xcf, 0xfa, 0xed, 0xfe], [0xca, 0xfe, 0xba, 0xbe]].some(m => comeca(b, m))
}

const comeca = (b: Uint8Array, assinatura: number[], desde = 0) => assinatura.every((x, i) => b[desde + i] === x)
const texto = (b: Uint8Array, s: string, desde = 0) => comeca(b, [...s].map(c => c.charCodeAt(0)), desde)

const ehZip = (b: Uint8Array) => comeca(b, [0x50, 0x4b, 0x03, 0x04])
const ehVideo = (b: Uint8Array) =>
  ["ftyp", "moov", "mdat", "wide", "free", "skip"].some(c => texto(b, c, 4)) || // mp4 e mov
  comeca(b, [0x1a, 0x45, 0xdf, 0xa3]) || // webm e mkv
  (texto(b, "RIFF") && texto(b, "AVI ", 8))

/** Os primeiros bytes batem com o tipo declarado? Barra o executável renomeado para .pdf. */
export function assinaturaConfere(tipo: string, b: Uint8Array): boolean {
  switch (tipo) {
    case "application/pdf": return texto(b, "%PDF")
    case "image/png": return comeca(b, [0x89, 0x50, 0x4e, 0x47])
    case "image/jpeg": return comeca(b, [0xff, 0xd8, 0xff])
    case "image/webp": return texto(b, "RIFF") && texto(b, "WEBP", 8)
    // Vídeo e pacote de brutos: o navegador nem sempre sabe o tipo (.mkv sai
    // vazio e a tela manda "video/mp4"), então vale qualquer vídeo ou ZIP de verdade.
    case "video/x-msvideo": case "video/webm": case "video/x-matroska": case "video/mp4": case "video/quicktime":
    case "application/zip": case "application/x-zip-compressed":
      return ehVideo(b) || ehZip(b)
    // docx, xlsx e pptx são ZIP por dentro.
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
    case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      return comeca(b, [0x50, 0x4b, 0x03, 0x04])
    // doc, xls e ppt antigos: contêiner OLE.
    case "application/msword": case "application/vnd.ms-powerpoint":
      return comeca(b, [0xd0, 0xcf, 0x11, 0xe0])
    // O Windows declara CSV como planilha do Excel: aceita os dois conteúdos.
    case "application/vnd.ms-excel":
      return comeca(b, [0xd0, 0xcf, 0x11, 0xe0]) || !b.includes(0)
    // Texto não tem assinatura; basta não ter byte nulo no começo.
    case "text/plain": case "text/csv": return !b.includes(0)
    default: return false
  }
}

export type ConferenciaUpload = { ok: true; tamanho: number; tipo: string } | { ok: false; erro: string; status: number }

function tamanhoLegivel(bytes: number) {
  return bytes >= 1024 * MB ? `${(bytes / (1024 * MB)).toFixed(1).replace(".", ",").replace(",0", "")} GB` : `${Math.round(bytes / MB)} MB`
}

/**
 * Confere o objeto que uma URL nossa de mídia aponta. URL de fora do bucket
 * privado (link externo, acervo antigo) não é upload nosso: passa sem conferir.
 * Recusa apaga o objeto.
 */
export async function conferirUpload(url: string): Promise<ConferenciaUpload | null> {
  const caminho = caminhoDaUrl(url)
  if (!caminho) return null
  // Acervo legado (org/{org}/legado/...) não recebe upload novo: não confere.
  if (caminho.split("/")[2] === "legado") return null
  const pasta = partesDaMidia(caminho)?.tipo
  const regra = pasta ? limitesMidia()[pasta] : undefined
  if (!regra) return null
  const amostra = await amostraDaMidia(caminho)
  if (!amostra) return { ok: false, erro: "O arquivo não chegou ao armazenamento. Envie de novo.", status: 422 }
  const tipo = (amostra.tipo ?? "").split(";")[0].trim().toLowerCase()
  let erro: string | null = null
  if (amostra.tamanho > regra.bytes) erro = `Arquivo grande demais (${tamanhoLegivel(amostra.tamanho)}). O limite é ${tamanhoLegivel(regra.bytes)}.`
  else if (ehExecutavel(amostra.inicio)) erro = "Programa executável não é aceito."
  else if (regra.tipos.includes(tipo) ? !assinaturaConfere(tipo, amostra.inicio) : !regra.outros) erro = "Tipo de arquivo não aceito aqui, ou o arquivo não é o que o nome diz."
  if (erro) {
    await removerMidia(caminho)
    return { ok: false, erro, status: 422 }
  }
  return { ok: true, tamanho: amostra.tamanho, tipo }
}

/** Confere várias URLs; a primeira recusada vira a resposta. null = tudo certo. */
export async function recusarUploads(urls: (string | null | undefined)[]): Promise<{ erro: string; status: number } | null> {
  for (const url of urls) {
    if (!url || typeof url !== "string") continue
    const c = await conferirUpload(url)
    if (c && !c.ok) return { erro: c.erro, status: c.status }
  }
  return null
}

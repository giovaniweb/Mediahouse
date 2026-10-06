// Nome de arquivo para mostrar na tela.
//
// Quem anexa pelo detalhe manda o nome original, mas parte dos registros guarda
// o pedaço final do endereço no armazenamento — um código ("243f1e79-….jpg") ou
// a hora do envio em milissegundos ("1759690000000.pdf"). O nome original não
// existe no banco para esses; mostrar o código não ajuda ninguém a achar o
// arquivo, então eles viram "Imagem 1", "PDF 2"…

const CODIGO_GERADO = /^(?:[0-9a-f]{8}(?:-?[0-9a-f]{4}){3}-?[0-9a-f]{12}|[0-9a-f]{24,}|\d{10,})$/i

const TIPO_POR_EXTENSAO: Record<string, string> = {
  jpg: "Imagem", jpeg: "Imagem", png: "Imagem", webp: "Imagem", gif: "Imagem", svg: "Imagem", heic: "Imagem",
  pdf: "PDF",
  doc: "Documento", docx: "Documento", txt: "Texto",
  xls: "Planilha", xlsx: "Planilha", csv: "Planilha",
  ppt: "Apresentação", pptx: "Apresentação",
  mp4: "Vídeo", mov: "Vídeo", webm: "Vídeo", avi: "Vídeo",
  zip: "Pacote",
}

export function extensaoDe(nome: string): string {
  const ponto = nome.lastIndexOf(".")
  return ponto > 0 ? nome.slice(ponto + 1).toLowerCase() : ""
}

export function ehImagem(nome: string): boolean {
  return TIPO_POR_EXTENSAO[extensaoDe(nome)] === "Imagem" && extensaoDe(nome) !== "heic"
}

/** `ordem` começa em 1 e numera os arquivos sem nome dentro da mesma lista. */
export function nomeParaMostrar(nome: string, ordem: number): string {
  const ext = extensaoDe(nome)
  const base = ext ? nome.slice(0, -(ext.length + 1)) : nome
  if (base && !CODIGO_GERADO.test(base)) return nome
  return `${TIPO_POR_EXTENSAO[ext] ?? "Arquivo"} ${ordem}`
}

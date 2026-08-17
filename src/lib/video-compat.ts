// O vídeo vai abrir no navegador de quem aprova?
//
// Esta pergunta não pode ser respondida testando o navegador de quem envia. O
// videomaker está no Mac, onde o Safari toca HEVC sem reclamar — ele vê o vídeo
// perfeito e sobe tranquilo. O cliente abre no Chrome e vê preto. Foi assim que
// 20 arquivos chegaram ao cliente sem tocar, alguns parados desde abril.
//
// Então olhamos o ARQUIVO, não o player: MP4/MOV são feitos de "boxes", e o
// codec de vídeo aparece como um marcador de 4 letras — `hvc1`/`hev1` para
// HEVC (H.265), `avc1` para H.264. Basta procurar esses marcadores nos bytes.

export type CompatibilidadeVideo =
  | { compativel: true }
  | { compativel: false; motivo: string; comoResolver: string }

/** Procura uma marca de 4 letras ASCII dentro de um buffer. */
function contemMarca(bytes: Uint8Array, marca: string): boolean {
  const alvo = [...marca].map((ch) => ch.charCodeAt(0))
  for (let i = 0; i + alvo.length <= bytes.length; i++) {
    let bate = true
    for (let j = 0; j < alvo.length; j++) {
      if (bytes[i + j] !== alvo[j]) { bate = false; break }
    }
    if (bate) return true
  }
  return false
}

/**
 * Decide pela amostra de bytes de um arquivo de vídeo.
 *
 * `avc1` (H.264) ganha de `hvc1`: arquivos com as duas faixas costumam ter o
 * H.264 como trilha principal, e recusar aí seria alarme falso.
 *
 * Na dúvida devolve compatível — este aviso existe para evitar retrabalho, não
 * para impedir alguém de trabalhar.
 */
export function analisarBytesDeVideo(bytes: Uint8Array, nomeArquivo: string): CompatibilidadeVideo {
  const nome = nomeArquivo.toLowerCase()
  const temHevc = contemMarca(bytes, "hvc1") || contemMarca(bytes, "hev1")
  const temH264 = contemMarca(bytes, "avc1")

  if (temHevc && !temH264) {
    return {
      compativel: false,
      motivo: "Este vídeo está em HEVC (H.265), o formato padrão do iPhone.",
      comoResolver: "O Chrome não reproduz esse formato — o cliente veria uma tela preta. Exporte em H.264 / MP4 e envie de novo.",
    }
  }

  // Sem marca de codec na amostra: em vídeo de câmera o índice costuma ficar no
  // fim do arquivo. A extensão .mov então é o melhor palpite que resta, e é
  // justamente a do iPhone.
  if (!temHevc && !temH264 && (nome.endsWith(".mov") || nome.endsWith(".qt"))) {
    return {
      compativel: false,
      motivo: "Arquivos .mov costumam vir em HEVC, o formato padrão do iPhone.",
      comoResolver: "Se este for o caso, o Chrome não reproduz e o cliente veria tela preta. Exportar em H.264 / MP4 evita o problema.",
    }
  }

  return { compativel: true }
}

/** Quantos bytes bastam: o cabeçalho com os marcadores vive no começo. */
export const AMOSTRA_BYTES = 256 * 1024

/**
 * Lê o começo do arquivo e diz se ele vai abrir no navegador de quem aprova.
 *
 * Falha de leitura devolve compatível: um aviso que trava o upload por engano
 * custa mais caro que o retrabalho que ele evita.
 */
export async function analisarVideoDoUpload(file: File): Promise<CompatibilidadeVideo> {
  try {
    const buffer = await file.slice(0, AMOSTRA_BYTES).arrayBuffer()
    return analisarBytesDeVideo(new Uint8Array(buffer), file.name)
  } catch {
    return { compativel: true }
  }
}

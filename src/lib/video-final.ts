import { registrarArquivoDemanda } from "@/lib/arquivo-registro"

/**
 * Registra uma nova versão do vídeo final de uma demanda e devolve o id do
 * Arquivo. Existe para o Cutflow registrar a entrega do mesmo jeito que a tela.
 *
 * Na integração com a branch de melhorias (02/10/2026) o corpo antigo — contar
 * versões, criar Arquivo e só depois atualizar o link — deu lugar a
 * `registrarArquivoDemanda`, que faz tudo numa transação: confere a empresa,
 * trava a demanda, não duplica a mesma URL e grava `linkFinal` junto. A
 * conversão saiu daqui porque o Cutflow só entrega link do Drive, e referência
 * externa não é baixada pelo conversor.
 *
 * `nomeArquivo` é opcional: link do Drive termina em "/view", que não é nome
 * de arquivo.
 */
export async function criarArquivoFinal(
  organizacaoId: string,
  id: string,
  url: string,
  thumbnailUrl?: string,
  nomeArquivoInformado?: string
): Promise<string> {
  const nomeArquivo = nomeArquivoInformado ?? url.split("/").pop()?.split("?")[0] ?? "video.mp4"
  const { arquivo } = await registrarArquivoDemanda({ organizacaoId, demandaId: id, tipo: "final", url, nomeArquivo, thumbnailUrl })
  return arquivo.id
}

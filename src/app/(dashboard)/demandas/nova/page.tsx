import { redirect } from "next/navigation"

// Esta rota já foi um formulário completo de ~930 linhas, irmão do modal de
// Nova Demanda — e os dois divergiram: o modal ganhou formato 9:16/16:9,
// multi-produto, videomaker de gravação, anexos e rascunho, enquanto a página
// ficou no produto único e ainda perdia silenciosamente o que era digitado em
// "Observações" (o campo nunca entrou no POST). Dois formulários para a mesma
// coisa é defeito, então sobrou um só.
//
// A URL continua de pé porque estava em links e favoritos: ela agora leva ao
// quadro com o modal aberto, carregando a pessoa que veio no link.
export default async function NovaDemandaRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams

  const primeiro = (valor: string | string[] | undefined) =>
    Array.isArray(valor) ? valor[0] : valor

  // Os links antigos mandavam o id cru (`?editorId=abc`). O modal trabalha com
  // os tokens de /api/equipe-disponivel (`ed:abc` / `vm:abc`), então um id sem
  // prefixo é convertido aqui — sem isso o POST leria "abc" como videomaker,
  // que é o fallback legado do parseToken, e atribuiria a pessoa errada.
  const comPrefixo = (valor: string | undefined, prefixo: "ed" | "vm") =>
    !valor ? undefined : valor.includes(":") ? valor : `${prefixo}:${valor}`

  const destino = new URLSearchParams({ nova: "1" })
  const editorId = comPrefixo(primeiro(params.editorId), "ed")
  const videomakerId = comPrefixo(primeiro(params.videomakerId), "vm")
  if (editorId) destino.set("editorId", editorId)
  if (videomakerId) destino.set("videomakerId", videomakerId)

  redirect(`/demandas?${destino}`)
}

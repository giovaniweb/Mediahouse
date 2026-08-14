// Fetcher único do SWR.
//
// O padrão anterior, repetido em 51 arquivos, era:
//   const fetcher = (url) => fetch(url).then((r) => r.json())
//
// Nenhum deles checava `res.ok`. Consequências reais:
//
// 1. Sessão expirada: o middleware respondia 307 para /login, o fetch seguia o
//    redirect e recebia HTML. O `r.json()` estourava, o SWR entrava em erro e a
//    tela ficava vazia — sem nunca dizer "sua sessão caiu". (O middleware agora
//    devolve 401 JSON para /api/*; este fetcher trata esse caso.)
// 2. Módulo congelado devolvia `{error:"Módulo desativado"}` com status 403, e o
//    componente recebia esse objeto como se fossem dados válidos.
// 3. Erro 500 virava `data` com forma inesperada, e telas que fazem
//    `if (!data) return <spinner/>` ficavam girando para sempre.
import { erroDaResposta } from "@/lib/erro-cliente"

// Sem genérico próprio, e devolvendo `any`, de propósito: é exatamente o que o
// fetcher antigo produzia (`r.json()` é `Promise<any>`). Quem chama
// `useSWR<Tipo>(url, fetcher)` continua tipado pelo genérico do próprio SWR;
// as ~40 chamadas sem tipo explícito continuam funcionando como antes. Tipar
// cada tela é trabalho legítimo, mas separado — aqui o objetivo é só passar a
// checar `res.ok`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetcher(url: string): Promise<any> {
  const res = await fetch(url)

  if (!res.ok) {
    const erro = await erroDaResposta(res, "Não foi possível carregar os dados.")

    // Sessão expirada: manda para o login preservando para onde a pessoa queria
    // ir. Sem isto o usuário fica numa tela vazia sem entender o motivo.
    if (res.status === 401 && typeof window !== "undefined") {
      const destino = window.location.pathname + window.location.search
      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = `/login?callbackUrl=${encodeURIComponent(destino)}`
      }
    }

    throw erro
  }

  return res.json()
}

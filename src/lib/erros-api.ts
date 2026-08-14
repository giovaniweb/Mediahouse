// Contrato único de erro das rotas de API.
//
// O problema que isto resolve: cada rota respondia de um jeito. Umas devolviam
// { error: "texto" }, outras { error: parsed.error.flatten() } — um OBJETO. O
// cliente que fazia `new Error(json.error)` exibia "[object Object]", e o que
// fazia JSON.stringify despejava o blob do zod (em inglês) na cara do usuário.
//
// Agora toda resposta de erro tem a MESMA forma:
//
//   { error: string, campos?: { [campo]: string } }
//
// `error` é sempre uma frase pronta para exibir. `campos` diz QUAL campo causou,
// para o formulário marcar o input certo em vez de só piscar um toast.
import { NextResponse } from "next/server"
import type { ZodError } from "zod"

export type CamposComErro = Record<string, string>

export type CorpoErro = {
  error: string
  campos?: CamposComErro
}

/**
 * Erro de validação com atribuição por campo.
 * A mensagem geral, quando omitida, é a do primeiro campo — assim o toast
 * também diz algo útil, e não um "erro ao salvar" genérico.
 */
export function erroDeValidacao(campos: CamposComErro, mensagemGeral?: string): NextResponse<CorpoErro> {
  const primeira = Object.values(campos)[0]
  return NextResponse.json(
    { error: mensagemGeral ?? primeira ?? "Dados inválidos.", campos },
    { status: 400 }
  )
}

/** Erro de um único campo — atalho para o caso mais comum. */
export function erroDeCampo(campo: string, mensagem: string): NextResponse<CorpoErro> {
  return erroDeValidacao({ [campo]: mensagem })
}

/**
 * Converte um ZodError no contrato acima.
 *
 * Sem isto o cliente recebia o `flatten()` cru: estrutura aninhada, chaves em
 * inglês e as mensagens padrão do zod ("String must contain at least 3
 * character(s)") — texto de biblioteca, não de produto.
 */
export function erroDeZod(erro: ZodError, mensagemGeral?: string): NextResponse<CorpoErro> {
  const campos: CamposComErro = {}
  for (const issue of erro.issues) {
    const campo = issue.path.map(String).join(".") || "_"
    // Primeira mensagem por campo: a segunda raramente acrescenta e polui a tela.
    if (!campos[campo]) campos[campo] = issue.message
  }
  return erroDeValidacao(campos, mensagemGeral)
}

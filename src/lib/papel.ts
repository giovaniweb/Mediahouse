// Papel do usuário DENTRO da organização ativa.
//
// Por que isto existe: `Usuario.tipo` é uma coluna global — vale para todas as
// empresas de que a pessoa participa. Como dezenas de rotas usavam esse campo
// como autoridade, promover alguém a admin numa empresa o tornava admin em
// todas as outras em que fosse membro. `UsuarioOrganizacao.papel` é por empresa
// e é a fonte correta.
//
// `tipo` continua no schema: ainda serve como perfil profissional padrão e é
// exibido em várias telas. O que ele deixa de ser é autoridade.
import { NextResponse } from "next/server"
import type { Session } from "next-auth"

type ComPapel = { papel?: string | null }

// Papel efetivo na organização ativa. Desde 30/10/2026 a sessão o relê do vínculo
// da empresa ativa a cada `auth()` (comPapelDaEmpresaAtiva, em lib/org.ts). Não
// há mais recaída para `tipo`: sem vínculo ativo o papel é nulo, e o cargo
// global de outra empresa não autoriza nada aqui.
export function papelNaOrg(session: Session | null | undefined): string | null {
  const u = session?.user as ComPapel | undefined
  return u?.papel ?? null
}

export function temPapel(session: Session | null | undefined, ...papeis: string[]): boolean {
  const p = papelNaOrg(session)
  return !!p && papeis.includes(p)
}

// Atalho para o gate mais comum do app: quem administra a operação da empresa.
export function ehGestor(session: Session | null | undefined): boolean {
  return temPapel(session, "admin", "gestor")
}

// Versão que já devolve a resposta de erro, para a rota retornar direto.
export function requirePapel(
  session: Session | null | undefined,
  ...papeis: string[]
): NextResponse | null {
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  if (!temPapel(session, ...papeis)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
  }
  return null
}

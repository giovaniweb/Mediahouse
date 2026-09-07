import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { permissaoEfetiva } from "@/lib/permissoes"
import { getOrgId } from "@/lib/org"
import { modulosDaOrganizacao } from "@/lib/modulos-org"

// GET /api/me — retorna dados do usuário logado + permissões
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)

  const usuario = await prisma.usuario.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      nome: true,
      email: true,
      tipo: true,
      status: true,
      avatarUrl: true,
      // Quem administra a plataforma (acima das empresas). O front usa isto para
      // mostrar o painel de organizações — a autorização de verdade continua em
      // requireSuperAdmin, no servidor: esconder o menu não protege nada.
      superAdmin: true,
      permissoes: true,
      organizacoes: {
        where: organizacaoId ? { organizacaoId } : undefined,
        select: {
          organizacaoId: true,
          papel: true,
          categoria: true,
          funcaoProfissional: true,
          areas: true,
        },
        take: 1,
      },
      videomakerRef: { select: { id: true, nome: true, avaliacao: true } },
    },
  })

  if (!usuario) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 })
  const { organizacoes, ...usuarioSemOrganizacoes } = usuario

  // Permissões desta pessoa NA EMPRESA ATIVA. A relação virou lista quando as
  // permissões passaram a ser por empresa — antes era uma linha só por usuário,
  // então quem participava de duas empresas levava os mesmos acessos às duas.
  //
  // ESCALADA DE PRIVILÉGIO CORRIGIDA EM 07/09/2026. Este ponto resolvia o preset
  // por `usuario.tipo` — a coluna GLOBAL — e gravava o resultado. A base tem uma
  // pessoa com `tipo = admin` e `papel = videomaker`: faltando o registro, ela
  // recebia ALL_TRUE numa empresa onde é videomaker. É a mesma classe de falha
  // que `src/lib/papel.ts` foi criado para fechar.
  //
  // Agora a resolução é a mesma do resto do app (lib/permissoes.ts):
  // registro explícito vence; sem registro, preset de `membro.papel`; sem como
  // determinar, `null` — e `null` aqui significa "sem permissão", não "todas".
  //
  // Também deixou de ESCREVER. Materializar preset num GET era efeito colateral
  // escondido numa leitura, e era o que tornava a falha acima permanente: o
  // registro errado ficava gravado. A ausência de registro agora se resolve por
  // herança em tempo de leitura, sem gravar nada.
  const membro = organizacoes[0] ?? null
  const permissoes = permissaoEfetiva({
    membro: membro
      ? { papel: membro.papel, organizacaoId: membro.organizacaoId, statusUsuario: usuario.status }
      : null,
    permissaoExplicita: usuario.permissoes.find((p) => p.organizacaoId === organizacaoId) ?? null,
    organizacaoId,
  })

  // Módulos da empresa ATIVA. O cliente lia constantes compiladas no bundle —
  // iguais para todas as empresas e impossíveis de mudar sem deploy. Agora vêm
  // daqui, junto do resto do "quem sou eu nesta empresa".
  const modulos = await modulosDaOrganizacao(organizacaoId)

  return NextResponse.json({
    ...usuarioSemOrganizacoes,
    membership: organizacoes[0] ?? null,
    permissoes,
    modulos,
  })
}

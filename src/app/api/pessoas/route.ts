import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrgId, semOrg } from "@/lib/org"
import {
  vinculoDaCategoria, nivelDoPapel, grupoDoNivel, funcaoDaPessoa, equipesDaPessoa,
  type Vinculo, type Nivel,
} from "@/lib/pessoas-vocabulario"

// GET /api/pessoas — UMA lista de pessoas, para todas as telas.
//
// Substitui a partição por `Usuario.tipo` que a tela de usuários fazia com uma
// lista de tipos escrita à mão:
//
//     sistema = usuarios.filter(u => [10 tipos].includes(u.tipo))
//     vmExt   = usuarios.filter(u => u.tipo === "videomaker")
//     vmInt   = usuarios.filter(u => u.tipo === "editor")
//
// Isso contava PESSOAS POR TIPO, enquanto /equipe e /videomakers contavam FICHAS
// PROFISSIONAIS — daí "equipe interna" dar 3, 6 ou 7 conforme a tela. Pior: a
// lista era manual, então um tipo novo no enum sumia das três abas de uma vez.
//
// Aqui a pessoa é a unidade, e vínculo/função/equipe são atributos dela.

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const sp = req.nextUrl.searchParams
  const busca = sp.get("busca")?.trim().toLowerCase()
  const fVinculo = sp.get("vinculo")
  const fEquipe = sp.get("equipe")
  const fNivel = sp.get("nivel")
  const fStatus = sp.get("status")
  const grupo = sp.get("grupo") ?? "todos"

  // Uma consulta: as pessoas da organização, com a ficha profissional apenas
  // para saber QUE capacidades elas têm — não para decidir se aparecem.
  const membros = await prisma.usuarioOrganizacao.findMany({
    where: { organizacaoId },
    select: {
      papel: true,
      categoria: true,
      liderAudiovisual: true,
      funcaoProfissional: true,
      areas: true,
      usuario: {
        select: {
          id: true, nome: true, email: true, telefone: true, tipo: true,
          status: true, avatarUrl: true, createdAt: true,
          videomakerRef: { select: { id: true } },
          editorRef: { select: { id: true } },
          designerRef: { select: { id: true } },
        },
      },
    },
    orderBy: { usuario: { nome: "asc" } },
  })

  const pessoas = membros
    .filter((m) => m.usuario)
    .map((m) => {
      const u = m.usuario!
      // liderAudiovisual mora na membership, não nas fichas — é atributo do
      // vínculo com a empresa, não do ofício.
      const lider = m.liderAudiovisual
      const vinculo = vinculoDaCategoria(m.categoria)
      const nivel = nivelDoPapel(m.papel, lider)

      return {
        id: u.id,
        nome: u.nome,
        email: u.email,
        telefone: u.telefone,
        avatarUrl: u.avatarUrl,
        status: u.status,
        criadoEm: u.createdAt,
        funcao: funcaoDaPessoa(m.funcaoProfissional, {
          videomaker: !!u.videomakerRef,
          editor: !!u.editorRef,
          designer: !!u.designerRef,
        }),
        equipes: equipesDaPessoa(m.areas),
        vinculo,
        nivel,
        // Enquanto o perfil de acesso não é entidade própria (fase 4), o papel
        // atual faz esse papel — é o que de fato governa a autorização hoje.
        perfilAcesso: m.papel,
        // Capacidades: a existência da ficha É a capacidade. Substitui
        // `podeEditar`/`fazCaptacao`, que hoje se contradizem (4 contra 5).
        capacidades: {
          captacao: !!u.videomakerRef,
          edicao: !!u.editorRef,
          design: !!u.designerRef,
        },
        // Ainda não é registrado — vira campo próprio na fase 4.
        ultimoAcesso: null as string | null,
      }
    })

  const filtradas = pessoas.filter((p) => {
    if (grupo === "inativos") {
      if (p.status === "ativo") return false
    } else if (grupo !== "todos") {
      if (p.status !== "ativo") return false
      if (grupoDoNivel(p.nivel) !== grupo) return false
    }
    if (fVinculo && p.vinculo !== fVinculo) return false
    if (fNivel && p.nivel !== fNivel) return false
    if (fStatus && p.status !== fStatus) return false
    if (fEquipe && !p.equipes.includes(fEquipe)) return false
    if (busca) {
      const alvo = `${p.nome} ${p.email ?? ""} ${p.funcao} ${p.equipes.join(" ")}`.toLowerCase()
      if (!alvo.includes(busca)) return false
    }
    return true
  })

  // O resumo conta a MESMA lista que a tabela mostra — era a origem da
  // divergência: cada tela somava um recorte diferente.
  const resumo = {
    total: pessoas.length,
    ativas: pessoas.filter((p) => p.status === "ativo").length,
    inativas: pessoas.filter((p) => p.status !== "ativo").length,
    porVinculo: ["interno", "parceiro", "cliente", "sistema"].reduce<Record<string, number>>(
      (acc, v) => { acc[v] = pessoas.filter((p) => p.vinculo === (v as Vinculo)).length; return acc },
      {}
    ),
    porNivel: ["ceo", "diretor", "supervisor", "lider", "executor", "solicitante"].reduce<Record<string, number>>(
      (acc, n) => { acc[n] = pessoas.filter((p) => p.nivel === (n as Nivel)).length; return acc },
      {}
    ),
  }

  const equipes = Array.from(new Set(pessoas.flatMap((p) => p.equipes))).sort()

  return NextResponse.json({ pessoas: filtradas, resumo, equipes, mostrando: filtradas.length })
}

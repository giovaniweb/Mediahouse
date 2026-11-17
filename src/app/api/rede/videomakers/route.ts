import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrgId, semOrg } from "@/lib/org"
import { scoresDaRede } from "@/lib/rede"
import { empresaVeRede, SEM_MODULO_REDE } from "@/lib/videomakers-da-rede"
import { atendeCidade, chaveCidade } from "@/lib/cidades-videomaker"

// GET /api/rede/videomakers?cidade=&uf=&especialidade=
//
// A busca na rede: videomakers que ainda NÃO estão na lista desta empresa.
// Devolve só o que os Termos do Profissional (seção 5) dizem que outra empresa
// vê: nome, cidade e estado, áreas de atuação, portfólio, redes sociais e o
// score (média e quantidade). Nunca telefone, e-mail, documento ou diária.
//
// Quem saiu da rede não aparece. Candidato pendente também não: ele se
// candidatou a uma empresa só, pelo link dela.
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()
  // Busca na rede é do módulo "rede" (pago, por empresa).
  if (!(await empresaVeRede(organizacaoId))) return NextResponse.json({ error: SEM_MODULO_REDE }, { status: 403 })

  const sp = req.nextUrl.searchParams
  const cidade = sp.get("cidade")?.trim().slice(0, 80) || ""
  const uf = sp.get("uf")?.trim().toUpperCase().slice(0, 2) || ""
  const especialidade = sp.get("especialidade")?.trim().slice(0, 80) || ""

  const perfis = await prisma.videomaker.findMany({
    where: {
      naRede: true,
      status: { in: ["ativo", "preferencial"] },
      vinculos: { none: { organizacaoId } },
    },
    select: {
      id: true, nome: true, cidade: true, estado: true, cidadesAtendidas: true,
      areasAtuacao: true, habilidades: true, portfolio: true, redesSociais: true,
    },
    orderBy: { nome: "asc" },
    take: 500,
  })

  // Os filtros mostram o que existe na rede, antes de filtrar. As cidades
  // atendidas entram sem UF (o perfil só tem a UF da base); a que já aparece
  // como base de alguém não se repete.
  const bases = [...new Set(perfis.map(p => [p.cidade, p.estado].filter(Boolean).join(" / ")).filter(Boolean))]
  const chavesBase = new Set(bases.map(chaveCidade))
  const atendidas = new Map<string, string>()
  for (const c of perfis.flatMap(p => p.cidadesAtendidas ?? [])) {
    const k = chaveCidade(c)
    if (k && !chavesBase.has(k) && !atendidas.has(k)) atendidas.set(k, c.trim())
  }
  const cidades = [...bases, ...atendidas.values()].sort((a, b) => a.localeCompare(b, "pt-BR"))
  const especialidades = [...new Set(perfis.flatMap(p => [...p.areasAtuacao, ...p.habilidades]))]
    .sort((a, b) => a.localeCompare(b, "pt-BR"))

  const igual = (a: string | null | undefined, b: string) => (a ?? "").localeCompare(b, "pt-BR", { sensitivity: "base" }) === 0
  const filtrados = perfis.filter(p =>
    // Cidade: a base ou qualquer uma que ele atende. A UF é a da base, e só
    // filtra quem não atende a cidade escolhida por fora dela.
    (!cidade || atendeCidade(p, cidade)) &&
    (!uf || igual(p.estado, uf) || (!!cidade && !igual(p.cidade, cidade) && atendeCidade(p, cidade))) &&
    (!especialidade || [...p.areasAtuacao, ...p.habilidades].some(e => igual(e, especialidade))),
  ).slice(0, 100)

  const [scores, convites] = await Promise.all([
    scoresDaRede("videomaker", filtrados.map(p => p.id)),
    prisma.conviteRede.findMany({
      where: { organizacaoId, status: "pendente", videomakerId: { in: filtrados.map(p => p.id) } },
      select: { videomakerId: true },
    }),
  ])
  const convidados = new Set(convites.map(c => c.videomakerId))

  const videomakers = filtrados
    .map(p => ({ ...p, score: scores.get(p.id), convitePendente: convidados.has(p.id) }))
    // Quem tem média aparece primeiro, da maior para a menor.
    .sort((a, b) => (b.score?.media ?? -1) - (a.score?.media ?? -1) || a.nome.localeCompare(b.nome, "pt-BR"))

  return NextResponse.json({ videomakers, filtros: { cidades, especialidades } })
}

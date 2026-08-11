import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrgId, semOrg } from "@/lib/org"
import { lerPlanilha, interpretarData, interpretarPrioridade } from "@/lib/planilha"
import { departamentoValido } from "@/lib/departamentos"
import { setResponsaveis } from "@/lib/responsaveis"
import { calcularPeso } from "@/lib/peso-demanda"

// Planilha → demandas. Mão única de propósito (ver src/lib/planilha.ts).
//
// Sempre analisa e devolve o que VAI acontecer. Só grava com `confirmar: true` —
// ninguém deve descobrir que importou 40 linhas erradas depois de gravadas.

export const dynamic = "force-dynamic"

function gerarCodigo(): string {
  const ano = new Date().getFullYear().toString().slice(-2)
  return `VOP-${ano}-${Math.floor(Math.random() * 9000 + 1000)}`
}

interface Analise {
  linha: number
  titulo: string
  prazo: string | null
  prioridade: string
  responsavel: string | null
  produto: string | null
  problemas: string[]
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const { texto, area, confirmar } = await req.json()
  const areaFinal: "audiovisual" | "design" = area === "design" ? "design" : "audiovisual"

  const leitura = lerPlanilha(String(texto ?? ""))
  if (leitura.erro) return NextResponse.json({ error: leitura.erro }, { status: 400 })
  if (leitura.linhas.length === 0) {
    return NextResponse.json({ error: "Nenhuma linha de dados encontrada." }, { status: 400 })
  }
  if (leitura.linhas.length > 200) {
    return NextResponse.json({ error: "Máximo de 200 linhas por importação." }, { status: 400 })
  }

  // Resolve nomes contra o que existe NA EMPRESA. Sem isso, "Julie" numa planilha
  // poderia casar com alguém de outra organização.
  const [produtos, membros] = await Promise.all([
    prisma.produto.findMany({ where: { organizacaoId }, select: { id: true, nome: true } }),
    prisma.usuarioOrganizacao.findMany({
      where: { organizacaoId, usuario: { status: "ativo" } },
      select: { usuario: { select: { id: true, nome: true } } },
    }),
  ])

  const acharProduto = (nome: string) =>
    produtos.find((p) => p.nome.toLowerCase() === nome.toLowerCase())
    ?? produtos.find((p) => p.nome.toLowerCase().includes(nome.toLowerCase()))

  const acharPessoa = (nome: string) =>
    membros.find((m) => m.usuario.nome.toLowerCase() === nome.toLowerCase())?.usuario
    ?? membros.find((m) => m.usuario.nome.toLowerCase().startsWith(nome.toLowerCase()))?.usuario

  const analises: Analise[] = []

  for (const l of leitura.linhas) {
    const problemas: string[] = []

    if (l.titulo.trim().length < 3) problemas.push("título com menos de 3 caracteres")

    let prazo: Date | null = null
    if (l.prazo) {
      prazo = interpretarData(l.prazo)
      if (!prazo) problemas.push(`prazo "${l.prazo}" não reconhecido`)
    }

    let produtoId: string | null = null
    if (l.produto) {
      const p = acharProduto(l.produto)
      if (p) produtoId = p.id
      else problemas.push(`produto "${l.produto}" não cadastrado`)
    }

    let responsavelId: string | null = null
    if (l.responsavel) {
      const pessoa = acharPessoa(l.responsavel)
      if (pessoa) responsavelId = pessoa.id
      else problemas.push(`"${l.responsavel}" não encontrado na equipe`)
    }

    const departamento = l.departamento?.trim() || "outros"
    if (l.departamento && !(await departamentoValido(departamento, organizacaoId))) {
      problemas.push(`departamento "${l.departamento}" não cadastrado`)
    }

    analises.push({
      linha: l.linha,
      titulo: l.titulo,
      prazo: prazo ? prazo.toISOString() : null,
      prioridade: interpretarPrioridade(l.prioridade),
      responsavel: responsavelId ? l.responsavel : null,
      produto: produtoId ? l.produto : null,
      problemas,
    })

    // Guarda o resolvido para não refazer o trabalho na hora de gravar.
    ;(l as unknown as Record<string, unknown>)._resolvido = { prazo, produtoId, responsavelId, departamento }
  }

  const validas = analises.filter((a) => !a.problemas.some((p) => p.includes("título")))

  if (!confirmar) {
    return NextResponse.json({
      previa: true,
      colunasReconhecidas: leitura.colunasReconhecidas,
      colunasIgnoradas: leitura.colunasIgnoradas,
      analises,
      totalLinhas: analises.length,
      totalValidas: validas.length,
    })
  }

  // ── Gravação ──────────────────────────────────────────────────────────────
  // Linha com problema que NÃO seja o título ainda entra: melhor a demanda existir
  // sem prazo do que a pessoa ter de refazer a planilha inteira por uma data
  // malformada. O que impede de verdade é não ter título.
  const criadas: { codigo: string; titulo: string }[] = []
  const falhas: { linha: number; motivo: string }[] = []

  for (const l of leitura.linhas) {
    const res = (l as unknown as Record<string, unknown>)._resolvido as {
      prazo: Date | null; produtoId: string | null; responsavelId: string | null; departamento: string
    }
    if (l.titulo.trim().length < 3) {
      falhas.push({ linha: l.linha, motivo: "título ausente ou curto demais" })
      continue
    }

    try {
      const demanda = await prisma.demanda.create({
        data: {
          organizacaoId,
          codigo: gerarCodigo(),
          titulo: l.titulo.trim(),
          descricao: l.descricao?.trim() || l.titulo.trim(),
          departamento: res.departamento,
          area: areaFinal,
          tipoVideo: l.tipoVideo?.trim() || (areaFinal === "design" ? "post" : "outro"),
          cidade: "N/A",
          prioridade: interpretarPrioridade(l.prioridade),
          statusInterno: "aguardando_triagem",
          statusVisivel: "entrada",
          pesoDemanda: calcularPeso(l.tipoVideo?.trim() || "outro", interpretarPrioridade(l.prioridade)),
          solicitanteId: session.user.id,
          ...(res.prazo ? { dataLimite: res.prazo } : {}),
          ...(res.produtoId ? { produtos: { create: [{ produtoId: res.produtoId }] } } : {}),
        },
        select: { id: true, codigo: true, titulo: true },
      })

      if (res.responsavelId) await setResponsaveis(demanda.id, [res.responsavelId])
      criadas.push({ codigo: demanda.codigo, titulo: demanda.titulo })
    } catch (e) {
      falhas.push({ linha: l.linha, motivo: e instanceof Error ? e.message.slice(0, 120) : "erro ao criar" })
    }
  }

  return NextResponse.json({ criadas: criadas.length, demandas: criadas, falhas })
}

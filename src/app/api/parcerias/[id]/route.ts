// Responder a uma parceria: aceitar, recusar ou encerrar.
//
// Quem aceita é SÓ a empresa convidada — e quem impõe isso é o gatilho
// `parceria_regras`, não este arquivo. Aqui a checagem existe para devolver 403
// com uma frase em português em vez de deixar o Postgres estourar um erro cru.
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrgId, semOrg } from "@/lib/org"
import { permissoesEfetivas } from "@/lib/permissoes-server"
import { ehGestaoDaEmpresa } from "@/lib/parceria"
import { espelharPelaParceria } from "@/lib/espelho-do-videomaker"

type Params = { params: Promise<{ id: string }> }

const ACOES = ["aceitar", "recusar", "encerrar"] as const
type Acao = (typeof ACOES)[number]

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const vinculo = await permissoesEfetivas(session.user.id, organizacaoId)
  if (!ehGestaoDaEmpresa(vinculo?.papel)) {
    return NextResponse.json({ error: "Só admin ou gestor responde a parceria." }, { status: 403 })
  }

  const { id } = await params
  const { acao } = (await req.json().catch(() => ({}))) as { acao?: Acao }
  if (!acao || !ACOES.includes(acao)) {
    return NextResponse.json({ error: `Ação inválida. Use ${ACOES.join(", ")}.` }, { status: 400 })
  }

  const parceria = await prisma.parceriaOrganizacao.findUnique({ where: { id } })
  // Sob RLS a política já esconderia a linha de quem não é parte; sem RLS, é
  // esta linha que faz o mesmo. As duas camadas dizem a mesma coisa.
  const souParte =
    parceria &&
    (parceria.organizacaoConvidanteId === organizacaoId || parceria.organizacaoConvidadaId === organizacaoId)
  if (!souParte) return NextResponse.json({ error: "Não encontrado" }, { status: 404 })

  const souConvidada = parceria.organizacaoConvidadaId === organizacaoId

  if (acao !== "encerrar") {
    if (!souConvidada) {
      return NextResponse.json(
        { error: "Quem convidou não responde ao próprio convite." },
        { status: 403 }
      )
    }
    if (parceria.status !== "pendente") {
      // Idempotência (§44): repetir a resposta não é erro, mas também não
      // reescreve quem respondeu nem quando.
      if (parceria.status === (acao === "aceitar" ? "aceita" : "recusada")) {
        return NextResponse.json({ parceriaId: parceria.id, status: parceria.status, repetido: true })
      }
      return NextResponse.json({ error: "Esta parceria já foi respondida." }, { status: 409 })
    }
  }

  const atualizada = await prisma.parceriaOrganizacao.update({
    where: { id },
    data:
      acao === "encerrar"
        ? { status: "encerrada", encerradaEm: new Date(), encerradaPorId: session.user.id }
        : {
            status: acao === "aceitar" ? "aceita" : "recusada",
            respondidoEm: new Date(),
            respondidoPorId: session.user.id,
          },
  })

  // Encerrar NÃO revoga as arestas que já existem, e isso é decisão, não
  // esquecimento: um job em execução não deve parar no meio porque a relação
  // comercial acabou. Revogar cada card é ato separado, e a tela de parcerias
  // mostra quantos ainda estão de pé. Ver PLANO-ESPELHAMENTO-CROSS-TENANT.md §6.3.
  const [a, b] = [atualizada.organizacaoConvidanteId, atualizada.organizacaoConvidadaId]
  // Aceitou: os cards abertos dos videomakers que trabalham por uma das duas
  // aparecem na outra (lib/espelho-do-videomaker.ts).
  const espelhados = atualizada.status === "aceita" ? await espelharPelaParceria(a, b) : 0
  // Encerrou: nenhum card fica aberto entre as duas. Antes de 12/11/2026 o
  // espelho seguia ativo depois de encerrar a parceria. Os gatilhos apagam o
  // executor e, no automático, registram e avisam.
  if (atualizada.status === "encerrada") {
    await prisma.demandaCompartilhamento.updateMany({
      where: {
        revogadoEm: null,
        OR: [
          { organizacaoOrigemId: a, organizacaoDestinoId: b },
          { organizacaoOrigemId: b, organizacaoDestinoId: a },
        ],
      },
      data: { revogadoEm: new Date(), revogadoPorId: session.user.id },
    })
  }

  return NextResponse.json({ parceriaId: atualizada.id, status: atualizada.status, espelhados })
}

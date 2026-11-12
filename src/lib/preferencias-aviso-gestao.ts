// Ler e gravar a escolha de avisos de uma pessoa (Configurações → Avisos por
// pessoa, e a própria pessoa no Perfil). A aplicação da regra nos canais está
// em lib/preferencias-aviso.ts; aqui só a tela.
//
// Quem pode o quê:
// - a gestão (gerenciarUsuarios) mexe em qualquer pessoa da empresa e pode
//   TRAVAR uma categoria: aí a pessoa vê, mas não muda;
// - a própria pessoa mexe nas dela, menos nas travadas, e não trava nada.
//
// A linha que volta ao padrão (tudo ligado, "tudo", sem trava) é apagada: sem
// linha é "recebe como sempre", e não fica lixo que pareça configuração.
import type { Prisma } from "@prisma/client"
import { LISTA_CATEGORIAS, ehCategoria, ehRecorte, ehSetor, type CategoriaAviso, type Recorte, type Setor } from "@/lib/avisos-categorias"

type Tx = Prisma.TransactionClient

export type EstadoCategoria = {
  categoria: CategoriaAviso
  sino: boolean
  email: boolean
  whatsapp: boolean
  recorte: Recorte
  /** Só com recorte "setor". */
  setor: Setor | null
  travada: boolean
}

export const PADRAO = { sino: true, email: true, whatsapp: true, recorte: "tudo" as Recorte, setor: null as Setor | null, travada: false }

export const ehPadrao = (e: Omit<EstadoCategoria, "categoria">) =>
  e.sino && e.email && e.whatsapp && e.recorte === "tudo" && !e.travada

export async function lerPreferencias(tx: Tx, organizacaoId: string, usuarioId: string): Promise<EstadoCategoria[]> {
  const linhas = await tx.preferenciaAviso.findMany({ where: { organizacaoId, usuarioId } })
  const por = new Map(linhas.map((l) => [l.categoria, l]))
  return LISTA_CATEGORIAS.map((categoria) => {
    const l = por.get(categoria)
    return l
      ? { categoria, sino: l.sino, email: l.email, whatsapp: l.whatsapp, recorte: ehRecorte(l.recorte) ? l.recorte : "tudo",
        setor: ehSetor(l.setor) ? l.setor : null, travada: l.travada }
      : { categoria, ...PADRAO }
  })
}

export type ResultadoSalvar = { ok: true; alteradas: number } | { ok: false; erro: string }

/**
 * Grava o estado pedido. `comoGestao` false = a própria pessoa: categoria
 * travada fica como está, e a trava pedida é ignorada.
 */
export async function salvarPreferencias(
  tx: Tx, organizacaoId: string, alvoId: string, atorId: string, comoGestao: boolean, pedidas: EstadoCategoria[],
): Promise<ResultadoSalvar> {
  const membro = await tx.usuarioOrganizacao.findFirst({ where: { organizacaoId, usuarioId: alvoId, usuario: { status: "ativo" } }, select: { id: true } })
  if (!membro) return { ok: false, erro: "Pessoa não encontrada nesta empresa." }
  const atuais = new Map((await lerPreferencias(tx, organizacaoId, alvoId)).map((e) => [e.categoria, e]))
  let alteradas = 0
  for (const p of pedidas) {
    if (!ehCategoria(p.categoria)) continue
    const atual = atuais.get(p.categoria)!
    if (!comoGestao && atual.travada) continue
    // Setor só vale com recorte "setor"; sem setor escolhido, o recorte não tem
    // como funcionar e volta a "tudo" (nunca corta às cegas).
    const setor = p.recorte === "setor" && ehSetor(p.setor) ? p.setor : null
    const recorte: Recorte = p.recorte === "setor" && !setor ? "tudo" : p.recorte
    const novo = { sino: p.sino, email: p.email, whatsapp: p.whatsapp, recorte, setor, travada: comoGestao ? p.travada : atual.travada }
    if (novo.sino === atual.sino && novo.email === atual.email && novo.whatsapp === atual.whatsapp &&
      novo.recorte === atual.recorte && novo.setor === atual.setor && novo.travada === atual.travada) continue
    const onde = { organizacaoId_usuarioId_categoria: { organizacaoId, usuarioId: alvoId, categoria: p.categoria } }
    if (ehPadrao(novo)) await tx.preferenciaAviso.deleteMany({ where: { organizacaoId, usuarioId: alvoId, categoria: p.categoria } })
    else await tx.preferenciaAviso.upsert({
      where: onde,
      create: { organizacaoId, usuarioId: alvoId, categoria: p.categoria, ...novo, atualizadoPorId: atorId },
      update: { ...novo, atualizadoPorId: atorId },
    })
    alteradas++
  }
  return { ok: true, alteradas }
}

/** Pessoas da equipe que a gestão configura: ativas, internas ou que pedem. */
export async function pessoasConfiguraveis(tx: Tx, organizacaoId: string) {
  const membros = await tx.usuarioOrganizacao.findMany({
    where: { organizacaoId, categoria: { in: ["interna", "solicitante"] }, usuario: { status: "ativo" } },
    select: { papel: true, areas: true, usuario: { select: { id: true, nome: true } } },
    orderBy: { usuario: { nome: "asc" } },
  })
  const ajustes = await tx.preferenciaAviso.groupBy({ by: ["usuarioId"], where: { organizacaoId }, _count: { _all: true } })
  const n = new Map(ajustes.map((a) => [a.usuarioId, a._count._all]))
  return membros.map((m) => ({ id: m.usuario.id, nome: m.usuario.nome.trim(), papel: m.papel, areas: m.areas, ajustes: n.get(m.usuario.id) ?? 0 }))
}

import { prisma } from "@/lib/prisma"
import { gravarDadosPrivadosVideomaker } from "@/lib/videomaker-dados"
import { gravarDadosPrivadosEditor } from "@/lib/editor-dados"

const FORA_DA_LISTA = "Este videomaker não está na lista da sua empresa. Convide-o pela rede."

export { parseToken, type OrigemEquipe } from "@/lib/equipe-token"
import { parseToken } from "@/lib/equipe-token"

// ─── Find-or-create de espelho VIDEOMAKER ─────────────────────────────────────
async function findOrCreateVideomaker(opts: {
  usuarioId?: string | null
  nome: string
  telefone?: string | null
  cidade?: string | null
  estado?: string | null
  tipoContrato: string
  /** O casamento por nome fica entre os videomakers da empresa (Onda 2B). */
  soDaEmpresa?: string | null
}): Promise<string> {
  // 1. Dedup por usuarioId (coluna @unique). O perfil achado pode ser da REDE:
  //    sem vínculo com a empresa, só entra se o usuário for da empresa (pessoa
  //    interna); senão, é o convite da rede que libera (Onda 2B, achado do #157).
  if (opts.usuarioId) {
    const existente = await prisma.videomaker.findUnique({
      where: { usuarioId: opts.usuarioId },
      select: { id: true },
    })
    if (existente) {
      if (opts.soDaEmpresa) {
        const [vinculo, membro] = await Promise.all([
          prisma.videomakerOrganizacao.count({ where: { organizacaoId: opts.soDaEmpresa, videomakerId: existente.id } }),
          prisma.usuarioOrganizacao.count({ where: { organizacaoId: opts.soDaEmpresa, usuarioId: opts.usuarioId } }),
        ])
        if (!vinculo && !membro) throw new Error(FORA_DA_LISTA)
      }
      return existente.id
    }
  }
  // 2. Fallback por nome
  const porNome = await prisma.videomaker.findFirst({
    where: {
      nome: { equals: opts.nome, mode: "insensitive" },
      ...(opts.soDaEmpresa ? { vinculos: { some: { organizacaoId: opts.soDaEmpresa } } } : {}),
    },
    select: { id: true },
  })
  if (porNome) return porNome.id
  // 3. Criar (race-safe: re-query no conflito de unique)
  try {
    const novo = await prisma.videomaker.create({
      data: {
        nome: opts.nome,
        usuarioId: opts.usuarioId ?? undefined,
        telefone: opts.telefone ?? undefined,
        cidade: opts.cidade ?? undefined,
        estado: opts.estado ?? undefined,
        tipoContrato: opts.tipoContrato,
        status: "ativo",
      },
      select: { id: true },
    })
    return novo.id
  } catch {
    if (opts.usuarioId) {
      const conflito = await prisma.videomaker.findUnique({
        where: { usuarioId: opts.usuarioId },
        select: { id: true },
      })
      if (conflito) return conflito.id
    }
    throw new Error("Não foi possível criar/vincular o videomaker")
  }
}

// ─── Find-or-create de espelho EDITOR ─────────────────────────────────────────
async function findOrCreateEditor(opts: {
  usuarioId?: string | null
  nome: string
  telefone?: string | null
  whatsapp?: string | null
  cidade?: string | null
  estado?: string | null
  tipoContrato: string
  organizacaoId?: string | null
}): Promise<string> {
  // O perfil é da REDE, o vínculo é da empresa. Os três caminhos abaixo podem
  // devolver um perfil que existe — mas devolver um id que a empresa não enxerga
  // deixaria a demanda apontando para alguém invisível na tela dela. Por isso
  // todo caminho termina garantindo o vínculo, e não só encontrando o perfil.
  const garantirVinculo = async (editorId: string) => {
    await gravarDadosPrivadosEditor({
      editorId,
      organizacaoId: opts.organizacaoId,
      tipoContrato: opts.tipoContrato,
      comercial: { status: "ativo" },
    })
    return editorId
  }

  if (opts.usuarioId) {
    // Busca global de propósito: `usuarioId` é único na tabela inteira, então
    // filtrar por empresa aqui criaria um perfil duplicado para a mesma pessoa.
    const existente = await prisma.editor.findUnique({
      where: { usuarioId: opts.usuarioId },
      select: { id: true },
    })
    if (existente) return garantirVinculo(existente.id)
  }
  // Reaproveita espelho por nome apenas entre quem já tem vínculo com a empresa:
  // casar por nome na rede inteira juntaria homônimos de clientes diferentes.
  const porNome = await prisma.editor.findFirst({
    where: {
      nome: { equals: opts.nome, mode: "insensitive" },
      ...(opts.organizacaoId ? { vinculos: { some: { organizacaoId: opts.organizacaoId } } } : {}),
    },
    select: { id: true },
  })
  if (porNome) return garantirVinculo(porNome.id)
  try {
    const novo = await prisma.editor.create({
      data: {
        nome: opts.nome,
        usuarioId: opts.usuarioId ?? undefined,
        telefone: opts.telefone ?? undefined,
        whatsapp: opts.whatsapp ?? undefined,
        cidade: opts.cidade ?? undefined,
        estado: opts.estado ?? undefined,
        tipoContrato: opts.tipoContrato,
        status: "ativo",
      },
      select: { id: true },
    })
    return garantirVinculo(novo.id)
  } catch {
    if (opts.usuarioId) {
      const conflito = await prisma.editor.findUnique({
        where: { usuarioId: opts.usuarioId },
        select: { id: true },
      })
      if (conflito) return garantirVinculo(conflito.id)
    }
    throw new Error("Não foi possível criar/vincular o editor")
  }
}

// ─── Resolver token → Videomaker.id (slot de captação) ────────────────────────
/**
 * Resolve o token de atribuição para um id de Videomaker, garantindo o VÍNCULO
 * com a empresa que está alocando.
 *
 * Sem o vínculo, a pessoa executa a demanda mas some da agenda, do ranking e da
 * lista de equipe daquela empresa — e, sob RLS, o perfil dela deixaria de ser
 * visível ali. Foi o que apareceu no primeiro teste cross-company: alocar
 * alguém numa demanda não bastava para a empresa passar a enxergá-lo.
 *
 * Mesmo tratamento que `resolveParaEditor` já dava com `garantirVinculo`.
 */
export async function resolveParaVideomaker(token: string, organizacaoId?: string | null): Promise<string> {
  const { origem, id } = parseToken(token)

  const comVinculo = async (videomakerId: string) => {
    if (organizacaoId) {
      await gravarDadosPrivadosVideomaker({
        videomakerId,
        organizacaoId,
        comercial: { status: "ativo" },
      })
    }
    return videomakerId
  }

  // Videomaker da rede só entra na escala se já está na lista da empresa. Criar
  // o vínculo aqui seria pular o convite da rede e entregar o contato de quem
  // não aceitou (Termos do Profissional, seção 5). Ver /api/rede/convites.
  if (origem === "vm") {
    if (organizacaoId) {
      const naLista = await prisma.videomakerOrganizacao.count({ where: { organizacaoId, videomakerId: id } })
      if (!naLista) throw new Error(FORA_DA_LISTA)
    }
    // O vínculo já existe: regravá-lo com "ativo" rebaixaria quem é preferencial.
    return id
  }

  // Quem chama já conferiu a pessoa (pessoaDoSlotLiberada). Aqui, por garantia,
  // nem o casamento por nome nem o perfil achado pelo usuário puxam um
  // videomaker da rede sem vínculo, com ou sem o módulo "rede" (Onda 2B).
  const soDaEmpresa = organizacaoId ?? null

  if (origem === "ed") {
    const ed = await prisma.editor.findUnique({
      where: { id },
      select: { nome: true, usuarioId: true, telefone: true, cidade: true, estado: true },
    })
    if (!ed) throw new Error("Editor não encontrado")
    return comVinculo(await findOrCreateVideomaker({
      usuarioId: ed.usuarioId,
      nome: ed.nome,
      telefone: ed.telefone,
      cidade: ed.cidade,
      estado: ed.estado,
      tipoContrato: "interno", // editor mirrorado → pessoa interna
      soDaEmpresa,
    }))
  }

  // origem === "user"
  const user = await prisma.usuario.findUnique({
    where: { id },
    select: { nome: true, telefone: true },
  })
  if (!user) throw new Error("Usuário não encontrado")
  return comVinculo(await findOrCreateVideomaker({
    usuarioId: id,
    nome: user.nome,
    telefone: user.telefone,
    tipoContrato: "interno",
    soDaEmpresa,
  }))
}

// ─── Resolver token → Editor.id (slot de edição) ──────────────────────────────
export async function resolveParaEditor(token: string, organizacaoId?: string | null): Promise<string> {
  const { origem, id } = parseToken(token)

  if (origem === "ed") return id

  if (origem === "vm") {
    const vm = await prisma.videomaker.findUnique({
      where: { id },
      select: { nome: true, usuarioId: true, telefone: true, cidade: true, estado: true },
    })
    if (!vm) throw new Error("Videomaker não encontrado")
    return findOrCreateEditor({
      usuarioId: vm.usuarioId,
      nome: vm.nome,
      telefone: vm.telefone,
      cidade: vm.cidade,
      estado: vm.estado,
      tipoContrato: "externo", // videomaker mirrorado → pessoa externa
      organizacaoId,
    })
  }

  // origem === "user"
  const user = await prisma.usuario.findUnique({
    where: { id },
    select: { nome: true, telefone: true },
  })
  if (!user) throw new Error("Usuário não encontrado")
  return findOrCreateEditor({
    usuarioId: id,
    nome: user.nome,
    telefone: user.telefone,
    tipoContrato: "interno",
    organizacaoId,
  })
}

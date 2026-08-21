import { prisma } from "@/lib/prisma"
import { gravarDadosPrivadosEditor } from "@/lib/editor-dados"

// Token opaco para identificar a origem de uma pessoa atribuível:
//   "vm:<id>"   → registro Videomaker
//   "ed:<id>"   → registro Editor
//   "user:<id>" → Usuario (tipo=social etc.)
export type OrigemEquipe = "vm" | "ed" | "user"

export function parseToken(token: string): { origem: OrigemEquipe; id: string } {
  const idx = token.indexOf(":")
  if (idx === -1) {
    // Compatibilidade: id puro = videomaker (comportamento legado)
    return { origem: "vm", id: token }
  }
  const prefix = token.slice(0, idx)
  const id = token.slice(idx + 1)
  const origem: OrigemEquipe = prefix === "ed" ? "ed" : prefix === "user" ? "user" : "vm"
  return { origem, id }
}

// ─── Find-or-create de espelho VIDEOMAKER ─────────────────────────────────────
async function findOrCreateVideomaker(opts: {
  usuarioId?: string | null
  nome: string
  telefone?: string | null
  cidade?: string | null
  estado?: string | null
  tipoContrato: string
}): Promise<string> {
  // 1. Dedup por usuarioId (coluna @unique)
  if (opts.usuarioId) {
    const existente = await prisma.videomaker.findUnique({
      where: { usuarioId: opts.usuarioId },
      select: { id: true },
    })
    if (existente) return existente.id
  }
  // 2. Fallback por nome
  const porNome = await prisma.videomaker.findFirst({
    where: { nome: { equals: opts.nome, mode: "insensitive" } },
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
export async function resolveParaVideomaker(token: string): Promise<string> {
  const { origem, id } = parseToken(token)

  if (origem === "vm") return id

  if (origem === "ed") {
    const ed = await prisma.editor.findUnique({
      where: { id },
      select: { nome: true, usuarioId: true, telefone: true, cidade: true, estado: true },
    })
    if (!ed) throw new Error("Editor não encontrado")
    return findOrCreateVideomaker({
      usuarioId: ed.usuarioId,
      nome: ed.nome,
      telefone: ed.telefone,
      cidade: ed.cidade,
      estado: ed.estado,
      tipoContrato: "interno", // editor mirrorado → pessoa interna
    })
  }

  // origem === "user"
  const user = await prisma.usuario.findUnique({
    where: { id },
    select: { nome: true, telefone: true },
  })
  if (!user) throw new Error("Usuário não encontrado")
  return findOrCreateVideomaker({
    usuarioId: id,
    nome: user.nome,
    telefone: user.telefone,
    tipoContrato: "interno",
  })
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

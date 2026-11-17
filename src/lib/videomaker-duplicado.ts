// O mesmo telefone não vira dois videomakers na mesma empresa (16/11/2026).
//
// O Kevew Felix tinha três cadastros com o mesmo número, um por cidade. A
// identificação do WhatsApp (lib/whatsapp-identidade.ts) recusa o envio quando
// o número aparece em mais de um cadastro da empresa, então nenhum aviso chegava
// a ele, sem erro. O cadastro público e o da gestão consultam aqui antes de
// criar: se o número já existe, oferecem acrescentar a cidade ao cadastro dele.
//
// A comparação usa o mesmo número completo da identificação (`telefoneCompleto`:
// só dígitos, com 55 quando vem sem DDI), em memória, porque o banco guarda o
// telefone como foi digitado.

import type { Prisma } from "@prisma/client"
import { telefoneCompleto } from "@/lib/whatsapp-identidade"

type Db = Pick<Prisma.TransactionClient, "videomakerOrganizacao">

export type VideomakerDoTelefone = {
  id: string
  nome: string
  cidade: string | null
  estado: string | null
  cidadesAtendidas: string[]
  status: string
}

/**
 * Videomakers DESTA empresa (com vínculo aqui, em qualquer situação) que têm
 * este telefone. Inativo também conta: a identificação do WhatsApp trava com
 * ele do mesmo jeito se a conta estiver ativa, e recadastrar quem saiu é voltar
 * com o mesmo cadastro.
 */
export async function videomakersComOTelefone(
  db: Db,
  organizacaoId: string,
  telefone: string | null | undefined,
  excetoId?: string,
): Promise<VideomakerDoTelefone[]> {
  const alvo = telefoneCompleto(telefone ?? "")
  if (!alvo) return []
  const vinculos = await db.videomakerOrganizacao.findMany({
    where: { organizacaoId, videomaker: { telefone: { not: null } } },
    select: {
      status: true,
      videomaker: { select: { id: true, nome: true, cidade: true, estado: true, cidadesAtendidas: true, telefone: true } },
    },
  })
  return vinculos
    .filter(v => v.videomaker.id !== excetoId && telefoneCompleto(v.videomaker.telefone) === alvo)
    .map(v => ({
      id: v.videomaker.id,
      nome: v.videomaker.nome,
      cidade: v.videomaker.cidade,
      estado: v.videomaker.estado,
      cidadesAtendidas: v.videomaker.cidadesAtendidas ?? [],
      status: v.status,
    }))
}

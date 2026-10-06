import { describe, it, expect } from "vitest"
import type { StatusInterno } from "@prisma/client"
import { podeTransicionar, type JobTransicao } from "@/lib/job-transicoes"
import { PRESETS } from "@/lib/permissoes"
import { GROWTH_COLUNA_PARA_STATUS } from "@/lib/growth-kanban"
import { AUDIOVISUAL_COLUNA_PARA_STATUS, PEDE_TEXTO } from "@/lib/kanban-movimento"

// Card sem nada preenchido: é o pior caso que alguém arrasta no quadro.
const VAZIA: JobTransicao = {
  videomakerId: null,
  editorId: null,
  linkBrutos: null,
  linkFolderBrutos: null,
  linkFinal: null,
  motivoImpedimento: null,
}

const gestor = {
  id: "u-gestor",
  papel: "gestor",
  permissoes: PRESETS.gestor,
  videomakerId: null,
  origem: "dona" as const,
}

function soltar(status: StatusInterno, observacao?: string) {
  return podeTransicionar({
    statusAtual: "pedido_criado",
    novoStatus: status,
    usuario: gestor,
    demanda: VAZIA,
    entrada: observacao ? { observacao } : undefined,
  })
}

const QUADROS = {
  growth: GROWTH_COLUNA_PARA_STATUS as Record<string, StatusInterno>,
  audiovisual: AUDIOVISUAL_COLUNA_PARA_STATUS,
}

describe("colunas do quadro × precondições da guarda", () => {
  for (const [quadro, mapa] of Object.entries(QUADROS)) {
    for (const [coluna, status] of Object.entries(mapa)) {
      it(`${quadro}: soltar em "${coluna}" nunca termina num erro sem saída`, () => {
        const sem = soltar(status)
        if (sem.ok) return
        // Se a guarda pede algo, o quadro precisa perguntar — e a resposta tem
        // que bastar para passar.
        expect(sem.codigo, `${quadro}/${coluna}: ${sem.motivo}`).toBe("precondicao")
        expect(PEDE_TEXTO[status], `${quadro}/${coluna} exige algo e o quadro não pergunta`).toBeDefined()
        expect(soltar(status, "motivo escrito no quadro").ok).toBe(true)
      })
    }
  }

  it("Impedimento do Growth pede o motivo", () => {
    expect(soltar(GROWTH_COLUNA_PARA_STATUS.impedimento).codigo).toBe("precondicao")
    expect(PEDE_TEXTO.impedimento?.confirmar).toBe("Mover para Impedimento")
  })
})

import { describe, it, expect } from "vitest"
import type { StatusInterno } from "@prisma/client"
import {
  ACOES_DO_VIDEOMAKER,
  podeTransicionar,
  type ActorTransicao,
  type JobTransicao,
} from "@/lib/job-transicoes"
import { TRANSICOES_VALIDAS } from "@/lib/status"
import { PRESETS, permissaoEfetiva, type MapaPermissoes } from "@/lib/permissoes"

// ── Cenário base: job em edição, sem pendência de precondição ────────────────
const JOB: JobTransicao = {
  videomakerId: "vm-1",
  editorId: "ed-1",
  linkBrutos: "https://drive/brutos",
  linkFolderBrutos: null,
  linkFinal: "https://drive/final.mp4",
  motivoImpedimento: null,
}

// Os atores levam a permissão EFETIVA, resolvida como em produção: preset do
// papel quando não há registro, registro quando há. Construir a partir de
// PRESETS (e não de literais) faz o teste acompanhar o preset de verdade — se
// alguém mudar `social` para moverKanban false, estes testes falam.
function ator(
  id: string,
  papel: string,
  extras: { videomakerId?: string | null; explicita?: Partial<MapaPermissoes> | null } = {}
): ActorTransicao {
  return {
    id,
    papel,
    videomakerId: extras.videomakerId ?? null,
    permissoes: permissaoEfetiva({
      membro: { papel, organizacaoId: "org-1", statusUsuario: "ativo" },
      permissaoExplicita: extras.explicita ?? null,
      organizacaoId: "org-1",
    }),
  }
}

const admin = ator("u-admin", "admin")
const gestor = ator("u-gestor", "gestor")
const editor = ator("u-editor", "editor")
// O videomaker DONO do job (o perfil dele bate com demanda.videomakerId).
const vmDono = ator("u-vm", "videomaker", { videomakerId: "vm-1" })
// Outro videomaker, sem relação com este job.
const vmOutro = ator("u-vm2", "videomaker", { videomakerId: "vm-9" })
// Social SEM registro em permissoes_usuario — 3 pessoas reais nesta situação.
// Herda o preset `social`, que tem moverKanban true.
const socialSemRegistro = ator("u-social", "social")
// Recusa declarada por um gestor na tela de permissões (registro explícito).
const bloqueado = ator("u-blq", "analista_crm")

function mover(
  statusAtual: StatusInterno,
  novoStatus: string,
  usuario: ActorTransicao,
  demanda: JobTransicao = JOB,
  entrada?: { linkBrutos?: string | null; linkFinal?: string | null; observacao?: string | null }
) {
  return podeTransicionar({ statusAtual, novoStatus, usuario, demanda, entrada })
}

// ─────────────────────────────────────────────────────────────────────────────
describe("status inexistente", () => {
  it("recusa valor que não é StatusInterno", () => {
    const r = mover("editando", "virou_pó", admin)
    expect(r.ok).toBe(false)
    expect(r.codigo).toBe("status_inexistente")
  })

  it("recusa string vazia", () => {
    expect(mover("editando", "", admin).ok).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe("transição válida", () => {
  it("gestão move dentro da matriz", () => {
    const r = mover("fila_edicao", "editando", gestor)
    expect(r.ok).toBe(true)
    // Dentro da matriz: nenhum desvio de sequência registrado.
    expect(r.avisos.filter((a) => a.startsWith("sequencia"))).toEqual([])
  })

  it("editor com moverKanban move", () => {
    expect(mover("editando", "revisao_pendente", editor).ok).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe("transição fora da matriz — registra, não recusa", () => {
  // Esta é a decisão central desta camada. TRANSICOES_VALIDAS recusaria 84,5%
  // da operação real; enquanto não se souber qual é a matriz verdadeira, desvio
  // de sequência é telemetria, não porta.
  it("pular etapas passa, com aviso", () => {
    // `pedido_criado → entregue_cliente` é o pior salto possível — e é o que o
    // kanban do Growth faz ao arrastar de "backlog" para "finalizado".
    const r = mover("pedido_criado", "entregue_cliente", admin)
    expect(r.ok).toBe(true)
    expect(r.avisos).toContain("sequencia_fora_da_matriz:pedido_criado->entregue_cliente")
  })

  it("as quatro transições mais frequentes da operação real continuam passando", () => {
    // Medidas em historico_status (2.242 linhas) em 07/09/2026. Se alguma
    // destas passar a recusar, a operação para.
    const reais: Array<[StatusInterno, StatusInterno]> = [
      ["aguardando_aprovacao_interna", "aguardando_triagem"], // 287x
      ["editando", "revisao_pendente"],                       // 143x
      ["revisao_pendente", "entregue_cliente"],               // 129x
      ["aguardando_triagem", "editando"],                     //  71x
    ]
    for (const [de, para] of reais) {
      expect(mover(de, para, gestor).ok, `${de} → ${para} precisa continuar passando`).toBe(true)
    }
  })

  it("origem que a matriz nem conhece passa, com aviso próprio", () => {
    // `aguardando_aprovacao_interna` não é chave em TRANSICOES_VALIDAS e é a
    // origem mais comum da base (446 transições).
    expect(TRANSICOES_VALIDAS["aguardando_aprovacao_interna"]).toBeUndefined()
    const r = mover("aguardando_aprovacao_interna", "aguardando_triagem", gestor)
    expect(r.ok).toBe(true)
    expect(r.avisos.some((a) => a.startsWith("sequencia_origem_sem_regra"))).toBe(true)
  })

  it("o kanban do Growth continua inteiro", () => {
    // As 8 colunas do Growth mapeiam para estes status e o card move em
    // qualquer direção. Um gate de sequência mataria o quadro.
    const growth: StatusInterno[] = [
      "pedido_criado", "aguardando_triagem", "fila_edicao", "editando",
      "revisao_pendente", "postagem_pendente", "entregue_cliente", "impedimento",
    ]
    for (const de of growth) {
      for (const para of growth) {
        if (de === para) continue
        const r = mover(de, para, editor, { ...JOB, motivoImpedimento: "travado" })
        expect(r.ok, `Growth quebrou em ${de} → ${para}: ${r.motivo}`).toBe(true)
      }
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe("usuário autorizado", () => {
  it("admin passa mesmo com moverKanban explicitamente false", () => {
    const adminSemCheck = ator("u-admin2", "admin", { explicita: { moverKanban: false } })
    expect(mover("editando", "aprovado", adminSemCheck).ok).toBe(true)
  })

  it("sem registro, o preset do papel decide — e nada fica em modo tolerante", () => {
    // 3 pessoas de `social` estão exatamente assim e fizeram 74
    // `entregue_cliente`. O preset `social` tem moverKanban true: passam por
    // herança, não por tolerância.
    const r = mover("postagem_pendente", "entregue_cliente", socialSemRegistro)
    expect(r.ok).toBe(true)
    expect(r.avisos.some((a) => a.startsWith("autoridade_nao_declarada"))).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe("usuário NÃO autorizado", () => {
  it("moverKanban false declarado é recusa", () => {
    const r = mover("editando", "entregue_cliente", bloqueado)
    expect(r.ok).toBe(false)
    expect(r.codigo).toBe("sem_autoridade")
  })

  it("videomaker não marca job como aprovado — o buraco que existia", () => {
    // Era isto que um `curl` fazia antes desta camada: o KanbanBoard bloqueava
    // no onDragEnd, e o backend não conferia nada.
    const r = mover("revisao_pendente", "aprovado", vmDono)
    expect(r.ok).toBe(false)
    expect(r.codigo).toBe("fora_do_seu_papel")
  })

  it("videomaker não finaliza nem encerra", () => {
    for (const alvo of ["entregue_cliente", "postado", "encerrado", "edicao_finalizada"]) {
      expect(mover("editando", alvo, vmDono).ok, `videomaker não pode ${alvo}`).toBe(false)
    }
  })

  it("videomaker não age em job de outro videomaker (§52)", () => {
    const r = mover("videomaker_notificado", "videomaker_aceitou", vmOutro)
    expect(r.ok).toBe(false)
    expect(r.codigo).toBe("nao_e_seu_job")
  })

  it("videomaker sem perfil vinculado não age", () => {
    const semPerfil: ActorTransicao = { ...vmDono, videomakerId: null }
    expect(mover("videomaker_notificado", "videomaker_aceitou", semPerfil).codigo).toBe("nao_e_seu_job")
  })

  it("job sem videomaker atribuído não aceita ação de videomaker", () => {
    const r = mover("videomaker_notificado", "videomaker_aceitou", vmDono, { ...JOB, videomakerId: null })
    expect(r.codigo).toBe("nao_e_seu_job")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe("ações próprias do videomaker (§37.2)", () => {
  it("aceita, recusa, agenda, finaliza captação e envia material no job dele", () => {
    for (const alvo of ACOES_DO_VIDEOMAKER) {
      const r = mover("videomaker_notificado", alvo, vmDono)
      expect(r.ok, `videomaker deveria poder ${alvo}: ${r.motivo}`).toBe(true)
    }
  })

  it("funciona mesmo sem moverKanban — é trabalho, não gestão", () => {
    // 61 dos 63 videomakers têm moverKanban false. Se esta regra caísse, o
    // painel de campo inteiro parava.
    expect(PRESETS.videomaker.moverKanban).toBe(false)
    expect(vmDono.permissoes?.moverKanban).toBe(false)
    expect(mover("videomaker_notificado", "videomaker_aceitou", vmDono).ok).toBe(true)
  })

  it("terceiro executando ação de videomaker fica registrado", () => {
    // O admin confirmando no lugar dele — o que DemandaDetalhe faz hoje.
    const r = mover("videomaker_notificado", "videomaker_aceitou", socialSemRegistro)
    expect(r.ok).toBe(true)
    expect(r.avisos.some((a) => a.startsWith("acao_de_videomaker_por_terceiro"))).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe("status atual igual ao novo", () => {
  // Comportamento definido explicitamente: NÃO é erro (pedir o que já vale é
  // repetição, não violação — §53), mas é no-op para a rota não gravar
  // histórico novo nem repetir notificação. A base tem 46 destes, e hoje cada
  // um dispara WhatsApp outra vez.
  it("passa, marcado como no-op", () => {
    const r = mover("revisao_pendente", "revisao_pendente", gestor)
    expect(r.ok).toBe(true)
    expect(r.noop).toBe(true)
  })

  it("é no-op mesmo quando a precondição não estaria satisfeita", () => {
    // Já está em `brutos_enviados`; repetir não pode exigir o link de novo.
    const semBrutos: JobTransicao = { ...JOB, linkBrutos: null, linkFolderBrutos: null }
    const r = mover("brutos_enviados", "brutos_enviados", gestor, semBrutos)
    expect(r.ok).toBe(true)
    expect(r.noop).toBe(true)
  })

  it("no-op não vale para quem não tem autoridade nenhuma", () => {
    // O no-op é avaliado antes da autoridade de propósito: não há efeito a
    // proteger, e recusar geraria erro numa ação que não muda nada.
    const r = mover("editando", "editando", bloqueado)
    expect(r.ok).toBe(true)
    expect(r.noop).toBe(true)
  })

  it("transição de verdade nunca é no-op", () => {
    expect(mover("editando", "revisao_pendente", gestor).noop).toBeFalsy()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe("precondições de negócio preservadas", () => {
  // Estavam soltas na rota e foram movidas para dentro da guarda. O texto e o
  // efeito têm que ser os mesmos de antes.
  it("brutos_enviados exige link", () => {
    const semBrutos: JobTransicao = { ...JOB, linkBrutos: null, linkFolderBrutos: null }
    const r = mover("captacao_realizada", "brutos_enviados", gestor, semBrutos)
    expect(r.ok).toBe(false)
    expect(r.codigo).toBe("precondicao")
    expect(r.motivo).toContain("Link dos brutos obrigatório")
  })

  it("aceita a pasta do Drive como link de brutos", () => {
    const comPasta: JobTransicao = { ...JOB, linkBrutos: null, linkFolderBrutos: "https://drive/pasta" }
    expect(mover("captacao_realizada", "brutos_enviados", gestor, comPasta).ok).toBe(true)
  })

  it("aceita o link vindo no mesmo PATCH", () => {
    const semBrutos: JobTransicao = { ...JOB, linkBrutos: null, linkFolderBrutos: null }
    const r = mover("captacao_realizada", "brutos_enviados", gestor, semBrutos, { linkBrutos: "https://x" })
    expect(r.ok).toBe(true)
  })

  it("edicao_finalizada exige link do vídeo final", () => {
    const semFinal: JobTransicao = { ...JOB, linkFinal: null }
    const r = mover("editando", "edicao_finalizada", gestor, semFinal)
    expect(r.codigo).toBe("precondicao")
    expect(r.motivo).toContain("Link do vídeo final")
  })

  it("impedimento exige motivo", () => {
    const r = mover("editando", "impedimento", gestor, JOB)
    expect(r.codigo).toBe("precondicao")
    expect(r.motivo).toContain("Motivo do impedimento")
  })

  it("impedimento aceita motivo pela observação do PATCH", () => {
    const r = mover("editando", "impedimento", gestor, JOB, { observacao: "cliente sumiu" })
    expect(r.ok).toBe(true)
  })

  it("precondição é avaliada depois da autoridade", () => {
    // Quem não pode mover recebe 403 por autoridade, não 400 por dado faltando:
    // dizer "falta o link" a quem não tem permissão vaza a regra errada.
    const semBrutos: JobTransicao = { ...JOB, linkBrutos: null, linkFolderBrutos: null }
    expect(mover("captacao_realizada", "brutos_enviados", bloqueado, semBrutos).codigo).toBe("sem_autoridade")
  })
})

import { describe, it, expect } from "vitest"
import { destinatariosDoAviso, mensagemKanban, type DadosAvisoKanban } from "@/lib/kanban-avisos"

// Base com todo mundo vazio: cada teste liga só o que está exercitando.
function base(over: Partial<DadosAvisoKanban> = {}): DadosAvisoKanban {
  return {
    statusNovo: "editando",
    codigo: "VOP-26-0001",
    titulo: "Vídeo institucional",
    telefoneVideomaker: null,
    telefoneEditor: null,
    telefonesExecutores: [],
    telefoneSolicitanteSistema: null,
    telefoneSolicitanteWhatsapp: null,
    telefonesGestores: [],
    telefonesSocial: [],
    autorTelefone: null,
    autorNome: "Alguém",
    autorEhGestor: false,
    ...over,
  }
}

const papeis = (d: ReturnType<typeof destinatariosDoAviso>) => d.map((x) => x.papel)
const fones = (d: ReturnType<typeof destinatariosDoAviso>) => d.map((x) => x.telefone)

describe("executor do Growth", () => {
  it("recebe aviso quando o card entra na fila dele", () => {
    const r = destinatariosDoAviso(base({
      statusNovo: "fila_edicao",
      telefonesExecutores: ["5531988887777"],
    }))
    expect(papeis(r)).toContain("executor")
    expect(r[0].mensagem).toContain("entrou na sua fila")
  })

  it("recebe aviso quando a demanda vai para execução", () => {
    const r = destinatariosDoAviso(base({
      statusNovo: "editando",
      telefonesExecutores: ["5531988887777"],
    }))
    expect(r.find((x) => x.papel === "executor")?.mensagem).toContain("em execução com você")
  })

  it("vários responsáveis recebem, um aviso cada", () => {
    const r = destinatariosDoAviso(base({
      statusNovo: "fila_edicao",
      telefonesExecutores: ["5531988887777", "5531977776666"],
    }))
    expect(r).toHaveLength(2)
    expect(new Set(fones(r)).size).toBe(2)
  })

  it("demanda de Growth sem videomaker nem editor ainda avisa alguém", () => {
    const r = destinatariosDoAviso(base({
      statusNovo: "editando",
      telefoneVideomaker: null,
      telefoneEditor: null,
      telefonesExecutores: ["5531988887777"],
    }))
    expect(r.length).toBeGreaterThan(0)
  })
})

describe("quem mexeu não recebe eco da própria ação", () => {
  it("executor que move o próprio card não se autoavisa", () => {
    const r = destinatariosDoAviso(base({
      statusNovo: "editando",
      telefonesExecutores: ["5531988887777"],
      autorTelefone: "5531988887777",
    }))
    expect(fones(r)).not.toContain("5531988887777")
  })

  it("reconhece o autor mesmo com formatação diferente do cadastro", () => {
    const r = destinatariosDoAviso(base({
      statusNovo: "editando",
      telefonesExecutores: ["5531988887777"],
      autorTelefone: "+55 (31) 98888-7777",
    }))
    expect(r).toHaveLength(0)
  })

  it("o 9º dígito não faz o autor virar outra pessoa", () => {
    // Cadastro com 13 dígitos, JID do WhatsApp com 12 — mesma pessoa.
    const r = destinatariosDoAviso(base({
      statusNovo: "editando",
      telefonesExecutores: ["5531988887777"],
      autorTelefone: "553188887777",
    }))
    expect(r).toHaveLength(0)
  })
})

describe("uma pessoa, uma mensagem", () => {
  it("quem é gestor e solicitante recebe só uma vez", () => {
    const r = destinatariosDoAviso(base({
      statusNovo: "edicao_finalizada",
      telefoneSolicitanteSistema: "5531955554444",
      telefonesGestores: ["5531955554444"],
    }))
    expect(r).toHaveLength(1)
    expect(r[0].papel).toBe("solicitante")   // quem pediu vence a gestão
  })

  it("solicitante do sistema e do WhatsApp no mesmo número não duplica", () => {
    const r = destinatariosDoAviso(base({
      statusNovo: "editando",
      telefoneSolicitanteSistema: "5531955554444",
      telefoneSolicitanteWhatsapp: "31955554444",
    }))
    expect(r).toHaveLength(1)
  })

  it("videomaker que também é o editor recebe só a mensagem de videomaker", () => {
    const r = destinatariosDoAviso(base({
      statusNovo: "aprovado",
      telefoneVideomaker: "5531988887777",
      telefoneEditor: "5531988887777",
    }))
    expect(r).toHaveLength(1)
    expect(r[0].papel).toBe("videomaker")
  })

  it("executor que também é responsável singular não recebe duas vezes", () => {
    const r = destinatariosDoAviso(base({
      statusNovo: "fila_edicao",
      telefonesExecutores: ["5531988887777", "5531988887777"],
    }))
    expect(r).toHaveLength(1)
  })
})

describe("gestão sabe quando o executor mexe", () => {
  it("executor começando o trabalho avisa o gestor", () => {
    const r = destinatariosDoAviso(base({
      statusNovo: "editando",
      telefonesGestores: ["5531911112222"],
      autorNome: "Tatiane",
      autorEhGestor: false,
      autorTelefone: "5531988887777",
    }))
    const g = r.find((x) => x.papel === "gestor")
    expect(g?.mensagem).toContain("Tatiane começou a trabalhar")
  })

  it("gestor movendo card não vira anúncio para os outros gestores", () => {
    const r = destinatariosDoAviso(base({
      statusNovo: "editando",
      telefonesGestores: ["5531911112222"],
      autorEhGestor: true,
      autorTelefone: "5531900001111",
    }))
    expect(papeis(r)).not.toContain("gestor")
  })

  it("a mensagem própria do mapa tem prioridade sobre o aviso de execução", () => {
    const r = destinatariosDoAviso(base({
      statusNovo: "revisao_pendente",
      telefonesGestores: ["5531911112222"],
      autorEhGestor: false,
      autorNome: "Tatiane",
    }))
    expect(r.find((x) => x.papel === "gestor")?.mensagem).toContain("aguardando aprovação")
  })
})

describe("nada é enviado sem motivo", () => {
  it("status sem mensagem para ninguém não gera envio", () => {
    const r = destinatariosDoAviso(base({
      statusNovo: "captacao_realizada",
      telefonesExecutores: ["5531988887777"],
      telefoneSolicitanteSistema: "5531955554444",
      telefonesGestores: ["5531911112222"],
      autorEhGestor: true,
    }))
    expect(r).toHaveLength(0)
  })

  it("telefone vazio ou só pontuação é ignorado", () => {
    const r = destinatariosDoAviso(base({
      statusNovo: "fila_edicao",
      telefonesExecutores: ["", "   ", "()-"],
    }))
    expect(r).toHaveLength(0)
  })

  it("social só é avisado no status de postagem", () => {
    const semPostagem = destinatariosDoAviso(base({
      statusNovo: "editando",
      telefonesSocial: ["5531933332222"],
    }))
    expect(papeis(semPostagem)).not.toContain("social")

    const comPostagem = destinatariosDoAviso(base({
      statusNovo: "postagem_pendente",
      telefonesSocial: ["5531933332222"],
    }))
    expect(papeis(comPostagem)).toContain("social")
  })
})

describe("texto das mensagens", () => {
  it("identifica a demanda por título e código", () => {
    const m = mensagemKanban("editando", "VOP-26-0001", "Vídeo institucional", "executor")
    expect(m).toContain("Vídeo institucional (VOP-26-0001)")
  })

  it("link de aprovação só aparece quando é URL de verdade", () => {
    const comLink = mensagemKanban("revisao_pendente", "V-1", "T", "solicitante", "https://nuflow.space/a/xyz")
    expect(comLink).toContain("https://nuflow.space/a/xyz")

    const semLink = mensagemKanban("revisao_pendente", "V-1", "T", "solicitante", "cliente pediu pressa")
    expect(semLink).toContain("Acesse o sistema")
    expect(semLink).not.toContain("cliente pediu pressa")
  })

  it("impedimento leva o motivo para quem executa", () => {
    const m = mensagemKanban("impedimento", "V-1", "T", "executor", "faltou o material do cliente")
    expect(m).toContain("faltou o material do cliente")
  })
})

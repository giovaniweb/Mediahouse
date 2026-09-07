import { describe, it, expect } from "vitest"
import {
  PRESETS,
  permissaoEfetiva,
  podePermissao,
  type MapaPermissoes,
  type MembroOrg,
} from "@/lib/permissoes"
import { podeTransicionar, type JobTransicao } from "@/lib/job-transicoes"

const ORG = "org-1"
const membro = (papel: string, extras: Partial<MembroOrg> = {}): MembroOrg => ({
  papel,
  organizacaoId: ORG,
  statusUsuario: "ativo",
  ...extras,
})

const resolver = (m: MembroOrg | null, explicita?: Partial<MapaPermissoes> | null, org = ORG) =>
  permissaoEfetiva({ membro: m, permissaoExplicita: explicita ?? null, organizacaoId: org })

// Presets medidos na auditoria de 07/09/2026. Se algum mudar, estes testes
// falham — que é o ponto: a mudança tem que ser deliberada.
describe("os presets que a auditoria mediu", () => {
  it("moverKanban true", () => {
    for (const p of ["admin", "gestor", "lider_audiovisual", "editor", "social", "operacao"]) {
      expect(PRESETS[p].moverKanban, `${p} deveria mover`).toBe(true)
    }
  })
  it("moverKanban false", () => {
    for (const p of ["videomaker", "designer", "analista_crm", "gestor_trafego", "auxiliar_admin", "gestor_eventos", "solicitante"]) {
      expect(PRESETS[p].moverKanban, `${p} não deveria mover`).toBe(false)
    }
  })
})

// ─── 1 e 2: ausência de registro resolve pelo preset ─────────────────────────
describe("1. sem registro + preset true", () => {
  it("social herda e pode mover", () => {
    // As 3 pessoas de `social` sem registro. Fizeram 74 `entregue_cliente`.
    const efetiva = resolver(membro("social"))
    expect(podePermissao(efetiva, "moverKanban")).toBe(true)
  })

  it("operacao herda e pode mover", () => {
    expect(podePermissao(resolver(membro("operacao")), "moverKanban")).toBe(true)
  })
})

describe("2. sem registro + preset false", () => {
  it("solicitante herda e NÃO pode mover", () => {
    // 14 pessoas nesta situação. Não quebra ninguém: elas só criam demanda, e
    // criação não passa pela guarda.
    expect(podePermissao(resolver(membro("solicitante")), "moverKanban")).toBe(false)
  })

  it("designer herda e NÃO pode mover", () => {
    expect(podePermissao(resolver(membro("designer")), "moverKanban")).toBe(false)
  })
})

// ─── 3 e 4: precedência do registro explícito ────────────────────────────────
describe("3. explícito true sobrescreve preset false", () => {
  it("designer com concessão explícita move", () => {
    // Exatamente as 2 pessoas que movem 92 cards no quadro do Growth. Se o
    // preset vencesse, o quadro parava.
    expect(PRESETS.designer.moverKanban).toBe(false)
    const efetiva = resolver(membro("designer"), { moverKanban: true })
    expect(podePermissao(efetiva, "moverKanban")).toBe(true)
  })

  it("as 8 concessões da auditoria continuam valendo", () => {
    const concessoes: Array<[string, number]> = [
      ["videomaker", 2], ["designer", 2], ["gestor_eventos", 2],
      ["gestor_trafego", 1], ["auxiliar_admin", 1],
    ]
    for (const [papel] of concessoes) {
      expect(PRESETS[papel].moverKanban, `${papel} tem preset false`).toBe(false)
      const efetiva = resolver(membro(papel), { moverKanban: true })
      expect(podePermissao(efetiva, "moverKanban"), `${papel} perdeu a concessão`).toBe(true)
    }
    expect(concessoes.reduce((s, [, n]) => s + n, 0)).toBe(8)
  })
})

describe("4. explícito false sobrescreve preset true", () => {
  it("social com recusa declarada não move", () => {
    expect(PRESETS.social.moverKanban).toBe(true)
    expect(podePermissao(resolver(membro("social"), { moverKanban: false }), "moverKanban")).toBe(false)
  })

  it("admin com recusa declarada perde a permissão no mapa", () => {
    // O bypass de admin vive na guarda, não aqui: esta função só resolve o mapa.
    expect(podePermissao(resolver(membro("admin"), { moverKanban: false }), "moverKanban")).toBe(false)
  })
})

// ─── 5: a escalada de privilégio ─────────────────────────────────────────────
describe("5. tipo global admin + papel videomaker na empresa", () => {
  it("recebe as permissões de videomaker, não as de admin", () => {
    // A pessoa real da base. Pelo caminho antigo, /api/me resolvia o preset por
    // `usuario.tipo` e gravava ALL_TRUE numa empresa onde ela é videomaker.
    const efetiva = resolver(membro("videomaker"))
    expect(podePermissao(efetiva, "moverKanban")).toBe(false)
    expect(podePermissao(efetiva, "gerenciarUsuarios")).toBe(false)
    expect(podePermissao(efetiva, "gerenciarConfig")).toBe(false)
    expect(efetiva).toEqual(PRESETS.videomaker)
  })

  it("o tipo global não entra na função — não há por onde vazar", () => {
    // A assinatura não aceita `tipo`. Este teste documenta a decisão: a única
    // fonte de papel é o vínculo com a empresa.
    const efetiva = resolver({ papel: "videomaker", organizacaoId: ORG, statusUsuario: "ativo" })
    expect(efetiva).not.toEqual(PRESETS.admin)
  })

  it("salvo concessão explícita, como manda a regra", () => {
    const efetiva = resolver(membro("videomaker"), { moverKanban: true })
    expect(podePermissao(efetiva, "moverKanban")).toBe(true)
    // Mas só o que foi concedido — não vira admin por isso.
    expect(podePermissao(efetiva, "gerenciarUsuarios")).toBe(false)
  })
})

// ─── 6 a 9: fail-closed ──────────────────────────────────────────────────────
describe("6. membro inativo", () => {
  it("nega mesmo com preset permissivo", () => {
    expect(resolver(membro("admin", { statusUsuario: "inativo" }))).toBeNull()
    expect(resolver(membro("social", { statusUsuario: "inativo" }))).toBeNull()
  })

  it("nega mesmo com concessão explícita", () => {
    // Inatividade vence a permissão explícita: quem saiu não opera.
    expect(resolver(membro("designer", { statusUsuario: "inativo" }), { moverKanban: true })).toBeNull()
  })

  it("status ausente ou desconhecido também nega", () => {
    expect(resolver(membro("admin", { statusUsuario: null }))).toBeNull()
    expect(resolver(membro("admin", { statusUsuario: "suspenso" }))).toBeNull()
  })
})

describe("7. membro inexistente", () => {
  it("sem vínculo, nega", () => {
    expect(resolver(null)).toBeNull()
    expect(permissaoEfetiva({ membro: undefined, organizacaoId: ORG })).toBeNull()
  })
})

describe("8. papel desconhecido", () => {
  it("papel sem preset nega — não vira liberado nem silenciosamente vazio", () => {
    expect(resolver(membro("papel_que_nao_existe"))).toBeNull()
  })

  it("papel ausente nega", () => {
    expect(resolver(membro(""))).toBeNull()
    expect(resolver({ papel: null, organizacaoId: ORG, statusUsuario: "ativo" })).toBeNull()
  })

  it("papel desconhecido nega mesmo com registro explícito", () => {
    // O registro não substitui o vínculo válido: sem papel conhecido não há
    // base sobre a qual aplicar a precedência.
    expect(resolver(membro("papel_que_nao_existe"), { moverKanban: true })).toBeNull()
  })
})

describe("9. organização incorreta", () => {
  it("vínculo de outra empresa não autoriza aqui", () => {
    // A pessoa da base que participa de mais de uma empresa. Sem esta
    // conferência, ela levaria o papel da empresa errada.
    expect(resolver(membro("admin", { organizacaoId: "org-outra" }))).toBeNull()
  })

  it("sem empresa ativa, nega", () => {
    expect(permissaoEfetiva({ membro: membro("admin"), organizacaoId: null })).toBeNull()
    expect(permissaoEfetiva({ membro: membro("admin"), organizacaoId: "" })).toBeNull()
  })
})

describe("higiene do mapa", () => {
  it("campos do registro do Prisma não vazam para o mapa de permissões", () => {
    const comLixo = {
      moverKanban: true,
      id: "perm-1", usuarioId: "u-1", organizacaoId: ORG,
    } as unknown as Partial<MapaPermissoes>
    const efetiva = resolver(membro("videomaker"), comLixo)!
    expect(efetiva.moverKanban).toBe(true)
    expect("id" in efetiva).toBe(false)
    expect("usuarioId" in efetiva).toBe(false)
  })

  it("registro antigo sem chaves novas cai no preset para elas", () => {
    // Registros nasceram em épocas diferentes; chave que não existe na linha
    // não pode virar `undefined` no mapa.
    const efetiva = resolver(membro("editor"), { moverKanban: false })!
    expect(efetiva.moverKanban).toBe(false)
    expect(efetiva.verDashboard).toBe(PRESETS.editor.verDashboard)
  })

  it("podePermissao trata null como negação", () => {
    expect(podePermissao(null, "moverKanban")).toBe(false)
  })
})

// ─── 10 e 11: a guarda consumindo a permissão efetiva ────────────────────────
describe("10. Transition Guard usando a permissão efetiva", () => {
  const JOB: JobTransicao = {
    videomakerId: "vm-1", editorId: "ed-1",
    linkBrutos: "https://x", linkFolderBrutos: null,
    linkFinal: "https://x.mp4", motivoImpedimento: null,
  }
  const guarda = (papel: string, explicita?: Partial<MapaPermissoes> | null, extras: { statusUsuario?: string; org?: string; videomakerId?: string | null } = {}) =>
    podeTransicionar({
      statusAtual: "editando",
      novoStatus: "revisao_pendente",
      usuario: {
        id: "u-1", papel, videomakerId: extras.videomakerId ?? null,
        permissoes: permissaoEfetiva({
          membro: { papel, organizacaoId: extras.org ?? ORG, statusUsuario: extras.statusUsuario ?? "ativo" },
          permissaoExplicita: explicita ?? null,
          organizacaoId: ORG,
        }),
      },
      demanda: JOB,
    })

  it("herda o preset e permite (social, sem registro)", () => {
    expect(guarda("social").ok).toBe(true)
  })

  it("herda o preset e nega (solicitante, sem registro)", () => {
    const r = guarda("solicitante")
    expect(r.ok).toBe(false)
    expect(r.codigo).toBe("sem_autoridade")
  })

  it("concessão explícita destrava quem o preset travaria", () => {
    expect(guarda("designer").ok).toBe(false)
    expect(guarda("designer", { moverKanban: true }).ok).toBe(true)
  })

  it("inativo é negado mesmo sendo admin", () => {
    const r = guarda("admin", null, { statusUsuario: "inativo" })
    expect(r.ok).toBe(false)
    expect(r.codigo).toBe("sem_autoridade")
    expect(r.avisos).toContain("permissao_indeterminada")
  })

  it("vínculo de outra empresa é negado mesmo sendo admin", () => {
    const r = guarda("admin", null, { org: "org-outra" })
    expect(r.ok).toBe(false)
    expect(r.avisos).toContain("permissao_indeterminada")
  })

  it("papel desconhecido é negado", () => {
    expect(guarda("papel_inventado").ok).toBe(false)
  })

  it("não existe mais caminho tolerante", () => {
    // O ramo `autoridade_nao_declarada` saiu. Nenhum papel, com ou sem
    // registro, produz aviso de tolerância.
    for (const papel of Object.keys(PRESETS)) {
      const r = guarda(papel)
      expect(r.avisos.some((a) => a.startsWith("autoridade_nao_declarada")), papel).toBe(false)
    }
  })
})

describe("11. preservação das concessões explícitas", () => {
  it("preset nunca sobrescreve registro explícito", () => {
    // A regra em uma frase. Vale nos dois sentidos.
    for (const papel of Object.keys(PRESETS)) {
      const presetVale = PRESETS[papel].moverKanban
      const contrario = !presetVale
      const efetiva = resolver(membro(papel), { moverKanban: contrario })
      expect(podePermissao(efetiva, "moverKanban"), `${papel}: preset venceu o explícito`).toBe(contrario)
    }
  })

  it("registro parcial só sobrescreve o que declara", () => {
    const efetiva = resolver(membro("solicitante"), { moverKanban: true })!
    expect(efetiva.moverKanban).toBe(true)
    // O resto continua sendo o preset de solicitante.
    expect(efetiva.gerenciarUsuarios).toBe(false)
    expect(efetiva.criarDemanda).toBe(PRESETS.solicitante.criarDemanda)
  })
})

// ─── O bypass de gestão não pode vir da sessão ───────────────────────────────
describe("bypass de gestão sai do vínculo, não do token", () => {
  const JOB: JobTransicao = {
    videomakerId: "vm-1", editorId: null,
    linkBrutos: "https://x", linkFolderBrutos: null,
    linkFinal: "https://x.mp4", motivoImpedimento: null,
  }

  it("papel `admin` sem permissão efetiva não bypassa", () => {
    // O cenário do token velho: `auth.ts:88` grava `papel ?? usuario.tipo`, e
    // um JWT emitido sem membership carrega o tipo GLOBAL. Se a guarda
    // recebesse esse papel com permissões indeterminadas, o bypass de gestão
    // abriria tudo. A ordem das checagens impede.
    const r = podeTransicionar({
      statusAtual: "editando",
      novoStatus: "aprovado",
      usuario: { id: "u-1", papel: "admin", permissoes: null, videomakerId: null },
      demanda: JOB,
    })
    expect(r.ok).toBe(false)
    expect(r.avisos).toContain("permissao_indeterminada")
  })

  it("papel do vínculo manda: videomaker com permissões de videomaker é barrado", () => {
    // A pessoa real: tipo global admin, papel videomaker na empresa.
    const r = podeTransicionar({
      statusAtual: "editando",
      novoStatus: "aprovado",
      usuario: {
        id: "u-1", papel: "videomaker", videomakerId: "vm-1",
        permissoes: permissaoEfetiva({
          membro: { papel: "videomaker", organizacaoId: ORG, statusUsuario: "ativo" },
          organizacaoId: ORG,
        }),
      },
      demanda: JOB,
    })
    expect(r.ok).toBe(false)
    expect(r.codigo).toBe("fora_do_seu_papel")
  })
})

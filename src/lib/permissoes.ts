/**
 * Sistema de Permissões Configuráveis
 * Cada usuário tem um registro PermissaoUsuario com checkboxes.
 * Gestor/admin podem editar qualquer permissão via UI.
 */

// Preset padrão por tipo de usuário (aplicado ao criar usuário se não houver permissões)
export type PermissaoKey =
  | "verDashboard"
  | "verDemandas"
  | "verAprovacoes"
  | "verAprovacoesGrowth"
  | "verAgenda"
  | "verProdutos"
  | "verVideomakers"
  | "verEquipe"
  | "verCustos"
  | "verIA"
  | "verAlertas"
  | "verRelatorios"
  | "verUsuarios"
  | "verConfiguracoes"
  | "verIdeias"
  | "verEventos"
  | "verCoberturas"
  | "verFinanceiroEvento"
  | "gerenciarFornecedores"
  | "verDesign"
  | "gerenciarDesigners"
  | "criarDemanda"
  | "editarDemanda"
  | "excluirDemanda"
  | "moverKanban"
  | "verTodasDemandas"
  | "verKanban"
  | "gerenciarUsuarios"
  | "gerenciarConfig"

export const PERMISSAO_LABELS: Record<PermissaoKey, string> = {
  verDashboard: "Ver Dashboard",
  verDemandas: "Ver Demandas",
  verAprovacoes: "Aprovações · Audiovisual",
  verAprovacoesGrowth: "Aprovações · Growth",
  verAgenda: "Ver Agenda",
  verProdutos: "Ver Produtos",
  verVideomakers: "Ver Videomakers Ext",
  verEquipe: "Ver Videomakers Int",
  verCustos: "Ver Custos",
  verIA: "Ver Central IA",
  verAlertas: "Ver Alertas IA",
  verRelatorios: "Ver Relatórios",
  verUsuarios: "Ver Usuários",
  verConfiguracoes: "Ver Configurações",
  verIdeias: "Ver Banco de Ideias",
  verEventos: "Ver Eventos (Gestão)",
  verCoberturas: "Ver Coberturas (Audiovisual)",
  verFinanceiroEvento: "Ver Financeiro de Eventos",
  gerenciarFornecedores: "Gerenciar Fornecedores",
  verDesign: "Ver Growth / Conteúdos",
  gerenciarDesigners: "Gerenciar equipe criativa",
  criarDemanda: "Criar Demanda",
  editarDemanda: "Editar Demanda",
  excluirDemanda: "Excluir Demanda",
  moverKanban: "Mover Kanban",
  verTodasDemandas: "Ver Todas Demandas",
  verKanban: "Ver como Kanban",
  gerenciarUsuarios: "Gerenciar Usuários",
  gerenciarConfig: "Gerenciar Configurações",
}

export const PERMISSAO_GRUPOS = [
  {
    label: "Páginas",
    keys: [
      "verDashboard",
      "verDemandas",
      "verAprovacoes",
      "verAprovacoesGrowth",
      "verAgenda",
      "verProdutos",
      "verVideomakers",
      "verEquipe",
      "verCustos",
      "verIA",
      "verAlertas",
      "verRelatorios",
      "verUsuarios",
      "verConfiguracoes",
      "verIdeias",
    ] as PermissaoKey[],
  },
  {
    label: "Growth / Criativos",
    keys: [
      "verDesign",
      "gerenciarDesigners",
    ] as PermissaoKey[],
  },
  {
    label: "Eventos",
    keys: [
      "verEventos",
      "verCoberturas",
      "verFinanceiroEvento",
      "gerenciarFornecedores",
    ] as PermissaoKey[],
  },
  {
    label: "Ações em Demandas",
    keys: [
      "criarDemanda",
      "editarDemanda",
      "excluirDemanda",
      "moverKanban",
      "verTodasDemandas",
      "verKanban",
    ] as PermissaoKey[],
  },
  {
    label: "Administração",
    keys: ["gerenciarUsuarios", "gerenciarConfig"] as PermissaoKey[],
  },
]

// Presets — o que cada tipo de usuário recebe por padrão
type PresetPerms = Record<PermissaoKey, boolean>

export const BASE_FALSE: PresetPerms = {
  verDashboard: false,
  verDemandas: false,
  verAprovacoes: false,
  verAprovacoesGrowth: false,
  verAgenda: false,
  verProdutos: false,
  verVideomakers: false,
  verEquipe: false,
  verCustos: false,
  verIA: false,
  verAlertas: false,
  verRelatorios: false,
  verUsuarios: false,
  verConfiguracoes: false,
  verIdeias: false,
  verEventos: false,
  verCoberturas: false,
  verFinanceiroEvento: false,
  gerenciarFornecedores: false,
  verDesign: false,
  gerenciarDesigners: false,
  criarDemanda: false,
  editarDemanda: false,
  excluirDemanda: false,
  moverKanban: false,
  verTodasDemandas: false,
  verKanban: false,
  gerenciarUsuarios: false,
  gerenciarConfig: false,
}

const ALL_TRUE: PresetPerms = Object.fromEntries(
  Object.keys(BASE_FALSE).map((k) => [k, true])
) as PresetPerms

export const PRESETS: Record<string, PresetPerms> = {
  admin: ALL_TRUE,
  gestor: ALL_TRUE,

  // Líder audiovisual — autonomia sobre as demandas do audiovisual: edita, move,
  // vê todas, aprova. (Aplicado ao marcar "Líder audiovisual" em Pessoas & Acessos.)
  lider_audiovisual: {
    ...BASE_FALSE,
    verDashboard: true,
    verDemandas: true,
    verKanban: true,
    verTodasDemandas: true,
    verAgenda: true,
    verProdutos: true,
    verCoberturas: true,
    verAprovacoes: true,
    verAprovacoesGrowth: true,
    criarDemanda: true,
    editarDemanda: true,
    excluirDemanda: true,
    moverKanban: true,
  },

  // Videomaker interno (editor) — dashboard, demandas, agenda, produtos
  editor: {
    ...BASE_FALSE,
    verDashboard: true,
    verDemandas: true,
    verAgenda: true,
    verProdutos: true,
    verCoberturas: true,
    criarDemanda: true,
    editarDemanda: true,
    excluirDemanda: true,
    moverKanban: true,
    verKanban: true,
    verTodasDemandas: true,
  },

  // Social Media (Growth) — conteúdo: demandas, artes, ideias
  social: {
    ...BASE_FALSE,
    verDashboard: true,
    verDemandas: true,
    verAgenda: true,
    verProdutos: true,
    verCoberturas: true,
    verDesign: true,
    verIdeias: true,
    criarDemanda: true,
    editarDemanda: true,
    excluirDemanda: true,
    moverKanban: true,
    verKanban: true,
    verTodasDemandas: true,
  },

  // Analista CRM (Growth) — análise: relatórios, alertas, ideias
  analista_crm: {
    ...BASE_FALSE,
    verDashboard: true,
    verRelatorios: true,
    verAlertas: true,
    verIdeias: true,
    verTodasDemandas: true,
  },

  // Gestor de Tráfego (Growth) — criativos + análise
  gestor_trafego: {
    ...BASE_FALSE,
    verDashboard: true,
    verRelatorios: true,
    verIdeias: true,
    verProdutos: true,
    verDesign: true,
    verTodasDemandas: true,
  },

  // Auxiliar Admin (Growth) — apoio amplo, sem financeiro/usuários/config
  auxiliar_admin: {
    ...BASE_FALSE,
    verDashboard: true,
    verDemandas: true,
    verAprovacoes: true,
    verAprovacoesGrowth: true,
    verAgenda: true,
    verProdutos: true,
    verIdeias: true,
    verDesign: true,
    verEventos: true,
    verCoberturas: true,
    gerenciarFornecedores: true,
    verRelatorios: true,
    verTodasDemandas: true,
  },

  // Gestor de Eventos — gestão de eventos + acompanha os cards do evento nos
  // quadros do departamento (Audiovisual/Growth), só leitura (não move).
  gestor_eventos: {
    ...BASE_FALSE,
    verDashboard: true,
    verAgenda: true,
    verEventos: true,
    verCoberturas: true,
    verFinanceiroEvento: true,
    gerenciarFornecedores: true,
    verDemandas: true,
    verDesign: true,
    verTodasDemandas: true,
  },

  // Videomaker externo — dashboard dele, demandas dele, feedbacks, perfil
  videomaker: {
    ...BASE_FALSE,
    verDashboard: true,
    verDemandas: true,
    verKanban: false, // visualização em cards, não kanban
    // Vê o quadro do audiovisual inteiro; a rota o prende a `area=audiovisual`,
    // então o Growth continua fora do alcance.
    verTodasDemandas: true,
  },

  // Designer — dashboard dele + quadro de artes (área design)
  designer: {
    ...BASE_FALSE,
    verDashboard: true,
    verDesign: true,
    verKanban: false,
    verTodasDemandas: true,
  },

  // Operação
  operacao: {
    ...BASE_FALSE,
    verDashboard: true,
    verDemandas: true,
    verAprovacoes: true,
    verAprovacoesGrowth: true,
    verAgenda: true,
    verProdutos: true,
    verCoberturas: true,
    criarDemanda: true,
    editarDemanda: true,
    moverKanban: true,
    verTodasDemandas: true,
    verKanban: true,
  },

  // Solicitante — só cria e vê as próprias
  solicitante: {
    ...BASE_FALSE,
    verDashboard: true,
    verDemandas: true,
    criarDemanda: true,
  },
}

// Mapeia permissão de página → href da sidebar
export const PERMISSAO_HREF_MAP: Record<string, PermissaoKey> = {
  "/dashboard": "verDashboard",
  "/demandas": "verDemandas",
  // O quadro de Jobs lê a mesma coisa que /demandas; reusa a permissão em vez
  // de criar uma chave nova que ninguém teria marcada.
  "/jobs": "verDemandas",
  "/aprovacoes": "verAprovacoes",
  "/aprovacoes/growth": "verAprovacoesGrowth",
  "/agenda": "verAgenda",
  "/produtos": "verProdutos",
  "/videomakers": "verVideomakers",
  "/equipe": "verEquipe",
  "/custos": "verCustos",
  "/ia": "verIA",
  "/alertas": "verAlertas",
  "/relatorios": "verRelatorios",
  "/relatorios/finalizadas-sem-video": "verRelatorios",
  "/usuarios": "verUsuarios",
  "/configuracoes": "verConfiguracoes",
  "/ideias": "verIdeias",
  "/eventos": "verEventos",
  "/coberturas": "verCoberturas",
  "/fornecedores": "gerenciarFornecedores",
  "/produtos-servico": "gerenciarFornecedores",
  "/design": "verDesign",
  "/galeria-artes": "verDesign",
  "/growth/equipe": "gerenciarDesigners",
  "/configuracoes/linhas-projetos": "gerenciarDesigners",
}

// ─────────────────────────────────────────────────────────────────────────────
// PERMISSÃO EFETIVA — a resolução única de "o que esta pessoa pode nesta empresa"
//
// Antes disto havia três respostas diferentes para a mesma pergunta:
//
//   /api/me              materializava o preset de `usuario.tipo` (GLOBAL)
//   /api/permissoes      materializava o preset de `membro.papel` (POR EMPRESA)
//   job-transicoes       lia a tabela direto e tratava ausência como negação
//
// A auditoria de 07/09/2026 mediu o estrago: 19 das 103 memberships não têm
// linha em `permissoes_usuario`, e nenhuma delas é negação deliberada — é login
// que ainda não aconteceu, porque a linha nasce sozinha na primeira carga do
// app. Tratar `null` como "não pode" era negar por acidente de cadastro.
//
// A regra, agora em um lugar só:
//
//     registro explícito  →  vence sempre
//     sem registro        →  preset de membro.papel
//     não dá para saber   →  NEGA (devolve null)
//
// `usuario.tipo` não participa. É coluna global: promover alguém a admin numa
// empresa o tornava admin em todas as outras — exatamente o que
// `src/lib/papel.ts` foi criado para fechar. A base tem 1 pessoa com
// `tipo = admin` e `papel = videomaker`; pelo caminho antigo do /api/me, um
// registro faltante lhe daria ALL_TRUE numa empresa onde ela é videomaker.
// ─────────────────────────────────────────────────────────────────────────────

export type MapaPermissoes = PresetPerms

/** O vínculo da pessoa com a empresa. É daqui que sai a autoridade. */
export type MembroOrg = {
  /** `UsuarioOrganizacao.papel` — nunca `Usuario.tipo`. */
  papel: string | null | undefined
  /** A empresa deste vínculo, conferida contra a empresa ativa. */
  organizacaoId: string | null | undefined
  /** `Usuario.status`. Inativo não recebe autorização, preset nenhum. */
  statusUsuario: string | null | undefined
}

/**
 * A permissão efetiva, ou `null` quando não se pode determinar com segurança.
 *
 * `null` significa NEGAR. É o tipo que força o chamador a decidir — um
 * `MapaPermissoes` com tudo falso seria confundível com "papel sem acesso", e
 * as duas coisas merecem tratamento diferente no log.
 *
 * Nega quando falta organização, falta vínculo, o vínculo é de outra empresa,
 * a pessoa está inativa, não há papel, ou o papel não tem preset conhecido.
 */
export function permissaoEfetiva(entrada: {
  membro: MembroOrg | null | undefined
  /** A linha de `permissoes_usuario`, quando existe. Tem precedência total. */
  permissaoExplicita?: Partial<MapaPermissoes> | null
  /** A empresa ativa da requisição. */
  organizacaoId: string | null | undefined
}): MapaPermissoes | null {
  const { membro, permissaoExplicita, organizacaoId } = entrada

  // ── Fail-closed: os quatro "não dá para saber" ────────────────────────────
  if (!organizacaoId) return null
  if (!membro) return null
  // Vínculo de OUTRA empresa não autoriza nada aqui. Sem esta conferência, quem
  // participa de duas empresas levaria o papel da errada — é a mesma classe de
  // vazamento que o `papel` por empresa resolveu.
  if (membro.organizacaoId !== organizacaoId) return null
  // Inativo não recebe autorização, venha de preset ou de registro explícito.
  if (membro.statusUsuario !== "ativo") return null
  if (!membro.papel) return null

  const preset = PRESETS[membro.papel]
  // Papel sem preset conhecido não vira "tudo liberado" nem "tudo negado por
  // omissão": vira recusa explícita, para aparecer no log em vez de passar.
  if (!preset) return null

  // ── Precedência: o registro explícito vence ───────────────────────────────
  // A auditoria achou 8 concessões que divergem do preset (2 videomakers, 2
  // designers, 2 gestor_eventos, 1 gestor_trafego, 1 auxiliar_admin). Os 2
  // designers com `moverKanban: true` são quem move 92 cards no quadro do
  // Growth. Deixar o preset sobrescrever isso pararia o quadro.
  if (permissaoExplicita) {
    // Merge sobre o preset para tolerar registro de época anterior, a que
    // faltem chaves criadas depois. As chaves presentes mandam.
    return { ...preset, ...somenteBooleanos(permissaoExplicita) }
  }

  return preset
}

/**
 * Fica só com as chaves de permissão booleanas.
 *
 * `PermissaoUsuario` do Prisma carrega `id`, `usuarioId`, `organizacaoId` e
 * datas junto dos checkboxes. Espalhar o registro inteiro por cima do preset
 * injetaria esses campos no mapa de permissões.
 */
function somenteBooleanos(registro: Partial<MapaPermissoes>): Partial<MapaPermissoes> {
  const limpo: Partial<MapaPermissoes> = {}
  for (const chave of Object.keys(BASE_FALSE) as PermissaoKey[]) {
    const valor = (registro as Record<string, unknown>)[chave]
    if (typeof valor === "boolean") limpo[chave] = valor
  }
  return limpo
}

/** Atalho para uma permissão só. `null` (indeterminado) é negação. */
export function podePermissao(
  efetiva: MapaPermissoes | null,
  chave: PermissaoKey
): boolean {
  return efetiva?.[chave] === true
}

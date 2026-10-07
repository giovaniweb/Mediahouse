// Catálogo de módulos e o que cada um cobre.
//
// Até 25/08/2026 isto era quatro booleanos em código, iguais para todas as
// empresas: desligar Eventos de um cliente significava desligar de todos, e
// subir deploy. Com o SaaS, cada assinatura compra um conjunto diferente.
//
// A separação que importa:
//
//   DISPONIVEL_NA_PLATAFORMA  o módulo existe como produto? `false` esconde de
//                             TODO MUNDO, inclusive de quem já pagou — é chave
//                             geral, não plano. Serve para código que ainda não
//                             está pronto para cliente nenhum.
//
//   PADRAO_MODULOS            para uma empresa que nunca teve o módulo decidido
//                             explicitamente. Empresa nova nasce com isto, sem
//                             precisar de INSERT nenhum.
//
// O ligado/desligado POR EMPRESA vive no banco (ModuloOrganizacao) e é lido por
// src/lib/modulos-org.ts. Aqui não há estado de cliente.

export type Modulo = "growth" | "eventos" | "ideias" | "mensagens" | "cutflow"

export const MODULOS: { chave: Modulo; nome: string; descricao: string }[] = [
  { chave: "growth", nome: "Growth / Conteúdos", descricao: "Área de design, kanban próprio e galeria de criativos." },
  { chave: "eventos", nome: "Eventos", descricao: "Coberturas, portal de campo, fornecedores e produtos de evento." },
  { chave: "ideias", nome: "Banco de Ideias", descricao: "Registro de ideias que viram demanda." },
  { chave: "mensagens", nome: "Mensagens", descricao: "Central de mensagens do WhatsApp." },
  { chave: "cutflow", nome: "Cutflow", descricao: "Plugin do Premiere que edita os cards atribuídos ao editor Cutflow." },
]

/**
 * Existe como produto? `false` esconde de todo mundo, inclusive de quem
 * comprou. Eventos segue indisponível: o código existe e os dados também, mas
 * o módulo não está pronto para ser vendido.
 *
 * Ideias desligado em 09/09/2026 para o piloto: a base tinha dois registros, um
 * deles descartado, e a tela ainda anunciava "Todas (1)". Um destino de menu
 * permanente custa mais atenção do que devolve enquanto for isso. Os registros
 * continuam no banco — desligar módulo esconde rota, não apaga dado.
 */
export const DISPONIVEL_NA_PLATAFORMA: Record<Modulo, boolean> = {
  growth: true,
  eventos: false,
  ideias: false,
  mensagens: false,
  cutflow: true,
}

/** O que uma empresa recebe quando ninguém decidiu nada para ela. */
export const PADRAO_MODULOS: Record<Modulo, boolean> = {
  growth: true,
  eventos: false,
  ideias: false,
  mensagens: false,
  // Cutflow (30/09/2026): começa desligado. Por ora é do time e de pessoas de
  // confiança; liga por empresa quando a assinatura incluir o plugin.
  cutflow: false,
}

// Rotas (páginas + APIs) de cada módulo. O bloqueio cobre o caminho exato e
// tudo abaixo dele.
export const ROTAS_POR_MODULO: Record<Modulo, string[]> = {
  growth: ["/design", "/galeria-artes", "/historico/growth"],
  // Coberturas e o portal de campo entraram aqui em 09/09/2026. O módulo já
  // estava indisponível e a descrição já dizia "Coberturas" — só faltava a rota
  // na lista, então `/coberturas` seguiu no ar enquanto `/eventos` sumia. O
  // portal `/campo` vem junto porque é uma casca de coberturas: das cinco
  // chamadas que ele faz, três são /api/coberturas.
  //
  // `/api/publico/cobertura/**` fica DE FORA de propósito: é o link que o
  // cliente já recebeu. Desligar o módulo não pode quebrar o que já foi enviado.
  eventos: [
    "/eventos", "/fornecedores", "/produtos-servico", "/coberturas", "/campo",
    "/api/eventos", "/api/fornecedores", "/api/produtos-servico",
    "/api/coberturas", "/api/campo",
  ],
  ideias: ["/ideias", "/api/ideias"],
  // Só a página; NÃO bloquear /api/whatsapp, usado pelas notificações automáticas.
  mensagens: ["/mensagens"],
  // As rotas do plugin conferem o módulo por empresa na própria rota (a sessão do
  // plugin é Bearer, não cookie). A página de autorização também.
  cutflow: ["/cutflow", "/api/cutflow"],
}

/** A que módulo um caminho pertence, se pertencer a algum. */
export function moduloDaRota(pathname: string): Modulo | null {
  for (const [chave, rotas] of Object.entries(ROTAS_POR_MODULO) as [Modulo, string[]][]) {
    if (rotas.some((p) => pathname === p || pathname.startsWith(p + "/"))) return chave
  }
  return null
}

/**
 * O caminho é de um módulo que esta empresa NÃO tem? É a pergunta do menu, e a
 * de todo botão que leva para fora da tela (ex.: "Abrir evento" no detalhe da
 * demanda): um botão para rota bloqueada só devolve a pessoa ao Dashboard.
 *
 * `modulos` indefinido = perfil ainda carregando, e aí a resposta é "não se
 * sabe" (false). O menu prefere mostrar a piscar; um botão que leva a módulo
 * deve esperar o perfil (`modulos && !rotaDeModuloDesligado(...)`).
 */
export function rotaDeModuloDesligado(pathname: string, modulos: Partial<Record<Modulo, boolean>> | null | undefined): boolean {
  const modulo = moduloDaRota(pathname)
  return modulo !== null && !!modulos && !modulos[modulo]
}

/**
 * Bloqueio GLOBAL — o que nem existe como produto.
 *
 * É o que roda no middleware (`auth.config.ts`), que é edge-safe e não fala com
 * o Prisma: ali só dá para saber o que está desligado para todo mundo. O
 * desligado por EMPRESA é conferido do lado Node, em modulos-org.ts.
 */
export function rotaIndisponivelNaPlataforma(pathname: string): boolean {
  const modulo = moduloDaRota(pathname)
  return modulo !== null && !DISPONIVEL_NA_PLATAFORMA[modulo]
}

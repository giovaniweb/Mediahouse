// Quem é avisado quando um card muda de coluna — e com que texto.
//
// Mora fora da rota porque é a parte que erra calado: uma matriz de status ×
// papéis, mais as regras de "não avisar duas vezes" e "não avisar quem mexeu".
// Aqui é função pura, sem banco e sem rede, então dá para testar de verdade
// (tests/unit/kanban-avisos.spec.ts) em vez de descobrir em produção que o
// executor do Growth nunca recebeu nada — que foi exatamente o que aconteceu.

import { entregaPecaVisual } from "@/lib/growth-conteudo"
import { variar } from "@/lib/variacao"
import { arteDoKanban, arteDoParabens, type FamiliaArte } from "@/lib/avisos-arte"

export type DestinatarioKanban =
  | "videomaker" | "solicitante" | "gestor" | "editor" | "executor"

/**
 * Status que têm aviso definido. Existe para ser conferida contra o enum do
 * Prisma no teste: já houve um aviso escrito para "aguardando_aprovacao_cliente",
 * status que nunca existiu — a chave não casava com nada e a mensagem com o
 * link de aprovação simplesmente nunca era enviada, sem erro nenhum.
 */
export const STATUS_COM_AVISO_KANBAN = [
  "videomaker_notificado", "videomaker_aceitou", "videomaker_recusou",
  "captacao_agendada", "brutos_enviados", "fila_edicao", "editando",
  "edicao_finalizada", "revisao_pendente", "aprovado", "ajuste_solicitado",
  "postado", "entregue_cliente", "impedimento",
] as const

// Variantes de celebração — só para quem PRODUZIU. Quem pediu e a gestão
// continuam com texto fixo: para eles o aviso é informação, não reconhecimento.
// Edição pronta (edicao_finalizada): quem fez entregou a parte dele.
const ENTREGUE_QUEM_FEZ = (ref: string) => [
  `🎉 ${ref} entregue. Valeu!`,
  `✔️ ${ref} fechada. Uma a menos na lista 😉`,
  `🙌 Entrega de ${ref} concluída. Obrigado!`,
  `📦 ${ref} entregue e fora da sua fila.`,
]

const APROVADO_QUEM_FEZ = (ref: string) => [
  `🏆 O cliente aprovou ${ref}. Ótimo trabalho!`,
  `✅ Aprovado! ${ref} passou sem ajuste. Mandou bem 👏`,
  `🎯 ${ref} aprovado de primeira. Trabalho bem feito.`,
  `💚 O cliente gostou de ${ref}. Valeu pelo capricho!`,
]


/**
 * Texto do aviso para um papel, ou null quando esse papel não precisa saber
 * dessa mudança.
 *
 * "executor" é quem toca a demanda no Growth (responsável interno ou designer).
 * O mapa só conhecia videomaker e editor — campos do audiovisual —, então mover
 * um card de Growth não avisava a pessoa que ia fazer o trabalho.
 */
export function mensagemKanban(
  statusNovo: string,
  codigo: string,
  titulo: string,
  destinatario: DestinatarioKanban,
  extra?: string,
  /** Demanda de Growth (arte, não vídeo). Muda o substantivo do aviso. */
  isGrowth = false,
  /** O que o solicitante vai abrir: a página de aprovação ou o arquivo final.
   *  Vem explícito porque `extra` também carrega observação — e uma observação
   *  escrita à mão fazia o link sumir da mensagem. */
  linkAprovacao?: string | null
): string | null {
  // Identifica a demanda no meio da frase, não como bloco de campos rotulados.
  const ref = `${titulo} (${codigo})`
  // `extra` chega como observação OU como link final (ver chamador). Só vale
  // como link se de fato for uma URL — senão viraria uma observação apresentada
  // como se fosse clicável.
  const ehUrl = (v?: string | null) => !!v && /^https?:\/\//i.test(v)
  const link = ehUrl(linkAprovacao) ? linkAprovacao! : (ehUrl(extra) ? extra! : null)
  // "Seu vídeo" chegava a quem pediu uma arte. O aviso é o único texto do
  // sistema que o solicitante lê, e chamar a peça dele de vídeo é dizer que
  // ninguém olhou o pedido.
  const aPeca = isGrowth ? "A sua arte" : "O seu vídeo"
  const oQueFazer = isGrowth ? "Confira e aprove" : "Assista e aprove"
  // Semente por demanda + estado: a mesma demanda no mesmo ponto devolve sempre
  // a mesma frase, então reenviar não parece um aviso novo. Demandas diferentes
  // é que soam diferentes.
  const v = (opcoes: string[]) => variar(opcoes, `${codigo}:${statusNovo}:${destinatario}`)
  type Mapa = Record<string, Partial<Record<DestinatarioKanban, string | null>>>

  // Mesma voz dos templates de src/lib/whatsapp.ts: primeira linha diz o que
  // aconteceu e o que fazer, um emoji, sem cabeçalho repetindo a marca.
  const mapa: Mapa = {
    videomaker_notificado: {
      videomaker: `🎬 Você foi escalado para ${ref}.\n\nResponda *SIM* para confirmar ou *NÃO* para recusar.`,
      solicitante: `🎬 Já temos um profissional para ${ref}. Avisamos assim que ele confirmar.`,
    },
    videomaker_aceitou: {
      solicitante: `✅ Captação de ${ref} confirmada pelo profissional.`,
      gestor: `✅ Videomaker aceitou ${ref}.`,
    },
    videomaker_recusou: {
      solicitante: `⏳ Estamos trocando o profissional de ${ref}. Avisamos em breve.`,
      gestor: `⚠️ Videomaker recusou ${ref} — precisa escalar outro.`,
    },
    captacao_agendada: {
      videomaker: `📅 Captação de ${ref} agendada.${extra ? `\n\n${extra}` : ""}`,
      solicitante: `📅 A captação de ${ref} foi agendada.${extra ? `\n\n${extra}` : ""}`,
    },
    brutos_enviados: {
      gestor: `📤 Brutos de ${ref} chegaram e seguiram para edição.`,
      editor: `📦 Os brutos de ${ref} chegaram — pode começar a edição.`,
    },
    // "Para fazer" no kanban do Growth. Não existia no mapa: o card entrava na
    // fila de alguém e essa pessoa não ficava sabendo.
    fila_edicao: {
      editor: `📋 ${ref} entrou na sua fila.`,
      executor: `📋 ${ref} entrou na sua fila.`,
    },
    editando: {
      solicitante: `✂️ ${ref} entrou em edição. Avisamos quando ficar pronto.`,
      editor: `✂️ ${ref} está com você para editar.`,
      executor: `▶️ ${ref} está em execução com você.`,
    },
    edicao_finalizada: {
      solicitante: isGrowth
        ? `🎨 ${ref} ficou pronta. Já já mandamos o link para você aprovar.`
        : `🎥 A edição de ${ref} ficou pronta. Já já mandamos o link para você aprovar.`,
      gestor: `🎥 ${ref} editado, aguardando aprovação do cliente.`,
      editor: v(ENTREGUE_QUEM_FEZ(ref)),
      executor: v(ENTREGUE_QUEM_FEZ(ref)),
    },
    // Antes esta mensagem morava em "aguardando_aprovacao_cliente", que não
    // existe no enum StatusInterno — ou seja, o aviso com o link de aprovação
    // nunca chegou a ser enviado. O status real desta etapa é revisao_pendente.
    //
    // Sem link, o solicitante NÃO é avisado. A mensagem antiga caía num "acesse
    // o sistema para aprovar" — e quem acessava não encontrava nada, porque não
    // havia peça nem link. Anunciar entrega que não existe é pior do que ficar
    // quieto: gasta a confiança de quem pediu e gera a cobrança de volta.
    //
    // O gestor continua sendo avisado nos dois casos: para ele o card na coluna
    // já é informação, e é ele quem precisa notar o que ficou pelo caminho.
    revisao_pendente: {
      solicitante: link
        ? `👀 ${aPeca} de ${ref} está pronto para revisão.\n\n${oQueFazer} — ou peça ajustes — por aqui:\n${link}`
        : null,
      gestor: `👀 ${ref} aguardando aprovação do cliente.`,
    },
    aprovado: {
      videomaker: v(APROVADO_QUEM_FEZ(ref)),
      solicitante: `🎉 ${ref} aprovado! Seguimos para a publicação.`,
      gestor: `✅ ${ref} aprovado.`,
      editor: v(APROVADO_QUEM_FEZ(ref)),
      executor: v(APROVADO_QUEM_FEZ(ref)),
    },
    ajuste_solicitado: {
      solicitante: `🔄 Recebemos seu retorno sobre ${ref} e já estamos ajustando. Avisamos quando a nova versão sair.`,
      gestor: `🔄 Ajustes pedidos em ${ref} — quem produz já foi avisado.`,
      editor: `🔄 O cliente pediu ajustes em ${ref}${extra ? `:\n\n_"${extra}"_` : "."}\n\nO retorno completo está no sistema.`,
      executor: `🔄 O cliente pediu ajustes em ${ref}${extra ? `:\n\n_"${extra}"_` : "."}\n\nO retorno completo está no sistema.`,
    },
    // Quem fez recebe o parabéns (parabensDoJob, abaixo), não este aviso.
    postado: {
      solicitante: `🎉 ${ref} está no ar!`,
    },
    // "Finalizado" no kanban do Growth — a coluna onde o card morre. Sem isto,
    // encerrar uma demanda de Growth não avisava ninguém.
    entregue_cliente: {
      solicitante: `✅ ${ref} foi finalizada e entregue. Obrigado!`,
    },
    impedimento: {
      solicitante: `⚠️ Travamos em ${ref} e precisamos falar com você. Nossa equipe entra em contato em breve.`,
      gestor: `🚫 Impedimento em ${ref}.${extra ? `\n\nMotivo: ${extra}` : ""}`,
      executor: `🚫 ${ref} foi marcada como impedida.${extra ? `\n\nMotivo: ${extra}` : ""}`,
    },
  }

  return mapa[statusNovo]?.[destinatario] ?? null
}

// ─── Aviso ao gestor quando QUEM MEXEU foi o executor ─────────────────────────
//
// Pegar o card e começar a trabalhar não avisava ninguém: "Para fazer" →
// "Fazendo" no Growth (fila_edicao → editando) tinha gestor: null, então o
// trabalho começava e a gestão só descobria olhando o quadro.
//
// Fica separado do mapa porque a regra é diferente: só dispara quando o autor da
// mudança NÃO é gestor/admin. Gestor movendo card não precisa avisar os outros
// gestores — é assim que uma ferramenta vira spam e a equipe desliga.
export const AVISO_GESTOR_QUANDO_EXECUTOR_MEXE: Record<string, (ref: string, quem: string) => string> = {
  fila_edicao:       (ref, quem) => `📋 ${quem} colocou ${ref} na fila.`,
  editando:          (ref, quem) => `▶️ ${quem} começou a trabalhar em ${ref}.`,
  revisao_pendente:  (ref, quem) => `👀 ${quem} mandou ${ref} para aprovação.`,
  postagem_pendente: (ref, quem) => `📅 ${quem} deixou ${ref} pronta para publicar.`,
  entregue_cliente:  (ref, quem) => `✅ ${quem} finalizou ${ref}.`,
}

export interface DadosAvisoKanban {
  statusNovo: string
  codigo: string
  titulo: string
  telefoneVideomaker: string | null
  telefoneEditor: string | null
  /** Responsáveis internos (Growth) e designer — quem toca a demanda. */
  telefonesExecutores: string[]
  telefoneSolicitanteSistema: string | null
  telefoneSolicitanteWhatsapp: string | null
  telefonesGestores: string[]
  telefonesSocial: string[]
  /** Quem mexeu no status: não recebe eco da própria ação. */
  autorTelefone: string | null
  autorNome: string
  autorEhGestor: boolean
  /** Quem mexeu é da Social Media: ao marcar postado, ganha o parabéns do papagaio. */
  autorEhSocial?: boolean
  extra?: string | null
  /** Demanda de Growth: o aviso fala em arte, não em vídeo. */
  isGrowth?: boolean
  /** Tipo da demanda de Growth: decide se a arte é do camaleão (peça visual) ou do coelho. */
  tipoEntrega?: string | null
  /** Página de aprovação (ou o arquivo final) — o que o solicitante abre. */
  linkAprovacao?: string | null
}

export interface AvisoDestinatario {
  telefone: string
  mensagem: string
  papel: DestinatarioKanban | "social"
  /** Arte que acompanha o aviso (lib/avisos-arte.ts); null para quem pediu. */
  arte: FamiliaArte | null
}

/**
 * Decide quem recebe o quê — uma pessoa, uma mensagem.
 *
 * Antes as comparações de telefone eram duplicadas caso a caso (videomaker x
 * editor, solicitante do sistema x do WhatsApp) e não existiam entre os demais
 * papéis: quem fosse gestor E solicitante recebia duas mensagens, e quem mexeu
 * no card recebia o aviso da própria ação. Agora existe um funil só — normaliza
 * pelos últimos 8 dígitos, pula o autor e pula repetição. A ordem de registro
 * define o papel que vence: primeiro quem produz, depois quem pediu, por último
 * a gestão.
 */
export function destinatariosDoAviso(d: DadosAvisoKanban): AvisoDestinatario[] {
  const { statusNovo, codigo, titulo } = d
  const ref = `${titulo} (${codigo})`
  const extra = d.extra ?? undefined

  const chave = (t: string) => t.replace(/\D/g, "").slice(-8)
  const autorChave = d.autorTelefone ? chave(d.autorTelefone) : ""
  // Na coluna final, quem executou recebe só o parabéns (parabensDoJob), mesmo
  // que também seja quem pediu: nada do aviso de "está no ar" para solicitante.
  const jaAvisado = new Set<string>(parabensDoJob(d).map((p) => chave(p.telefone)))
  const saida: AvisoDestinatario[] = []

  const add = (telefone: string | null | undefined, mensagem: string | null, papel: AvisoDestinatario["papel"]) => {
    if (!telefone || !mensagem) return
    const k = chave(telefone)
    if (!k) return
    if (k === autorChave) return   // não avisar quem acabou de fazer a mudança
    if (jaAvisado.has(k)) return   // mesma pessoa em dois papéis
    jaAvisado.add(k)
    saida.push({ telefone, mensagem, papel, arte: arteDoKanban(statusNovo, papel, d.isGrowth ?? false, d.tipoEntrega === undefined || entregaPecaVisual(d.tipoEntrega)) })
  }

  const texto = (papel: DestinatarioKanban) =>
    mensagemKanban(statusNovo, codigo, titulo, papel, extra, d.isGrowth ?? false, d.linkAprovacao)

  // Quem produz primeiro — é a mensagem mais acionável das três.
  add(d.telefoneVideomaker, texto("videomaker"), "videomaker")
  add(d.telefoneEditor, texto("editor"), "editor")
  for (const tel of d.telefonesExecutores) add(tel, texto("executor"), "executor")

  // Quem pediu (cadastrado no sistema e/ou o número que pediu por WhatsApp).
  add(d.telefoneSolicitanteSistema, texto("solicitante"), "solicitante")
  add(d.telefoneSolicitanteWhatsapp, texto("solicitante"), "solicitante")

  // Gestão por último.
  const avisoExecutor = d.autorEhGestor ? null : AVISO_GESTOR_QUANDO_EXECUTOR_MEXE[statusNovo]
  const msgGestor = texto("gestor") ?? (avisoExecutor ? avisoExecutor(ref, d.autorNome) : null)
  for (const tel of d.telefonesGestores) add(tel, msgGestor, "gestor")

  // Social Media quando o vídeo fica pronto para postar.
  if (statusNovo === "postagem_pendente") {
    for (const tel of d.telefonesSocial) {
      add(tel, `📱 ${ref} foi aprovado e está pronto para postar. 🚀`, "social")
    }
  }

  return saida
}

// ─── Parabéns de job finalizado ───────────────────────────────────────────────
//
// Pedido do Giovani (12/11/2026): a cada job aprovado e finalizado, quem executou
// recebe um parabéns com o meme do personagem da função dele. "Finalizado" é a
// coluna onde o card termina: postado (audiovisual) ou entregue_cliente (Growth).
// Substitui os "obrigado/publicado/entregue" que quem fez recebia nessas colunas,
// então não sai mensagem a mais.
//
// Diferente dos outros avisos, aqui QUEM MEXEU também recebe: quem finaliza o
// próprio card fez o trabalho. Quem pediu, cliente e gestão não entram (a não ser
// que a mesma pessoa também tenha executado). Sai uma vez na vida por pessoa e
// job: o envio usa chaveDoParabens, que não muda de um dia para o outro.

export const STATUS_DE_PARABENS = ["postado", "entregue_cliente"] as const

export function parabensDoJob(d: DadosAvisoKanban): AvisoDestinatario[] {
  if (!(STATUS_DE_PARABENS as readonly string[]).includes(d.statusNovo)) return []
  const ref = `${d.titulo} (${d.codigo})`
  const fim = d.statusNovo === "postado" ? "foi aprovado e está no ar" : "foi aprovado e entregue"
  const mensagem = `🏆 Parabéns! ${ref} ${fim}. Obrigado pelo trabalho!`
  const pecaVisual = d.tipoEntrega === undefined || entregaPecaVisual(d.tipoEntrega)
  const chave = (t: string) => t.replace(/\D/g, "").slice(-8)
  const ja = new Set<string>()
  const saida: AvisoDestinatario[] = []
  const add = (telefone: string | null | undefined, papel: AvisoDestinatario["papel"]) => {
    const k = telefone ? chave(telefone) : ""
    if (!telefone || k.length < 8 || ja.has(k)) return
    const arte = arteDoParabens(papel, d.isGrowth ?? false, pecaVisual)
    if (!arte) return
    ja.add(k)
    saida.push({ telefone, mensagem, papel, arte })
  }
  add(d.telefoneVideomaker, "videomaker")
  add(d.telefoneEditor, "editor")
  for (const tel of d.telefonesExecutores) add(tel, "executor")
  if (d.statusNovo === "postado" && d.autorEhSocial) add(d.autorTelefone, "social")
  return saida
}

/** Uma vez na vida por job e pessoa: sem data, para não repetir se o card voltar e avançar de novo. */
export function chaveDoParabens(demandaId: string, telefone: string): string {
  return `parabens:${demandaId}:${telefone.replace(/\D/g, "").slice(-8)}`
}

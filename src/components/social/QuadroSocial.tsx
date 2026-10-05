"use client"

// Planejamento da social media: Ideias → No plano → Com a equipe → Pronto, ou o
// calendário das postagens. O quadro é DELA: a produção continua no kanban de
// Demandas (Audiovisual) e no do Growth, e aqui só chega a etapa em quatro
// palavras. Protótipo aprovado em 05/10/2026 (docs/prototipos/area-empresa-social.html).

import { useMemo, useRef, useState } from "react"
import useSWR from "swr"
import { toast } from "sonner"
import { ExternalLink, Plus, ChevronLeft, ChevronRight } from "lucide-react"
import { Header } from "@/components/layout/Header"
import { fetcher } from "@/lib/fetcher"
import { cn } from "@/lib/utils"
import { diasEntre, hojeEmSaoPaulo, somarDias, somarMeses } from "@/lib/datas"
import {
  COLUNAS_SOCIAL, ETAPA_NOME, ETAPA_PASSO, colunaDoCard, diaDaPostagem, etapaDoPedido, jaCobrouHoje,
  type ColunaSocial,
} from "@/lib/social-quadro"
import { NovaDemandaModal } from "@/components/demandas/NovaDemandaModal"
import { NovaDemandaGrowthModal } from "@/components/demandas/NovaDemandaGrowthModal"
import { DemandaModal } from "@/components/demandas/DemandaModal"
import type { OrigemSocial } from "@/components/social/ideiaNoFormulario"
import type { CardSocial, RespostaQuadro } from "@/components/social/tipos"

type Filtro = "tudo" | "audiovisual" | "design"
type Visao = "quadro" | "calendario"
type Periodo = "semana" | "quinzena" | "mes"

const DIAS_PARADO = 3
const SEMANA = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"]

const dataCurta = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`
const diasParado = (c: CardSocial, hoje: string) =>
  c.demanda?.ultimaMudanca ? diasEntre(c.demanda.ultimaMudanca.slice(0, 10), hoje) : 0

export function QuadroSocial() {
  const { data, error, isLoading, mutate } = useSWR<RespostaQuadro>("/api/social", fetcher, { refreshInterval: 30000 })
  const [linhaSel, setLinhaSel] = useState<string>("")
  const [filtro, setFiltro] = useState<Filtro>("tudo")
  const [visao, setVisao] = useState<Visao>("quadro")
  const [periodo, setPeriodo] = useState<Periodo>("quinzena")
  const [deslocamento, setDeslocamento] = useState(0)
  const [formulario, setFormulario] = useState<{ chave: string; area: "audiovisual" | "design"; social: OrigemSocial } | null>(null)
  const [escolhendo, setEscolhendo] = useState(false)
  const [demandaAberta, setDemandaAberta] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const novas = useRef(0) // chave do formulário de ideia nova: cada abertura começa limpa

  const hoje = hojeEmSaoPaulo()
  const linhas = useMemo(() => data?.linhas ?? [], [data])
  const minhas = linhas.filter((l) => l.minha)
  // Começa na linha dela; quem tem várias (ou é gestor) pode ver todas juntas.
  const linhaAtual = linhaSel || (minhas.length === 1 && !data?.veTodas ? minhas[0].id : "todas")
  const visiveis = (data?.cards ?? []).filter((c) =>
    (linhaAtual === "todas" || c.linhaProjetoId === linhaAtual) && (filtro === "tudo" || c.area === filtro))

  function abrirFormulario(c: CardSocial | null, area: "audiovisual" | "design", linhaId: string) {
    const linha = linhas.find((l) => l.id === linhaId)
    if (!linha) return
    setFormulario({
      chave: c?.id ?? `nova-${++novas.current}`,
      area,
      social: {
        ideiaId: c?.id,
        linhaProjetoId: linha.id,
        linhaNome: linha.nome,
        titulo: c?.titulo,
        descricao: c?.descricao,
        linkReferencia: c?.linkReferencia,
        dataPostagem: diaDaPostagem(c?.dataPostagem),
        formulario: c?.formulario,
        somenteLeitura: c ? !c.podeMexer : false,
        aoTerminar: () => { setFormulario(null); mutate() },
      },
    })
  }

  function abrirCard(c: CardSocial) {
    if (c.demanda) return setDemandaAberta(c.demanda.id)
    if (c.linhaProjetoId) abrirFormulario(c, c.area ?? "audiovisual", c.linhaProjetoId)
  }

  async function chamar(id: string, url: string, init: RequestInit, ok: (json: Record<string, unknown>) => string) {
    setOcupado(id)
    try {
      const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Não deu certo. Tente de novo.")
      toast.success(ok(json))
      await mutate()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não deu certo. Tente de novo.")
    } finally {
      setOcupado(null)
    }
  }

  const cobrar = (c: CardSocial) => chamar(c.id, `/api/social/pedidos/${c.demanda!.id}/cobrar`, { method: "POST" }, (j) => {
    const nomes = Array.isArray(j.avisados) ? (j.avisados as string[]).map((n) => n.split(" ")[0]) : []
    const quem = nomes.length === 0 ? "Ninguém com WhatsApp cadastrado" : nomes.length === 1 ? nomes[0] : `${nomes.slice(0, -1).join(", ")} e ${nomes.at(-1)}`
    return j.temResponsavel ? `${quem} avisados no sistema e no WhatsApp.` : `Ainda sem responsável: ${quem} (gestão da área) avisados.`
  })
  const priorizar = (c: CardSocial, prioridade: string) => chamar(c.id, `/api/social/pedidos/${c.demanda!.id}`,
    { method: "PATCH", body: JSON.stringify({ prioridade }) }, () => "Prioridade atualizada.")
  const marcarPostado = (c: CardSocial) => chamar(c.id, `/api/demandas/${c.demanda!.id}/status`,
    { method: "PATCH", body: JSON.stringify({ statusInterno: "postado" }) }, () => "Marcado como postado.")
  const descartar = (c: CardSocial) => {
    if (!confirm(`Descartar "${c.titulo}"? Ela sai do quadro.`)) return
    chamar(c.id, `/api/social/ideias/${c.id}`, { method: "DELETE" }, () => "Ideia descartada.")
  }

  // ── Resumo ──────────────────────────────────────────────────────────────
  const comEquipe = visiveis.filter((c) => colunaDoCard(c) === "equipe")
  const paraRevisar = comEquipe.filter((c) => etapaDoPedido(c.demanda!.statusVisivel, c.demanda!.statusInterno) === "revisar").length
  const parados = comEquipe.filter((c) => diasParado(c, hoje) >= DIAS_PARADO).length
  const nestaSemana = visiveis.filter((c) => {
    const dia = diaDaPostagem(c.dataPostagem)
    return dia && dia >= hoje && dia <= somarDias(hoje, 6) && c.demanda?.statusVisivel !== "finalizado"
  }).length

  const podeCriar = minhas.length > 0

  return (
    <div className="flex h-full flex-col">
      <Header title="Social Media · Planejamento" />
      <div className="flex-1 overflow-y-auto px-4 pb-10 pt-5 md:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">Meu planejamento</h1>
            <p className="mt-1 text-sm text-zinc-400">Ideias viram plano, plano vira pedido, e você vê onde cada pedido está.</p>
            {linhas.length > 1 && (
              <div className="mt-3"><Segmento
                rotulo="Linha de produto"
                valor={linhaAtual}
                aoMudar={(v) => { setLinhaSel(v); setDeslocamento(0) }}
                opcoes={[
                  ...linhas.map((l) => ({ valor: l.id, texto: l.socials.length ? `${l.nome} · ${l.socials.map((n) => n.split(" ")[0]).join(", ")}` : l.nome })),
                  { valor: "todas", texto: data?.veTodas ? "Todas (gestão)" : "Todas" },
                ]}
              /></div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Segmento rotulo="Visão" valor={visao} aoMudar={(v) => setVisao(v as Visao)}
              opcoes={[{ valor: "quadro", texto: "Quadro" }, { valor: "calendario", texto: "Calendário" }]} />
            <Segmento rotulo="Tipo" valor={filtro} aoMudar={(v) => setFiltro(v as Filtro)}
              opcoes={[{ valor: "tudo", texto: "Tudo" }, { valor: "audiovisual", texto: "Vídeo" }, { valor: "design", texto: "Arte" }]} />
            {podeCriar && (
              <button type="button" onClick={() => setEscolhendo(true)}
                className="flex items-center gap-1.5 rounded-xl bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-500">
                <Plus className="h-4 w-4" /> Ideia
              </button>
            )}
          </div>
        </div>

        {error && <p role="alert" className="mt-6 text-sm text-red-400">Não foi possível carregar o quadro. Recarregue a página.</p>}
        {data && !data.veTodas && minhas.length === 0 && (
          <p className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-200">
            Você ainda não cuida de nenhuma linha de produto. Peça ao gestor para ligar você a uma linha em Social Media → Equipe.
          </p>
        )}

        <div className="mt-5 flex flex-wrap gap-2 text-[13px] text-zinc-400">
          <Resumo n={nestaSemana} texto="postagens nesta semana" />
          <Resumo n={comEquipe.length} texto="com a equipe" />
          <Resumo n={paraRevisar} texto="para você revisar" alerta />
          <Resumo n={parados} texto={`parado${parados === 1 ? "" : "s"} há ${DIAS_PARADO} dias ou mais`} alerta />
        </div>

        {isLoading && <p className="mt-8 text-sm text-zinc-500">Carregando…</p>}

        {data && visao === "quadro" && (
          <div className="mt-5 overflow-x-auto pb-2">
            <div className="grid min-w-[1040px] grid-cols-4 gap-3.5">
              {COLUNAS_SOCIAL.map((col) => {
                const lista = visiveis.filter((c) => colunaDoCard(c) === col.id)
                return (
                  <section key={col.id} aria-label={col.nome} className="flex min-w-0 flex-col gap-2.5 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3">
                    <h2 className="mx-1 mt-0.5 flex items-baseline justify-between text-sm font-bold text-zinc-100">
                      {col.nome}<span className="font-semibold tabular-nums text-zinc-500">{lista.length}</span>
                    </h2>
                    <p className="mx-1 -mt-1 mb-1 text-xs text-zinc-500">{col.dica}</p>
                    {lista.map((c) => (
                      <Cartao key={c.id} c={c} coluna={col.id} hoje={hoje} mostrarLinha={linhaAtual === "todas"}
                        ocupado={ocupado === c.id} aoAbrir={() => abrirCard(c)}
                        aoAbrirDemanda={() => abrirFormulario(c, c.area ?? "audiovisual", c.linhaProjetoId!)}
                        aoDescartar={() => descartar(c)} aoCobrar={() => cobrar(c)}
                        aoPriorizar={(p) => priorizar(c, p)} aoPostar={() => marcarPostado(c)} />
                    ))}
                    {col.id === "ideia" && podeCriar && (
                      <button type="button" onClick={() => setEscolhendo(true)}
                        className="rounded-xl border border-dashed border-zinc-700 p-2.5 text-[13px] font-semibold text-zinc-400 hover:border-purple-500/60 hover:text-zinc-200">
                        + Anotar ideia ou referência
                      </button>
                    )}
                  </section>
                )
              })}
            </div>
          </div>
        )}

        {data && visao === "calendario" && (
          <Calendario cards={visiveis} hoje={hoje} periodo={periodo} deslocamento={deslocamento}
            aoPeriodo={(p) => { setPeriodo(p); setDeslocamento(0) }} aoDeslocar={setDeslocamento} aoAbrir={abrirCard} />
        )}
      </div>

      {escolhendo && (
        <EscolherNova linhas={minhas} linhaAtual={linhaAtual}
          aoFechar={() => setEscolhendo(false)}
          aoEscolher={(area, linhaId) => { setEscolhendo(false); abrirFormulario(null, area, linhaId) }} />
      )}
      {formulario?.area === "audiovisual" && (
        <NovaDemandaModal key={formulario.chave} open social={formulario.social} onClose={() => setFormulario(null)} />
      )}
      {formulario?.area === "design" && (
        <NovaDemandaGrowthModal key={formulario.chave} open social={formulario.social}
          onClose={() => setFormulario(null)} onCreated={() => { setFormulario(null); mutate() }} />
      )}
      <DemandaModal demandaId={demandaAberta} onClose={() => { setDemandaAberta(null); mutate() }} />
    </div>
  )
}

// ── Peças ─────────────────────────────────────────────────────────────────

function Segmento({ rotulo, valor, opcoes, aoMudar }: {
  rotulo: string; valor: string; opcoes: { valor: string; texto: string }[]; aoMudar: (v: string) => void
}) {
  return (
    <div role="group" aria-label={rotulo} className="inline-flex flex-wrap gap-1 rounded-xl border border-zinc-800 bg-zinc-900/70 p-1">
      {opcoes.map((o) => (
        <button key={o.valor} type="button" aria-pressed={valor === o.valor} onClick={() => aoMudar(o.valor)}
          className={cn("rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-colors",
            valor === o.valor ? "bg-purple-600 text-white" : "text-zinc-400 hover:text-zinc-100")}>
          {o.texto}
        </button>
      ))}
    </div>
  )
}

function Resumo({ n, texto, alerta }: { n: number; texto: string; alerta?: boolean }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-3.5 py-2">
      <b className={cn("mr-1 text-[15px] tabular-nums", alerta && n > 0 ? "text-amber-300" : "text-zinc-100")}>{n}</b>{texto}
    </div>
  )
}

const TAG = "rounded-full px-2 py-0.5 text-[11px] font-bold tracking-wide"

function TagTipo({ area }: { area: CardSocial["area"] }) {
  return area === "design"
    ? <span className={cn(TAG, "bg-sky-500/15 text-sky-300")}>Arte · Growth</span>
    : <span className={cn(TAG, "bg-fuchsia-500/15 text-fuchsia-300")}>Vídeo · Audiovisual</span>
}

function Cartao({ c, coluna, hoje, mostrarLinha, ocupado, aoAbrir, aoAbrirDemanda, aoDescartar, aoCobrar, aoPriorizar, aoPostar }: {
  c: CardSocial; coluna: ColunaSocial; hoje: string; mostrarLinha: boolean; ocupado: boolean
  aoAbrir: () => void; aoAbrirDemanda: () => void; aoDescartar: () => void; aoCobrar: () => void
  aoPriorizar: (p: string) => void; aoPostar: () => void
}) {
  const dia = diaDaPostagem(c.dataPostagem)
  const d = c.demanda
  const etapa = d ? etapaDoPedido(d.statusVisivel, d.statusInterno) : null
  const parado = d && coluna === "equipe" ? diasParado(c, hoje) : 0
  const cobrouHoje = jaCobrouHoje(d?.cobradoEm)
  const pare = (e: React.MouseEvent) => e.stopPropagation()

  return (
    <article
      onClick={aoAbrir}
      className={cn("grid min-w-0 cursor-pointer gap-2 rounded-xl border border-zinc-800 bg-zinc-950/70 p-3 transition-colors hover:border-zinc-600",
        etapa === "revisar" && "border-purple-400/60 shadow-[inset_0_0_0_1px_rgba(194,171,255,0.2)]",
        parado >= DIAS_PARADO && "border-amber-400/50")}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <TagTipo area={c.area} />
        {c.solicitacao && <span className={cn(TAG, "bg-zinc-700/60 text-zinc-200")}>Solicitação</span>}
        {d && d.prioridade !== "normal" && (
          <span className={cn(TAG, d.prioridade === "urgente" ? "bg-red-500/15 text-red-300" : "bg-amber-500/15 text-amber-300")}>
            {d.prioridade === "urgente" ? "Urgente" : "Alta"}
          </span>
        )}
        {dia && <span className={cn(TAG, "bg-white/5 font-semibold tabular-nums text-zinc-400")}>{d?.statusVisivel === "finalizado" ? "postado " : "posta "}{dataCurta(dia)}</span>}
        {mostrarLinha && c.linha && <span className={cn(TAG, "bg-white/5 font-semibold text-zinc-400")}>{c.linha}</span>}
      </div>
      <h3 className="text-sm font-semibold leading-snug text-zinc-100">{c.titulo}</h3>
      {d && <p className="-mt-1 font-mono text-[11px] text-zinc-500">{d.codigo}</p>}
      {c.enviadaPor && <p className="text-xs text-zinc-400">Enviada por {c.enviadaPor}</p>}

      {coluna === "ideia" && c.linkReferencia && (
        <a href={c.linkReferencia.startsWith("http") ? c.linkReferencia : `https://${c.linkReferencia}`} target="_blank" rel="noreferrer"
          onClick={pare} className="flex items-center gap-1 break-all text-xs text-purple-300 hover:underline">
          <ExternalLink className="h-3 w-3 shrink-0" /> {c.linkReferencia.replace(/^https?:\/\//, "")}
        </a>
      )}

      {coluna === "plano" && dia && diasEntre(hoje, dia) <= 5 && (
        <p className="text-xs text-amber-300">
          {diasEntre(hoje, dia) < 0 ? "A data já passou. Mude a data ou faça o pedido." : `Posta em ${diasEntre(hoje, dia)} dia${diasEntre(hoje, dia) === 1 ? "" : "s"}. Faça o pedido logo.`}
        </p>
      )}

      {(coluna === "ideia" || coluna === "plano") && c.podeMexer && (
        <div className="flex flex-wrap gap-1.5" onClick={pare}>
          <Mini forte={coluna === "plano"} onClick={aoAbrirDemanda}>Abrir demanda</Mini>
          <Mini onClick={aoDescartar} disabled={ocupado}>Descartar</Mini>
        </div>
      )}

      {coluna === "equipe" && d && etapa && (
        <>
          {etapa !== "recusado" && (
            <div className="grid grid-cols-4 gap-1" aria-label={`Etapa: ${ETAPA_NOME[etapa]}`}>
              {[0, 1, 2, 3].map((i) => <i key={i} className={cn("h-1 rounded", i <= ETAPA_PASSO[etapa] ? "bg-purple-400" : "bg-white/10")} />)}
            </div>
          )}
          <div className="flex justify-between gap-2 text-xs font-semibold">
            <span className={etapa === "recusado" ? "text-red-300" : "text-zinc-200"}>{ETAPA_NOME[etapa]}</span>
            <span className="truncate font-medium text-zinc-500">{d.responsaveis.join(", ") || "Sem responsável ainda"}</span>
          </div>
          {parado >= DIAS_PARADO && <p className="text-xs text-amber-300">Parado há {parado} dias.</p>}
          {d.cobrancas > 0 && <p className="text-xs text-zinc-400">Cobrado {d.cobrancas}x{cobrouHoje ? ", hoje" : ""}.</p>}
          {etapa === "revisar" && !d.tokenAprovacao && <p className="text-xs text-zinc-400">A equipe ainda vai mandar a prévia.</p>}
          {c.podeMexer && etapa !== "recusado" && (
            <div className="flex flex-wrap gap-1.5" onClick={pare}>
              {etapa === "revisar" && d.tokenAprovacao && (
                <a href={`/aprovar/${d.tokenAprovacao}`} target="_blank" rel="noreferrer"
                  className="rounded-lg bg-purple-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-purple-500">Revisar e aprovar</a>
              )}
              <label className="flex items-center gap-1 rounded-lg border border-zinc-700 bg-white/5 px-2.5 py-1.5 text-xs font-semibold text-zinc-300">
                Prioridade
                <select value={d.prioridade} disabled={ocupado} onChange={(e) => aoPriorizar(e.target.value)}
                  className="bg-transparent text-xs font-semibold text-zinc-100 outline-none">
                  <option value="normal">Normal</option><option value="alta">Alta</option><option value="urgente">Urgente</option>
                </select>
              </label>
              <Mini onClick={aoCobrar} disabled={ocupado || cobrouHoje} aviso>{cobrouHoje ? "Cobrado hoje" : "Cobrar"}</Mini>
            </div>
          )}
        </>
      )}

      {coluna === "pronto" && d && (
        d.statusVisivel === "finalizado"
          ? <p className="text-xs text-emerald-300">Postado.</p>
          : c.podeMexer && <div onClick={pare}><Mini onClick={aoPostar} disabled={ocupado}>Marcar como postado</Mini></div>
      )}
    </article>
  )
}

function Mini({ children, onClick, disabled, forte, aviso }: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean; forte?: boolean; aviso?: boolean
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={cn("rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:cursor-default disabled:opacity-55",
        forte ? "border-transparent bg-purple-600 text-white hover:bg-purple-500"
          : aviso ? "border-amber-400/40 bg-white/5 text-amber-300 hover:border-amber-300/70"
          : "border-zinc-700 bg-white/5 text-zinc-300 hover:border-purple-500/60")}>
      {children}
    </button>
  )
}

function EscolherNova({ linhas, linhaAtual, aoFechar, aoEscolher }: {
  linhas: { id: string; nome: string }[]; linhaAtual: string
  aoFechar: () => void; aoEscolher: (area: "audiovisual" | "design", linhaId: string) => void
}) {
  const [linhaId, setLinhaId] = useState(linhas.some((l) => l.id === linhaAtual) ? linhaAtual : linhas[0]?.id ?? "")
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={(e) => { if (e.target === e.currentTarget) aoFechar() }}>
      <div role="dialog" aria-modal="true" aria-labelledby="nova-ideia" className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
        <h2 id="nova-ideia" className="text-lg font-semibold text-zinc-50">Nova ideia</h2>
        <p className="mt-1 text-sm text-zinc-400">Vídeo vai para o Audiovisual; arte, para o Growth. Abre o formulário de demanda da área.</p>
        {linhas.length > 1 && (
          <label className="mt-4 block text-xs font-medium text-zinc-400">Linha de produto
            <select value={linhaId} onChange={(e) => setLinhaId(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100">
              {linhas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
            </select>
          </label>
        )}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button type="button" onClick={() => aoEscolher("audiovisual", linhaId)}
            className="rounded-xl border border-fuchsia-500/40 bg-fuchsia-500/10 py-4 text-sm font-semibold text-fuchsia-200 hover:bg-fuchsia-500/20">🎬 Vídeo</button>
          <button type="button" onClick={() => aoEscolher("design", linhaId)}
            className="rounded-xl border border-sky-500/40 bg-sky-500/10 py-4 text-sm font-semibold text-sky-200 hover:bg-sky-500/20">🎨 Arte</button>
        </div>
        <button type="button" onClick={aoFechar} className="mt-4 w-full rounded-xl border border-zinc-800 py-2 text-sm text-zinc-400 hover:bg-zinc-900">Cancelar</button>
      </div>
    </div>
  )
}

// ── Calendário ────────────────────────────────────────────────────────────

function segundaDaSemana(dia: string) {
  const dow = new Date(`${dia}T12:00:00Z`).getUTCDay() // 0 = domingo
  return somarDias(dia, -((dow + 6) % 7))
}

function Calendario({ cards, hoje, periodo, deslocamento, aoPeriodo, aoDeslocar, aoAbrir }: {
  cards: CardSocial[]; hoje: string; periodo: Periodo; deslocamento: number
  aoPeriodo: (p: Periodo) => void; aoDeslocar: (n: number) => void; aoAbrir: (c: CardSocial) => void
}) {
  let inicio: string, total: number
  if (periodo === "mes") {
    const primeiro = somarMeses(`${hoje.slice(0, 7)}-01`, deslocamento)
    inicio = primeiro
    total = diasEntre(primeiro, somarMeses(primeiro, 1))
  } else {
    total = periodo === "semana" ? 7 : 14
    inicio = somarDias(segundaDaSemana(hoje), deslocamento * total)
  }
  const antes = (new Date(`${inicio}T12:00:00Z`).getUTCDay() + 6) % 7
  const dias = Array.from({ length: total }, (_, i) => somarDias(inicio, i))
  const fim = dias[dias.length - 1]
  const titulo = periodo === "mes"
    ? new Date(`${inicio}T12:00:00Z`).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" })
    : `${dataCurta(inicio)} a ${dataCurta(fim)}`

  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-center gap-2">
        <Segmento rotulo="Período" valor={periodo} aoMudar={(v) => aoPeriodo(v as Periodo)}
          opcoes={[{ valor: "semana", texto: "Semana" }, { valor: "quinzena", texto: "Quinzena" }, { valor: "mes", texto: "Mês" }]} />
        <div className="flex items-center gap-1">
          <button type="button" aria-label="Período anterior" onClick={() => aoDeslocar(deslocamento - 1)} className="grid h-8 w-8 place-items-center rounded-lg border border-zinc-700 text-zinc-300 hover:bg-white/5"><ChevronLeft className="h-4 w-4" /></button>
          <button type="button" onClick={() => aoDeslocar(0)} className="h-8 rounded-lg border border-zinc-700 px-3 text-xs font-semibold text-zinc-300 hover:bg-white/5">Hoje</button>
          <button type="button" aria-label="Próximo período" onClick={() => aoDeslocar(deslocamento + 1)} className="grid h-8 w-8 place-items-center rounded-lg border border-zinc-700 text-zinc-300 hover:bg-white/5"><ChevronRight className="h-4 w-4" /></button>
        </div>
        <span className={cn("text-sm font-semibold text-zinc-300", periodo === "mes" && "capitalize")}>{titulo}</span>
      </div>
      <div className="mt-4 hidden grid-cols-7 gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500 md:grid">
        {SEMANA.map((s) => <span key={s}>{s}</span>)}
      </div>
      <div className="mt-1.5 grid grid-cols-1 gap-2 md:grid-cols-7">
        {Array.from({ length: antes }, (_, i) => <div key={`v${i}`} className="hidden md:block" />)}
        {dias.map((dia) => {
          const doDia = cards.filter((c) => diaDaPostagem(c.dataPostagem) === dia)
          const dow = SEMANA[(new Date(`${dia}T12:00:00Z`).getUTCDay() + 6) % 7]
          return (
            <div key={dia} className={cn("flex min-h-[104px] min-w-0 flex-col gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/60 p-2",
              dia === hoje && "border-purple-500", dia < hoje && "opacity-45", doDia.length === 0 && "max-md:hidden")}>
              <b className="text-xs tabular-nums text-zinc-400">{dow} {dataCurta(dia)}</b>
              {doDia.map((c) => {
                const col = colunaDoCard(c)
                const estado = col === "ideia" ? "Ideia" : col === "plano" ? "No plano, sem pedido"
                  : c.demanda?.statusVisivel === "finalizado" ? "Postado"
                  : ETAPA_NOME[etapaDoPedido(c.demanda!.statusVisivel, c.demanda!.statusInterno)]
                return (
                  <button key={c.id} type="button" onClick={() => aoAbrir(c)}
                    className={cn("rounded-lg border-l-[3px] bg-white/5 px-2 py-1.5 text-left text-[11.5px] font-semibold leading-snug text-zinc-100 hover:bg-white/10",
                      c.area === "design" ? "border-sky-400" : "border-fuchsia-400")}>
                    {c.titulo}
                    <small className="block font-medium text-zinc-500">{estado}</small>
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

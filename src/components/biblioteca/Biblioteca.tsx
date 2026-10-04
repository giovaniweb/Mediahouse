"use client"
import { useState } from "react"
import useSWR from "swr"
import Link from "next/link"
import { ChevronLeft, ChevronRight, Download, ExternalLink, Film, Library, Search, ShieldCheck } from "lucide-react"
import { useMe } from "@/hooks/usePermissoes"
import { Header } from "@/components/layout/Header"
import { PageIntro } from "@/components/layout/PageIntro"

const campo = "rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-500/30"

type Entrega = { estadoPrevia: string; id: string; demandaId: string; codigo: string; titulo: string; linkFinal: string; downloadUrl?: string | null; thumbnailUrl: string | null; publicado: boolean; legado: boolean; dataReferencia: string; origemData: string; dataEstimada: boolean }
const fetcher = async (url: string) => {
  const res = await fetch(url)
  const body = await res.json()
  if (!res.ok) throw new Error(body.error ?? "Não foi possível carregar a biblioteca")
  return body as { videos: Entrega[]; pendencias?: {id:string;codigo:string;titulo:string}[]; total: number; totalPages: number; podePublicar: boolean }
}
export default function Biblioteca({ areaInicial = "audiovisual", qualidadeInicial = "" }: { areaInicial?: "audiovisual" | "design"; qualidadeInicial?: string }) {
  const { data: me } = useMe()
  const podeRevisar = me?.membership?.papel === "admin" && me.permissoes.gerenciarConfig && me.permissoes.editarDemanda && me.permissoes.verTodasDemandas
  const [area, setArea] = useState(areaInicial), [search, setSearch] = useState(""), [page, setPage] = useState(1)
  const [qualidade,setQualidade] = useState(qualidadeInicial), [tipo,setTipo] = useState(""), [projeto,setProjeto] = useState(""), [pessoa,setPessoa] = useState("")
  const [ocupado, setOcupado] = useState<string | null>(null), [erro, setErro] = useState("")
  const { data, error, isLoading, mutate } = useSWR(`/api/biblioteca?area=${area}&page=${page}&search=${encodeURIComponent(search)}&qualidade=${qualidade}&tipo=${encodeURIComponent(tipo)}&projeto=${encodeURIComponent(projeto)}&pessoa=${encodeURIComponent(pessoa)}`, fetcher)
  async function publicar(v: Entrega) {
    setOcupado(v.id); setErro("")
    try {
      const res = await fetch(`/api/biblioteca/${v.id}/publicacao`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ publicar: !v.publicado }) })
      if (!res.ok) throw new Error((await res.json()).error ?? "Não foi possível alterar a publicação")
      await mutate()
    } catch (e) { setErro(e instanceof Error ? e.message : "Falha ao salvar") }
    finally { setOcupado(null) }
  }
  const titulo = area === "design" ? "Galeria de criativos" : "Biblioteca de vídeos"
  return <>
    <Header title={titulo} />
    <PageIntro eyebrow={area === "design" ? "GROWTH / GALERIA" : "AUDIOVISUAL / BIBLIOTECA"} title="O que a equipe já entregou." description="Entregas da equipe em um lugar só. Só os itens publicados ficam visíveis no portfólio público.">
      {podeRevisar && <Link href="/biblioteca/acervo" className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:border-zinc-500"><ShieldCheck className="h-4 w-4" aria-hidden="true" />Revisar acervo e retenção</Link>}
    </PageIntro>
    <main className="space-y-5 p-6">
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-xs text-zinc-400">Área
        <select className={campo} value={area} onChange={e => { setArea(e.target.value as "audiovisual" | "design"); setPage(1) }}><option value="audiovisual">Audiovisual</option><option value="design">Growth</option></select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-zinc-400">Buscar
        <span className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
        <input className={`${campo} w-64 pl-9`} aria-label="Buscar entregas" placeholder="Título ou código" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} /></span>
      </label>
    </div>
    <details className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3"><summary className="cursor-pointer text-sm text-zinc-300">Mais filtros: tipo, projeto, pessoa e qualidade</summary><div className="flex flex-wrap gap-3 pt-3">
      <input aria-label="Tipo de entrega" placeholder="Tipo (ex.: reels)" value={tipo} onChange={e=>{setTipo(e.target.value);setPage(1)}} className={campo} />
      <input aria-label="Projeto" placeholder="Projeto" value={projeto} onChange={e=>{setProjeto(e.target.value);setPage(1)}} className={campo} />
      <input aria-label="Pessoa" placeholder="Nome da pessoa" value={pessoa} onChange={e=>{setPessoa(e.target.value);setPage(1)}} className={campo} />
      <select aria-label="Qualidade do acervo" value={qualidade} onChange={e=>{setQualidade(e.target.value);setPage(1)}} className={campo}><option value="">Entregas registradas</option><option value="sem_final">Tipos que exigem arquivo, sem referência final</option></select>
    </div></details>
    {data?.pendencias?.map(d=><article key={d.id} className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4"><Link href={`/demandas/${d.id}`} className="font-medium text-zinc-100 hover:underline">{d.codigo} · {d.titulo}</Link><p className="mt-1 text-sm text-zinc-400">Sem referência final registrada. Isso não comprova perda do arquivo.</p></article>)}
    {(erro || error) && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{erro || error.message}</p>}
    {data && <p className="text-sm text-zinc-400">{data.total} {qualidade ? (data.total === 1 ? "demanda para revisar" : "demandas para revisar") : (data.total === 1 ? "entrega encontrada" : "entregas encontradas")}</p>}
    {isLoading && <p role="status" className="text-sm text-zinc-400">Carregando entregas…</p>}
    {data?.videos.length === 0 && !data.pendencias?.length && <div className="rounded-xl border border-dashed border-zinc-700 px-6 py-12 text-center"><Library className="mx-auto mb-3 h-7 w-7 text-zinc-500" aria-hidden="true" /><p className="text-zinc-200">Nenhuma entrega nesta seleção.</p><p className="mt-1 text-sm text-zinc-400">As entregas aparecem aqui quando a demanda é concluída com o arquivo final.</p></div>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{data?.videos.map(v => <article key={v.id} className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      {/* URLs protegidas por sessão passam diretamente pelo navegador. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {v.thumbnailUrl ? <img src={v.thumbnailUrl} alt="" loading="lazy" className="aspect-video w-full rounded-lg object-cover" /> : <div className="flex aspect-video w-full items-center justify-center rounded-lg bg-zinc-800/60" aria-hidden="true"><Film className="h-7 w-7 text-zinc-500" /></div>}
      <div className="flex items-center justify-between gap-2 text-xs"><span className="font-mono text-zinc-400">{v.codigo}</span><span className={v.publicado ? "rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-emerald-300" : "rounded-full border border-zinc-700 px-2 py-0.5 text-zinc-400"}>{v.publicado ? "No portfólio" : "Uso interno"}</span></div>
      <h2 className="font-medium text-zinc-100">{v.titulo}</h2>
      <p className="text-xs text-zinc-400">{new Date(v.dataReferencia).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })} · {v.dataEstimada ? "Data estimada" : v.origemData === "anexacao" ? "Anexado" : "Concluído"}</p>
      <p className="text-xs text-zinc-400">{v.estadoPrevia === "verificada" ? "Prévia verificada" : v.estadoPrevia === "processando" ? "Prévia em processamento" : v.estadoPrevia === "falhou" ? "Prévia não concluída; revise na demanda" : "Prévia não verificada; abra a referência ou revise na demanda"}</p>
      <div className="mt-auto flex flex-wrap gap-2 text-sm"><a href={v.linkFinal} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-zinc-200 hover:border-zinc-500">Abrir arquivo<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></a>{v.downloadUrl && <a href={v.downloadUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-zinc-200 hover:border-zinc-500">Baixar<Download className="h-3.5 w-3.5" aria-hidden="true" /></a>}<Link href={`/demandas/${v.demandaId}`} className="inline-flex items-center rounded-lg px-3 py-1.5 text-zinc-300 hover:text-zinc-100">Ver demanda</Link></div>
      {data.podePublicar && !v.legado && <button disabled={ocupado !== null} onClick={() => publicar(v)} className={v.publicado ? "rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:border-zinc-500 disabled:opacity-50" : "rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white hover:bg-purple-500 disabled:opacity-50"}>{ocupado === v.id ? "Salvando…" : v.publicado ? "Retirar do portfólio público" : "Publicar para qualquer pessoa ver"}</button>}
      {v.legado && data.podePublicar && <p className="text-xs text-zinc-400">Link antigo: registre a entrega como arquivo final na demanda para publicar.</p>}
    </article>)}</div>
    {data && data.totalPages > 1 && <nav aria-label="Páginas" className="flex items-center justify-between"><button disabled={page === 1} onClick={() => setPage(page - 1)} className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:border-zinc-500 disabled:opacity-40"><ChevronLeft className="h-4 w-4" aria-hidden="true" />Anterior</button><span className="text-sm text-zinc-400">Página {page} de {data.totalPages}</span><button disabled={page >= data.totalPages} onClick={() => setPage(page + 1)} className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:border-zinc-500 disabled:opacity-40">Próxima<ChevronRight className="h-4 w-4" aria-hidden="true" /></button></nav>}
    </main>
  </>
}

"use client"
import { useState } from "react"
import useSWR from "swr"
import Link from "next/link"
import { useMe } from "@/hooks/usePermissoes"

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
  return <main className="space-y-6 p-6">
    <div><h1 className="text-2xl font-semibold">Biblioteca</h1><p className="text-sm text-muted-foreground">Entregas da equipe. Só os itens publicados ficam visíveis no portfólio público.</p></div>
    <div className="flex flex-wrap gap-3">
      <label>Área <select className="rounded border p-2" value={area} onChange={e => { setArea(e.target.value as "audiovisual" | "design"); setPage(1) }}><option value="audiovisual">Audiovisual</option><option value="design">Growth</option></select></label>
      <input className="rounded border p-2" aria-label="Buscar entregas" placeholder="Buscar título ou código" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
    </div>
    <details><summary className="cursor-pointer">Filtros de tipo, projeto, pessoa e qualidade</summary><div className="flex flex-wrap gap-3 py-3">
      <input aria-label="Tipo de entrega" placeholder="Tipo (ex.: reels)" value={tipo} onChange={e=>{setTipo(e.target.value);setPage(1)}} className="border rounded p-2" />
      <input aria-label="Projeto" placeholder="Projeto" value={projeto} onChange={e=>{setProjeto(e.target.value);setPage(1)}} className="border rounded p-2" />
      <input aria-label="Pessoa" placeholder="Nome da pessoa" value={pessoa} onChange={e=>{setPessoa(e.target.value);setPage(1)}} className="border rounded p-2" />
      <select aria-label="Qualidade do acervo" value={qualidade} onChange={e=>{setQualidade(e.target.value);setPage(1)}} className="border rounded p-2"><option value="">Entregas registradas</option><option value="sem_final">Tipos que exigem arquivo, sem referência final</option></select>
    </div></details>
    {podeRevisar && <Link href="/biblioteca/acervo" className="text-sm underline">Revisar acervo e política de retenção</Link>}
    {data?.pendencias?.map(d=><article key={d.id} className="rounded border p-4"><Link href={`/demandas/${d.id}`} className="underline">{d.codigo} · {d.titulo}</Link><p className="text-sm">Sem referência final registrada. Isso não comprova perda do arquivo.</p></article>)}
    {(erro || error) && <p role="alert" className="text-red-600">{erro || error.message}</p>}
    {data && <p className="text-sm text-muted-foreground">{data.total} {qualidade ? "demandas para revisar" : "entregáveis encontrados"}</p>}
    {isLoading && <p>Carregando entregas…</p>}
    {data?.videos.length === 0 && !data.pendencias?.length && <p>Nenhuma entrega encontrada nesta seleção.</p>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{data?.videos.map(v => <article key={v.id} className="space-y-3 rounded-xl border p-4">
      {/* URLs protegidas por sessão passam diretamente pelo navegador. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {v.thumbnailUrl && <img src={v.thumbnailUrl} alt="" loading="lazy" className="aspect-video w-full rounded object-cover" />}
      <span className="text-xs text-muted-foreground">{v.codigo} · {v.publicado ? "Publicado no portfólio" : "Uso interno"}</span>
      <h2 className="font-medium">{v.titulo}</h2>
      <p className="text-xs text-muted-foreground">{new Date(v.dataReferencia).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })} · {v.dataEstimada ? "Data estimada" : v.origemData === "anexacao" ? "Anexado" : "Concluído"}</p>
      <p className="text-xs text-muted-foreground">{v.estadoPrevia === "verificada" ? "Prévia verificada" : v.estadoPrevia === "processando" ? "Prévia em processamento" : v.estadoPrevia === "falhou" ? "Prévia não concluída; revise na demanda" : "Prévia não verificada; abra a referência ou revise na demanda"}</p>
      <div className="flex flex-wrap gap-3 text-sm"><a href={v.linkFinal} target="_blank" rel="noopener noreferrer" className="underline">Abrir arquivo</a>{v.downloadUrl && <a href={v.downloadUrl} target="_blank" rel="noopener noreferrer" className="underline">Baixar</a>}<Link href={`/demandas/${v.demandaId}`} className="underline">Ver demanda</Link></div>
      {data.podePublicar && !v.legado && <button disabled={ocupado !== null} onClick={() => publicar(v)} className="rounded border px-3 py-2 text-sm disabled:opacity-50">{ocupado === v.id ? "Salvando…" : v.publicado ? "Retirar do portfólio público" : "Publicar para qualquer pessoa ver"}</button>}
      {v.legado && data.podePublicar && <p className="text-xs text-muted-foreground">Link antigo: registre a entrega como arquivo final na demanda para publicar.</p>}
    </article>)}</div>
    {data && data.totalPages > 1 && <div className="flex items-center gap-4"><button disabled={page === 1} onClick={() => setPage(page - 1)}>Anterior</button><span>Página {page} de {data.totalPages}</span><button disabled={page >= data.totalPages} onClick={() => setPage(page + 1)}>Próxima</button></div>}
  </main>
}

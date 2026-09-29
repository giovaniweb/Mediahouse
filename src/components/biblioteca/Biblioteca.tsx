"use client"
import { useState } from "react"
import useSWR from "swr"
import Link from "next/link"

type Entrega = { id: string; demandaId: string; codigo: string; titulo: string; linkFinal: string; thumbnailUrl: string | null; publicado: boolean; legado: boolean }
const fetcher = async (url: string) => {
  const res = await fetch(url)
  const body = await res.json()
  if (!res.ok) throw new Error(body.error ?? "Não foi possível carregar a biblioteca")
  return body as { videos: Entrega[]; totalPages: number; podePublicar: boolean }
}
export default function Biblioteca({ areaInicial = "audiovisual" }: { areaInicial?: "audiovisual" | "design" }) {
  const [area, setArea] = useState(areaInicial), [search, setSearch] = useState(""), [page, setPage] = useState(1)
  const [ocupado, setOcupado] = useState<string | null>(null), [erro, setErro] = useState("")
  const { data, error, isLoading, mutate } = useSWR(`/api/biblioteca?area=${area}&page=${page}&search=${encodeURIComponent(search)}`, fetcher)
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
    {(erro || error) && <p role="alert" className="text-red-600">{erro || error.message}</p>}
    {isLoading && <p>Carregando entregas…</p>}
    {data?.videos.length === 0 && <p>Nenhuma entrega encontrada nesta seleção.</p>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{data?.videos.map(v => <article key={v.id} className="space-y-3 rounded-xl border p-4">
      {/* URLs protegidas por sessão passam diretamente pelo navegador. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {v.thumbnailUrl && <img src={v.thumbnailUrl} alt="" loading="lazy" className="aspect-video w-full rounded object-cover" />}
      <span className="text-xs text-muted-foreground">{v.codigo} · {v.publicado ? "Publicado no portfólio" : "Uso interno"}</span>
      <h2 className="font-medium">{v.titulo}</h2>
      <div className="flex flex-wrap gap-3 text-sm"><a href={v.linkFinal} target="_blank" rel="noopener noreferrer" className="underline">Abrir arquivo</a><Link href={`/demandas/${v.demandaId}`} className="underline">Ver demanda</Link></div>
      {data.podePublicar && !v.legado && <button disabled={ocupado !== null} onClick={() => publicar(v)} className="rounded border px-3 py-2 text-sm disabled:opacity-50">{ocupado === v.id ? "Salvando…" : v.publicado ? "Retirar do portfólio público" : "Publicar para qualquer pessoa ver"}</button>}
      {v.legado && data.podePublicar && <p className="text-xs text-muted-foreground">Link antigo: registre a entrega como arquivo final na demanda para publicar.</p>}
    </article>)}</div>
    {data && data.totalPages > 1 && <div className="flex items-center gap-4"><button disabled={page === 1} onClick={() => setPage(page - 1)}>Anterior</button><span>Página {page} de {data.totalPages}</span><button disabled={page >= data.totalPages} onClick={() => setPage(page + 1)}>Próxima</button></div>}
  </main>
}

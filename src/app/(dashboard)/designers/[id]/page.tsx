"use client"

import { useState } from "react"
import useSWR from "swr"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, Loader2, Trash2, Pencil, Check, X } from "lucide-react"
import { toast } from "sonner"
import { TIPO_ARTE_LABEL } from "@/lib/design-pecas"

const fetcher = (url: string) => fetch(url).then((r) => r.json())
const inputCls = "w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-purple-500"

const STATUS_ARTE: Record<string, string> = {
  entrada: "Briefing", producao: "Criação", edicao: "Ajustes",
  aprovacao: "Aprovação", para_postar: "Entrega", finalizado: "Concluído",
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function DesignerDetalhePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { data, mutate, isLoading } = useSWR<{ designer: any }>(`/api/designers/${id}`, fetcher) // eslint-disable-line @typescript-eslint/no-explicit-any
  const [editing, setEditing] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [form, setForm] = useState<any>({})

  if (isLoading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-zinc-600" /></div>
  const d = data?.designer
  if (!d) return <div className="p-6 text-zinc-500">Designer não encontrado.</div>

  async function patch(payload: Record<string, unknown>) {
    await fetch(`/api/designers/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
    mutate(); toast.success("Salvo")
  }
  async function remover() {
    if (!confirm("Remover designer?")) return
    await fetch(`/api/designers/${id}`, { method: "DELETE" }); router.push("/designers")
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <button onClick={() => router.push("/designers")} className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-white mb-4"><ArrowLeft className="w-4 h-4" /> Designers</button>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-zinc-100">{d.nome}</h1>
            <div className="flex items-center gap-3 mt-1 text-sm text-zinc-500 flex-wrap">
              {d.telefone && <span>{d.telefone}</span>}
              {d.email && <span>{d.email}</span>}
              {d.cidade && <span>{d.cidade}{d.estado ? `/${d.estado}` : ""}</span>}
            </div>
            {d.especialidade?.length > 0 && (
              <div className="flex gap-1 mt-2 flex-wrap">
                {d.especialidade.map((e: string) => <span key={e} className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">{e}</span>)}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => patch({ tipoContrato: d.tipoContrato === "interno" ? "externo" : "interno" })}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${d.tipoContrato === "interno" ? "bg-blue-600/20 border-blue-600/40 text-blue-300" : "bg-amber-600/20 border-amber-600/40 text-amber-300"}`}>
              {d.tipoContrato === "interno" ? "Interno" : "Externo"}
            </button>
            <button onClick={() => patch({ status: d.status === "ativo" ? "inativo" : "ativo" })}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${d.status === "ativo" ? "bg-emerald-600/20 border-emerald-600/40 text-emerald-300" : "bg-zinc-700/40 border-zinc-600 text-zinc-400"}`}>
              {d.status === "ativo" ? "Ativo" : "Inativo"}
            </button>
            <button onClick={() => { setForm({ nome: d.nome, telefone: d.telefone ?? "", email: d.email ?? "", cidade: d.cidade ?? "", valorDiaria: d.valorDiaria ?? "" }); setEditing(!editing) }}
              className="p-1.5 rounded-lg text-zinc-500 hover:text-white"><Pencil className="w-4 h-4" /></button>
            <button onClick={remover} className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
          </div>
        </div>

        {editing && (
          <div className="mt-4 grid grid-cols-2 gap-2 border-t border-zinc-800 pt-4">
            <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Nome" className={inputCls} />
            <input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} placeholder="Telefone" className={inputCls} />
            <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="E-mail" className={inputCls} />
            <input value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} placeholder="Cidade" className={inputCls} />
            <input type="number" value={form.valorDiaria} onChange={(e) => setForm({ ...form, valorDiaria: e.target.value })} placeholder="Diária (R$)" className={inputCls} />
            <div className="flex gap-2">
              <button onClick={() => { patch(form); setEditing(false) }} className="flex-1 flex items-center justify-center gap-1 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm"><Check className="w-4 h-4" /> Salvar</button>
              <button onClick={() => setEditing(false)} className="px-3 border border-zinc-700 text-zinc-400 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
          </div>
        )}
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-zinc-800"><h3 className="text-xs font-semibold text-zinc-400 uppercase">Artes ({d.demandas?.length ?? 0})</h3></div>
        {(d.demandas ?? []).length === 0 ? (
          <p className="p-4 text-sm text-zinc-500">Nenhuma arte atribuída.</p>
        ) : (
          <div className="divide-y divide-zinc-800">
            {d.demandas.map((dm: { id: string; codigo: string; titulo: string; statusVisivel: string; tipoVideo: string }) => (
              <Link key={dm.id} href={`/demandas/${dm.id}`} className="flex items-center justify-between p-4 hover:bg-zinc-800/50">
                <div className="min-w-0">
                  <p className="text-sm text-zinc-200 truncate">{dm.titulo}</p>
                  <p className="text-xs text-zinc-500">{dm.codigo} · {TIPO_ARTE_LABEL[dm.tipoVideo] ?? dm.tipoVideo}</p>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300">{STATUS_ARTE[dm.statusVisivel] ?? dm.statusVisivel}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import useSWR from "swr"
import { Header } from "@/components/layout/Header"
import { ArrowLeft, Film, Save, X, Edit2, QrCode, Download, Star } from "lucide-react"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { QRCodeSVG } from "qrcode.react"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const specs = ["institucional", "motion", "aftermovie", "social_media", "reels", "ads", "vsl", "tutorial"]

const prioridadeConfig: Record<string, string> = {
  urgente: "bg-red-100 text-red-700",
  alta: "bg-orange-100 text-orange-700",
  normal: "bg-zinc-100 text-zinc-600",
}

export default function EditorDetalhePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { data, mutate } = useSWR(`/api/editores/${id}`, fetcher)
  const editor = data?.editor
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState<{
    nome: string; email: string; telefone: string
    cargaLimite: string; status: string; especialidade: string[]
  }>({ nome: "", email: "", telefone: "", cargaLimite: "5", status: "ativo", especialidade: [] })

  function startEdit() {
    if (!editor) return
    setForm({
      nome: editor.nome ?? "",
      email: editor.email ?? "",
      telefone: editor.telefone ?? "",
      cargaLimite: editor.cargaLimite?.toString() ?? "5",
      status: editor.status ?? "ativo",
      especialidade: editor.especialidade ?? [],
    })
    setEditing(true)
  }

  function toggleSpec(s: string) {
    setForm((f) => ({
      ...f,
      especialidade: f.especialidade.includes(s)
        ? f.especialidade.filter((x) => x !== s)
        : [...f.especialidade, s],
    }))
  }

  async function saveEdit() {
    setLoading(true)
    await fetch(`/api/editores/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, cargaLimite: Number(form.cargaLimite) }),
    })
    setLoading(false)
    setEditing(false)
    mutate()
  }

  if (!editor) {
    return (
      <>
        <Header title="Editor" />
        <main className="flex-1 p-6 flex items-center justify-center text-zinc-400">Carregando...</main>
      </>
    )
  }

  const carga = editor.demandas?.filter((d: { statusVisivel: string }) =>
    d.statusVisivel !== "finalizado" && d.statusVisivel !== "encerrado"
  ).length ?? 0
  const pct = Math.min((carga / editor.cargaLimite) * 100, 100)
  const cargaStatus = pct >= 100 ? "sobrecarga" : pct >= 75 ? "atencao" : "ok"

  return (
    <>
      <Header
        title={editor.nome}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.back()}
              className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800 border rounded-lg px-3 py-1.5"
            >
              <ArrowLeft className="w-4 h-4" /> Voltar
            </button>
            {!editing ? (
              <button
                onClick={startEdit}
                className="flex items-center gap-1.5 text-sm bg-purple-600 text-white hover:bg-purple-700 rounded-lg px-3 py-1.5"
              >
                <Edit2 className="w-4 h-4" /> Editar
              </button>
            ) : (
              <>
                <button onClick={() => setEditing(false)} className="flex items-center gap-1.5 text-sm border rounded-lg px-3 py-1.5 text-zinc-600">
                  <X className="w-4 h-4" /> Cancelar
                </button>
                <button onClick={saveEdit} disabled={loading} className="flex items-center gap-1.5 text-sm bg-green-600 text-white hover:bg-green-700 rounded-lg px-3 py-1.5 disabled:opacity-60">
                  <Save className="w-4 h-4" /> {loading ? "Salvando..." : "Salvar"}
                </button>
              </>
            )}
          </div>
        }
      />

      <main className="flex-1 p-6 max-w-3xl space-y-6">
        {/* Perfil */}
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
          <div className="flex items-start justify-between mb-5">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center text-xl font-bold text-purple-600">
                {editor.nome?.charAt(0)}
              </div>
              <div>
                {editing ? (
                  <input
                    value={form.nome}
                    onChange={(e) => setForm({ ...form, nome: e.target.value })}
                    className="text-lg font-bold border rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-purple-200"
                  />
                ) : (
                  <h2 className="text-lg font-bold text-zinc-800">{editor.nome}</h2>
                )}
                <p className="text-sm text-zinc-500">{editor.email}</p>
              </div>
            </div>
            {editing ? (
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="text-sm border rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-purple-200"
              >
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
              </select>
            ) : (
              <span className={cn(
                "text-sm font-medium px-3 py-1 rounded-full",
                editor.status === "ativo" ? "bg-green-100 text-green-700" : "bg-zinc-100 text-zinc-500"
              )}>
                {editor.status}
              </span>
            )}
          </div>

          {/* Carga */}
          <div className="mb-5">
            <div className="flex justify-between text-sm mb-1.5">
              <span className="text-zinc-500">Carga atual</span>
              <span className={cn(
                "font-bold",
                cargaStatus === "sobrecarga" && "text-red-600",
                cargaStatus === "atencao" && "text-yellow-600",
                cargaStatus === "ok" && "text-green-600"
              )}>
                {carga}/{editing ? form.cargaLimite : editor.cargaLimite}
              </span>
            </div>
            <div className="h-2.5 bg-zinc-100 rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  cargaStatus === "sobrecarga" && "bg-red-500",
                  cargaStatus === "atencao" && "bg-yellow-400",
                  cargaStatus === "ok" && "bg-green-500"
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
            {editing && (
              <div className="mt-2">
                <label className="text-xs text-zinc-500">Limite de demandas</label>
                <input
                  type="number" min="1"
                  value={form.cargaLimite}
                  onChange={(e) => setForm({ ...form, cargaLimite: e.target.value })}
                  className="w-24 ml-2 border rounded px-2 py-0.5 text-sm outline-none focus:ring-2 focus:ring-purple-200"
                />
              </div>
            )}
          </div>

          {/* Especialidades */}
          <div>
            <p className="text-xs text-zinc-400 uppercase font-semibold mb-2">Especialidades</p>
            {editing ? (
              <div className="flex flex-wrap gap-1.5">
                {specs.map((s) => (
                  <button
                    key={s} type="button" onClick={() => toggleSpec(s)}
                    className={cn(
                      "text-xs px-2 py-0.5 rounded border",
                      form.especialidade.includes(s) ? "bg-purple-100 border-purple-300 text-purple-700" : "text-zinc-500"
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {editor.especialidade?.map((e: string) => (
                  <span key={e} className="text-xs bg-zinc-50 border text-zinc-600 px-2 py-0.5 rounded">{e}</span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* QR Code de Avaliação */}
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
          <h3 className="font-semibold text-zinc-100 mb-4 flex items-center gap-2">
            <QrCode className="w-4 h-4 text-purple-400" />
            QR de Avaliação
          </h3>
          <div className="flex flex-col sm:flex-row items-start gap-6">
            <div className="bg-white p-3 rounded-xl shadow-sm flex-shrink-0">
              <QRCodeSVG
                value={typeof window !== "undefined" ? `${window.location.origin}/avaliar-editor/${id}` : `/avaliar-editor/${id}`}
                size={140}
                bgColor="#ffffff"
                fgColor="#09090b"
                level="M"
              />
            </div>
            <div className="space-y-3 flex-1">
              <div>
                <p className="text-sm font-medium text-zinc-200">{editor.nome}</p>
                <p className="text-xs text-zinc-400 mt-0.5">Videomaker Int · NuFlow</p>
              </div>
              {editor.avaliacao && (
                <div className="flex items-center gap-1">
                  {[1,2,3,4,5].map((s) => (
                    <Star key={s} className={`w-4 h-4 ${s <= Math.round(editor.avaliacao) ? "text-amber-400 fill-amber-400" : "text-zinc-600"}`} />
                  ))}
                  <span className="text-sm text-zinc-300 ml-1 font-medium">{editor.avaliacao?.toFixed(1)}</span>
                </div>
              )}
              <p className="text-xs text-zinc-400">
                Compartilhe este QR code para receber avaliações anônimas sobre este profissional.
              </p>
              <a
                href={`/avaliar-editor/${id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-purple-400 hover:text-purple-300 hover:underline"
              >
                <Download className="w-3.5 h-3.5" />
                Abrir link de avaliação
              </a>
            </div>
          </div>
        </div>

        {/* Histórico de demandas */}
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
          <h3 className="font-semibold text-zinc-100 mb-4 flex items-center gap-2">
            <Film className="w-4 h-4 text-zinc-400" />
            Demandas ({editor.demandas?.length ?? 0})
          </h3>

          {editor.demandas?.length === 0 && (
            <p className="text-sm text-zinc-400 text-center py-6">Nenhuma demanda registrada.</p>
          )}

          <div className="space-y-2">
            {editor.demandas?.map((d: {
              id: string
              codigo: string
              titulo: string
              statusVisivel: string
              prioridade: string
              createdAt: string
            }) => (
              <Link key={d.id} href={`/demandas/${d.id}`}>
                <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-zinc-50 border border-transparent hover:border-zinc-100 transition-colors">
                  <Film className="w-4 h-4 text-zinc-300 shrink-0" />
                  <span className="font-mono text-xs text-zinc-400 shrink-0">{d.codigo}</span>
                  <span className="flex-1 text-sm text-zinc-700 truncate">{d.titulo}</span>
                  <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full", prioridadeConfig[d.prioridade] ?? prioridadeConfig.normal)}>
                    {d.prioridade}
                  </span>
                  <span className="text-xs text-zinc-400 shrink-0">
                    {format(new Date(d.createdAt), "dd/MM/yy", { locale: ptBR })}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </main>
    </>
  )
}

"use client"

import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useRouter } from "next/navigation"
import { Header } from "@/components/layout/Header"
import { ChevronLeft, ChevronRight, Send, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

const schema = z.object({
  titulo: z.string().min(5, "Mínimo 5 caracteres"),
  descricao: z.string().min(10, "Descreva melhor a demanda"),
  departamento: z.string().min(1, "Selecione o departamento"),
  tipoVideo: z.string().min(1, "Selecione o tipo de vídeo"),
  cidade: z.string().min(2, "Informe a cidade"),
  prioridade: z.enum(["urgente", "alta", "normal"]),
  motivoUrgencia: z.string().optional(),
  editorId: z.string().optional(),
  dataLimite: z.string().optional(),
  localEvento: z.string().optional(),
  campanha: z.string().optional(),
  objetivo: z.string().optional(),
  plataforma: z.string().optional(),
  referencia: z.string().optional(),
  observacoes: z.string().optional(),
})

type FormData = z.infer<typeof schema>

interface Parametro {
  valor: string
  label: string
}

interface Editor {
  id: string
  nome: string
  especialidade: string[]
  status: string
  _count?: { demandas: number }
}

const STEPS = ["Básico", "Detalhes", "Contexto"]

const inputClass =
  "w-full border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-500 bg-zinc-800 text-zinc-200 disabled:bg-zinc-900 disabled:text-zinc-500 placeholder-zinc-500"

function Field({ label, children, error, hint }: { label: string; children: React.ReactNode; error?: string; hint?: string }) {
  return (
    <div>
      <label className="block text-sm font-medium text-zinc-300 mb-1">{label}</label>
      {children}
      {hint && !error && <p className="text-xs text-zinc-500 mt-1">{hint}</p>}
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  )
}

export default function NovaDemandaPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)

  const [departamentos, setDepartamentos] = useState<Parametro[]>([])
  const [tiposVideoPorDepto, setTiposVideoPorDepto] = useState<Record<string, Parametro[]>>({})
  const [editores, setEditores] = useState<Editor[]>([])
  const [loadingParams, setLoadingParams] = useState(true)

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { prioridade: "normal", departamento: "", tipoVideo: "" },
  })

  const { register, watch, handleSubmit, formState: { errors } } = form
  const depto = watch("departamento")
  const prioridade = watch("prioridade")
  const tiposDisponiveis = tiposVideoPorDepto[depto] ?? []

  // Carregar parâmetros dinâmicos do banco
  useEffect(() => {
    async function carregarParametros() {
      try {
        const [resDeps, resTipos, resEditores] = await Promise.all([
          fetch("/api/configuracoes/parametros?grupo=departamentos"),
          fetch("/api/configuracoes/parametros?grupo=tipos_video"),
          fetch("/api/editores?status=ativo"),
        ])

        const deps = await resDeps.json()
        const tipos = await resTipos.json()
        const eds = await resEditores.json()

        setDepartamentos(deps.parametros ?? [])

        // Agrupar tipos de vídeo por departamento (campo: valor = "depto:tipo")
        // Se não há formato depto:tipo, usar todos os tipos para todos os deptos
        const agrupado: Record<string, Parametro[]> = {}
        const tiposArr: Parametro[] = tipos.parametros ?? []
        tiposArr.forEach((t: Parametro) => {
          if (t.valor.includes(":")) {
            const [d, v] = t.valor.split(":")
            if (!agrupado[d]) agrupado[d] = []
            agrupado[d].push({ valor: v, label: t.label })
          } else {
            // Sem depto específico: disponível para todos
            if (!agrupado["_all"]) agrupado["_all"] = []
            agrupado["_all"].push(t)
          }
        })

        // Fallback: se banco vazio, usar defaults
        if (tiposArr.length === 0) {
          setTiposVideoPorDepto({
            growth: [
              { valor: "reels", label: "Reels" },
              { valor: "ads", label: "Anúncio (Ads)" },
              { valor: "vsl", label: "VSL" },
              { valor: "tutorial", label: "Tutorial" },
            ],
            eventos: [
              { valor: "aftermovie", label: "Aftermovie" },
              { valor: "cobertura_evento", label: "Cobertura de Evento" },
              { valor: "teaser", label: "Teaser" },
            ],
            institucional: [
              { valor: "video_institucional", label: "Vídeo Institucional" },
              { valor: "depoimento", label: "Depoimento" },
              { valor: "tour_instalacoes", label: "Tour Instalações" },
            ],
            rh: [
              { valor: "reels", label: "Reels" },
              { valor: "video_institucional", label: "Vídeo Institucional" },
              { valor: "tutorial", label: "Tutorial" },
            ],
            audiovisual: [
              { valor: "documentario", label: "Documentário" },
              { valor: "minidoc", label: "Mini-doc" },
              { valor: "entrevista", label: "Entrevista" },
            ],
            outros: [
              { valor: "outro", label: "Outro" },
            ],
          })
        } else {
          // Quando há tipos sem depto, replica para todos os deptos
          const global = agrupado["_all"] ?? []
          delete agrupado["_all"]
          const deptosUsados = new Set([...Object.keys(agrupado), ...(deps.parametros ?? []).map((d: Parametro) => d.valor)])
          deptosUsados.forEach(d => {
            if (!agrupado[d]) agrupado[d] = []
            agrupado[d] = [...(agrupado[d] ?? []), ...global]
          })
          setTiposVideoPorDepto(agrupado)
        }

        if (deps.parametros?.length === 0) {
          // Fallback departamentos
          setDepartamentos([
            { valor: "growth", label: "Growth" },
            { valor: "eventos", label: "Eventos" },
            { valor: "institucional", label: "Institucional" },
            { valor: "rh", label: "RH" },
            { valor: "audiovisual", label: "Audiovisual" },
            { valor: "outros", label: "Outros" },
          ])
        }

        setEditores(eds.editores ?? [])
      } catch {
        // fallback silencioso
      } finally {
        setLoadingParams(false)
      }
    }
    carregarParametros()
  }, [])

  async function onSubmit(data: FormData) {
    setLoading(true)
    try {
      const res = await fetch("/api/demandas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error("Erro ao criar demanda")
      const { demanda } = await res.json()
      router.push(`/demandas/${demanda.id}`)
    } catch {
      alert("Erro ao criar demanda. Tente novamente.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Header title="Nova Demanda" />
      <main className="flex-1 p-6 max-w-2xl mx-auto">
        {/* Steps */}
        <div className="flex items-center gap-2 mb-8">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={cn(
                  "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold",
                  i < step
                    ? "bg-green-600 text-white"
                    : i === step
                    ? "bg-purple-600 text-white"
                    : "bg-zinc-800 text-zinc-500 border border-zinc-700"
                )}
              >
                {i < step ? "✓" : i + 1}
              </div>
              <span className={cn("text-sm", i === step ? "font-semibold text-zinc-100" : "text-zinc-500")}>
                {s}
              </span>
              {i < STEPS.length - 1 && <div className="w-8 h-px bg-zinc-700" />}
            </div>
          ))}
        </div>

        {loadingParams && (
          <div className="flex items-center gap-2 text-sm text-zinc-400 mb-4">
            <Loader2 className="w-4 h-4 animate-spin" />
            Carregando parâmetros...
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* STEP 0 — Básico */}
          {step === 0 && (
            <>
              <Field label="Título da demanda" error={errors.titulo?.message}>
                <input {...register("titulo")} placeholder="Ex: Reels lançamento produto X" className={inputClass} />
              </Field>

              <Field label="Descrição" error={errors.descricao?.message}>
                <textarea
                  {...register("descricao")}
                  rows={3}
                  placeholder="Descreva o objetivo, referências, tom de voz..."
                  className={inputClass}
                />
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Departamento" error={errors.departamento?.message}>
                  <select {...register("departamento")} className={inputClass} disabled={loadingParams}>
                    <option value="">Selecionar...</option>
                    {departamentos.map((d) => (
                      <option key={d.valor} value={d.valor}>{d.label}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Tipo de vídeo" error={errors.tipoVideo?.message}>
                  <select {...register("tipoVideo")} className={inputClass} disabled={!depto || loadingParams}>
                    <option value="">Selecionar...</option>
                    {tiposDisponiveis.map((t) => (
                      <option key={t.valor} value={t.valor}>{t.label}</option>
                    ))}
                  </select>
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Prioridade" error={errors.prioridade?.message}>
                  <select {...register("prioridade")} className={inputClass}>
                    <option value="normal">Normal</option>
                    <option value="alta">Alta</option>
                    <option value="urgente">🚨 Urgente</option>
                  </select>
                </Field>
                <Field label="Cidade" error={errors.cidade?.message}>
                  <input {...register("cidade")} placeholder="São Paulo" className={inputClass} />
                </Field>
              </div>

              {prioridade === "urgente" && (
                <Field label="Motivo da urgência" error={errors.motivoUrgencia?.message}>
                  <select {...register("motivoUrgencia")} className={inputClass}>
                    <option value="">Selecionar motivo...</option>
                    <option value="Trend do Instagram / TikTok">Trend Instagram/TikTok</option>
                    <option value="Prazo contratual">Prazo contratual</option>
                    <option value="Evento iminente">Evento iminente</option>
                    <option value="Campanha urgente">Campanha urgente</option>
                    <option value="Solicitação da diretoria">Solicitação da diretoria</option>
                  </select>
                </Field>
              )}

              {/* Editor (Videomaker Int) */}
              {editores.length > 0 && (
                <Field
                  label="Videomaker Int (Editor) — opcional"
                  hint="Atribuir já na criação. Pode ser alterado depois."
                  error={errors.editorId?.message}
                >
                  <select {...register("editorId")} className={inputClass}>
                    <option value="">Sem atribuição por enquanto</option>
                    {editores.map((e) => {
                      const carga = e._count?.demandas ?? 0
                      const disponibilidade = carga < 3 ? "🟢" : carga < 5 ? "🟡" : "🔴"
                      return (
                        <option key={e.id} value={e.id}>
                          {disponibilidade} {e.nome} {e.especialidade.length > 0 ? `· ${e.especialidade[0]}` : ""} ({carga} dem.)
                        </option>
                      )
                    })}
                  </select>
                </Field>
              )}
            </>
          )}

          {/* STEP 1 — Detalhes */}
          {step === 1 && (
            <>
              <Field label="Data limite" error={errors.dataLimite?.message}>
                <input type="date" {...register("dataLimite")} className={inputClass} />
              </Field>
              <Field label="Local do evento (se aplicável)" error={errors.localEvento?.message}>
                <input {...register("localEvento")} placeholder="Ex: Espaço XP — Faria Lima" className={inputClass} />
              </Field>
              <Field label="Referência (link de vídeo)">
                <input {...register("referencia")} placeholder="https://..." className={inputClass} />
              </Field>
              <Field label="Observações adicionais">
                <textarea
                  {...register("observacoes")}
                  rows={3}
                  placeholder="Algo mais que a equipe precisa saber?"
                  className={inputClass}
                />
              </Field>
            </>
          )}

          {/* STEP 2 — Contexto */}
          {step === 2 && (
            <>
              <Field label="Campanha">
                <input {...register("campanha")} placeholder="Ex: Performance Q2" className={inputClass} />
              </Field>
              <Field label="Objetivo">
                <input {...register("objetivo")} placeholder="Ex: Conversão, Awareness..." className={inputClass} />
              </Field>
              <Field label="Plataforma">
                <select {...register("plataforma")} className={inputClass}>
                  <option value="">Selecionar...</option>
                  <option value="Meta Ads">Meta Ads</option>
                  <option value="Instagram Orgânico">Instagram Orgânico</option>
                  <option value="YouTube">YouTube</option>
                  <option value="TikTok">TikTok</option>
                  <option value="LinkedIn">LinkedIn</option>
                  <option value="Site">Site</option>
                </select>
              </Field>
            </>
          )}

          {/* Navegação */}
          <div className="flex justify-between pt-4 border-t border-zinc-800">
            {step > 0 ? (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                className="flex items-center gap-1.5 px-4 py-2 text-sm border border-zinc-700 rounded-lg hover:bg-zinc-800 text-zinc-300"
              >
                <ChevronLeft className="w-4 h-4" /> Voltar
              </button>
            ) : (
              <button
                type="button"
                onClick={() => router.back()}
                className="px-4 py-2 text-sm border border-zinc-700 rounded-lg hover:bg-zinc-800 text-zinc-300"
              >
                Cancelar
              </button>
            )}

            {step < STEPS.length - 1 ? (
              <button
                type="button"
                onClick={() => setStep((s) => s + 1)}
                className="flex items-center gap-1.5 px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700"
              >
                Próximo <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={loading}
                className="flex items-center gap-1.5 px-5 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-60"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {loading ? "Enviando..." : "Criar Demanda"}
              </button>
            )}
          </div>
        </form>
      </main>
    </>
  )
}

"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useRouter } from "next/navigation"
import { Header } from "@/components/layout/Header"
import { ChevronLeft, ChevronRight, Send } from "lucide-react"
import { cn } from "@/lib/utils"

const schema = z.object({
  titulo: z.string().min(5, "Mínimo 5 caracteres"),
  descricao: z.string().min(10, "Descreva melhor a demanda"),
  departamento: z.string().min(1, "Selecione o departamento"),
  tipoVideo: z.string().min(1, "Selecione o tipo de vídeo"),
  cidade: z.string().min(2, "Informe a cidade"),
  prioridade: z.enum(["urgente", "alta", "normal", "baixa"]),
  motivoUrgencia: z.string().optional(),
  dataLimite: z.string().optional(),
  localEvento: z.string().optional(),
  campanha: z.string().optional(),
  objetivo: z.string().optional(),
  plataforma: z.string().optional(),
  referencia: z.string().optional(),
  observacoes: z.string().optional(),
})

type FormData = z.infer<typeof schema>

const TIPOS_VIDEO_POR_DEPTO: Record<string, string[]> = {
  growth: ["reels", "ads", "vsl", "tutorial"],
  eventos: ["aftermovie", "cobertura_evento", "teaser"],
  institucional: ["video_institucional", "tour_instalacoes", "depoimento"],
  rh: ["reels", "video_institucional", "tutorial"],
  comercial: ["ads", "vsl", "depoimento"],
  social_media: ["reels", "stories", "tutorial"],
}

const STEPS = ["Básico", "Detalhes", "Contexto"]

export default function NovaDemandaPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { prioridade: "normal", departamento: "", tipoVideo: "" },
  })

  const { register, watch, handleSubmit, formState: { errors } } = form
  const depto = watch("departamento")
  const prioridade = watch("prioridade")
  const tipos = TIPOS_VIDEO_POR_DEPTO[depto] ?? []

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
                  i <= step
                    ? "bg-purple-600 text-white"
                    : "bg-zinc-100 text-zinc-400"
                )}
              >
                {i + 1}
              </div>
              <span className={cn("text-sm", i === step ? "font-semibold text-zinc-800" : "text-zinc-400")}>
                {s}
              </span>
              {i < STEPS.length - 1 && <div className="w-8 h-px bg-zinc-200" />}
            </div>
          ))}
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* STEP 0 — Básico */}
          {step === 0 && (
            <>
              <Field label="Título da demanda" error={errors.titulo?.message}>
                <input {...register("titulo")} placeholder="Ex: Reels lançamento produto X" className={inputClass} />
              </Field>

              <Field label="Descrição" error={errors.descricao?.message}>
                <textarea {...register("descricao")} rows={3} placeholder="Descreva o objetivo, referências, tom de voz..." className={inputClass} />
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Departamento" error={errors.departamento?.message}>
                  <select {...register("departamento")} className={inputClass}>
                    <option value="">Selecionar...</option>
                    {Object.keys(TIPOS_VIDEO_POR_DEPTO).map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Tipo de vídeo" error={errors.tipoVideo?.message}>
                  <select {...register("tipoVideo")} className={inputClass} disabled={!depto}>
                    <option value="">Selecionar...</option>
                    {tipos.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Prioridade" error={errors.prioridade?.message}>
                  <select {...register("prioridade")} className={inputClass}>
                    <option value="baixa">Baixa</option>
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
              <Field label="Referência (link de vídeo)" error={errors.referencia?.message}>
                <input {...register("referencia")} placeholder="https://..." className={inputClass} />
              </Field>
              <Field label="Observações adicionais">
                <textarea {...register("observacoes")} rows={3} placeholder="Algo mais que a equipe precisa saber?" className={inputClass} />
              </Field>
            </>
          )}

          {/* STEP 2 — Contexto (só para growth/comercial) */}
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
                  <option>Meta Ads</option>
                  <option>Instagram Orgânico</option>
                  <option>YouTube</option>
                  <option>TikTok</option>
                  <option>LinkedIn</option>
                  <option>Site</option>
                </select>
              </Field>
            </>
          )}

          {/* Navegação */}
          <div className="flex justify-between pt-4">
            {step > 0 ? (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                className="flex items-center gap-1.5 px-4 py-2 text-sm border rounded-lg hover:bg-zinc-50 text-zinc-600"
              >
                <ChevronLeft className="w-4 h-4" /> Voltar
              </button>
            ) : (
              <button
                type="button"
                onClick={() => router.back()}
                className="px-4 py-2 text-sm border rounded-lg hover:bg-zinc-50 text-zinc-600"
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
                <Send className="w-4 h-4" /> {loading ? "Enviando..." : "Criar Demanda"}
              </button>
            )}
          </div>
        </form>
      </main>
    </>
  )
}

const inputClass =
  "w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-200 bg-white disabled:bg-zinc-50 disabled:text-zinc-400"

function Field({ label, children, error }: { label: string; children: React.ReactNode; error?: string }) {
  return (
    <div>
      <label className="block text-sm font-medium text-zinc-700 mb-1">{label}</label>
      {children}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  )
}

"use client"

import { useState } from "react"
import Link from "next/link"
import { Film, ArrowLeft, Mail, CheckCircle2, AlertCircle } from "lucide-react"

export default function EsqueciSenhaPage() {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [erro, setErro] = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return
    setLoading(true)
    setErro("")

    try {
      const res = await fetch("/api/auth/esqueci-senha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setErro(data.error || "Erro ao enviar e-mail. Verifique as configurações SMTP.")
      } else {
        setEnviado(true)
      }
    } catch {
      setErro("Erro de conexão. Tente novamente.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 text-white mb-2">
            <Film className="h-6 w-6" />
            <span className="text-xl font-bold tracking-tight">NuFlow</span>
          </div>
        </div>

        {enviado ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center shadow-2xl">
            <div className="w-14 h-14 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-5">
              <CheckCircle2 className="h-7 w-7 text-green-400" />
            </div>
            <h1 className="text-xl font-bold text-white mb-3">E-mail enviado!</h1>
            <p className="text-zinc-400 text-sm leading-relaxed mb-2">
              Enviamos um link de redefinição para{" "}
              <span className="text-zinc-200 font-medium">{email}</span>.
            </p>
            <p className="text-zinc-500 text-xs leading-relaxed mb-6">
              O link é válido por 1 hora. Verifique também a caixa de spam.
            </p>
            <Link href="/login" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors">
              <ArrowLeft className="h-4 w-4" /> Voltar ao login
            </Link>
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl">
            <div className="mb-6">
              <h1 className="text-xl font-bold text-white mb-1">Esqueceu a senha?</h1>
              <p className="text-zinc-400 text-sm">Informe seu e-mail e enviaremos um link de redefinição.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">E-mail</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="seu@outlook.com"
                    required
                    autoFocus
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-200 placeholder:text-zinc-500 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-500 transition-colors"
                  />
                </div>
              </div>

              {erro && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{erro}</span>
                </div>
              )}

              <button type="submit" disabled={loading || !email}
                className="w-full py-2.5 rounded-lg bg-white text-zinc-900 text-sm font-semibold hover:bg-zinc-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
                    Enviando...
                  </span>
                ) : "Enviar link de redefinição"}
              </button>
            </form>

            <div className="mt-5 text-center">
              <Link href="/login" className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
                <ArrowLeft className="h-3.5 w-3.5" /> Voltar ao login
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

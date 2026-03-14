"use client"

import { useState, useEffect, use } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Film, ArrowLeft, Eye, EyeOff, CheckCircle2, AlertCircle, Lock, XCircle } from "lucide-react"

interface Params {
  token: string
}

type Estado = "verificando" | "valido" | "invalido" | "sucesso"

export default function RedefinirSenhaPage({ params }: { params: Promise<Params> }) {
  const { token } = use(params)
  const router = useRouter()

  const [estado, setEstado] = useState<Estado>("verificando")
  const [erroToken, setErroToken] = useState("")
  const [novaSenha, setNovaSenha] = useState("")
  const [confirmarSenha, setConfirmarSenha] = useState("")
  const [showSenha, setShowSenha] = useState(false)
  const [showConfirmar, setShowConfirmar] = useState(false)
  const [loading, setLoading] = useState(false)
  const [erroForm, setErroForm] = useState("")

  // Valida o token ao carregar a página
  useEffect(() => {
    async function validarToken() {
      try {
        const res = await fetch(`/api/auth/redefinir-senha?token=${token}`)
        const data = await res.json()
        if (data.valido) {
          setEstado("valido")
        } else {
          setErroToken(data.error || "Link inválido")
          setEstado("invalido")
        }
      } catch {
        setErroToken("Erro ao verificar o link.")
        setEstado("invalido")
      }
    }
    validarToken()
  }, [token])

  // Critérios de senha
  const criterios = [
    { ok: novaSenha.length >= 8, texto: "Mínimo 8 caracteres" },
    { ok: /[A-Z]/.test(novaSenha), texto: "Pelo menos uma letra maiúscula" },
    { ok: /[0-9]/.test(novaSenha), texto: "Pelo menos um número" },
  ]
  const senhaForte = criterios.every((c) => c.ok)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErroForm("")

    if (!senhaForte) {
      setErroForm("A senha não atende aos requisitos mínimos.")
      return
    }
    if (novaSenha !== confirmarSenha) {
      setErroForm("As senhas não coincidem.")
      return
    }

    setLoading(true)
    try {
      const res = await fetch("/api/auth/redefinir-senha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, novaSenha }),
      })
      const data = await res.json()

      if (!res.ok) {
        setErroForm(data.error || "Erro ao redefinir senha.")
      } else {
        setEstado("sucesso")
        // Redireciona para login após 3s
        setTimeout(() => router.push("/login"), 3000)
      }
    } catch {
      setErroForm("Erro de conexão. Tente novamente.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 text-white mb-2">
            <Film className="h-6 w-6" />
            <span className="text-xl font-bold tracking-tight">VideoOps</span>
          </div>
        </div>

        {/* Verificando */}
        {estado === "verificando" && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center shadow-2xl">
            <div className="h-8 w-8 border-2 border-zinc-500 border-t-zinc-200 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-zinc-400 text-sm">Verificando link...</p>
          </div>
        )}

        {/* Token inválido */}
        {estado === "invalido" && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center shadow-2xl">
            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-5">
              <XCircle className="h-8 w-8 text-red-500" />
            </div>
            <h1 className="text-xl font-bold text-white mb-3">Link inválido</h1>
            <p className="text-zinc-400 text-sm leading-relaxed mb-6">{erroToken}</p>
            <Link
              href="/esqueci-senha"
              className="inline-flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-white text-zinc-900 text-sm font-semibold hover:bg-zinc-100 transition-colors mb-4"
            >
              Solicitar novo link
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Voltar ao login
            </Link>
          </div>
        )}

        {/* Sucesso */}
        {estado === "sucesso" && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center shadow-2xl">
            <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-5">
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            </div>
            <h1 className="text-xl font-bold text-white mb-3">Senha redefinida!</h1>
            <p className="text-zinc-400 text-sm leading-relaxed mb-6">
              Sua senha foi alterada com sucesso. Você será redirecionado para o login em instantes.
            </p>
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-white text-zinc-900 text-sm font-semibold hover:bg-zinc-100 transition-colors"
            >
              Ir para o login agora
            </Link>
          </div>
        )}

        {/* Formulário */}
        {estado === "valido" && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl">
            <div className="mb-6">
              <div className="w-12 h-12 bg-blue-500/10 rounded-full flex items-center justify-center mb-4">
                <Lock className="h-6 w-6 text-blue-400" />
              </div>
              <h1 className="text-xl font-bold text-white mb-1">Criar nova senha</h1>
              <p className="text-zinc-400 text-sm">
                Escolha uma senha segura para sua conta.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Nova senha */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                  Nova senha
                </label>
                <div className="relative">
                  <input
                    type={showSenha ? "text" : "password"}
                    value={novaSenha}
                    onChange={(e) => setNovaSenha(e.target.value)}
                    placeholder="••••••••"
                    required
                    autoFocus
                    className="w-full pl-4 pr-10 py-2.5 rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-200 placeholder:text-zinc-500 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-500 focus:border-zinc-500 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSenha((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    {showSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                {/* Critérios de senha */}
                {novaSenha.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {criterios.map((c) => (
                      <div key={c.texto} className="flex items-center gap-1.5">
                        {c.ok ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                        ) : (
                          <div className="h-3.5 w-3.5 rounded-full border border-zinc-600 flex-shrink-0" />
                        )}
                        <span className={`text-xs ${c.ok ? "text-green-400" : "text-zinc-500"}`}>
                          {c.texto}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Confirmar senha */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                  Confirmar nova senha
                </label>
                <div className="relative">
                  <input
                    type={showConfirmar ? "text" : "password"}
                    value={confirmarSenha}
                    onChange={(e) => setConfirmarSenha(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full pl-4 pr-10 py-2.5 rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-200 placeholder:text-zinc-500 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-500 focus:border-zinc-500 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmar((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    {showConfirmar ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {confirmarSenha.length > 0 && novaSenha !== confirmarSenha && (
                  <p className="mt-1 text-xs text-red-400 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    As senhas não coincidem
                  </p>
                )}
                {confirmarSenha.length > 0 && novaSenha === confirmarSenha && (
                  <p className="mt-1 text-xs text-green-400 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Senhas conferem
                  </p>
                )}
              </div>

              {erroForm && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                  <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>{erroForm}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !senhaForte || novaSenha !== confirmarSenha}
                className="w-full py-2.5 rounded-lg bg-white text-zinc-900 text-sm font-semibold hover:bg-zinc-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-white/10"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
                    Salvando...
                  </span>
                ) : (
                  "Salvar nova senha"
                )}
              </button>
            </form>

            <div className="mt-5 text-center">
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Voltar ao login
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

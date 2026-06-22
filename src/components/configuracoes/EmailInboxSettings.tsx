"use client"

import { useEffect, useState } from "react"
import useSWR from "swr"
import { toast } from "sonner"
import {
  AlertTriangle,
  CheckCircle2,
  Inbox,
  Loader2,
  MailCheck,
  RefreshCw,
  Save,
  Unplug,
} from "lucide-react"

const fetcher = (url: string) => fetch(url).then(async (res) => {
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || "Falha ao carregar")
  return data
})

interface InboxConfig {
  emailCaixa: string | null
  remetenteFiltro: string | null
  assuntoFiltro: string | null
  criarDemandaAutomaticamente: boolean
  solicitantePadraoId: string | null
  ativo: boolean
  conectado: boolean
  ultimaSincronizacaoEm: string | null
  ultimoErro: string | null
}

interface ConfigResponse {
  config: InboxConfig | null
  podeConfigurar: boolean
  integracaoMicrosoft: {
    pronta: boolean
    camposAusentes: string[]
    redirectUri: string
  }
  solicitantes: Array<{ id: string; nome: string; email: string | null; papel: string }>
}

function formatDate(value?: string | null) {
  if (!value) return "Nunca"
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value))
}

export function EmailInboxSettings() {
  const { data, mutate, error } = useSWR<ConfigResponse>("/api/email-inbox/config", fetcher)
  const [remetenteFiltro, setRemetenteFiltro] = useState("")
  const [assuntoFiltro, setAssuntoFiltro] = useState("")
  const [autoCreate, setAutoCreate] = useState(false)
  const [solicitantePadraoId, setSolicitantePadraoId] = useState("")
  const [saving, setSaving] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [syncing, setSyncing] = useState(false)

  const config = data?.config
  const connected = !!config?.conectado

  useEffect(() => {
    if (!data) return
    setRemetenteFiltro(config?.remetenteFiltro ?? "")
    setAssuntoFiltro(config?.assuntoFiltro ?? "")
    setAutoCreate(config?.criarDemandaAutomaticamente ?? false)
    setSolicitantePadraoId(config?.solicitantePadraoId ?? data.solicitantes[0]?.id ?? "")
  }, [data, config])

  async function connect() {
    setConnecting(true)
    try {
      const res = await fetch("/api/email-inbox/connect?format=json")
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Falha ao iniciar conexão")
      window.location.href = json.url
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
      setConnecting(false)
    }
  }

  async function save() {
    setSaving(true)
    try {
      const res = await fetch("/api/email-inbox/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          remetenteFiltro,
          assuntoFiltro,
          criarDemandaAutomaticamente: autoCreate,
          solicitantePadraoId: solicitantePadraoId || null,
          ativo: connected,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Falha ao salvar")
      toast.success("Configuração da caixa salva")
      await mutate()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  async function syncNow() {
    setSyncing(true)
    try {
      const res = await fetch("/api/email-inbox/sync", { method: "POST" })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Falha ao sincronizar")
      toast.success(`${json.recebidos} novo(s) e-mail(s), ${json.criados} demanda(s) criada(s)`)
      await mutate()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setSyncing(false)
    }
  }

  async function disconnect() {
    if (!confirm("Desconectar esta caixa? Os e-mails já importados serão preservados.")) return
    const res = await fetch("/api/email-inbox/config", { method: "DELETE" })
    const json = await res.json()
    if (!res.ok) {
      toast.error(json.error || "Falha ao desconectar")
      return
    }
    toast.success("Caixa desconectada")
    await mutate()
  }

  if (error) {
    return <p className="text-sm text-red-400">{error.message}</p>
  }
  if (!data) {
    return <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-zinc-500" /></div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 border-b border-zinc-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <MailCheck className={connected ? "h-5 w-5 text-emerald-400" : "h-5 w-5 text-zinc-500"} />
            <h2 className="text-sm font-semibold text-zinc-100">
              {connected ? config?.emailCaixa : "Caixa Microsoft 365"}
            </h2>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            {connected
              ? `Última sincronização: ${formatDate(config?.ultimaSincronizacaoEm)}`
              : "Conecte o e-mail que recebe as solicitações de produção."}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {connected ? (
            <>
              <button
                onClick={syncNow}
                disabled={syncing}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-white px-3 text-sm font-medium text-zinc-900 hover:bg-zinc-100 disabled:opacity-50"
              >
                {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Sincronizar
              </button>
              <button
                onClick={disconnect}
                title="Desconectar caixa"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-700 text-zinc-400 hover:border-red-900 hover:text-red-400"
              >
                <Unplug className="h-4 w-4" />
              </button>
            </>
          ) : (
            <button
              onClick={connect}
              disabled={connecting || !data.integracaoMicrosoft.pronta}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <MailCheck className="h-4 w-4" />}
              Conectar Microsoft 365
            </button>
          )}
        </div>
      </div>

      {!data.integracaoMicrosoft.pronta && (
        <div className="flex gap-3 rounded-lg border border-amber-900/70 bg-amber-950/30 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
          <div>
            <p className="text-sm font-medium text-amber-300">Integração Microsoft ainda não ativada no servidor</p>
            <p className="mt-1 text-xs leading-relaxed text-amber-200/70">
              Configure {data.integracaoMicrosoft.camposAusentes.join(" e ")} no ambiente do NuFlow.
              Depois registre esta URL no Microsoft Entra:
            </p>
            <code className="mt-2 block break-all rounded bg-black/20 px-2 py-1.5 text-xs text-amber-200">
              {data.integracaoMicrosoft.redirectUri}
            </code>
          </div>
        </div>
      )}

      {config?.ultimoErro && (
        <div className="rounded-lg border border-red-950 bg-red-950/20 px-4 py-3 text-xs text-red-300">
          {config.ultimoErro}
        </div>
      )}

      <div>
        <div className="mb-4 flex items-center gap-2">
          <Inbox className="h-4 w-4 text-zinc-500" />
          <h3 className="text-sm font-semibold text-zinc-200">Regras de entrada</h3>
        </div>

        <div className="grid gap-4">
          <label className="space-y-1.5">
            <span className="text-xs text-zinc-400">Remetentes aceitos</span>
            <input
              value={remetenteFiltro}
              onChange={(event) => setRemetenteFiltro(event.target.value)}
              placeholder="viagens@contourline.com.br"
              className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-zinc-200 outline-none focus:border-zinc-500"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs text-zinc-400">Assunto deve conter</span>
            <input
              value={assuntoFiltro}
              onChange={(event) => setAssuntoFiltro(event.target.value)}
              placeholder="NOVA SOLICITAÇÃO DE VIAGENS E OPERAÇÕES"
              className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-zinc-200 outline-none focus:border-zinc-500"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs text-zinc-400">Responsável padrão pelas demandas</span>
            <select
              value={solicitantePadraoId}
              onChange={(event) => setSolicitantePadraoId(event.target.value)}
              className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-zinc-200 outline-none focus:border-zinc-500"
            >
              {data.solicitantes.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.nome} · {user.papel}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-start gap-3 rounded-lg border border-zinc-800 p-3">
            <input
              type="checkbox"
              checked={autoCreate}
              onChange={(event) => setAutoCreate(event.target.checked)}
              className="mt-0.5 h-4 w-4 accent-emerald-500"
            />
            <span>
              <span className="block text-sm text-zinc-300">Criar demanda automaticamente</span>
              <span className="mt-0.5 block text-xs text-zinc-600">
                Somente quando todos os campos obrigatórios forem reconhecidos.
              </span>
            </span>
          </label>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-zinc-800 pt-5">
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          {connected
            ? <><CheckCircle2 className="h-4 w-4 text-emerald-400" /> Leitura automática ativa</>
            : "Conecte a caixa para iniciar a leitura automática."}
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-zinc-700 px-3 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar regras
        </button>
      </div>
    </div>
  )
}

"use client"
// "Sua área pública": os links que a empresa divulga para clientes e
// videomakers. Antes o administrador precisava saber montar
// /cadastrar-demanda?org=<slug> de cabeça; sem o slug, o pedido ia para a
// empresa padrão.
import { useState } from "react"
import useSWR from "swr"
import { Check, Copy, ExternalLink } from "lucide-react"
import { fetcher } from "@/lib/fetcher"

type Org = { id: string; nome: string; slug: string; ativa: boolean }

const LINKS = [
  { caminho: "", titulo: "Área da empresa", texto: "A página de entrada, com todos os caminhos abaixo." },
  { caminho: "/pedido", titulo: "Pedir um vídeo", texto: "Formulário de pedido, inclusive gravação em evento." },
  { caminho: "/videomaker", titulo: "Cadastro de videomaker", texto: "Para quem quer trabalhar com a equipe." },
  { caminho: "/galeria", titulo: "Galeria", texto: "Os vídeos publicados pela empresa." },
  { caminho: "/entrar", titulo: "Entrar", texto: "Login que já abre esta empresa." },
]

export function AreaPublicaEmpresa() {
  const { data, error } = useSWR<{ organizacoes: Org[] }>("/api/me/organizacoes", fetcher)
  const [copiado, setCopiado] = useState<string | null>(null)
  const ativa = data?.organizacoes.find(o => o.ativa)

  async function copiar(url: string) {
    try { await navigator.clipboard.writeText(url); setCopiado(url); setTimeout(() => setCopiado(null), 2000) }
    catch { setCopiado(null) }
  }

  if (error) return <p role="alert" className="text-sm text-amber-300">Não foi possível carregar os links da área pública.</p>
  if (!ativa) return <p role="status" className="text-sm text-zinc-400">Carregando os links da área pública…</p>
  // Só chega aqui no navegador: os dados vêm do SWR, que não roda no servidor.
  const origem = window.location.origin

  return (
    <section aria-labelledby="area-publica-titulo" className="space-y-4 rounded-2xl border border-violet-400/25 bg-violet-400/5 p-5">
      <div>
        <h3 id="area-publica-titulo" className="text-base font-semibold text-zinc-100">Sua área pública</h3>
        <p className="mt-1 text-sm text-zinc-400">Divulgue estes links. Tudo o que chegar por eles vai para {ativa.nome}, e cada formulário mostra no topo para qual empresa está enviando.</p>
      </div>
      <ul className="divide-y divide-white/10">
        {LINKS.map(l => {
          const url = `${origem}/c/${ativa.slug}${l.caminho}`
          return (
            <li key={l.caminho} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-zinc-100">{l.titulo}</p>
                <p className="text-sm text-zinc-400">{l.texto}</p>
                <code className="mt-1 block break-all text-xs text-violet-200">{url}</code>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => copiar(url)} className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-2 text-sm text-zinc-200 hover:bg-white/5" aria-label={`Copiar link: ${l.titulo}`}>
                  {copiado === url ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
                  {copiado === url ? "Copiado" : "Copiar"}
                </button>
                <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-2 text-sm text-zinc-200 hover:bg-white/5" aria-label={`Abrir: ${l.titulo}`}>
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />Abrir
                </a>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

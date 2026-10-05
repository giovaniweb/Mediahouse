"use client"
// "Sua área pública": os links que a empresa divulga para clientes e
// videomakers. Antes o administrador precisava saber montar
// /cadastrar-demanda?org=<slug> de cabeça; sem o slug, o pedido ia para a
// empresa padrão. Hoje o link antigo redireciona para a área, mas o link a
// divulgar é este.
//
// Os seis links ficavam numa lista só, todos com o mesmo peso. O que o cliente
// usa (a área, o pedido e o agendamento de gravação) vem agora destacado; o
// cadastro de videomaker, a galeria e o login vêm depois.
import { useState } from "react"
import useSWR from "swr"
import { Check, Copy, ExternalLink } from "lucide-react"
import { fetcher } from "@/lib/fetcher"

type Org = { id: string; nome: string; slug: string; ativa: boolean }
type LinkPublico = { caminho: string; titulo: string; texto: string }

const PARA_CLIENTES: LinkPublico[] = [
  { caminho: "/pedido?tipo=video", titulo: "Quero um vídeo", texto: "Pedido de vídeo, já sem a tela de escolher o tipo. Entra em Aprovações." },
  { caminho: "/pedido?tipo=conteudo", titulo: "Quero uma arte", texto: "Post, story, carrossel, criativo. Entra em Aprovações." },
  { caminho: "/gravacao", titulo: "Quero um videomaker", texto: "Gravação numa tela só: cliente, endereço, data e horário. Aprovado, vira Job." },
]
const OUTROS: LinkPublico[] = [
  { caminho: "/videomaker", titulo: "Quero ser videomaker", texto: "Cadastro para quem quer trabalhar com a equipe." },
  { caminho: "/galeria", titulo: "Galeria", texto: "Os vídeos publicados pela empresa." },
  { caminho: "/entrar", titulo: "Entrar no sistema", texto: "Login que já abre esta empresa." },
]

function Acoes({ url, titulo, copiado, copiar }: { url: string; titulo: string; copiado: string | null; copiar: (url: string) => void }) {
  return (
    <div className="flex gap-2">
      <button type="button" onClick={() => copiar(url)} className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-2 text-sm text-zinc-200 hover:bg-white/5" aria-label={`Copiar link: ${titulo}`}>
        {copiado === url ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
        {copiado === url ? "Copiado" : "Copiar"}
      </button>
      <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-2 text-sm text-zinc-200 hover:bg-white/5" aria-label={`Abrir: ${titulo}`}>
        <ExternalLink className="h-4 w-4" aria-hidden="true" />Abrir
      </a>
    </div>
  )
}

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
  const base = `${window.location.origin}/c/${ativa.slug}`

  const linha = (l: LinkPublico) => {
    const url = `${base}${l.caminho}`
    return (
      <li key={l.caminho} className="flex flex-wrap items-center gap-3 py-3">
        <div className="min-w-0 flex-[1_1_16rem]">
          <p className="text-sm font-medium text-zinc-100">{l.titulo}</p>
          <p className="text-sm text-zinc-400">{l.texto}</p>
          <code className="mt-1 block break-all text-xs text-violet-200">{url}</code>
        </div>
        <Acoes url={url} titulo={l.titulo} copiado={copiado} copiar={copiar} />
      </li>
    )
  }

  return (
    <section aria-labelledby="area-publica-titulo" className="space-y-5 rounded-2xl border border-violet-400/25 bg-violet-400/5 p-5">
      <div>
        <h3 id="area-publica-titulo" className="text-base font-semibold text-zinc-100">Sua área pública</h3>
        <p className="mt-1 text-sm text-zinc-400">Divulgue estes links. Tudo o que chegar por eles vai para {ativa.nome}, e cada formulário mostra no topo para qual empresa está enviando.</p>
      </div>

      <div className="rounded-xl border border-violet-300/40 bg-zinc-950/60 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-violet-300">Link para seus clientes</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-[1_1_16rem]">
            <p className="text-sm text-zinc-300">A página de entrada, com as seis opções: vídeo, arte, videomaker, ser videomaker, galeria e entrar.</p>
            <code className="mt-1 block break-all text-sm font-semibold text-violet-100">{base}</code>
          </div>
          <Acoes url={base} titulo="Área da empresa" copiado={copiado} copiar={copiar} />
        </div>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-zinc-200">Direto para o pedido</h4>
        <ul className="divide-y divide-white/10">{PARA_CLIENTES.map(linha)}</ul>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-zinc-400">Outros links</h4>
        <ul className="divide-y divide-white/10">{OUTROS.map(linha)}</ul>
      </div>
    </section>
  )
}

"use client"

// "Mandar ideia" (menu Geral): qualquer pessoa da empresa manda uma ideia ou
// uma solicitação para a social media de uma linha, e acompanha o que mandou.
// É o banco de ideias de sempre (IdeiaVideo); quem decide é a social.
import useSWR from "swr"
import { toast } from "sonner"
import { Header } from "@/components/layout/Header"
import { fetcher } from "@/lib/fetcher"
import { ETAPA_NOME, TAG_SOLICITACAO, diaDaPostagem, etapaDoPedido } from "@/lib/social-quadro"
import { FormularioSugestao, type EnvioSugestao } from "@/components/social/FormularioSugestao"

type Enviada = {
  id: string; titulo: string; status: string; dataPostagem: string | null; tags: string[]; createdAt: string
  linhaProjeto: { nome: string } | null
  demanda: { codigo: string; statusVisivel: string } | null
}

function andamento(e: Enviada): string {
  if (e.status === "descartada") return "Não entrou no planejamento"
  if (e.demanda) {
    const etapa = etapaDoPedido(e.demanda.statusVisivel)
    return `Virou pedido ${e.demanda.codigo} · ${e.demanda.statusVisivel === "finalizado" ? "Postado" : ETAPA_NOME[etapa]}`
  }
  const dia = diaDaPostagem(e.dataPostagem)
  return dia ? `No plano para ${dia.slice(8, 10)}/${dia.slice(5, 7)}` : "Com a social media"
}

export default function MandarIdeiaPage() {
  const { data, mutate } = useSWR<{ linhas: { id: string; nome: string }[]; enviadas: Enviada[] }>("/api/social/sugestoes", fetcher)

  async function enviar(envio: EnvioSugestao) {
    const res = await fetch("/api/social/sugestoes", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(envio),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json.error ?? "Não foi possível enviar.")
    toast.success("Enviado para a social media.")
    await mutate()
  }

  return (
    <div className="flex h-full flex-col">
      <Header title="Mandar ideia" />
      <div className="flex-1 overflow-y-auto px-4 pb-10 pt-5 md:px-6">
        <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">Mandar para a social media</h1>
            <p className="mb-6 mt-1 text-sm text-zinc-400">Viu algo bom ou precisa de um post? Mande aqui. Vai para a social media da linha escolhida.</p>
            {data && data.linhas.length === 0 && (
              <p className="mb-4 text-sm text-amber-200">Esta empresa ainda não tem linhas de produto cadastradas.</p>
            )}
            <FormularioSugestao linhas={data?.linhas ?? []} aoEnviar={enviar} />
          </div>
          <aside>
            <h2 className="text-sm font-semibold text-zinc-200">O que você já mandou</h2>
            {data && data.enviadas.length === 0 && <p className="mt-2 text-sm text-zinc-500">Nada ainda.</p>}
            <ul className="mt-3 grid gap-2">
              {(data?.enviadas ?? []).map((e) => (
                <li key={e.id} className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-3.5 py-3">
                  <p className="text-sm font-medium text-zinc-100">{e.titulo}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {e.tags.includes(TAG_SOLICITACAO) ? "Solicitação" : "Ideia"}{e.linhaProjeto ? ` · ${e.linhaProjeto.nome}` : ""}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-purple-300">{andamento(e)}</p>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </div>
    </div>
  )
}

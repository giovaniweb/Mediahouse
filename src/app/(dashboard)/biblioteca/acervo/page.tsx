"use client"
import { useState } from "react"
import Link from "next/link"
import useSWR from "swr"
import { ArrowLeft, ShieldCheck } from "lucide-react"
import { fetcher } from "@/lib/fetcher"
import { Header } from "@/components/layout/Header"
import { PageIntro } from "@/components/layout/PageIntro"

const secundario = "rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:border-zinc-500 disabled:opacity-50"
const alerta = "rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
type Plano = { loteId: string; expiraEm: string; proximoCursor: string | null; itens: { id: string; codigo: string; titulo: string; classe: string; confianca: string; motivo: string; aplicavel: boolean; referencias: number }[] }
type Resultado = { recuperados:number; relatorio:{demandaId:string;resultado:string;antes:number;depois:number}[] }
export default function Acervo() {
  const [plano,setPlano] = useState<Plano|null>(null), [ocupado,setOcupado] = useState(false), [erro,setErro] = useState("")
  const [resultado,setResultado] = useState<Resultado|null>(null)
  const { data: historico, error: erroHistorico, mutate } = useSWR<{lotes:(Plano & {resultado:Resultado|null;estado:string;createdAt:string})[]}>("/api/biblioteca/acervo",fetcher)
  async function executar(acao: "simular"|"aplicar", cursor?: string) {
    setOcupado(true); setErro("")
    try {
      const r = await fetch("/api/biblioteca/acervo",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({acao,...(cursor?{cursor}:{}),...(acao==="aplicar"?{loteId:plano?.loteId}:{})})})
      const b = await r.json(); if (!r.ok) throw new Error(b.error)
      if(acao==="simular") { setPlano(b);setResultado(null) } else setResultado(b)
      await mutate()
    } catch(e) { setErro(e instanceof Error?e.message:"Não foi possível concluir") } finally { setOcupado(false) }
  }
  const aplicaveis = plano?.itens.filter(i=>i.aplicavel).length ?? 0
  return <>
    <Header title="Revisar acervo" />
    <PageIntro eyebrow="AUDIOVISUAL / BIBLIOTECA / ACERVO" title="Recuperar o que já foi entregue." description="Localize referências já registradas e recupere seus vínculos. A simulação não verifica se o arquivo ainda existe onde foi guardado.">
      <Link href="/biblioteca" className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:border-zinc-500"><ArrowLeft className="h-4 w-4" aria-hidden="true" />Voltar à biblioteca</Link>
    </PageIntro>
    <main className="p-6 space-y-5 max-w-5xl">
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-2"><h2 className="flex items-center gap-2 font-medium text-zinc-100"><ShieldCheck className="h-4 w-4 text-emerald-300" aria-hidden="true" />Retenção: preservar arquivos</h2><p className="text-sm text-zinc-400">Originais, prévias e finais são preservados. Não há exclusão automática nem estimativa de espaço liberado. A carência mínima preparada para uma futura política é de 48 horas; ela não autoriza apagar arquivos.</p><Link href="/historico/audiovisual" className="inline-block text-sm text-purple-300 hover:text-purple-200 hover:underline">Serviços concluídos continuam no histórico, mesmo sem mídia</Link></section>
    <div className="flex flex-wrap gap-3"><button className={secundario} disabled={ocupado} onClick={()=>executar("simular")}>Simular primeiro lote (até 25 demandas)</button>{plano?.proximoCursor && <button className={secundario} disabled={ocupado} onClick={()=>executar("simular",plano.proximoCursor!)}>Simular próximo lote</button>}</div>
    {erroHistorico && <p role="alert" className={alerta}>{erroHistorico.message}</p>}
    {!!historico?.lotes.length && <details className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3"><summary className="cursor-pointer text-sm text-zinc-300">Retomar simulação ou consultar últimos relatórios</summary><div className="space-y-2 pt-3">{historico.lotes.map(l=><button key={l.loteId} className="block text-left text-sm text-purple-300 hover:text-purple-200 hover:underline disabled:opacity-50" disabled={ocupado} onClick={()=>{setPlano(l);setResultado(l.resultado);setErro("")}}>{new Date(l.createdAt).toLocaleString("pt-BR")} · {l.estado === "aplicado" ? "Relatório de aplicação" : "Simulação"}</button>)}</div></details>}
    {erro && <p role="alert" className={alerta}>{erro}</p>}{ocupado && <p role="status" className="text-sm text-zinc-400">Processando…</p>}
    {plano && <section className="space-y-3"><p className="text-sm text-zinc-300">{plano.itens.length} demandas revisadas · {aplicaveis} vínculos recuperáveis · simulação válida até {new Date(plano.expiraEm).toLocaleTimeString("pt-BR")}</p>
      {plano.itens.map(i=><article key={i.id} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-1"><Link href={`/demandas/${i.id}`} className="font-medium text-zinc-100 hover:underline">{i.codigo} · {i.titulo}</Link><p className={i.aplicavel ? "text-sm text-emerald-300" : "text-sm text-zinc-300"}>{i.aplicavel ? "Referência explícita encontrada" : i.classe === "final_vinculado" ? "Final já vinculado" : i.classe === "tipo_sem_arquivo" ? "Tipo sem obrigação de arquivo" : "Revisão necessária"} · {i.referencias} {i.referencias === 1 ? "referência" : "referências"}</p><p className="text-sm text-zinc-400">{i.motivo}</p></article>)}
      {!resultado && aplicaveis > 0 && <button className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-500 disabled:opacity-50" disabled={ocupado} onClick={()=>executar("aplicar")}>Aplicar os {aplicaveis} vínculos revisados deste lote</button>}
    </section>}
    {resultado && <section role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-1"><p className="text-zinc-100">{resultado.recuperados} vínculos recuperados. Nenhum arquivo foi publicado ou excluído.</p>{resultado.relatorio.map(r=><p key={r.demandaId} className="text-sm text-zinc-300">{plano?.itens.find(i=>i.id===r.demandaId)?.codigo}: {r.resultado === "vinculo_recuperado" ? `${r.antes} → ${r.depois} registro final` : "Dados mudaram desde a simulação; simule novamente."}</p>)}</section>}
    </main>
  </>
}

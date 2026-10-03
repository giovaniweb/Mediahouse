"use client"
import { useState } from "react"
import Link from "next/link"
import useSWR from "swr"
import { fetcher } from "@/lib/fetcher"
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
  return <main className="p-6 space-y-5 max-w-5xl">
    <Link href="/biblioteca" className="underline">Voltar à biblioteca</Link>
    <h1 className="text-2xl font-semibold">Revisar acervo</h1>
    <p>Localize referências já registradas e recupere seus vínculos. A simulação não verifica se o arquivo ainda existe no Storage ou no Drive.</p>
    <section className="rounded-xl border p-4 space-y-2"><h2 className="font-medium">Retenção: preservar arquivos</h2><p className="text-sm">Originais, prévias e finais são preservados. Não há exclusão automática nem estimativa de espaço liberado. A carência mínima preparada para uma futura política é de 48 horas; ela não autoriza apagar arquivos.</p><Link href="/historico" className="underline text-sm">Serviços concluídos continuam no histórico, mesmo sem mídia</Link></section>
    <div className="flex gap-3"><button className="rounded border px-4 py-2" disabled={ocupado} onClick={()=>executar("simular")}>Simular primeiro lote (até 25 demandas)</button>{plano?.proximoCursor && <button className="rounded border px-4 py-2" disabled={ocupado} onClick={()=>executar("simular",plano.proximoCursor!)}>Simular próximo lote</button>}</div>
    {erroHistorico && <p role="alert" className="text-red-400">{erroHistorico.message}</p>}
    {!!historico?.lotes.length && <details><summary className="cursor-pointer">Retomar simulação ou consultar últimos relatórios</summary><div className="space-y-2 py-2">{historico.lotes.map(l=><button key={l.loteId} className="block underline text-sm" disabled={ocupado} onClick={()=>{setPlano(l);setResultado(l.resultado);setErro("")}}>{new Date(l.createdAt).toLocaleString("pt-BR")} · {l.estado === "aplicado" ? "Relatório de aplicação" : "Simulação"}</button>)}</div></details>}
    {erro && <p role="alert" className="text-red-400">{erro}</p>}{ocupado && <p role="status">Processando…</p>}
    {plano && <section className="space-y-3"><p>{plano.itens.length} demandas revisadas · {plano.itens.filter(i=>i.aplicavel).length} vínculos recuperáveis · simulação válida até {new Date(plano.expiraEm).toLocaleTimeString("pt-BR")}</p>
      {plano.itens.map(i=><article key={i.id} className="rounded border p-3 space-y-1"><Link href={`/demandas/${i.id}`} className="font-medium underline">{i.codigo} · {i.titulo}</Link><p className="text-sm">{i.aplicavel ? "Referência explícita encontrada" : i.classe === "final_vinculado" ? "Final já vinculado" : i.classe === "tipo_sem_arquivo" ? "Tipo sem obrigação de arquivo" : "Revisão necessária"} · {i.referencias} referência(s)</p><p className="text-sm text-muted-foreground">{i.motivo}</p></article>)}
      {!resultado && plano.itens.some(i=>i.aplicavel) && <button className="rounded bg-blue-600 text-white px-4 py-2" disabled={ocupado} onClick={()=>executar("aplicar")}>Aplicar os {plano.itens.filter(i=>i.aplicavel).length} vínculos revisados deste lote</button>}
    </section>}
    {resultado && <section role="status" className="rounded border p-4"><p>{resultado.recuperados} vínculos recuperados. Nenhum arquivo foi publicado ou excluído.</p>{resultado.relatorio.map(r=><p key={r.demandaId} className="text-sm">{plano?.itens.find(i=>i.id===r.demandaId)?.codigo}: {r.resultado === "vinculo_recuperado" ? `${r.antes} → ${r.depois} registro final` : "Dados mudaram desde a simulação; simule novamente."}</p>)}</section>}
  </main>
}

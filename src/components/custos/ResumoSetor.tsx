"use client"
import styles from "./ResumoSetor.module.css"
import { Plus } from "lucide-react"
import { useState } from "react"
import useSWR from "swr"
import { fetcher } from "@/lib/fetcher"
import { hojeEmSaoPaulo } from "@/lib/datas"
import { erroDaResposta, mensagemDeErro } from "@/lib/erro-cliente"
import { toast } from "sonner"
import type { resumoCustosSetor } from "@/lib/custos-setor"
type Resumo=Awaited<ReturnType<typeof resumoCustosSetor>> & {podeEditar:boolean}
const fmt=(v:string)=>Number(v).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})
const nomes:Record<string,string>={interno:"Pessoas internas",externo:"Profissionais externos",infraestrutura:"Infraestrutura e ferramentas",outros:"Outros custos"}
const campo="block w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2 mt-1"
export function ResumoSetor() {
  const [mes,setMes]=useState(()=>hojeEmSaoPaulo().slice(0,7)),[aberto,setAberto]=useState(false),[salvando,setSalvando]=useState(false)
  const [form,setForm]=useState({categoria:"interno",descricao:"",fonte:"",chaveOrigem:"",valor:""})
  const {data,error,isLoading,mutate}=useSWR<Resumo>(`/api/custos-setor?competencia=${mes}`,fetcher)
  async function salvar(e:React.FormEvent) {
    e.preventDefault();setSalvando(true)
    try {
      const r=await fetch("/api/custos-setor",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...form,competencia:mes,valor:form.valor.trim()?form.valor.trim().replace(",","."):null})})
      if(!r.ok)throw await erroDaResposta(r,"Não foi possível registrar o custo.")
      setAberto(false);setForm({categoria:"interno",descricao:"",fonte:"",chaveOrigem:"",valor:""});await mutate();toast.success("Custo registrado para esta competência.")
    }catch(e){toast.error(mensagemDeErro(e,"Falha ao registrar."))}finally{setSalvando(false)}
  }
  async function cancelar(id:string) {
    setSalvando(true)
    try {const r=await fetch("/api/custos-setor",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id})});if(!r.ok)throw await erroDaResposta(r,"Não foi possível cancelar.");await mutate();toast.success("Lançamento cancelado. O registro foi preservado.")}
    catch(e){toast.error(mensagemDeErro(e,"Falha ao cancelar."))}finally{setSalvando(false)}
  }
  return <section className={styles.resumo} aria-label="Custos do setor">
    <div className={styles.toolbar}><label className="text-sm">Competência<input className={campo} type="month" min="2000-01" max="2099-12" value={mes} onChange={e=>{setMes(e.target.value);setAberto(false)}} /></label>
    {data?.podeEditar&&<button className="px-4 py-2 rounded-lg bg-violet-600" aria-expanded={aberto} aria-controls="novo-custo-setor" onClick={()=>setAberto(!aberto)}><Plus size={16} aria-hidden="true"/>{aberto ? "Fechar lançamento" : "Registrar custo do mês"}</button>}</div>
    {error&&<p role="alert" className="text-red-300">Não foi possível carregar os custos. <button className="underline" onClick={()=>mutate()}>Tentar novamente</button></p>}
    {isLoading&&<p role="status">Carregando custos…</p>}
    {data&&<>
      <div className={styles.total}><div><h2>Total conhecido do mês</h2><p className={styles.valor}>{fmt(data.totalConhecido)}</p><p>{data.aviso}</p></div><span className={styles.badge}>Fechamento parcial</span></div>
      <div className={styles.categorias}>{Object.entries(data.categorias).map(([k,v])=><div key={k} className="border border-zinc-800 rounded-xl p-4"><p className="text-sm text-zinc-400">{nomes[k]}</p><p className="text-xl mt-2">{fmt(v)}</p><p className="text-xs text-zinc-500 mt-2">{data.cobertura[k as keyof typeof data.cobertura]} registro(s) · conferência pendente</p></div>)}</div>
      {aberto&&<form id="novo-custo-setor" onSubmit={salvar} className={styles.form}>
        <h2>Registrar custo</h2>
        <p className="text-sm">Lançamento de {mes}. Registre somente a parcela que pertence ao setor. Valores históricos não são preenchidos pelo salário atual. Externos usam a aba própria, evitando dupla contagem.</p>
        <label className="block text-sm">Categoria<select className={campo} value={form.categoria} onChange={e=>setForm({...form,categoria:e.target.value})}>{Object.entries(nomes).filter(([k])=>k!=="externo").map(([k,v])=><option value={k} key={k}>{v}</option>)}</select></label>
        <label className="block text-sm">Descrição<input required minLength={3} maxLength={200} className={campo} value={form.descricao} onChange={e=>setForm({...form,descricao:e.target.value})}/></label>
        <label className="block text-sm">Valor em reais · em branco = ainda não conhecido<input inputMode="decimal" className={campo} value={form.valor} onChange={e=>setForm({...form,valor:e.target.value})}/></label>
        <label className="block text-sm">Fonte e critério do valor (ex.: folha de outubro, 50% destinado ao setor)<input required minLength={3} maxLength={200} className={campo} value={form.fonte} onChange={e=>setForm({...form,fonte:e.target.value})}/></label>
        <label className="block text-sm">Identificação única da origem (ex.: folha-2026-10-pessoa-01)<input required pattern="[A-Za-z0-9_:.-]+" minLength={3} maxLength={128} className={campo} value={form.chaveOrigem} onChange={e=>setForm({...form,chaveOrigem:e.target.value})}/></label>
        <p className="text-xs text-zinc-400">Repetir a mesma origem não duplica o gasto. Use origens diferentes para meses, parcelas ou diárias realmente distintos. Zero confirma gratuidade.</p>
        <button disabled={salvando} className="bg-violet-600 rounded-lg px-4 py-2 disabled:opacity-50">{salvando?"Salvando…":"Salvar lançamento"}</button>
      </form>}
      <details className="border border-zinc-800 rounded-xl p-4"><summary className="cursor-pointer">Conferir pendências ({data.pendencias.length}{data.maisServicosSemCusto?"+":""})</summary><p className="text-sm text-zinc-400 mt-2">Nenhum valor é estimado automaticamente. Confira serviços sem custo e os registros de externos antes do fechamento.</p><ul className="mt-3 space-y-3">{data.pendencias.map(p=><li key={p.id} className="text-sm"><a className="underline" href={p.href}>{p.descricao}</a> · {p.motivo}</li>)}</ul></details>
      <details className="border border-zinc-800 rounded-xl p-4"><summary className="cursor-pointer">Lançamentos do mês ({data.registros.length})</summary><div className="mt-4 space-y-4">{data.registros.map(r=><div key={r.id} className="flex flex-wrap gap-3 justify-between border-b border-zinc-800 pb-3"><div><p>{r.descricao} · {r.valor===null?"Valor pendente":fmt(r.valor)}</p><p className="text-xs text-zinc-400">{r.fonte} · {r.chaveOrigem}</p></div>{data.podeEditar&&<button disabled={salvando} className="text-sm underline disabled:opacity-50" onClick={()=>cancelar(r.id)}>Cancelar lançamento</button>}</div>)}</div></details>
      <p className="text-sm text-zinc-400">Custo por entrega — {data.regraRateio}</p>
    </>}
  </section>
}

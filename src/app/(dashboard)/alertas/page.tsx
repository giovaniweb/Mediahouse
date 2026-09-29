"use client"
import {useState} from "react"
import useSWR from "swr"
import Link from "next/link"
import {Header} from "@/components/layout/Header"
import {fetcher} from "@/lib/fetcher"
import {toast} from "sonner"
type Alerta={id:string;mensagem:string;tipoAlerta:string;severidade:string;origem:string;acaoSugerida:string|null;createdAt:string;podeAgir:boolean;demanda:{id:string;codigo:string;titulo:string;responsavel:{nome:string}|null;editor:{nome:string}|null;videomaker:{nome:string}|null}|null}
type Lista={alertas:Alerta[];total:number;tipos:string[];responsaveis:Array<{id:string;nome:string}>;nextCursor:string|null}
export default function AlertasPage() {
  const [tipo,setTipo]=useState(""),[responsavel,setResponsavel]=useState(""),[idade,setIdade]=useState(""),[cursor,setCursor]=useState(""),[ocupado,setOcupado]=useState<string|null>(null)
  const q=new URLSearchParams({tipo,responsavel,idade,cursor})
  const {data,error,isLoading,mutate}=useSWR<Lista>(`/api/alertas?${q}`,fetcher,{refreshInterval:30000})
  async function agir(id:string,acao:string) {
    setOcupado(id)
    try {
      const r=await fetch("/api/alertas",{method:acao==="snooze"?"PATCH":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,acao,minutos:60})})
      if(!r.ok) throw new Error("Não foi possível alterar o alerta. Confira sua permissão e tente novamente.")
      await mutate();toast.success("Alerta atualizado")
    } catch(e){toast.error(e instanceof Error?e.message:"Falha ao alterar")}
    finally{setOcupado(null)}
  }
  return <><Header title="Alertas"/><main className="flex-1 p-6 max-w-4xl space-y-4">
    <h1 className="text-xl font-semibold">O que precisa de atenção</h1>
    <div className="flex gap-3 flex-wrap">
      <label>Tipo <select className="border rounded p-2 bg-background" value={tipo} onChange={e=>{setTipo(e.target.value);setCursor("")}}><option value="">Todos</option>{data?.tipos.map(t=><option key={t} value={t}>{t.replace(/^regra_/,"").replaceAll("_"," ")}</option>)}</select></label>
      <label>Responsável <select className="border rounded p-2 bg-background" value={responsavel} onChange={e=>{setResponsavel(e.target.value);setCursor("")}}><option value="">Todos</option>{data?.responsaveis.map(r=><option key={r.id} value={r.id}>{r.nome}</option>)}</select></label>
      <label>Idade <select className="border rounded p-2 bg-background" value={idade} onChange={e=>{setIdade(e.target.value);setCursor("")}}><option value="">Qualquer</option><option value="1">Mais de um dia</option><option value="7">Mais de sete dias</option><option value="30">Mais de trinta dias</option></select></label>
    </div>
    {error?<div role="alert">Não foi possível carregar os alertas. <button className="underline" onClick={()=>mutate()}>Tentar novamente</button></div>:isLoading?<p>Carregando…</p>:<>
      <p>{data?.total} alerta(s) neste filtro.</p>
      {!data?.alertas.length && <p>Nenhum alerta neste filtro. Isso não confirma o funcionamento de todas as integrações.</p>}
      {data?.alertas.map(a=><article key={a.id} className="border rounded-xl p-4 space-y-2">
        <p className="font-medium">{a.severidade==="critico"?"Atenção urgente · ":""}{a.mensagem}</p>
        {a.acaoSugerida && <p className="text-sm">{a.acaoSugerida}</p>}
        <details className="text-sm"><summary className="cursor-pointer">Ver origem e ações</summary>
          <p>Origem: {a.origem==="regra"?"Regra automática":"Registro anterior ou ação do sistema"} · {new Date(a.createdAt).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"})}</p>
          {a.demanda && <><p>Responsável: {a.demanda.responsavel?.nome??a.demanda.editor?.nome??a.demanda.videomaker?.nome??"Não atribuído"}</p><Link href={`/demandas/${a.demanda.id}`} className="underline">Abrir {a.demanda.codigo}</Link></>}
          {a.podeAgir && <div className="flex flex-wrap gap-4 mt-3">{[["resolver","Resolver"],["snooze","Silenciar por uma hora"],["ignorar","Ignorar"]].map(([acao,label])=><button key={acao} disabled={ocupado!==null} className="underline disabled:opacity-50" onClick={()=>agir(a.id,acao)}>{label}</button>)}</div>}
        </details>
      </article>)}
      <div className="flex gap-4">{cursor&&<button onClick={()=>setCursor("")}>Voltar ao início</button>}{data?.nextCursor&&<button onClick={()=>setCursor(data.nextCursor!)}>Próxima página</button>}</div>
    </>}
  </main></>
}

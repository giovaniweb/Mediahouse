"use client"
import {useState} from "react"
import useSWR from "swr"
import {Header} from "@/components/layout/Header"
import {fetcher} from "@/lib/fetcher"
import {toast} from "sonner"

type Saida={id:string;estado:string;motivo:string|null;tentativas:number;createdAt:string;proximaTentativa:string|null;podeTentar:boolean;registros:Array<{createdAt:string;httpStatus:number|null;resultado:string}>}
const estados:Record<string,string>={aguardando:"Aguardando tentativa",aceito:"Aceita pelo provedor",entregue:"Entrega confirmada",lido:"Leitura confirmada",falhou:"Falhou",desconhecido:"Resultado desconhecido",expirado:"Prazo encerrado",cancelado:"Cancelada"}
const motivos:Record<string,string>={sem_config:"Verifique a conexão do WhatsApp.",contrato_nao_validado:"A integração precisa ser validada antes do envio.",
  destinatario_alterado:"O vínculo ou número do destinatário mudou.",objeto_alterado:"O trabalho mudou desde a criação do aviso.",
  timeout_ou_rede:"O provedor pode ter aceitado. Confira os recibos no provedor; não reenvie.",envio_iniciado:"Tentativa iniciada sem confirmação. Não reenvie.",
  resposta_inconclusiva:"Resposta incompleta do provedor. Confira os recibos no provedor.",rejeitado_provedor:"O provedor recusou a tentativa.",
  limite_provedor:"Aguardando o prazo indicado pelo provedor.",erro_provedor:"Falha temporária do provedor.",tentativas_esgotadas:"Limite de tentativas ou validade atingido."}
const quando=(data:string)=>new Date(data).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"})
export default function MensagensFalhadasPage() {
  const [cursor,setCursor]=useState(""),[ocupada,setOcupada]=useState<string|null>(null),[motivo,setMotivo]=useState("config_corrigida")
  const {data,error,isLoading,mutate}=useSWR<{mensagens:Saida[];total:number;tentativas:number;legado:number;nextCursor:string|null}>(`/api/mensagens-falhadas?cursor=${encodeURIComponent(cursor)}`,fetcher)
  async function tentar(id:string) {
    setOcupada(id)
    try {
      const r=await fetch("/api/mensagens-falhadas",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,motivo})})
      const b=await r.json()
      if(!r.ok) throw new Error(b.error || "Não foi possível agendar")
      toast.success("Nova tentativa agendada. Isso ainda não confirma entrega.")
      await mutate()
    } catch(e) {toast.error(e instanceof Error ? e.message : "Falha ao agendar")}
    finally {setOcupada(null)}
  }
  return <>
    <Header title="Saídas do WhatsApp"/>
    <main className="flex-1 overflow-y-auto p-6 space-y-4">
      <h1 className="text-xl font-semibold">Saídas do WhatsApp</h1>
      <p className="text-sm text-muted-foreground">Aceitação pelo provedor, entrega e leitura são etapas diferentes.</p>
      {error ? <div role="alert">Não foi possível carregar. <button onClick={()=>mutate()} className="underline">Tentar novamente</button></div>
        : isLoading ? <p>Carregando…</p> : <>
          <p>{data?.total ?? 0} intenções · {data?.tentativas ?? 0} tentativas</p>
          {!!data?.legado && <p className="text-sm text-muted-foreground">{data.legado} registros antigos preservados. Eles não comprovam entrega e não serão reenviados por esta tela.</p>}
          {!data?.mensagens.length && <p>Nenhuma saída nesta página.</p>}
          <label className="block text-sm">Motivo para tentar novamente
            <select value={motivo} onChange={e=>setMotivo(e.target.value)} className="ml-3 rounded border bg-background p-2">
              <option value="config_corrigida">Corrigi a conexão/configuração</option>
              <option value="provedor_normalizado">O provedor voltou a funcionar</option>
              <option value="destinatario_revalidado">Conferi o destinatário</option>
            </select>
          </label>
          {data?.mensagens.map(s=><article key={s.id} className="rounded-xl border p-4 space-y-2">
            <div className="font-medium">{estados[s.estado] ?? s.estado}</div>
            <p className="text-sm text-muted-foreground">{quando(s.createdAt)} · {s.tentativas} tentativa(s)</p>
            {s.motivo && <p>{motivos[s.motivo] ?? "Confira o estado antes de uma nova ação."}</p>}
            {!!s.registros[0] && <p className="text-sm">Última tentativa: {quando(s.registros[0].createdAt)}{s.registros[0].httpStatus ? ` · HTTP ${s.registros[0].httpStatus}` : ""}</p>}
            {s.proximaTentativa && <p className="text-sm">Próxima tentativa: {quando(s.proximaTentativa)}</p>}
            {s.podeTentar && <button disabled={ocupada!==null} onClick={()=>tentar(s.id)} className="rounded bg-primary px-3 py-2 text-primary-foreground disabled:opacity-50">{ocupada===s.id ? "Agendando…" : "Tentar novamente"}</button>}
          </article>)}
          <div className="flex gap-4">
            {cursor && <button onClick={()=>setCursor("")}>Voltar ao início</button>}
            {data?.nextCursor && <button onClick={()=>setCursor(data.nextCursor!)}>Próxima página</button>}
          </div>
        </>}
    </main>
  </>
}

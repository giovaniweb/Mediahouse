"use client"
import useSWR from "swr"
import Link from "next/link"
import { fetcher } from "@/lib/fetcher"
type Saude={whatsapp:{conexao:string;conexaoEm:string|null;ultimaEntrada:string|null;ultimaAceita:string|null;ultimaEntrega:string|null;ultimaLeitura:string|null;ultimoProcessamento:string|null;pendentes:number;atencao:number;pausadas:number};consumidores:Array<{consumidor:string;estado:string;inicio:string|null;fim:string|null;cadenciaMinutos:number|null;contadores:{concluidos:number;falhos:number;pendentes:number}|null}>}
const consumidores:Record<string,string>={"whatsapp-inbox":"Recebimento e fila do WhatsApp","agentes:alertas":"Alertas","agentes:monitor":"Monitor do fluxo","agentes:prazos":"Prazos","agentes:lembretes":"Lembretes","agentes:cobranca":"Notas fiscais pendentes","agentes:briefing":"Resumo diário","agentes:vistoria":"Resumo semanal","agentes:limpeza":"Manutenção de arquivos"}
const data=(v:string|null)=>v?new Date(v).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"}):"Sem registro"
const nomes:Record<string,string>={conectada:"Conexão reportada",desconectada:"Desconexão reportada",desconhecida:"Conexão sem confirmação",sem_configuracao:"Sem configuração ativa",sem_registro:"Sem registro",concluido:"Concluído",parcial:"Concluído com falhas",erro:"Falhou",executando:"Em execução",interrompido:"Possível interrupção",atrasado:"Processamento atrasado"}
export function SaudeAutomacoes() {
  const {data:s,error,isLoading,mutate}=useSWR<Saude>("/api/automacoes/saude",fetcher,{refreshInterval:30000})
  if(error) return <section role="alert" className="rounded-xl border p-4">Não foi possível consultar a saúde. <button className="underline" onClick={()=>mutate()}>Tentar novamente</button></section>
  if(isLoading || !s) return <p>Consultando saúde das automações…</p>
  const w=s.whatsapp,problemas=s.consumidores.filter(c=>["atrasado","interrompido","parcial","erro"].includes(c.estado))
  return <section className="rounded-xl border p-4 space-y-3" aria-label="Saúde das automações">
    <h2 className="font-semibold">Saúde das automações</h2>
    <p>{nomes[w.conexao]} · {w.atencao} saídas precisam de atenção · {w.pendentes} aguardando · {w.pausadas} pausadas</p>
    <p className="text-sm text-muted-foreground">Conexão não confirma entrega. Ausência de tráfego, sozinha, não indica falha.</p>
    {!!problemas.length && <p role="alert">{problemas.length} rotina(s) precisam de atenção. Confira o processamento abaixo.</p>}
    <details>
      <summary className="cursor-pointer font-medium">Ver entrada, entrega e processamento</summary>
      <dl className="grid gap-3 sm:grid-cols-2 mt-3 text-sm">
        {[["Conexão reportada em",w.conexaoEm],["Última entrada",w.ultimaEntrada],["Última aceitação pelo provedor",w.ultimaAceita],["Último recibo de entrega",w.ultimaEntrega],["Último recibo de leitura",w.ultimaLeitura],["Último trabalho encerrado na fila",w.ultimoProcessamento]].map(([nome,valor])=><div key={nome}><dt className="text-muted-foreground">{nome}</dt><dd>{data(valor)}</dd></div>)}
      </dl>
      <p className="text-sm mt-4">O registro da rotina não confirma entrega de mensagens.</p>
      <ul className="mt-4 space-y-3 text-sm">{s.consumidores.map(c=><li key={c.consumidor}>
        <strong>{consumidores[c.consumidor]??c.consumidor}</strong>: {nomes[c.estado]??c.estado} · início {data(c.inicio)}
        <p className="text-muted-foreground">{c.cadenciaMinutos?`Cadência esperada: ${c.cadenciaMinutos} min; atraso após dois intervalos.`:"Cadência não configurada; atraso do agendador não avaliado."}</p>
        {c.contadores && <p>{c.contadores.concluidos} etapas concluídas · {c.contadores.falhos} falhas · {c.contadores.pendentes} trabalhos pendentes</p>}
      </li>)}</ul>
    </details>
    <Link href="/mensagens-falhadas" className="text-sm underline">Conferir saídas e ações disponíveis</Link>
  </section>
}

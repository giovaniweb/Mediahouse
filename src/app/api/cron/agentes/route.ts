import { prepararMidias } from "@/lib/midia-fila"
import { acompanharConsumidor } from "@/lib/automacoes-saude"
import { timingSafeEqual } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { comOrg } from "@/lib/org-contexto"
// Listar as empresas acontece ANTES de haver empresa declarada: sob RLS o
// cliente normal devolvia zero, e o cron respondia ok sem fazer nada. Cada
// empresa é processada depois dentro do próprio comOrg.
import { prismaAuth } from "@/lib/prisma-auth"
import { executarRotina, ROTINAS, type Rotina } from "@/lib/automacoes-regras"
import { rodarFimDoDia } from "@/lib/resumo-fim-do-dia"
import { processarInbox, limparConteudoInbox } from "@/lib/whatsapp-inbox"
import { processarSaidas } from "@/lib/whatsapp-outbox"
import { recuperarExecucoesDuravel } from "@/lib/fila-manutencao"
import { encadear, percorrerEmpresas } from "@/lib/rodada-empresas"
export const maxDuration = 300

/** Rotinas determinísticas, para TODAS as empresas: a rodada se encadeia
 * sozinha quando o tempo não dá (src/lib/rodada-empresas.ts). Sem cliente de IA. */
export async function GET(req:NextRequest) {
  const segredo=process.env.CRON_SECRET
  if(!segredo) return NextResponse.json({error:"cron_nao_configurado"},{status:500})
  const a=Buffer.from(req.headers.get("authorization")??""),b=Buffer.from(`Bearer ${segredo}`)
  if(a.length!==b.length || !timingSafeEqual(a,b)) return NextResponse.json({error:"nao_autorizado"},{status:401})
  const agente=req.nextUrl.searchParams.get("agente")??"alertas"
  // fim-do-dia (12/11/2026): o resumo por pessoa, em lib/resumo-fim-do-dia.ts. Fora de
  // ROTINAS de propósito: não cria alerta nem resolve nada, só monta a mensagem de cada um.
  const fimDoDia=agente==="fim-do-dia"
  if(!fimDoDia && !ROTINAS.includes(agente as Rotina)) return NextResponse.json({error:"rotina_invalida"},{status:400})
  const cursor=req.nextUrl.searchParams.get("cursor")?.slice(0,128)
  const {resultados,proximoCursor}=await percorrerEmpresas({
    cursor, orcamentoMs:240_000,
    listar:(depois,take)=>prismaAuth.organizacao.findMany({where:{ativo:true,ambienteTeste:false,...(depois?{id:{gt:depois}}:{})},select:{id:true},orderBy:{id:"asc"},take}),
    processar:async(org)=>{
    try {
      const dados=await acompanharConsumidor(org.id,`agentes:${agente}`,async()=>{
      const fila=await recuperarExecucoesDuravel(org.id)
      const midia=await prepararMidias(org.id)
      const inbox=await processarInbox(org.id)
      await limparConteudoInbox(org.id)
      const regras=fimDoDia ? null : await comOrg(org.id,()=>executarRotina(org.id,agente as Rotina))
      const resumo=fimDoDia ? await rodarFimDoDia(org.id) : null
      const saidas=await processarSaidas(org.id)
      return {dados:{organizacaoId:org.id,fila,midia,inbox,...(regras?{regras}:{}),...(resumo?{resumo}:{}),saidas},contadores:{concluidos:midia.concluidos+fila.concluidos+inbox.concluidos+saidas.aceitos,falhos:midia.falhos+fila.falhos+inbox.falhos+saidas.falhos+saidas.desconhecidos,pendentes:regras?.intencoesCriadas ?? resumo?.whatsapp ?? 0}}
      })
      return dados
    } catch {return {organizacaoId:org.id,erro:"falha_local" as const}}
    },
  })
  const encadeado=encadear(req,proximoCursor)
  const parcial=resultados.some(r=>"erro" in r || ("saidas" in r && (r.saidas.falhos+r.saidas.desconhecidos+r.inbox.falhos+r.fila.falhos+r.midia.falhos)>0))
  return NextResponse.json({ok:!parcial,parcial,agente,organizacoes:resultados.length,resultados,
    nextCursor:proximoCursor,encadeado})
}

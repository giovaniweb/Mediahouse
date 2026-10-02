import { NextRequest,NextResponse } from "next/server"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { requireAcesso } from "@/lib/acesso"
import { comOrg } from "@/lib/org-contexto"
import { filtroMinhasDemandas } from "@/lib/escopo-demanda"
import { registrarAuditoria,correlacaoAuditoria } from "@/lib/auditoria"

type Acesso=Exclude<Awaited<ReturnType<typeof requireAcesso>>,NextResponse>
async function escopo(a:Acesso):Promise<Prisma.AlertaIAWhereInput> {
  const filtros:Prisma.AlertaIAWhereInput[]=[]
  if(!a.permissoes.verTodasDemandas) filtros.push({OR:[{usuarioId:a.usuarioId,demandaId:null},{demanda:{is:await filtroMinhasDemandas(a.usuarioId,a.organizacaoId)}}]})
  if(!["admin","gestor"].includes(a.papel)) {
    const m=await prisma.usuarioOrganizacao.findUnique({where:{usuarioId_organizacaoId:{usuarioId:a.usuarioId,organizacaoId:a.organizacaoId}},select:{areas:true}})
    const areas=m?.areas??[]
    if(areas.includes("audiovisual")!==areas.includes("growth")) filtros.push({OR:[{demandaId:null},{demanda:{area:areas.includes("audiovisual")?"audiovisual":"design"}}]})
  }
  return {organizacaoId:a.organizacaoId,AND:filtros}
}
export async function GET(req:NextRequest) {
  const a=await requireAcesso("verAlertas")
  if(a instanceof NextResponse) return a
  const q=req.nextUrl.searchParams
  const tipo=q.get("tipo"),responsavel=q.get("responsavel"),idade=q.get("idade"),cursor=q.get("cursor")
  if((tipo?.length??0)>80 || (responsavel?.length??0)>128 || (cursor?.length??0)>128 || (idade && !["1","7","30"].includes(idade))) return NextResponse.json({error:"Filtro inválido"},{status:400})
  try {
    return await comOrg(a.organizacaoId,async()=>{
      const base=await escopo(a)
      const filtros:Prisma.AlertaIAWhereInput[]=[base,{status:"ativo",OR:[{snoozeAte:null},{snoozeAte:{lte:new Date()}}]}]
      if(tipo) filtros.push({tipoAlerta:tipo})
      if(idade) filtros.push({createdAt:{lte:new Date(Date.now()-Number(idade)*86400_000)}})
      if(responsavel?.startsWith("vm:")) filtros.push({demanda:{videomakerId:responsavel.slice(3)}})
      else if(responsavel?.startsWith("ed:")) filtros.push({demanda:{editorId:responsavel.slice(3)}})
      else if(responsavel) filtros.push({OR:[{usuarioId:responsavel},{demanda:{OR:[{responsavelId:responsavel},{gestorId:responsavel},{editor:{usuarioId:responsavel}},{videomaker:{usuarioId:responsavel}},{responsaveis:{some:{usuarioId:responsavel}}}]}}]})
      const where={AND:filtros}
      const [rows,total,tipos,responsaveis]=await Promise.all([
        prisma.alertaIA.findMany({where:{AND:[where,...(cursor?[{id:{gt:cursor}}]:[])]},orderBy:{id:"asc"},take:51,
          select:{id:true,tipoAlerta:true,mensagem:true,severidade:true,acaoSugerida:true,createdAt:true,chaveRegra:true,usuarioId:true,demanda:{select:{id:true,codigo:true,titulo:true,responsavel:{select:{nome:true}},editor:{select:{nome:true}},videomaker:{select:{nome:true}}}}}}),
        prisma.alertaIA.count({where}),
        prisma.alertaIA.findMany({where:{AND:[base,{status:"ativo"}]},distinct:["tipoAlerta"],select:{tipoAlerta:true}}),
        prisma.usuario.findMany({where:{status:"ativo",organizacoes:{some:{organizacaoId:a.organizacaoId}},...(a.permissoes.verTodasDemandas?{}:{id:a.usuarioId})},select:{id:true,nome:true},orderBy:{nome:"asc"}}),
      ])
      if(a.permissoes.verTodasDemandas) {
        const [externos,editores]=await Promise.all([
          prisma.videomaker.findMany({where:{vinculos:{some:{organizacaoId:a.organizacaoId}}},select:{id:true,nome:true},orderBy:{nome:"asc"}}),
          prisma.editor.findMany({where:{vinculos:{some:{organizacaoId:a.organizacaoId}}},select:{id:true,nome:true},orderBy:{nome:"asc"}}),
        ])
        responsaveis.push(...externos.map(v=>({id:`vm:${v.id}`,nome:`Videomaker: ${v.nome}`})),...editores.map(v=>({id:`ed:${v.id}`,nome:`Editor: ${v.nome}`})))
      }
      const alertas=rows.slice(0,50).map(({chaveRegra,...r})=>({...r,origem:chaveRegra?"regra":"legado",podeAgir:a.permissoes.gerenciarConfig}))
      return NextResponse.json({alertas,total,tipos:tipos.map(t=>t.tipoAlerta),responsaveis,nextCursor:rows.length>50?alertas.at(-1)!.id:null},{headers:{"Cache-Control":"private, no-store"}})
    })
  } catch {return NextResponse.json({error:"Não foi possível carregar os alertas."},{status:503})}
}
async function alterar(req:NextRequest) {
  const a=await requireAcesso("verAlertas")
  if(a instanceof NextResponse) return a
  if(!a.permissoes.gerenciarConfig) return NextResponse.json({error:"Sem permissão para alterar alertas."},{status:403})
  const b=await req.json().catch(()=>null),acao=b?.acao??b?.action
  if(!b || typeof b.id!=="string" || !b.id || b.id.length>128 || !["resolver","ignorar","snooze"].includes(acao) || (acao==="snooze" && ![15,60,180,1440].includes(b.minutos))) return NextResponse.json({error:"Ação inválida"},{status:400})
  return comOrg(a.organizacaoId,async()=>{
    const filtro=await escopo(a)
    return prisma.$transaction(async tx=>{
      const r=await tx.alertaIA.updateMany({where:{AND:[filtro,{id:b.id,status:"ativo"}]},data:acao==="resolver"?{status:"resolvido",resolvedAt:new Date()}:acao==="ignorar"?{status:"ignorado"}:{snoozeAte:new Date(Date.now()+b.minutos*60000)}})
      if(!r.count) return NextResponse.json({error:"Alerta indisponível"},{status:404})
      await registrarAuditoria(tx,{organizacaoId:a.organizacaoId,usuarioId:a.usuarioId},{acao:acao==="resolver"?"alerta.resolver":acao==="ignorar"?"alerta.ignorar":"alerta.snooze",recurso:"alerta",recursoId:b.id,correlationId:correlacaoAuditoria()})
      return NextResponse.json({ok:true})
    })
  })
}
export const POST=alterar
export const PATCH=alterar

import { createHash, randomUUID } from "node:crypto"
import { Prisma, type PrismaClient } from "@prisma/client"
import { z } from "zod"
import { comOrg } from "@/lib/org-contexto"
import { registrarAuditoria } from "@/lib/auditoria"
import { intervaloCalendario } from "@/lib/metricas-recorte"
import { somarMeses, somarDias } from "@/lib/datas"

export const competenciaCusto = z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/)
export const lancamentoCusto = z.object({
  competencia: competenciaCusto, categoria: z.enum(["interno", "infraestrutura", "outros"]),
  descricao: z.string().trim().min(3).max(200), fonte: z.string().trim().min(3).max(200),
  // Decimal como texto: não aceita arredondamento silencioso, negativos, exponenciais ou NaN.
  valor: z.string().regex(/^\d{1,12}(\.\d{1,2})?$/).nullable(),
  chaveOrigem: z.string().trim().min(3).max(128).regex(/^[\w:.-]+$/),
  usuarioId: z.string().min(1).max(128).nullable().default(null),
}).strict()
type Ator = { organizacaoId: string; usuarioId: string }
export class CustoInvalido extends Error {
  constructor(message: string, public status=409) { super(message) }
}
export async function registrarCustoSetor(db: PrismaClient, ator: Ator, entrada: unknown) {
  const e=lancamentoCusto.parse(entrada)
  const valor=e.valor===null ? null : new Prisma.Decimal(e.valor).toFixed(2)
  const assinatura=createHash("sha256").update(JSON.stringify({...e,valor})).digest("hex")
  return comOrg(ator.organizacaoId,()=>db.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${ator.organizacaoId}:custo:${e.chaveOrigem}`},0))`
    const anterior=await tx.lancamentoSetor.findUnique({where:{organizacaoId_chaveOrigem:{organizacaoId:ator.organizacaoId,chaveOrigem:e.chaveOrigem}}})
    if(anterior) {
      if(anterior.assinatura!==assinatura || anterior.canceladoEm) throw new CustoInvalido("Esta origem já possui um lançamento diferente ou cancelado.")
      return anterior
    }
    if(e.usuarioId && !await tx.usuarioOrganizacao.findUnique({where:{usuarioId_organizacaoId:{usuarioId:e.usuarioId,organizacaoId:ator.organizacaoId}}})) throw new CustoInvalido("Pessoa não encontrada nesta empresa.",404)
    const r=await tx.lancamentoSetor.create({data:{...e,valor,assinatura,organizacaoId:ator.organizacaoId,criadoPor:ator.usuarioId}})
    await registrarAuditoria(tx,ator,{acao:"manutencao.custos",recurso:"custo_setor",recursoId:r.id,correlationId:randomUUID(),depois:{operacao:"criar",alterados:1}})
    return r
  }))
}
export async function cancelarCustoSetor(db: PrismaClient, ator: Ator, id: string) {
  return comOrg(ator.organizacaoId,()=>db.$transaction(async tx=>{
    const r=await tx.lancamentoSetor.findFirst({where:{id,organizacaoId:ator.organizacaoId}})
    if(!r) throw new CustoInvalido("Lançamento não encontrado.",404)
    if(r.canceladoEm) return {ok:true}
    const mudou=await tx.lancamentoSetor.updateMany({where:{id,organizacaoId:ator.organizacaoId,canceladoEm:null},data:{canceladoEm:new Date()}})
    if(mudou.count) await registrarAuditoria(tx,ator,{acao:"manutencao.custos",recurso:"custo_setor",recursoId:id,correlationId:randomUUID(),depois:{operacao:"editar",alterados:1}})
    return {ok:true}
  }))
}
export function pagamentoCusto(pago:boolean,status:string) {
  return pago !== (status==="pago") ? "conflito" : pago ? "pago" : "pendente"
}
export async function resumoCustosSetor(db: PrismaClient, organizacaoId:string, competencia:string) {
  competenciaCusto.parse(competencia)
  const de=`${competencia}-01`,ate=somarDias(somarMeses(de,1),-1),faixa=intervaloCalendario(de,ate)
  return comOrg(organizacaoId,()=>db.$transaction(async tx=>{
    const [registros,externos,semCusto]=await Promise.all([
      tx.lancamentoSetor.findMany({where:{organizacaoId,competencia,canceladoEm:null},orderBy:[{createdAt:"desc"},{id:"asc"}]}),
      tx.custoVideomaker.findMany({where:{organizacaoId,dataReferencia:faixa},select:{id:true,valor:true,valorConfirmadoEm:true,pago:true,statusPagamento:true,demandaId:true,videomaker:{select:{nome:true}}}}),
      tx.demanda.findMany({where:{organizacaoId,finalizadaEm:faixa,statusVisivel:"finalizado",videomakerId:{not:null},custos:{none:{organizacaoId}}},select:{id:true,codigo:true},orderBy:{id:"asc"},take:101}),
    ])
    const categorias={interno:new Prisma.Decimal(0),externo:new Prisma.Decimal(0),infraestrutura:new Prisma.Decimal(0),outros:new Prisma.Decimal(0)}
    const pendencias:{id:string;descricao:string;motivo:string;href:string}[]=[]
    for(const r of registros) {
      if(r.valor===null) pendencias.push({id:r.id,descricao:r.descricao,motivo:"Valor ainda não informado",href:"/custos"})
      else categorias[r.categoria as "interno"|"infraestrutura"|"outros"]=categorias[r.categoria as "interno"|"infraestrutura"|"outros"].plus(r.valor)
    }
    let pago=new Prisma.Decimal(0),pendente=new Prisma.Decimal(0)
    for(const c of externos) {
      const conhecido=Number.isFinite(c.valor) && c.valor>=0 && (c.valor>0 || c.valorConfirmadoEm!==null)
      if(!conhecido) pendencias.push({id:c.id,descricao:c.videomaker.nome,motivo:"Valor legado sem confirmação (zero não comprova gratuidade)",href:"/custos"})
      else categorias.externo=categorias.externo.plus(new Prisma.Decimal(c.valor.toString()).toDecimalPlaces(2))
      const estado=pagamentoCusto(c.pago,c.statusPagamento)
      if(estado==="conflito") pendencias.push({id:`pagamento:${c.id}`,descricao:c.videomaker.nome,motivo:"Pagamento com estados divergentes; conferir comprovante",href:"/custos"})
      else if(conhecido) { if(estado==="pago") pago=pago.plus(new Prisma.Decimal(c.valor.toString()).toDecimalPlaces(2)); else pendente=pendente.plus(new Prisma.Decimal(c.valor.toString()).toDecimalPlaces(2)) }
    }
    for(const d of semCusto.slice(0,100))pendencias.push({id:d.id,descricao:d.codigo,motivo:"Serviço concluído sem custo registrado",href:`/demandas/${d.id}`})
    const total=Object.values(categorias).reduce((a,b)=>a.plus(b),new Prisma.Decimal(0))
    return {competencia,moeda:"BRL",totalConhecido:total.toFixed(2),parcial:true,
      aviso:"Total dos valores registrados. Salários, encargos, ferramentas e serviços ainda não lançados podem estar ausentes. Não representa lucro nem fechamento contábil.",
      categorias:Object.fromEntries(Object.entries(categorias).map(([k,v])=>[k,v.toFixed(2)])),
      cobertura:{interno:registros.filter(r=>r.categoria==="interno").length,externo:externos.length,infraestrutura:registros.filter(r=>r.categoria==="infraestrutura").length,outros:registros.filter(r=>r.categoria==="outros").length},
      pagamentosExternos:{pago:pago.toFixed(2),pendente:pendente.toFixed(2)},
      custoPorEntrega:null,regraRateio:"Sem base: a distribuição dos custos entre vídeo, arte e texto ainda precisa ser definida. Unidades diferentes não são somadas.",
      registros:registros.map(r=>({...r,valor:r.valor?.toFixed(2)??null})),pendencias,maisServicosSemCusto:semCusto.length>100}
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead}))
}

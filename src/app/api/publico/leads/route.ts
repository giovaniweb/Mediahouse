import {NextRequest,NextResponse} from "next/server"
import {randomUUID} from "node:crypto"
import {z} from "zod"
import {prisma} from "@/lib/prisma"
import {checarRateLimit,ipDaRequisicao} from "@/lib/rate-limit"
const schema=z.object({nome:z.string().trim().min(2).max(120),email:z.string().trim().email().max(254),telefone:z.string().trim().min(10).max(30),empresa:z.string().trim().min(2).max(160),mensagem:z.string().trim().max(1500).optional(),origem:z.string().max(150).optional(),campanha:z.string().max(150).optional(),consentimento:z.literal(true),website:z.string().max(200).optional()})
export async function POST(req:NextRequest){
 const limit=checarRateLimit(`lead:${ipDaRequisicao(req.headers)}`,5,15*60*1000)
 if(!limit.ok)return NextResponse.json({error:"Muitas tentativas. Aguarde alguns minutos."},{status:429})
 if(Number(req.headers.get("content-length"))>12000)return NextResponse.json({error:"Formulário muito longo."},{status:413})
 const parsed=schema.safeParse(await req.json().catch(()=>null))
 if(!parsed.success)return NextResponse.json({error:"Confira os campos e autorize o contato para continuar."},{status:400})
 const d=parsed.data
 if(d.website)return NextResponse.json({ok:true},{status:201})
 try{
 // Sem RETURNING: role público tem INSERT, nunca SELECT nos leads.
 await prisma.$executeRaw`INSERT INTO leads_comerciais (id,nome,email,telefone,empresa,mensagem,origem,campanha) VALUES (${randomUUID()},${d.nome},${d.email.toLowerCase()},${d.telefone},${d.empresa},${d.mensagem||null},${d.origem||null},${d.campanha||null})`
 return NextResponse.json({ok:true},{status:201})
 }catch{return NextResponse.json({error:"Não foi possível enviar agora. Tente novamente."},{status:500})}
}

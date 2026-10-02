import { randomUUID } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { comToken, caminhoMidia, subirArquivo } from "@/lib/midia"
import { comOrg } from "@/lib/org-contexto"
import { orgPorCredencial } from "@/lib/org-por-credencial"
import { PagamentoInvalido, receberNotaFiscal } from "@/lib/pagamentos"
import { validarArquivoNF } from "@/lib/nota-fiscal-arquivo"
const resposta=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}})
type Params={params:Promise<{token:string}>}
async function carregar(token:string,organizacaoId:string) {
  if(!await prisma.organizacao.findFirst({where:{id:organizacaoId,ativo:true},select:{id:true}}))return null
  const nf=await prisma.notaFiscalUpload.findFirst({where:{token,demanda:{organizacaoId}},include:{videomaker:{select:{nome:true,usuario:{select:{status:true}}}},demanda:{select:{codigo:true,titulo:true,videomakerId:true}}}})
  if(!nf || nf.demanda.videomakerId!==nf.videomakerId || (nf.videomaker.usuario && nf.videomaker.usuario.status!=="ativo"))return null
  const vinculo=await prisma.videomakerOrganizacao.findFirst({where:{organizacaoId,videomakerId:nf.videomakerId,status:{in:["ativo","preferencial"]},emListaNegra:false},select:{id:true}})
  return vinculo ? nf : null
}
export async function GET(_req:NextRequest,{params}:Params) {
  const {token}=await params,org=await orgPorCredencial("nota_fiscal",token)
  if(!org)return resposta({error:"Link não encontrado"},404)
  return comOrg(org,async()=>{
    const nf=await carregar(token,org)
    if(!nf)return resposta({error:"Link não encontrado"},404)
    return resposta({id:nf.id,status:nf.status,nomeArquivo:nf.nomeArquivo,url:comToken(nf.url,token),videomaker:{nome:nf.videomaker.nome},demanda:{codigo:nf.demanda.codigo,titulo:nf.demanda.titulo}})
  })
}
export async function POST(req:NextRequest,{params}:Params) {
  const {token}=await params,org=await orgPorCredencial("nota_fiscal",token)
  if(!org)return resposta({error:"Link não encontrado"},404)
  return comOrg(org,async()=>{
    try {
      const nf=await carregar(token,org)
      if(!nf)return resposta({error:"Link não encontrado"},404)
      if(nf.status!=="pendente")return resposta({error:"Nota fiscal já enviada. Solicite revisão à equipe."},409)
      const form=await req.formData(),file=form.get("arquivo")
      if(!(file instanceof File))return resposta({error:"Arquivo obrigatório"},400)
      if(file.size===0 || file.size>20*1024*1024)return resposta({error:"Envie um arquivo de até 20 MB."},400)
      const buffer=await file.arrayBuffer()
      const tipo=validarArquivoNF(file.name,file.type,new Uint8Array(buffer))
      if(!tipo)return resposta({error:"Arquivo inválido. Envie PDF, PNG ou JPG com conteúdo e extensão correspondentes."},400)
      const caminho=caminhoMidia({organizacaoId:org,tipo:"nf",id:`${nf.id}-${randomUUID()}`,ext:tipo.ext})
      const url=await subirArquivo(caminho,buffer,tipo.mime)
      if(!url)return resposta({error:"Não foi possível armazenar a nota fiscal."},503)
      await prisma.$transaction(tx=>receberNotaFiscal(tx,{organizacaoId:org,notaId:nf.id,url,nomeArquivo:file.name.slice(0,255),ator:{organizacaoId:org,tecnico:`nf:${nf.id}`}}))
      return resposta({success:true})
    }catch(e){
      if(e instanceof PagamentoInvalido)return resposta({error:e.message},e.status)
      if(e instanceof TypeError)return resposta({error:"Formulário inválido"},400)
      throw e
    }
  })
}

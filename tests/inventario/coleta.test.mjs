import { test } from "node:test"
import assert from "node:assert/strict"
import { listarObjetosMidia, coletarInventario } from "../../scripts/lib/coleta-midia.mjs"
const pasta = name => ({name,id:null,metadata:null})
const arquivo = name => ({name,id:name,metadata:{size:10},created_at:"2026-09-20T00:00:00Z"})
const base = "org/empresa/videos", chave = `${base}/demanda/previews/arq/1/h264-720p-v1/job-lease.mp4`
function storage() {
  const tree = new Map([[base,[pasta("demanda")]],[`${base}/demanda`,[pasta("previews")]],[`${base}/demanda/previews`,[pasta("arq")]],[`${base}/demanda/previews/arq`,[pasta("1")]],[`${base}/demanda/previews/arq/1`,[pasta("h264-720p-v1")]],[`${base}/demanda/previews/arq/1/h264-720p-v1`,[arquivo("job-lease.mp4"),arquivo("job-outro.mp4")]]])
  return async (p,{offset,limit}) => (tree.get(p)??[]).slice(offset,offset+limit)
}
const banco = () => ({referencias:[{bucket:"midia",chave,tipo:"publicacao",registroId:"arq"}],arquivos:[{id:"arq",demandaId:"demanda",organizacaoId:"empresa"}],jobs:[],referenciasCompletas:true,jobsCompletos:true})
test("percorre pastas e páginas sem pular a página vazia terminal",async()=>{
  const r=await listarObjetosMidia({listar:storage(),organizacaoId:"empresa",tamanhoPagina:1})
  assert.equal(r.completo,true);assert.equal(r.objetos.length,2);assert.equal(r.paginas,13)
})
test("falha tardia preserva objetos já observados e não declara completude",async()=>{
  const listar=storage();const r=await listarObjetosMidia({organizacaoId:"empresa",tamanhoPagina:1,listar:async(p,o)=>{if(p.endsWith("h264-720p-v1")&&o.offset===1)throw new Error("token-secreto");return listar(p,o)}})
  assert.equal(r.completo,false);assert.equal(r.objetos.length,1);assert.equal(r.motivo,"storage_indisponivel");assert.ok(!JSON.stringify(r).includes("secreto"))
})
test("página repetida, traversal, metadata inválida e orçamento geram inconclusão",async()=>{
  const comum={organizacaoId:"empresa",tamanhoPagina:1}
  for(const row of [pasta(".."),{...arquivo("a"),metadata:{size:-1}},arquivo("a")]) {
    const r=await listarObjetosMidia({...comum,listar:async()=>[row]});assert.equal(r.completo,false)
  }
  const r=await listarObjetosMidia({...comum,listar:storage(),maxPaginas:1});assert.equal(r.motivo,"limite_paginas")
})
test("duas passagens estáveis não inventam atomicidade nem conciliação de recibos",async()=>{
  const r=await coletarInventario({banco:async()=>banco(),listar:storage(),organizacaoId:"empresa",carenciaHoras:48})
  assert.equal(r.coleta.storageEstavel,true);assert.equal(r.coleta.bancoEstavel,true)
  assert.equal(r.snapshot.evidencia.consistente,false);assert.equal(r.snapshot.evidencia.recibosConciliados,false)
  assert.equal(r.relatorio.resumo.preservar.objetos,1);assert.equal(r.relatorio.resumo.inconclusivo.objetos,1);assert.equal(r.relatorio.resumo.revisar.objetos,0)
})
test("referência criada na segunda leitura continua protegendo o objeto",async()=>{
  let calls=0;const r=await coletarInventario({banco:async()=>{const b=banco();if(calls++===0)b.referencias=[];return b},listar:storage(),organizacaoId:"empresa",carenciaHoras:48})
  assert.equal(r.coleta.bancoEstavel,false);assert.equal(r.relatorio.resumo.preservar.objetos,1)
})
test("segunda listagem diferente é marcada como instável",async()=>{
  const listar=storage();let passagens=0
  const r=await coletarInventario({banco:async()=>banco(),organizacaoId:"empresa",carenciaHoras:48,listar:async(p,o)=>{if(p===base)passagens++;const rows=await listar(p,o);return passagens>1?rows.map(r=>r.id?{...r,metadata:{size:12}}:r):rows}})
  assert.equal(r.coleta.storageEstavel,false);assert.equal(r.relatorio.resumo.revisar.objetos,0)
})
test("cancelamento não devolve storage completo",async()=>{
  const c=new AbortController();c.abort();const r=await listarObjetosMidia({listar:storage(),organizacaoId:"empresa",signal:c.signal});assert.equal(r.motivo,"cancelado");assert.equal(r.completo,false)
})

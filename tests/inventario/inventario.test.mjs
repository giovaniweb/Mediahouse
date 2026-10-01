import { spawnSync } from "node:child_process"
import { mkdtemp, writeFile, readFile, rm, stat } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { test } from "node:test"
import assert from "node:assert/strict"
import { analisarInventario } from "../../scripts/lib/inventario-midia.mjs"
const chave = "org/empresa/videos/demanda/previews/arquivo/1/h264-720p-v1/job-id-lease-id.mp4"
function fixture() { return { versao: 1, organizacaoId: "empresa", observadoEm: "2026-09-30T12:00:00Z", carenciaHoras: 48,
  evidencia: { storageCompleto: true, referenciasCompletas: true, jobsCompletos: true, recibosConciliados: true, consistente: true },
  objetos: [{ bucket: "midia", chave, bytes: 20, criadoEm: "2026-09-20T12:00:00Z" }], referencias: [],
  arquivos: [{ id: "arquivo", demandaId: "demanda", organizacaoId: "empresa" }],
  jobs: [{ id: "job-id", tipo: "midia.converter", organizacaoId: "empresa", arquivoId: "arquivo", fonteVersao: 1, perfil: "h264-720p-v1", estado: "concluido", encerradoEm: "2026-09-21T12:00:00Z", leaseToken: null }] } }
const item = s => analisarInventario(s).itens[0]
test("candidato antigo é somente revisão, nunca autorização de apagar", () => {
  const s=fixture(), antes=JSON.stringify(s), r=analisarInventario(s)
  assert.equal(r.itens[0].situacao,"revisar"); assert.equal(r.autorizaExclusao,false)
  assert.deepEqual(r.resumo.revisar,{objetos:1,bytes:"20"}); assert.equal(JSON.stringify(s),antes)
})
test("todas as referências preservam, inclusive publicação e aprovação antiga", () => {
  for(const tipo of ["fonte","original","atual","publicacao","thumbnail","demanda","aprovacao","outro"]) {
    const s=fixture();s.referencias.push({bucket:"midia",chave,tipo,registroId:"registro"}); assert.equal(item(s).situacao,"preservar")
  }
})
test("qualquer evidência incompleta impede classificar como candidato", () => {
  for(const flag of Object.keys(fixture().evidencia)){const s=fixture();s.evidencia[flag]=false;assert.equal(item(s).situacao,"inconclusivo")}
})
test("originais, outros buckets e empresas ficam fora do escopo", () => {
  for(const change of [{bucket:"uploads"},{chave:chave.replace("empresa","outra")},{chave:"org/empresa/videos/demanda/original.mov"}]){const s=fixture();Object.assign(s.objetos[0],change);assert.equal(item(s).situacao,"fora_escopo")}
})
test("arquivo ausente, duplicado ou vínculo divergente é inconclusivo", () => {
  for(const mode of ["ausente","duplicado","demanda","empresa"]){const s=fixture();if(mode==="ausente")s.arquivos=[];if(mode==="duplicado")s.arquivos.push({...s.arquivos[0]});if(mode==="demanda")s.arquivos[0].demandaId="outra";if(mode==="empresa")s.arquivos[0].organizacaoId="outra";assert.equal(item(s).situacao,"inconclusivo")}
})
test("job ativo é preservado; desconhecido, duplicado ou incompatível é inconclusivo", () => {
  for(const estado of ["pendente","executando"]){const s=fixture();s.jobs[0].estado=estado;assert.equal(item(s).motivo,"job_ativo")}
  for(const mode of ["ausente","duplicado","versao","empresa","arquivo"]){const s=fixture();if(mode==="ausente")s.jobs=[];if(mode==="duplicado")s.jobs.push({...s.jobs[0]});if(mode==="versao")s.jobs[0].fonteVersao=2;if(mode==="empresa")s.jobs[0].organizacaoId="outra";if(mode==="arquivo")s.jobs[0].arquivoId="outro";assert.equal(item(s).situacao,"inconclusivo")}
})
test("hífens ambíguos em job/lease não inventam vínculo", () => {const s=fixture();s.jobs.push({...s.jobs[0],id:"job-id-lease"});assert.equal(item(s).motivo,"tentativa_desconhecida_ou_ambigua")})
test("lease ainda registrado e data de encerramento ausente bloqueiam revisão", () => {
  const s=fixture();s.jobs[0].leaseToken="lease-id";assert.equal(item(s).motivo,"lease_ainda_registrado");s.jobs[0].leaseToken="outro-lease";assert.equal(item(s).motivo,"lease_ainda_registrado");s.jobs[0].leaseToken=null;s.jobs[0].encerradoEm=null;assert.equal(item(s).motivo,"sem_data_de_encerramento")
})
test("carência conta a data mais recente; datas futuras são inconclusivas", () => {
  const s=fixture();s.jobs[0].encerradoEm="2026-09-29T12:00:00Z";assert.equal(item(s).motivo,"dentro_da_carencia");s.jobs[0].encerradoEm="2026-10-01T12:00:00Z";assert.equal(item(s).motivo,"data_futura")
})
test("objetos duplicados não inflam bytes nem viram candidatos", () => {const s=fixture();s.objetos.push({...s.objetos[0],bytes:30});const r=analisarInventario(s);assert.equal(r.itens.length,1);assert.equal(r.itens[0].situacao,"inconclusivo")})
test("recusa URL assinada, traversal e campos desconhecidos", () => {
  for(const key of [chave+"?token=segredo", "https://storage.example/arquivo", "org/empresa/../arquivo"]){const s=fixture();s.objetos[0].chave=key;assert.throws(()=>analisarInventario(s))}
  const s=fixture();s.segredo="nunca";assert.throws(()=>analisarInventario(s))
})

test("CLI gera relatório privado sem sobrescrever saída nem alterar entrada", async () => {
  const root=await mkdtemp(join(tmpdir(),"nuflow-inventario-"))
  try {
    const entrada=join(root,"entrada.json"),saida=join(root,"saida.json"),conteudo=JSON.stringify(fixture())
    await writeFile(entrada,conteudo)
    const run=()=>spawnSync(process.execPath,["scripts/inventario-midia.mjs",entrada,saida],{encoding:"utf8"})
    assert.equal(run().status,0)
    const relatorio=await readFile(saida,"utf8")
    assert.equal(JSON.parse(relatorio).autorizaExclusao,false)
    assert.equal((await stat(saida)).mode & 0o777,0o600)
    assert.equal(run().status,1)
    assert.equal(await readFile(saida,"utf8"),relatorio)
    assert.equal(await readFile(entrada,"utf8"),conteudo)
    await writeFile(entrada,JSON.stringify({...fixture(),apiKey:"proibido"}))
    await rm(saida)
    assert.equal(run().status,1)
    await assert.rejects(stat(saida),{code:"ENOENT"})
  } finally {await rm(root,{recursive:true,force:true})}
})

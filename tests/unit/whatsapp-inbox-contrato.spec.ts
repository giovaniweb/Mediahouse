import { describe,it,expect } from "vitest"
import fixture from "../fixtures/whatsapp/evolution-envelope-v1.json"
import { normalizarEntrada } from "@/lib/whatsapp-inbox-contrato"
describe("envelope WhatsApp reduzido",()=>{
  it("extrai ID separado do texto e não conserva segredos/envelope",()=>{
    const r=normalizarEntrada(fixture.data)
    expect(r).toMatchObject({providerMessageId:"MSG-SINTETICA-001",conteudo:{texto:"SIM",tipo:"text"}})
    expect(JSON.stringify(r)).not.toContain("apikey")
  })
  it("aceita texto estendido e documento sem copiar base64, url ou chave de mídia",()=>{
    const r=normalizarEntrada({...fixture.data,message:{documentMessage:{caption:"Arquivo",mimetype:"application/pdf",fileName:"teste.pdf",base64:"segredo",mediaKey:"segredo",url:"https://example.invalid"}}})
    expect(r).toMatchObject({conteudo:{texto:"Arquivo",tipo:"document",midia:{mimetype:"application/pdf",fileName:"teste.pdf"}}})
    expect(JSON.stringify(r)).not.toContain("segredo")
    expect(normalizarEntrada({...fixture.data,message:{extendedTextMessage:{text:"Texto",contextInfo:{quotedMessage:"nao-copiar"}}}})).toMatchObject({conteudo:{texto:"Texto"}})
  })
  it("ausência de origem ou ID falha fechada, mensagem própria é ignorada",()=>{
    expect(()=>normalizarEntrada({...fixture.data,key:{id:"x"}})).toThrow()
    expect(()=>normalizarEntrada({...fixture.data,key:{...fixture.data.key,id:""}})).toThrow()
    expect(normalizarEntrada({...fixture.data,key:{...fixture.data.key,fromMe:true}})).toEqual({ignorado:"mensagem_propria"})
  })
})

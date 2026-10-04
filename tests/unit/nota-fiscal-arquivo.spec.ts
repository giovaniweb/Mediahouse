import { expect, it } from "vitest"
import { validarArquivoNF } from "@/lib/nota-fiscal-arquivo"
it("aceita extensão, MIME e assinatura de PDF correspondentes",()=>expect(validarArquivoNF("nf.PDF","application/pdf",new TextEncoder().encode("%PDF-1.7"))).toMatchObject({ext:"pdf"}))
it.each([
 ["nf.exe","application/pdf",[37,80,68,70,45]],
 ["nf.pdf","text/html",[37,80,68,70,45]],
 ["nf.pdf","application/pdf",[60,104,116,109,108]],
 ["nf.png","image/png",[]],
])("recusa disfarce ou conteúdo vazio: %s",(nome,mime,bytes)=>expect(validarArquivoNF(nome as string,mime as string,new Uint8Array(bytes as number[]))).toBeNull())
it("aceita PNG e normaliza JPEG",()=>{
 expect(validarArquivoNF("nf.png","image/png",new Uint8Array([137,80,78,71,13,10,26,10]))).toMatchObject({ext:"png"})
 expect(validarArquivoNF("nf.jpeg","image/jpeg",new Uint8Array([255,216,255]))).toMatchObject({ext:"jpg",mime:"image/jpeg"})
})

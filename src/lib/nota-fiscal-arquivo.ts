/** Extensão, MIME e assinatura precisam concordar. Não é antivírus. */
export function validarArquivoNF(nome:string,mime:string,bytes:Uint8Array) {
  const ext=nome.toLowerCase().split(".").pop()
  const comeca=(assinatura:number[])=>assinatura.every((b,i)=>bytes[i]===b)
  if(ext==="pdf" && mime==="application/pdf" && comeca([37,80,68,70,45]))return {ext:"pdf",mime}
  if(ext==="png" && mime==="image/png" && comeca([137,80,78,71,13,10,26,10]))return {ext:"png",mime}
  if((ext==="jpg" || ext==="jpeg") && ["image/jpeg","image/jpg"].includes(mime) && comeca([255,216,255]))return {ext:"jpg",mime:"image/jpeg"}
  return null
}

import {describe,it,expect} from "vitest"
import {cadenciaMinutos,estadoBatida} from "@/lib/automacoes-saude"
describe("saúde por evidências",()=>{
  it("não deduz atraso sem cadência ou sem registro",()=>{
    expect(cadenciaMinutos("whatsapp-inbox","{}")).toBeNull()
    expect(cadenciaMinutos("whatsapp-inbox",'{"whatsapp-inbox":0}')).toBeNull()
    expect(cadenciaMinutos("whatsapp-inbox","invalido")).toBeNull()
    expect(estadoBatida(null,null,5)).toBe("sem_registro")
    expect(estadoBatida(new Date(0),"concluido",null)).toBe("concluido")
  })
  it("atraso exige dois intervalos e execução interrompida não é sucesso",()=>{
    const agora=new Date("2026-09-29T15:00Z")
    expect(cadenciaMinutos("whatsapp-inbox",'{"whatsapp-inbox":5}')).toBe(5)
    expect(estadoBatida(new Date(+agora-11*60000),"concluido",5,agora)).toBe("atrasado")
    expect(estadoBatida(new Date(+agora-11*60000),"executando",null,agora)).toBe("interrompido")
    expect(estadoBatida(agora,"parcial",5,agora)).toBe("parcial")
  })
})

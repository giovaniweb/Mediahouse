import { describe,it,expect } from "vitest"
import { regrasDemanda,lembreteVigente,cobrancaValida } from "@/lib/regras-operacionais"
describe("regras puras O04",()=>{
  it.each([8,14,22])("lembrete às %ih respeita minutos e cron atrasado",hora=>{
    const inicio=new Date(`2026-09-29T${String(hora).padStart(2,"0")}:00:00-03:00`)
    const e={inicio,lembreteMinutos:180,status:"confirmado" as const}
    expect(lembreteVigente(e,new Date(+inicio-181*60000))).toBe(false)
    expect(lembreteVigente(e,new Date(+inicio-180*60000))).toBe(true)
    expect(lembreteVigente(e,new Date(+inicio-10*60000))).toBe(true)
    expect(lembreteVigente(e,inicio)).toBe(false)
    expect(lembreteVigente({...e,status:"cancelado"},new Date(+inicio-60000))).toBe(false)
  })
  it("encerra atraso/parada e limita ausência de final ao audiovisual finalizado",()=>{
    const agora=new Date("2026-09-29T15:00:00Z")
    const d={statusInterno:"editando" as const,statusVisivel:"edicao" as const,area:"audiovisual" as const,updatedAt:new Date("2026-09-01"),dataLimite:new Date("2026-09-28"),linkFinal:null,dataCaptacao:null}
    expect(regrasDemanda(d,false,agora)).toEqual(["prazo_vencido","sem_movimento"])
    expect(regrasDemanda({...d,statusVisivel:"finalizado"},false,agora)).toEqual(["sem_final"])
    expect(regrasDemanda({...d,statusVisivel:"finalizado",area:"design"},false,agora)).toEqual([])
    expect(regrasDemanda({...d,statusVisivel:"finalizado"},true,agora)).toEqual([])
  })
  it("cobrança só para NF pendente vencida, nunca custo pago ou contestado",()=>{
    const c={pago:false,statusPagamento:"pendente_nf" as const,dataVencimento:new Date("2026-09-29")},agora=new Date("2026-09-29T15:00Z")
    expect(cobrancaValida(c,agora)).toBe(true)
    expect(cobrancaValida({...c,pago:true},agora)).toBe(false)
    expect(cobrancaValida({...c,statusPagamento:"pago"},agora)).toBe(false)
    expect(cobrancaValida({...c,statusPagamento:"contestado"},agora)).toBe(false)
    expect(cobrancaValida({...c,dataVencimento:new Date("2026-09-30")},agora)).toBe(false)
  })
})

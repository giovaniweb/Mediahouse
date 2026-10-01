import { expect, it } from "vitest"
import { lancamentoCusto, pagamentoCusto } from "@/lib/custos-setor"
const base={competencia:"2026-10",categoria:"interno",descricao:"Folha mensal",fonte:"Folha confirmada",chaveOrigem:"folha-2026-10"}
it.each(["-1","1e3","NaN","1.005","1000000000000","1,50"])("recusa valor sem centavos exatos: %s",valor=>expect(lancamentoCusto.safeParse({...base,valor}).success).toBe(false))
it.each(["2026-00","2026-13","26-10","2026-10-01"])("recusa competência inválida: %s",competencia=>expect(lancamentoCusto.safeParse({...base,competencia,valor:"0"}).success).toBe(false))
it("separa valor desconhecido de zero explicitamente confirmado",()=>{expect(lancamentoCusto.parse({...base,valor:null}).valor).toBeNull();expect(lancamentoCusto.parse({...base,valor:"0"}).valor).toBe("0")})
it("não permite espelhar custo externo no livro complementar",()=>expect(lancamentoCusto.safeParse({...base,categoria:"externo",valor:"50"}).success).toBe(false))
it("pagamento não é inferido por e-mail ou só um dos estados",()=>{expect(pagamentoCusto(false,"aguardando_pagamento")).toBe("pendente");expect(pagamentoCusto(true,"pago")).toBe("pago");expect(pagamentoCusto(true,"nf_enviada")).toBe("conflito");expect(pagamentoCusto(false,"pago")).toBe("conflito")})

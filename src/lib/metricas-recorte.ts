import { dataEmSaoPaulo, somarDias, somarMeses } from "@/lib/datas"
export const VERSAO_METRICAS = 1 as const
export type RecorteMetricas = { versao: 1; area: "audiovisual" | "design"; fuso: "America/Sao_Paulo"; tipo: string; de: string; ate: string; inicio: string; fim: string }
export class RecorteInvalido extends Error {}
function diaValido(s: string) {
  return /^20\d{2}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0,10) === s
}
/** Resolve meia-noite no fuso IANA, sem depender do TZ do processo. */
function meiaNoite(dia: string) {
  const base = Date.parse(`${dia}T00:00:00Z`)
  let ms = base
  for (let i=0;i<3;i++) {
    const offset = new Intl.DateTimeFormat("en", { timeZone: "America/Sao_Paulo", timeZoneName: "longOffset" }).formatToParts(new Date(ms)).find(p => p.type === "timeZoneName")!.value
    const m = /GMT([+-])(\d{2}):(\d{2})/.exec(offset)
    const minutos = m ? (Number(m[2])*60+Number(m[3])) * (m[1] === "+" ? 1 : -1) : 0
    const proximo = base - minutos*60000
    if (ms === proximo) break
    ms = proximo
  }
  return new Date(ms).toISOString()
}
export function recorteMetricas(sp: URLSearchParams, agora = new Date()): RecorteMetricas {
  const raw = sp.get("area") ?? "audiovisual"
  const area = raw === "growth" ? "design" : raw
  if (area !== "audiovisual" && area !== "design") throw new RecorteInvalido("Área inválida")
  if (sp.has("fuso") && sp.get("fuso") !== "America/Sao_Paulo") throw new RecorteInvalido("Fuso inválido")
  const hoje = dataEmSaoPaulo(agora)
  let de: string, ate = hoje, tipo = sp.get("periodo") ?? "mes"
  const mes = sp.get("mes")
  if (mes) {
    if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(mes)) throw new RecorteInvalido("Mês inválido")
    tipo = "mes_especifico"; de = `${mes}-01`; ate = somarDias(somarMeses(de,1),-1)
  } else if (tipo === "custom" || sp.has("de") || sp.has("ate")) {
    tipo = "custom"; de = sp.get("de") ?? ""; ate = sp.get("ate") ?? ""
  } else if (tipo === "semana") de = somarDias(hoje,-6)
  else if (tipo === "3meses") de = somarDias(hoje,-89)
  else if (tipo === "ano") de = `${hoje.slice(0,4)}-01-01`
  else if (tipo === "12meses") de = somarMeses(`${hoje.slice(0,7)}-01`,-11)
  else if (tipo === "mes") de = `${hoje.slice(0,7)}-01`
  else throw new RecorteInvalido("Período inválido")
  if (!diaValido(de) || !diaValido(ate) || de > ate) throw new RecorteInvalido("Datas inválidas ou intervalo invertido")
  if (Date.parse(ate)-Date.parse(de) > 5*366*86400000) throw new RecorteInvalido("Selecione um intervalo de até cinco anos")
  return { versao: VERSAO_METRICAS, area, fuso: "America/Sao_Paulo", tipo, de, ate, inicio: meiaNoite(de), fim: meiaNoite(somarDias(ate,1)) }
}
export const faixaMetricas = (r: RecorteMetricas) => ({ gte: new Date(r.inicio), lt: new Date(r.fim) })
export const filtroConcluidas = (organizacaoId: string, r: RecorteMetricas) => ({ organizacaoId, area: r.area, statusVisivel: "finalizado" as const, finalizadaEm: faixaMetricas(r) })

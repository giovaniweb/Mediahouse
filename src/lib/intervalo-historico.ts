import { dataEmSaoPaulo, somarDias } from "./datas"

function validarDia(dia: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return false
  const instante = new Date(`${dia}T12:00:00Z`)
  return !Number.isNaN(instante.getTime()) && instante.toISOString().slice(0, 10) === dia
}

// Primeiro instante do dia no fuso da operação. A busca também contempla dias
// históricos em que o horário de verão eliminou a meia-noite local.
function inicioLocal(dia: string) {
  const utc = Date.parse(`${dia}T00:00:00Z`)
  let antes = utc - 86_400_000
  let depois = utc + 86_400_000
  while (antes < depois) {
    const meio = Math.floor((antes + depois) / 2)
    if (dataEmSaoPaulo(new Date(meio)) < dia) antes = meio + 1
    else depois = meio
  }
  return new Date(antes)
}

export function intervaloHistorico(de: string | null, ate: string | null) {
  if ((de && !validarDia(de)) || (ate && !validarDia(ate)) || (de && ate && de > ate)) {
    throw new Error("Informe um período válido para o histórico.")
  }
  return {
    ...(de ? { gte: inicioLocal(de) } : {}),
    ...(ate ? { lt: inicioLocal(somarDias(ate, 1)) } : {}),
  }
}

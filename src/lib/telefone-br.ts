// O WhatsApp digitado na hora (11/11/2026, "Enviar para um WhatsApp"): só
// número do Brasil, com DDD que existe. Regra pura, vai para o navegador (o
// erro aparece enquanto se digita) e para o servidor (que confere de novo).

/** Os 67 DDDs do plano de numeração da Anatel. */
export const DDDS_BR = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19,
  21, 22, 24, 27, 28,
  31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55,
  61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79,
  81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99,
])

export type WhatsappBR = { ok: true; telefone: string; legivel: string } | { ok: false; erro: string }

/**
 * "(41) 99876-5432", "+55 41 99876 5432", "041998765432" → "5541998765432".
 * Celular com 11 números (o terceiro é 9) ou fixo com 10.
 */
export function validarWhatsappBR(texto: string | null | undefined): WhatsappBR {
  const bruto = (texto ?? "").trim()
  if (!bruto) return { ok: false, erro: "Digite o WhatsApp com DDD." }
  if (/[a-z]/i.test(bruto)) return { ok: false, erro: "Use só números." }
  let n = bruto.replace(/\D/g, "")
  const internacional = bruto.startsWith("+") || bruto.startsWith("00")
  if (bruto.startsWith("00")) n = n.slice(2)
  if (internacional && !n.startsWith("55")) return { ok: false, erro: "Só números do Brasil (+55)." }
  if (n.startsWith("55") && (n.length === 12 || n.length === 13)) n = n.slice(2)
  else if (n.startsWith("0") && (n.length === 11 || n.length === 12)) n = n.slice(1)
  if (n.length < 10) return { ok: false, erro: "Faltam números. Use DDD + número, como (41) 99876-5432." }
  if (n.length > 11) return { ok: false, erro: "Números demais. Use DDD + número, como (41) 99876-5432." }
  if (!DDDS_BR.has(Number(n.slice(0, 2)))) return { ok: false, erro: `Confira o DDD: ${n.slice(0, 2)} não existe.` }
  const numero = n.slice(2)
  if (n.length === 11 && numero[0] !== "9") return { ok: false, erro: "Celular com 9 dígitos começa com 9. Confira o número." }
  if (n.length === 10 && numero[0] < "2") return { ok: false, erro: "Confira o número." }
  const legivel = n.length === 11
    ? `(${n.slice(0, 2)}) ${numero.slice(0, 5)}-${numero.slice(5)}`
    : `(${n.slice(0, 2)}) ${numero.slice(0, 4)}-${numero.slice(4)}`
  return { ok: true, telefone: `55${n}`, legivel }
}

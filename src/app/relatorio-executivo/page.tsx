import { redirect } from "next/navigation"

// Redireciona para o mês atual (mínimo maio/2026), no formato /relatorio-executivo/YYYY-MM
export default function RelatorioExecutivoIndex() {
  const now = new Date()
  let y = now.getFullYear()
  let m = now.getMonth() + 1
  // piso: maio/2026
  if (y < 2026 || (y === 2026 && m < 5)) { y = 2026; m = 5 }
  redirect(`/relatorio-executivo/${y}-${String(m).padStart(2, "0")}`)
}

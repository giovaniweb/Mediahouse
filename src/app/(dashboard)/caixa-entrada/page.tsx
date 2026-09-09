import { redirect } from "next/navigation"

/** Caixa de entrada retirada do produto. Links antigos continuam navegáveis. */
export default function CaixaEntradaPage() {
  redirect("/dashboard")
}

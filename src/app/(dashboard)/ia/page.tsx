import { redirect } from "next/navigation"

/** Links antigos levam à operação, sem recriar a vitrine de agentes. */
export default function IAPage() {
  redirect("/alertas")
}

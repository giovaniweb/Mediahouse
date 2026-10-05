import { Suspense } from "react"
import { FormularioLogin } from "@/components/auth/FormularioLogin"
import { SLUG_ORG_PADRAO } from "@/lib/org"

export default function LoginPage() {
  // useSearchParams exige Suspense para a página poder ser pré-renderizada.
  // Cliente que cai no login procurando onde pedir vai para a área da empresa padrão.
  return (
    <Suspense>
      <FormularioLogin areaCliente={`/c/${SLUG_ORG_PADRAO}`} />
    </Suspense>
  )
}

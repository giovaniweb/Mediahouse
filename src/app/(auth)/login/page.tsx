"use client"
import { Suspense } from "react"
import { FormularioLogin } from "@/components/auth/FormularioLogin"

export default function LoginPage() {
  // useSearchParams exige Suspense para a página poder ser pré-renderizada.
  return (
    <Suspense>
      <FormularioLogin />
    </Suspense>
  )
}

"use client"
import SystemState from "@/components/system/SystemState"
export default function AuthError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <SystemState embedded label="ACESSO AO NUFLOW" title="Vamos tentar mais uma vez." description="Não foi possível carregar esta página. Tente novamente ou volte para entrar na sua conta." code={error.digest}>
    <button onClick={retry}>Tentar novamente</button><a href="/login">Voltar para entrar</a>
  </SystemState>
}

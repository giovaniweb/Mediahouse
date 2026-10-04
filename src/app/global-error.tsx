"use client"
import SystemState from "@/components/system/SystemState"
export default function ErroGlobal({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <html lang="pt-BR"><body style={{margin:0}}><SystemState label="RECUPERAR ACESSO" title="O NuFlow não conseguiu carregar." description="Tente novamente. Se o problema continuar, informe o código abaixo ao administrador da sua empresa." code={error.digest}>
    <button onClick={retry}>Tentar novamente</button><a href="/login">Voltar para entrar</a>
  </SystemState></body></html>
}

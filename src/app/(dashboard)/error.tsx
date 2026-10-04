"use client"
import SystemState from "@/components/system/SystemState"
export default function ErroDoPainel({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <SystemState embedded label="RECUPERAR PÁGINA" title="Não conseguimos carregar esta tela." description="Tente carregar novamente. Se a falha continuar, volte ao início ou informe o código abaixo ao administrador da sua empresa." code={error.digest}>
    <button onClick={retry}>Tentar novamente</button><a href="/dashboard">Ir para o início</a>
  </SystemState>
}

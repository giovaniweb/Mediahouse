import SystemState from "@/components/system/SystemState"
export default function NotFound() {
  return <SystemState label="PÁGINA NÃO ENCONTRADA · 404" title="Este caminho não está disponível." description="O endereço pode ter mudado ou estar incompleto. Confira o link ou volte ao seu workspace.">
    <a href="/dashboard">Ir para meu workspace</a><a href="/login">Acessar minha conta</a>
  </SystemState>
}

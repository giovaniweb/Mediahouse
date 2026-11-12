import { SessionProvider } from "@/components/layout/SessionProvider"
import { TelaAceite } from "@/components/juridico/TelaAceite"
import { aceitePendenteDoPainel } from "@/lib/juridico/aceite-painel"

// O Modo Campo fica fora do layout do painel, mas é a mesma pessoa logada: o
// aceite dos termos vale aqui também (Onda 3), senão quem só usa o campo nunca
// o veria. Falha aberta, como no painel (aceite-painel.ts).
export default async function CampoLayout({ children }: { children: React.ReactNode }) {
  const aceite = await aceitePendenteDoPainel()
  return <SessionProvider>{aceite ? <TelaAceite {...aceite} /> : children}</SessionProvider>
}

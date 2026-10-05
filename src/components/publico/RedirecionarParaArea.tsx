import { redirect } from "next/navigation"
import { empresaDestino } from "@/lib/portal"
import { LinkIndisponivel } from "@/components/publico/LinkIndisponivel"

// Os endereços antigos (/cadastrar-demanda e /cadastrar-videomaker, com ou sem
// ?org=) continuam em links, QR codes e mensagens. Eles já abriam o mesmo
// formulário da área nova, mas fora dela: topo sem a área da empresa, "Voltar"
// para /sobre e, sem ?org=, um pedido sem dono aparente. Em vez de manter duas
// portas para a mesma tela, o link antigo leva à área da empresa.
//
// A empresa é a do ?org= ou, sem ele, a padrão (ORG_PUBLICA_PADRAO). O resto da
// query segue junto (?tipo=cobertura, utm_*). Slug que não existe não cai na
// padrão: mostra o aviso, para o pedido não ir à empresa errada sem ninguém ver.
// Redirecionamento temporário (307): a empresa padrão é configuração e pode mudar.
type Busca = Record<string, string | string[] | undefined>

export async function RedirecionarParaArea({ busca, trecho }: { busca: Promise<Busca>; trecho: "/pedido" | "/videomaker" }) {
  const params = await busca
  const resto = new URLSearchParams()
  let org: string | undefined
  for (const [chave, valor] of Object.entries(params)) {
    for (const v of [valor].flat()) {
      if (v === undefined) continue
      if (chave === "org") org ??= v
      else resto.append(chave, v)
    }
  }
  const empresa = await empresaDestino(org)
  if (!empresa) {
    return <LinkIndisponivel titulo="Empresa não encontrada" texto="Este link não aponta para nenhuma empresa ativa no NuFlow. Confira o endereço com quem enviou." />
  }
  const query = resto.toString()
  redirect(`/c/${empresa.slug}${trecho}${query ? `?${query}` : ""}`)
}

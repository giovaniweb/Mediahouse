import Sobre from "./Sobre"
import { SLUG_LINKS_ANTIGOS } from "@/lib/org"

// /sobre é a página da produtora de antes da área por empresa — da empresa dos
// links antigos. Os depoimentos dela pedem a empresa pelo nome, porque a API
// pública não tem mais empresa padrão.
export default function SobrePage() {
  return <Sobre org={SLUG_LINKS_ANTIGOS} />
}

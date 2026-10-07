import { PaginaDocumento, metadataDoDocumento } from "@/components/juridico/PaginaDocumento"

export const metadata = metadataDoDocumento("profissionais")

export default function Page() {
  return <PaginaDocumento slug="profissionais" />
}

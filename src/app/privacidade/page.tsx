import { PaginaDocumento, metadataDoDocumento } from "@/components/juridico/PaginaDocumento"

export const metadata = metadataDoDocumento("privacidade")

export default function Page() {
  return <PaginaDocumento slug="privacidade" />
}

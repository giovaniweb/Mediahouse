import { PaginaDocumento, metadataDoDocumento } from "@/components/juridico/PaginaDocumento"

export const metadata = metadataDoDocumento("avaliacoes")

export default function Page() {
  return <PaginaDocumento slug="avaliacoes" />
}

import { PaginaDocumento, metadataDoDocumento } from "@/components/juridico/PaginaDocumento"

export const metadata = metadataDoDocumento("termos")

export default function Page() {
  return <PaginaDocumento slug="termos" />
}

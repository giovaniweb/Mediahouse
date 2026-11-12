import { PaginaDocumento, metadataDoDocumento } from "@/components/juridico/PaginaDocumento"

export const metadata = metadataDoDocumento("dpa")

export default function Page() {
  return <PaginaDocumento slug="dpa" />
}

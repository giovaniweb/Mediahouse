import AprovacoesView from "@/components/aprovacoes/AprovacoesView"

// Aprovações do Audiovisual. O Growth tem a sua própria em /aprovacoes/growth —
// antes as duas áreas dividiam esta tela e o gestor recebia tudo misturado.
export default function AprovacoesAudiovisualPage() {
  return <AprovacoesView area="audiovisual" />
}

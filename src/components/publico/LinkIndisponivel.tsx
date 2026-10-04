import { Link2Off } from "lucide-react"

// A tela de quem abre um link público que não vale mais: avaliação, portal
// de fornecedor, envio de nota, evento. Cada página tinha a sua — texto
// vermelho solto, título repetido no subtítulo, "Indisponivel" sem acento — e
// a de avaliação nem tinha: mostrava o formulário para um profissional que não
// existe, e o erro só aparecia depois de a pessoa preencher tudo.
export function LinkIndisponivel({
  titulo = "Link indisponível",
  texto = "Este link não existe mais ou foi desativado. Peça um novo link a quem enviou.",
}: { titulo?: string; texto?: string }) {
  return (
    <main className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
      <section className="max-w-sm w-full rounded-2xl border border-zinc-800 bg-zinc-900 p-8 text-center">
        <span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/10" aria-hidden="true">
          <Link2Off className="h-7 w-7 text-amber-400" />
        </span>
        <h1 className="text-xl font-semibold text-zinc-100">{titulo}</h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">{texto}</p>
      </section>
    </main>
  )
}

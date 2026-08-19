"use client"

// O formulário voltou preenchido de uma sessão anterior — dizer isso evita que a
// pessoa ache que é resto de outra demanda e apague tudo.

export function BannerRascunho({ aoDescartar }: { aoDescartar: () => void }) {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 px-3.5 py-2.5">
      <p className="min-w-[14rem] flex-1 text-xs text-blue-200">
        Recuperamos o que você tinha começado a escrever.
      </p>
      <button
        type="button"
        onClick={() => { if (confirm("Descartar o rascunho e começar do zero?")) aoDescartar() }}
        className="rounded-md border border-blue-500/40 px-2.5 py-1 text-xs font-medium text-blue-100 transition-colors hover:bg-blue-500/20"
      >
        Começar do zero
      </button>
    </div>
  )
}

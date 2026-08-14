"use client"

// Último recurso: erro no próprio layout raiz, onde o error.tsx de rota já não
// alcança. Precisa trazer <html> e <body> porque substitui o layout inteiro.

export default function ErroGlobal({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, background: "#09090b", color: "#e4e4e7", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ maxWidth: 420, textAlign: "center" }}>
            <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
              O NuFlow não conseguiu carregar
            </h1>
            <p style={{ fontSize: 14, color: "#a1a1aa", marginBottom: 20 }}>
              Tente novamente. Se continuar, avise o suporte informando o código abaixo.
            </p>
            {error.digest && (
              <p style={{ fontSize: 11, color: "#52525b", fontFamily: "monospace", marginBottom: 20 }}>
                código {error.digest}
              </p>
            )}
            <button
              onClick={reset}
              style={{ background: "#7c3aed", color: "#fff", border: 0, padding: "10px 20px", borderRadius: 8, fontSize: 14, cursor: "pointer" }}
            >
              Tentar de novo
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}

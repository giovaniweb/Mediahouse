import styles from "./ManagementSurface.module.css"

/**
 * Abertura de página no padrão do v8: rótulo, título e uma frase do que a tela
 * resolve. Mesmo estilo da ManagementIntro, com o rótulo livre — as telas que
 * abriam só com o nome na barra do topo passam a se apresentar como as novas.
 */
export function PageIntro({ eyebrow, title, description, children }: {
  eyebrow: string
  title: string
  description?: string
  /** Ações ao lado do texto (opcional). */
  children?: React.ReactNode
}) {
  return (
    // Margem lateral de 24 px: a mesma do p-6 das telas que usam este cabeçalho.
    <div className={styles.intro} style={{ padding: "28px 24px 4px", ...(children ? { display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 16 } : {}) }}>
      <div>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h1>{title}</h1>
        {description && <p style={{ marginTop: 10, color: "#a5a7bb", fontSize: 14, lineHeight: 1.7, maxWidth: 700 }}>{description}</p>}
      </div>
      {children}
    </div>
  )
}

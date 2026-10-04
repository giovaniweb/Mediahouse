import { Aperture } from "lucide-react"
import styles from "./SystemState.module.css"

export default function SystemState({ title, description, label, children, code, embedded = false }: {
  title: string; description: string; label: string; children: React.ReactNode; code?: string; embedded?: boolean
}) {
  return <section className={`${styles.surface} ${embedded ? styles.embedded : ""}`} aria-labelledby="system-title">
    <div className={styles.card}>
      <a href="/" className={styles.brand}><Aperture size={28} aria-hidden="true"/>NuFlow.</a>
      <p className={styles.eyebrow}>{label}</p>
      <h1 id="system-title">{title}</h1>
      <p className={styles.description}>{description}</p>
      {code && <p className={styles.code}>Código de suporte: {code}</p>}
      <div className={styles.actions}>{children}</div>
    </div>
  </section>
}

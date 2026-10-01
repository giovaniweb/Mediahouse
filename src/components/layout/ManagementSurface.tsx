import "./Montserrat.css"
import styles from "./ManagementSurface.module.css"

/** Base visual integrada do protótipo aprovado, sem alterar autorização ou dados. */
export function ManagementSurface({ children }: { children: React.ReactNode }) {
  return <div className={styles.surface}>{children}</div>
}
export function ManagementIntro({ title, description }: { title: string; description: string }) {
  return <div className={styles.intro}>
    <p className={styles.eyebrow}>WORKSPACE / GESTÃO</p>
    <h1>{title}</h1>
    <p>{description}</p>
  </div>
}

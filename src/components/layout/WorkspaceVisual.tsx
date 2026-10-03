"use client"
import styles from "./WorkspaceVisual.module.css"

export function WorkspaceVisual({ children }: { children: React.ReactNode }) {
  return <div className={`flex h-dvh overflow-hidden bg-zinc-950 ${styles.workspace}`}>{children}</div>
}

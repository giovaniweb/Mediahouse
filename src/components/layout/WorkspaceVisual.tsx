"use client"
import { useVisualPreview } from "./useVisualPreview"
import styles from "./WorkspaceVisual.module.css"

export function WorkspaceVisual({ children }: { children: React.ReactNode }) {
  const { modern } = useVisualPreview()
  return <div className={`flex h-dvh overflow-hidden bg-zinc-950 ${modern ? styles.workspace : ""}`}>{children}</div>
}

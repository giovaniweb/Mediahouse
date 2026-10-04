"use client"
import { useState } from "react"
import { SlidersHorizontal, ChevronDown } from "lucide-react"
import styles from "./BoardFilters.module.css"

export function BoardFilters({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return <div className={styles.filters}>
    <button type="button" className={styles.toggle} aria-expanded={open} onClick={() => setOpen(v => !v)}>
      <SlidersHorizontal size={16} /> Buscar e filtrar <ChevronDown size={16} />
    </button>
    <div className={open ? styles.open : styles.closed}>{children}</div>
  </div>
}

import { Aperture } from "lucide-react"
import Link from "next/link"
import styles from "@/components/auth/AuthSurface.module.css"
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <main className={styles.shell}>
    <aside className={styles.story}>
      <Link href="/" className={styles.brand}><Aperture size={32} aria-hidden="true"/>NuFlow.</Link>
      <div><h2>Seu trabalho encontra o ritmo.<strong>Sua criatividade ganha espaço.</strong></h2><p>Do primeiro pedido à entrega. Pessoas, prazos e próximos passos no mesmo flow.</p><div className={styles.flow}><span>Pedido</span><span>Produção</span><span>Aprovação</span><span>Entrega</span></div></div>
      <footer>Menos coisas para guardar na cabeça. Mais espaço para criar.</footer>
    </aside>
    <div className={styles.content}>{children}</div>
  </main>
}

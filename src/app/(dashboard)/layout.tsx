import { Sidebar } from "@/components/layout/Sidebar"
import { SessionProvider } from "@/components/layout/SessionProvider"
import { Toaster } from "sonner"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      {/* Altura ancorada na viewport (h-screen, não min-h-screen): sem isso o
          kanban não consegue limitar a própria altura e a barra de rolagem
          horizontal acaba no fim do conteúdo, fora da tela. O scroll vertical
          vive na coluna de conteúdo, então as telas normais rolam como antes. */}
      <div className="flex h-screen overflow-hidden bg-zinc-950">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-y-auto">
          {children}
        </div>
      </div>
      <Toaster
        position="bottom-right"
        theme="dark"
        richColors
        closeButton
      />
    </SessionProvider>
  )
}

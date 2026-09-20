import { WorkspaceVisual } from "@/components/layout/WorkspaceVisual"
import { Sidebar } from "@/components/layout/Sidebar"
import { SessionProvider } from "@/components/layout/SessionProvider"
import { Toaster } from "sonner"
import { PainelExecutor } from "@/components/foco/PainelExecutor"
import { NavegacaoMovelProvider } from "@/components/layout/NavegacaoMovel"
import { BarraMovel } from "@/components/layout/BarraMovel"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      {/* Altura ancorada na viewport (h-screen, não min-h-screen): sem isso o
          kanban não consegue limitar a própria altura e a barra de rolagem
          horizontal acaba no fim do conteúdo, fora da tela. O scroll vertical
          vive na coluna de conteúdo, então as telas normais rolam como antes. */}
      <NavegacaoMovelProvider>
        <WorkspaceVisual>
          <Sidebar />
          <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-y-auto">
            {/* Só aparece abaixo de md — no desktop a lateral é permanente. */}
            <BarraMovel />
            {children}
          </div>
        </WorkspaceVisual>
      </NavegacaoMovelProvider>
      <PainelExecutor />
      {/* Avisos passaram para o topo: o painel do executor é permanente no canto
          inferior direito, e um toast por cima dele some sem ser lido. */}
      <Toaster
        position="top-right"
        theme="dark"
        richColors
        closeButton
      />
    </SessionProvider>
  )
}

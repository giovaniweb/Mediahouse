import { Sidebar } from "@/components/layout/Sidebar"
import { SessionProvider } from "@/components/layout/SessionProvider"
import { Toaster } from "sonner"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <div className="flex min-h-screen bg-zinc-950">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
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

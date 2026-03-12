import { Sidebar } from "@/components/layout/Sidebar"
import { SessionProvider } from "@/components/layout/SessionProvider"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <div className="flex min-h-screen bg-zinc-50">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          {children}
        </div>
      </div>
    </SessionProvider>
  )
}

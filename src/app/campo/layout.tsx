import { SessionProvider } from "@/components/layout/SessionProvider"

export default function CampoLayout({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>
}

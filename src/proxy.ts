import NextAuth from "next-auth"
import { authConfig } from "@/lib/auth.config"

// Edge-safe: usa apenas authConfig sem bcrypt/prisma
const { auth: middleware } = NextAuth(authConfig)

export default middleware

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/auth).*)"],
}

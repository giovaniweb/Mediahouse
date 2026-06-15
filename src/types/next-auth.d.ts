import "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      name?: string | null
      email?: string | null
      image?: string | null
      tipo: string
      organizacaoId?: string | null
      papel?: string | null
      permissoes?: Record<string, boolean>
    }
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string
    tipo?: string
    organizacaoId?: string | null
    papel?: string | null
  }
}

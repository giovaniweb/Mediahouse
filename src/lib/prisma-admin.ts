// Cliente de ADMINISTRAÇÃO — atravessa o isolamento de propósito.
//
// A tela de Super Admin lista TODAS as empresas: é o painel de quem opera a
// plataforma, não de quem é cliente dela. Sob RLS, `app_user` só enxerga a
// própria empresa, então esse painel precisa de outro caminho.
//
// A escolha é usar uma CONEXÃO diferente, e não uma variável de sessão que
// desligue o filtro. Escapatória em connection string aparece em `vercel env` e
// tem um role por trás; escapatória em variável é uma linha de código longe de
// qualquer consulta acidentalmente ligar. A porta dos fundos existe — que ela
// seja visível.
//
// Todo uso daqui passa antes por `requireSuperAdmin`. Se você está importando
// este arquivo numa rota que não faz essa checagem, está errado.
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

const globalParaAdmin = globalThis as unknown as { prismaAdmin: PrismaClient | undefined }

function criar() {
  // DIRECT_URL é a conexão de dono (5432). Sem ela, cai na normal — que é o
  // estado de hoje, antes da virada.
  const url = process.env.ADMIN_DATABASE_URL || process.env.DIRECT_URL || process.env.DATABASE_URL
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
    log: ["error"],
  })
}

export const prismaAdmin = globalParaAdmin.prismaAdmin ?? criar()
if (process.env.NODE_ENV !== "production") globalParaAdmin.prismaAdmin = prismaAdmin

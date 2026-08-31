// Cliente do caminho de AUTENTICAÇÃO.
//
// Existe por um problema de ordem, não por conveniência: o login precisa ler
// `usuarios` para conferir a senha, e nesse instante ainda não há empresa — ela
// só é conhecida DEPOIS de saber quem é a pessoa. Um cliente com RLS ligada em
// `usuarios` não autenticaria ninguém: a política pede `app.org_id`, que ainda
// não existe, e a consulta volta vazia. O login quebraria para todo mundo, de
// uma vez, sem erro claro — "senha inválida" para quem digitou a senha certa.
//
// Por isso o role `app_auth`, que enxerga exatamente três tabelas:
//   usuarios              SELECT   conferir identidade e senha
//   usuario_organizacao   SELECT   descobrir a empresa DEPOIS de autenticar
//   password_reset_tokens SELECT/INSERT/UPDATE  recuperação de senha
//
// Ele não lê demanda, custo, nem nada de cliente. Se este cliente vazar para
// outro uso por engano, o dano é limitado pelo GRANT, não pela boa intenção.
//
// AUTH_DATABASE_URL ausente = usa a conexão normal. É o estado de hoje, antes da
// virada: sem RLS ligada para o role atual, um cliente só resolve tudo.
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

const globalParaAuth = globalThis as unknown as { prismaAuth: PrismaClient | undefined }

function criar() {
  const url = process.env.AUTH_DATABASE_URL || process.env.DATABASE_URL
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
    log: ["error"],
  })
}

export const prismaAuth = globalParaAuth.prismaAuth ?? criar()
if (process.env.NODE_ENV !== "production") globalParaAuth.prismaAuth = prismaAuth

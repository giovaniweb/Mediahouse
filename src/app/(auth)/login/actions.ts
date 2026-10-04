"use server"

import { signIn } from "@/lib/auth"
import { AuthError } from "next-auth"
import { destinoDoLogin } from "@/lib/destino-login"

export async function loginAction(login: string, password: string, destino?: string) {
  try {
    // O campo "email" no credentials provider aceita email OU telefone
    await signIn("credentials", {
      email: login,
      password,
      // Volta para o link de onde a pessoa veio, se for do próprio NuFlow.
      redirectTo: destinoDoLogin(destino),
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Email/telefone ou senha incorretos." }
    }
    // NEXT_REDIRECT é lançado como erro — re-throw para funcionar
    throw error
  }
}

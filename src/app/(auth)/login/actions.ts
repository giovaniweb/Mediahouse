"use server"

import { signIn } from "@/lib/auth"
import { AuthError } from "next-auth"

export async function loginAction(login: string, password: string) {
  try {
    // O campo "email" no credentials provider aceita email OU telefone
    await signIn("credentials", {
      email: login,
      password,
      redirectTo: "/dashboard",
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Email/telefone ou senha incorretos." }
    }
    // NEXT_REDIRECT é lançado como erro — re-throw para funcionar
    throw error
  }
}

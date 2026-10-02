import { z } from "zod"

const texto = z.string().trim().max(2000).transform(v => v || null).nullable().optional()
export const configEmpresaPatch = z.object({
  cnpj: texto, razaoSocial: texto, nomeFantasia: texto,
  endereco: texto, bairro: texto, cidade: texto, estado: texto, cep: texto,
  email: texto, telefone: texto, pixKey: texto, pixTipo: texto, observacoesNF: texto,
  googleDriveFolderId: z.string().trim().regex(/^[a-zA-Z0-9_-]{10,200}$/).nullable().optional(),
}).strict()

// Allowlist: novos campos no banco nunca passam automaticamente para o cliente.
export const empresaFaturamentoSelect = {
  cnpj: true, razaoSocial: true, nomeFantasia: true,
  endereco: true, bairro: true, cidade: true, estado: true, cep: true,
  email: true, telefone: true, pixKey: true, pixTipo: true, observacoesNF: true,
} as const
export const empresaAdministrativaSelect = {
  ...empresaFaturamentoSelect,
  id: true, googleDriveFolderId: true, googleDriveEmail: true, googleDriveConnectedAt: true,
} as const

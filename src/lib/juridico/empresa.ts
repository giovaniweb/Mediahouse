// Quem vende o NuFlow e onde fala com o titular de dados.
//
// Um lugar só para os dados que os cinco documentos repetem. Enquanto estiverem
// marcados [PREENCHER], as páginas mostram a marca amarela e a faixa de minuta:
// nenhum documento pode ir ao ar como versão final com estes campos em aberto.
// Dados do cadastro na Receita (07/10/2026): empresário individual, ativo.
export const EMPRESA_NUFLOW = {
  razaoSocial: "GIOVANI GOMES DA SILVA, empresário individual",
  cnpj: "54.415.116/0001-10",
  endereco: "Rua Cicero, 72, bairro JK, Sete Lagoas, MG, CEP 35702-194",
  emailContato: "giovani.g@live.com",
  encarregado: "Giovani Gomes da Silva",
  emailEncarregado: "giovani.g@live.com",
  foro: "Sete Lagoas, MG",
} as const

/** true enquanto qualquer campo acima ainda pede preenchimento. */
export const DADOS_EM_ABERTO = Object.values(EMPRESA_NUFLOW).some(v => v.startsWith("[PREENCHER"))

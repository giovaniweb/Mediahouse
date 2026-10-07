// Quem vende o NuFlow e onde fala com o titular de dados.
//
// Um lugar só para os dados que os cinco documentos repetem. Enquanto estiverem
// marcados [PREENCHER], as páginas mostram a marca amarela e a faixa de minuta:
// nenhum documento pode ir ao ar como versão final com estes campos em aberto.
export const EMPRESA_NUFLOW = {
  razaoSocial: "[PREENCHER: razão social de quem vende o NuFlow]",
  cnpj: "[PREENCHER: CNPJ]",
  endereco: "[PREENCHER: endereço completo da sede]",
  emailContato: "[PREENCHER: e-mail de atendimento e cobrança]",
  encarregado: "[PREENCHER: nome do encarregado de dados]",
  emailEncarregado: "[PREENCHER: e-mail do encarregado, ex. privacidade@nuflow.space]",
  foro: "[PREENCHER: cidade e estado da sede, para o foro]",
} as const

/** true enquanto qualquer campo acima ainda pede preenchimento. */
export const DADOS_EM_ABERTO = Object.values(EMPRESA_NUFLOW).some(v => v.startsWith("[PREENCHER"))

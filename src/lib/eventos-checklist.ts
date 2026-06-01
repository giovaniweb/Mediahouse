// Checklist gerado automaticamente conforme o tipo do evento.
// Categorias livres (string) no model EventoGestaoChecklist.

export interface TarefaBase {
  titulo: string
  categoria: string // documentos | fornecedores | logistica | audiovisual | financeiro | producao
}

// Tarefas comuns a qualquer evento
const BASE: TarefaBase[] = [
  { titulo: "Confirmar briefing do evento", categoria: "documentos" },
  { titulo: "Definir responsável interno", categoria: "producao" },
  { titulo: "Aprovar orçamento previsto", categoria: "financeiro" },
  { titulo: "Criar pasta de documentos do evento", categoria: "documentos" },
  { titulo: "Confirmar equipe", categoria: "producao" },
  { titulo: "Fazer relatório pós-evento", categoria: "producao" },
]

// Tarefas específicas por tipo
const POR_TIPO: Record<string, TarefaBase[]> = {
  congresso: [
    { titulo: "Confirmar participação / cota", categoria: "documentos" },
    { titulo: "Enviar contrato assinado", categoria: "documentos" },
    { titulo: "Receber manual do expositor", categoria: "documentos" },
    { titulo: "Definir planta / localização do stand", categoria: "logistica" },
    { titulo: "Aprovar projeto do stand", categoria: "fornecedores" },
    { titulo: "Contratar montadora", categoria: "fornecedores" },
    { titulo: "Contratar audiovisual", categoria: "fornecedores" },
    { titulo: "Produzir materiais gráficos", categoria: "fornecedores" },
    { titulo: "Produzir vídeos para LED", categoria: "audiovisual" },
    { titulo: "Comprar brindes", categoria: "fornecedores" },
    { titulo: "Confirmar hospedagem", categoria: "logistica" },
    { titulo: "Confirmar transporte", categoria: "logistica" },
    { titulo: "Confirmar credenciamento", categoria: "logistica" },
    { titulo: "Confirmar montagem", categoria: "logistica" },
    { titulo: "Confirmar desmontagem", categoria: "logistica" },
    { titulo: "Fazer cobertura audiovisual", categoria: "audiovisual" },
  ],
  feira: [
    { titulo: "Confirmar contrato do espaço", categoria: "documentos" },
    { titulo: "Definir planta do stand", categoria: "logistica" },
    { titulo: "Aprovar projeto do stand", categoria: "fornecedores" },
    { titulo: "Contratar montadora", categoria: "fornecedores" },
    { titulo: "Produzir comunicação visual", categoria: "fornecedores" },
    { titulo: "Produzir vídeos para LED", categoria: "audiovisual" },
    { titulo: "Comprar brindes", categoria: "fornecedores" },
    { titulo: "Confirmar montagem / desmontagem", categoria: "logistica" },
    { titulo: "Fazer cobertura audiovisual", categoria: "audiovisual" },
  ],
  jantar: [
    { titulo: "Confirmar local / contrato do espaço", categoria: "documentos" },
    { titulo: "Definir cardápio", categoria: "fornecedores" },
    { titulo: "Montar lista de convidados", categoria: "logistica" },
    { titulo: "Enviar convites", categoria: "audiovisual" },
    { titulo: "Contratar buffet", categoria: "fornecedores" },
    { titulo: "Contratar decoração", categoria: "fornecedores" },
    { titulo: "Confirmar audiovisual / cobertura", categoria: "audiovisual" },
    { titulo: "Confirmar pagamentos", categoria: "financeiro" },
  ],
  cafe: [
    { titulo: "Confirmar local", categoria: "logistica" },
    { titulo: "Contratar buffet / coffee", categoria: "fornecedores" },
    { titulo: "Montar lista de convidados", categoria: "logistica" },
    { titulo: "Fazer cobertura audiovisual", categoria: "audiovisual" },
  ],
  webinar: [
    { titulo: "Definir roteiro", categoria: "documentos" },
    { titulo: "Confirmar convidados / palestrantes", categoria: "logistica" },
    { titulo: "Configurar link de transmissão", categoria: "logistica" },
    { titulo: "Produzir artes digitais / convite", categoria: "audiovisual" },
    { titulo: "Produzir teaser", categoria: "audiovisual" },
    { titulo: "Gerar relatório de audiência", categoria: "producao" },
  ],
  ativacao: [
    { titulo: "Definir briefing da ação", categoria: "documentos" },
    { titulo: "Confirmar local", categoria: "logistica" },
    { titulo: "Produzir materiais / artes", categoria: "fornecedores" },
    { titulo: "Comprar brindes", categoria: "fornecedores" },
    { titulo: "Organizar logística", categoria: "logistica" },
    { titulo: "Fazer captação / cobertura", categoria: "audiovisual" },
  ],
  unyque_experience: [
    { titulo: "Definir conceito da experiência", categoria: "documentos" },
    { titulo: "Aprovar projeto do espaço", categoria: "fornecedores" },
    { titulo: "Produzir vídeos para LED", categoria: "audiovisual" },
    { titulo: "Confirmar audiovisual / cobertura", categoria: "audiovisual" },
    { titulo: "Produzir aftermovie", categoria: "audiovisual" },
  ],
  treinamento: [
    { titulo: "Definir conteúdo / agenda", categoria: "documentos" },
    { titulo: "Confirmar local / sala", categoria: "logistica" },
    { titulo: "Confirmar instrutores", categoria: "logistica" },
    { titulo: "Captar depoimentos", categoria: "audiovisual" },
    { titulo: "Fazer cobertura audiovisual", categoria: "audiovisual" },
  ],
  lancamento: [
    { titulo: "Definir conceito do lançamento", categoria: "documentos" },
    { titulo: "Produzir teaser", categoria: "audiovisual" },
    { titulo: "Produzir vídeos para LED", categoria: "audiovisual" },
    { titulo: "Confirmar convidados / imprensa", categoria: "logistica" },
    { titulo: "Produzir aftermovie", categoria: "audiovisual" },
    { titulo: "Fazer cobertura audiovisual", categoria: "audiovisual" },
  ],
  evento_interno: [
    { titulo: "Confirmar local interno", categoria: "logistica" },
    { titulo: "Montar lista de participantes", categoria: "logistica" },
    { titulo: "Fazer cobertura audiovisual", categoria: "audiovisual" },
  ],
  evento_medicos: [
    { titulo: "Validar conformidade / contratos com médicos", categoria: "documentos" },
    { titulo: "Confirmar palestrantes", categoria: "logistica" },
    { titulo: "Produzir convites", categoria: "audiovisual" },
    { titulo: "Captar depoimentos", categoria: "audiovisual" },
    { titulo: "Fazer cobertura audiovisual", categoria: "audiovisual" },
  ],
  evento_fornecedores: [
    { titulo: "Confirmar fornecedores participantes", categoria: "fornecedores" },
    { titulo: "Organizar logística", categoria: "logistica" },
    { titulo: "Fazer cobertura audiovisual", categoria: "audiovisual" },
  ],
}

export function checklistParaTipo(tipo: string): TarefaBase[] {
  const especificas = POR_TIPO[tipo] ?? []
  return [...BASE, ...especificas]
}

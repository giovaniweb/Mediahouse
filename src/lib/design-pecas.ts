// Catálogo de peças de DESIGN (artes digitais e impressas).
// Usado no kanban Designer (tipos de arte) e na geração por evento (area=design).

export interface PecaDesign {
  key: string       // guardado em Demanda.tipoVideo (reuso do campo string)
  label: string
  grupo: "digital" | "impresso" | "led" | "convite"
  descricao: string
}

export const PECAS_DESIGN: PecaDesign[] = [
  { key: "post", label: "Post (feed)", grupo: "digital", descricao: "Arte de post para feed (redes sociais)." },
  { key: "story", label: "Story", grupo: "digital", descricao: "Arte de story para redes sociais." },
  { key: "banner_digital", label: "Banner digital", grupo: "digital", descricao: "Banner digital / web." },
  { key: "email_mkt", label: "E-mail marketing", grupo: "digital", descricao: "Arte de e-mail marketing." },
  { key: "criativo_trafego", label: "Criativo de tráfego", grupo: "digital", descricao: "Criativo para anúncios pagos." },
  { key: "arte_led", label: "Arte para LED", grupo: "led", descricao: "Arte estática/looping para painel de LED do evento." },
  { key: "folder", label: "Folder", grupo: "impresso", descricao: "Folder impresso." },
  { key: "catalogo", label: "Catálogo", grupo: "impresso", descricao: "Catálogo de produtos impresso." },
  { key: "credencial", label: "Credencial / Crachá", grupo: "impresso", descricao: "Credencial ou crachá do evento." },
  { key: "placas", label: "Placas / Sinalização", grupo: "impresso", descricao: "Placas e sinalização do evento." },
  { key: "cartao", label: "Cartão", grupo: "impresso", descricao: "Cartão de visita / institucional." },
  { key: "convite_digital", label: "Convite digital", grupo: "convite", descricao: "Convite digital do evento." },
  { key: "convite_impresso", label: "Convite impresso", grupo: "convite", descricao: "Convite impresso do evento." },
]

// Peças de design pré-marcadas por tipo de evento (geração automática)
export const PECAS_DESIGN_DEFAULT_POR_TIPO: Record<string, string[]> = {
  congresso: ["arte_led", "convite_digital", "credencial", "folder", "post"],
  feira: ["arte_led", "banner_digital", "folder", "post"],
  jantar: ["convite_digital", "convite_impresso", "post"],
  cafe: ["convite_digital", "post"],
  webinar: ["post", "banner_digital", "email_mkt"],
  ativacao: ["post", "story", "criativo_trafego"],
  unyque_experience: ["arte_led", "convite_digital", "post"],
  treinamento: ["credencial", "post"],
  lancamento: ["arte_led", "criativo_trafego", "convite_digital", "post"],
  evento_interno: ["credencial", "post"],
  evento_medicos: ["convite_digital", "credencial", "post"],
  evento_fornecedores: ["credencial", "post"],
  outro: ["post"],
}

export function pecasDesignDefaultPara(tipo: string): string[] {
  return PECAS_DESIGN_DEFAULT_POR_TIPO[tipo] ?? PECAS_DESIGN_DEFAULT_POR_TIPO.outro
}

export function getPecaDesign(key: string): PecaDesign | undefined {
  return PECAS_DESIGN.find((p) => p.key === key)
}

// Label de exibição para o tipo de arte (usado no kanban/cards)
export const TIPO_ARTE_LABEL: Record<string, string> = Object.fromEntries(
  PECAS_DESIGN.map((p) => [p.key, p.label])
)

// O departamento que o "Nova demanda" grava (NovaDemandaModal).
//
// O modal pede vídeo ao Audiovisual (area "audiovisual") e gravava todo pedido
// de vídeo como "growth" — o departamento do quadro de arte (area "design").
// O pedido de RH, de institucional ou da social media saía marcado como
// Growth. Vídeo é do Audiovisual, como já grava o pedido que chega por e-mail
// (lib/email-inbox-parser.ts); cobertura segue em "eventos", como o Novo Job
// (lib/gravacao.ts, corpoDoNovoJob).
//
// Sem import de runtime: este módulo vai para o navegador.

export type TipoDoPedido = "video" | "cobertura"

export function departamentoDoPedido(tipo: TipoDoPedido): "audiovisual" | "eventos" {
  return tipo === "cobertura" ? "eventos" : "audiovisual"
}

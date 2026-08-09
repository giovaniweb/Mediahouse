// Execução de efeitos colaterais que não devem segurar a resposta HTTP —
// tipicamente notificações (WhatsApp, alertas, e-mail).
//
// O problema que isto resolve: o código fazia `void notificarAlguem(...)` e logo
// em seguida `return NextResponse.json(...)`. Em serverless (Vercel) a função é
// congelada assim que a resposta sai; a promise pendente não recebe mais CPU e a
// notificação simplesmente não é enviada — sem erro, sem log, sem rastro.
//
// `after()` do Next resolve isso: registra o trabalho para rodar DEPOIS da
// resposta, com a função ainda viva. O projeto já usava esse padrão para upload
// ao Drive; aqui ele é estendido às notificações.
import { after } from "next/server"

/**
 * Agenda um efeito colateral para depois da resposta.
 *
 * Em contexto de request usa `after()`. Fora dele (cron, worker, script) cai
 * para execução imediata — o mesmo helper serve os dois mundos, e por isso
 * `lib/email-inbox.ts` e `lib/ia-tools-executor.ts` podem usá-lo sem saber de
 * onde foram chamados.
 *
 * Nunca lança: uma notificação que falha não pode derrubar a operação principal.
 */
export function emSegundoPlano(tarefa: () => Promise<unknown>, rotulo: string): void {
  const executar = () =>
    Promise.resolve()
      .then(tarefa)
      .catch((e) => console.error(`[notificar] ${rotulo} falhou:`, e))

  try {
    after(executar)
  } catch {
    // Fora de um request scope (cron/worker/script): roda direto.
    void executar()
  }
}

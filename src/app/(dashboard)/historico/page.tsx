import { redirect } from "next/navigation"

// O histórico é por departamento (/historico/audiovisual, /growth, /social).
// Links antigos para /historico continuam valendo; quem não vê o Audiovisual é
// levado ao primeiro departamento que vê, pela própria página.
export default function Historico() {
  redirect("/historico/audiovisual")
}

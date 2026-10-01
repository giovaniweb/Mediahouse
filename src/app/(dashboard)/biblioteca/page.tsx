import Biblioteca from "@/components/biblioteca/Biblioteca"
export default async function BibliotecaPage({searchParams}:{searchParams:Promise<{qualidade?:string;area?:string}>}) {
  const p=await searchParams
  return <Biblioteca areaInicial={p.area === "design" ? "design" : "audiovisual"} qualidadeInicial={p.qualidade === "sem_final" ? "sem_final" : ""} />
}

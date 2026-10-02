import { executarRotinaManual } from "@/lib/rotina-manual"
export const maxDuration = 180
export async function POST() { return executarRotinaManual("monitor") }

import { NextRequest } from "next/server"
import { biblioteca } from "@/lib/biblioteca"
export async function GET(req: NextRequest) { return biblioteca(req, "design") }

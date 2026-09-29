import { NextRequest } from "next/server"
import { biblioteca } from "@/lib/biblioteca"
export async function GET(req: NextRequest) {
  return biblioteca(req, req.nextUrl.searchParams.get("area") === "design" ? "design" : "audiovisual")
}

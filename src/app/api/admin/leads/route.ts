import {NextResponse} from "next/server"
import {auth} from "@/lib/auth"
import {requireSuperAdmin} from "@/lib/org"
import {prismaAdmin} from "@/lib/prisma-admin"
export async function GET(){const guard=await requireSuperAdmin(await auth());if(guard instanceof NextResponse)return guard;const leads=await prismaAdmin.leadComercial.findMany({orderBy:{createdAt:"desc"},take:100});return NextResponse.json({leads})}

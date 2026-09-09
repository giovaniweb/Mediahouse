"use client"

import { useEffect, useRef } from "react"
import markup from "./boreal-markup.json"
import { initializeBoreal } from "./boreal-runtime"

/** Local, reviewed product markup. Never accepts user-generated HTML. */
export default function Boreal({ contactUrl }: { contactUrl: string | null }) {
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const root = host.current?.querySelector<HTMLElement>("#nss")
    if (!root) return
    return initializeBoreal(root, contactUrl)
  }, [contactUrl])
  return <div ref={host} dangerouslySetInnerHTML={{ __html: markup }} />
}

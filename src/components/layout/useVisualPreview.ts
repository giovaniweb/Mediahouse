"use client"

import { useSyncExternalStore, useEffect } from "react"

const KEY = "nuflow:visual-preview"
const EVENT = "nuflow:visual-change"
function subscribe(listener: () => void) {
  window.addEventListener(EVENT, listener)
  window.addEventListener("popstate", listener)
  return () => { window.removeEventListener(EVENT, listener); window.removeEventListener("popstate", listener) }
}
function read() {
  const explicit = new URLSearchParams(window.location.search).get("visual")
  if (explicit === "novo" || explicit === "classico") return explicit
  try { return sessionStorage.getItem(KEY) ?? "" } catch { return "" }
}
const server = () => ""
export function useVisualPreview() {
  const value = useSyncExternalStore(subscribe, read, server)
  useEffect(() => {
    if (value) { try { sessionStorage.setItem(KEY, value) } catch { /* Preferência opcional. */ } }
  }, [value])
  return {
    modern: value === "novo",
    available: value !== "",
    toggle: () => {
      const next = value === "novo" ? "classico" : "novo"
      const url = new URL(window.location.href)
      url.searchParams.set("visual", next)
      window.history.replaceState(window.history.state, "", url)
      try { sessionStorage.setItem(KEY, next) } catch { /* URL ainda funciona. */ }
      window.dispatchEvent(new Event(EVENT))
    },
  }
}

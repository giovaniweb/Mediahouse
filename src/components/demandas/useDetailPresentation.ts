"use client"
import { useSyncExternalStore } from "react"
const key = "nuflow:detail-presentation"
function read(): "drawer" | "modal" { try { return localStorage.getItem(key) === "modal" ? "modal" : "drawer" } catch { return "drawer" } }
function subscribe(cb: () => void) { window.addEventListener(key, cb); window.addEventListener("storage", cb); return () => { window.removeEventListener(key, cb); window.removeEventListener("storage", cb) } }
export function useDetailPresentation() {
 const presentation = useSyncExternalStore(subscribe, read, () => "drawer" as const)
 return { presentation, setPresentation: (value: "drawer" | "modal") => { try { localStorage.setItem(key, value) } catch { /* Preferência opcional */ } window.dispatchEvent(new Event(key)) } }
}

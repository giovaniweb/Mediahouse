"use client"

import { useState, useRef, useEffect, KeyboardEvent } from "react"
import { X, Plus, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

interface TagInputProps {
  value: string[]
  onChange: (tags: string[]) => void
  suggestions?: string[]
  placeholder?: string
  maxTags?: number
  className?: string
  disabled?: boolean
}

export function TagInput({
  value = [],
  onChange,
  suggestions = [],
  placeholder = "Adicionar tag...",
  maxTags,
  className,
  disabled,
}: TagInputProps) {
  const [inputValue, setInputValue] = useState("")
  const [showDropdown, setShowDropdown] = useState(false)
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const filtered = suggestions.filter(
    (s) =>
      s.toLowerCase().includes(inputValue.toLowerCase()) &&
      !value.includes(s)
  )

  const addTag = (tag: string) => {
    const trimmed = tag.trim()
    if (!trimmed) return
    if (value.includes(trimmed)) return
    if (maxTags && value.length >= maxTags) return
    onChange([...value, trimmed])
    setInputValue("")
    setShowDropdown(false)
    inputRef.current?.focus()
  }

  const removeTag = (tag: string) => {
    if (disabled) return
    onChange(value.filter((t) => t !== tag))
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault()
      addTag(inputValue)
    } else if (e.key === "Backspace" && !inputValue && value.length > 0) {
      removeTag(value[value.length - 1])
    } else if (e.key === "Escape") {
      setShowDropdown(false)
    } else if (e.key === "ArrowDown" && showDropdown) {
      e.preventDefault()
      const first = containerRef.current?.querySelector<HTMLButtonElement>("[data-suggestion]")
      first?.focus()
    }
  }

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setShowDropdown(false)
        setFocused(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const showSuggestions = showDropdown && filtered.length > 0

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div
        className={cn(
          "min-h-10 flex flex-wrap gap-1.5 p-2 rounded-md border bg-zinc-900 transition-colors cursor-text",
          focused ? "border-zinc-500 ring-1 ring-zinc-500" : "border-zinc-700",
          disabled && "opacity-60 cursor-not-allowed"
        )}
        onClick={() => {
          if (!disabled) {
            inputRef.current?.focus()
            setShowDropdown(true)
          }
        }}
      >
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-700 text-zinc-200 text-xs font-medium"
          >
            {tag}
            {!disabled && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  removeTag(tag)
                }}
                className="hover:text-white transition-colors ml-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}

        {(!maxTags || value.length < maxTags) && !disabled && (
          <input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value)
              setShowDropdown(true)
            }}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              setFocused(true)
              setShowDropdown(true)
            }}
            placeholder={value.length === 0 ? placeholder : ""}
            className="flex-1 min-w-24 bg-transparent text-sm text-zinc-200 placeholder:text-zinc-500 outline-none"
          />
        )}

        {suggestions.length > 0 && !disabled && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setShowDropdown((v) => !v)
              inputRef.current?.focus()
            }}
            className="ml-auto text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        )}
      </div>

      {showSuggestions && (
        <div className="absolute z-50 top-full mt-1 w-full max-h-48 overflow-y-auto rounded-md border border-zinc-700 bg-zinc-900 shadow-lg py-1">
          {inputValue && !suggestions.includes(inputValue.trim()) && inputValue.trim() && (
            <button
              type="button"
              data-suggestion
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors text-left"
              onClick={() => addTag(inputValue)}
            >
              <Plus className="h-3.5 w-3.5 text-zinc-500" />
              Adicionar "{inputValue.trim()}"
            </button>
          )}
          {filtered.map((s) => (
            <button
              key={s}
              type="button"
              data-suggestion
              className="w-full px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors text-left"
              onClick={() => addTag(s)}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {inputValue && !showSuggestions && !suggestions.find(s => s.toLowerCase() === inputValue.toLowerCase()) && (
        <div className="absolute z-50 top-full mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 shadow-lg py-1">
          <button
            type="button"
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors text-left"
            onClick={() => addTag(inputValue)}
          >
            <Plus className="h-3.5 w-3.5 text-zinc-500" />
            Adicionar "{inputValue.trim()}"
          </button>
        </div>
      )}
    </div>
  )
}

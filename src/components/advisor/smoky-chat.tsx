'use client'

import { useEffect, useRef, useState } from 'react'
import { Mic, MicOff, RotateCcw, Send, Volume2, VolumeX, X } from 'lucide-react'
import { apiRequest } from '@/lib/client/api'
import { Button, IconButton, Spinner } from '@/components/ui/button'
import { ProductCardCompact, type ProductCardData } from '@/components/product/product-card'
import { cn } from '@/lib/utils/cn'

/**
 * Chatfenster des Räucherberaters „Smoky“.
 *
 * Der gesamte Gesprächskontext liegt im Browser und wird bei jeder Anfrage
 * mitgeschickt; der Server hält keine Sitzung vor. Empfohlene Artikel kommen
 * als Datensätze zurück und werden hier als reguläre Produktkarten gerendert —
 * die Antwort des Beraters ist reiner Text und wird als solcher ausgegeben.
 *
 * Sprachein- und -ausgabe nutzen die Browserschnittstellen. Fehlen sie, werden
 * die Knöpfe schlicht nicht angezeigt.
 */

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  products?: ProductCardData[]
}

interface SmokyResponse {
  text: string
  products: ProductCardData[]
  suggestions: string[]
  profile: Record<string, unknown>
  source: 'regelwerk' | 'ki'
}

const GREETING: Message = {
  id: 'greeting',
  role: 'assistant',
  content:
    'Ich bin Smoky und helfe Ihnen, die passende Ausstattung zu finden — Haken, Mehl, Lauge und Gewürze. Sagen Sie mir einfach, was Sie räuchern möchten.',
}

const INITIAL_SUGGESTIONS = [
  'Forellen heiß räuchern',
  'Lachs kalt räuchern',
  'Schinken für den Winter',
  'Ich bin Einsteiger',
]

let messageCounter = 0
function nextId(): string {
  messageCounter += 1
  return `m${messageCounter}`
}

export function SmokyChat({ onClose }: { onClose?: () => void }) {
  const [messages, setMessages] = useState<Message[]>([GREETING])
  const [suggestions, setSuggestions] = useState<string[]>(INITIAL_SUGGESTIONS)
  const [profile, setProfile] = useState<Record<string, unknown>>({})
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [speaking, setSpeaking] = useState(false)
  const [listening, setListening] = useState(false)
  const [speechSupported, setSpeechSupported] = useState(false)
  const [recognitionSupported, setRecognitionSupported] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)

  useEffect(() => {
    setSpeechSupported(typeof window !== 'undefined' && 'speechSynthesis' in window)
    const Recognition =
      typeof window !== 'undefined'
        ? ((window as WindowWithSpeech).SpeechRecognition ??
          (window as WindowWithSpeech).webkitSpeechRecognition)
        : undefined
    setRecognitionSupported(Boolean(Recognition))
  }, [])

  // Nach jeder neuen Nachricht ans Ende scrollen.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, busy])

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel()
      recognitionRef.current?.stop()
    }
  }, [])

  async function send(text: string) {
    const trimmed = text.trim()
    if (trimmed.length === 0 || busy) return

    const userMessage: Message = { id: nextId(), role: 'user', content: trimmed }
    const nextMessages = [...messages, userMessage]
    setMessages(nextMessages)
    setInput('')
    setSuggestions([])
    setBusy(true)
    setError(null)

    const result = await apiRequest<SmokyResponse>('/api/smoky', {
      method: 'POST',
      body: {
        messages: nextMessages
          .filter((m) => m.id !== 'greeting')
          .map((m) => ({ role: m.role, content: m.content })),
        profile,
      },
    })

    setBusy(false)

    if (!result.ok) {
      setError(result.error)
      setSuggestions(INITIAL_SUGGESTIONS)
      return
    }

    setMessages((current) => [
      ...current,
      {
        id: nextId(),
        role: 'assistant',
        content: result.data.text,
        products: result.data.products,
      },
    ])
    setSuggestions(result.data.suggestions)
    setProfile(result.data.profile)
  }

  function reset() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel()
    setSpeaking(false)
    setMessages([GREETING])
    setSuggestions(INITIAL_SUGGESTIONS)
    setProfile({})
    setInput('')
    setError(null)
    inputRef.current?.focus()
  }

  function toggleSpeech() {
    if (!speechSupported) return
    if (speaking) {
      window.speechSynthesis.cancel()
      setSpeaking(false)
      return
    }
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')
    if (!lastAssistant) return

    const utterance = new SpeechSynthesisUtterance(lastAssistant.content)
    utterance.lang = 'de-DE'
    utterance.rate = 1.02
    utterance.onend = () => setSpeaking(false)
    utterance.onerror = () => setSpeaking(false)
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utterance)
    setSpeaking(true)
  }

  function toggleListening() {
    if (!recognitionSupported) return

    if (listening) {
      recognitionRef.current?.stop()
      setListening(false)
      return
    }

    const Recognition =
      (window as WindowWithSpeech).SpeechRecognition ?? (window as WindowWithSpeech).webkitSpeechRecognition
    if (!Recognition) return

    const recognition = new Recognition()
    recognition.lang = 'de-DE'
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? ''
      if (transcript) setInput((current) => (current ? `${current} ${transcript}` : transcript))
    }
    recognition.onend = () => setListening(false)
    recognition.onerror = () => {
      setListening(false)
      setError('Die Spracheingabe hat nicht funktioniert. Bitte tippen Sie Ihre Frage ein.')
    }
    recognitionRef.current = recognition
    recognition.start()
    setListening(true)
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b border-[var(--border-subtle)] px-4 py-3">
        <span
          aria-hidden="true"
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]"
        >
          <SmokeIcon />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-base font-semibold">Smoky</p>
          <p className="text-xs text-ink-muted">Räucherberatung aus unserem Sortiment</p>
        </div>
        <IconButton label="Gespräch zurücksetzen" size="xs" onClick={reset}>
          <RotateCcw className="size-4" aria-hidden="true" />
        </IconButton>
        {speechSupported && (
          <IconButton
            label={speaking ? 'Vorlesen beenden' : 'Antwort vorlesen'}
            size="xs"
            onClick={toggleSpeech}
            className={speaking ? 'text-[var(--accent)]' : undefined}
          >
            {speaking ? <VolumeX className="size-4" aria-hidden="true" /> : <Volume2 className="size-4" aria-hidden="true" />}
          </IconButton>
        )}
        {onClose && (
          <IconButton label="Berater schließen" size="xs" onClick={onClose}>
            <X className="size-4" aria-hidden="true" />
          </IconButton>
        )}
      </header>

      <div
        ref={scrollRef}
        className="scroll-area min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4"
        role="log"
        aria-live="polite"
        aria-label="Gesprächsverlauf"
      >
        {messages.map((message) => (
          <div key={message.id}>
            <div
              className={cn(
                'max-w-[92%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-line',
                message.role === 'user'
                  ? 'ml-auto bg-steel-800 text-steel-50'
                  : 'bg-paper-sunken text-ink-soft',
              )}
            >
              <span className="sr-only">{message.role === 'user' ? 'Sie: ' : 'Smoky: '}</span>
              {message.content}
            </div>

            {message.products && message.products.length > 0 && (
              <ul className="mt-3 space-y-2.5">
                {message.products.map((product) => (
                  <li
                    key={product.slug}
                    className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-2.5"
                  >
                    <ProductCardCompact product={product} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}

        {busy && (
          <div className="flex items-center gap-2 text-sm text-ink-muted">
            <Spinner className="size-4" />
            Smoky sucht passende Artikel …
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-lg bg-danger-50 px-3.5 py-2.5 text-sm text-danger-700">
            {error}
          </p>
        )}
      </div>

      {suggestions.length > 0 && !busy && (
        <div className="shrink-0 border-t border-[var(--border-subtle)] px-4 py-2.5">
          <p className="sr-only">Vorgeschlagene Fragen</p>
          <ul className="flex flex-wrap gap-1.5">
            {suggestions.map((suggestion) => (
              <li key={suggestion}>
                <button
                  type="button"
                  onClick={() => void send(suggestion)}
                  className="rounded-full border border-[var(--border-default)] px-3 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                >
                  {suggestion}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          void send(input)
        }}
        className="flex shrink-0 items-end gap-2 border-t border-[var(--border-subtle)] p-3"
      >
        <label htmlFor="smoky-input" className="sr-only">
          Ihre Frage an Smoky
        </label>
        <textarea
          id="smoky-input"
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send(input)
            }
          }}
          rows={1}
          maxLength={2000}
          placeholder="Was möchten Sie räuchern?"
          className="max-h-28 min-h-11 flex-1 resize-none rounded-md border border-[var(--border-default)] px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
        />
        {recognitionSupported && (
          <IconButton
            label={listening ? 'Spracheingabe beenden' : 'Frage diktieren'}
            size="md"
            variant="outline"
            onClick={toggleListening}
            className={listening ? 'border-[var(--accent)] text-[var(--accent)]' : undefined}
          >
            {listening ? <MicOff className="size-4.5" aria-hidden="true" /> : <Mic className="size-4.5" aria-hidden="true" />}
          </IconButton>
        )}
        <Button type="submit" size="md" disabled={busy || input.trim().length === 0} className="px-4">
          <Send className="size-4.5" aria-hidden="true" />
          <span className="sr-only">Senden</span>
        </Button>
      </form>

      <p className="shrink-0 px-4 pb-3 text-2xs leading-relaxed text-ink-faint">
        Smoky empfiehlt ausschließlich Artikel aus unserem Sortiment. Angaben zu Zeiten und
        Temperaturen sind Erfahrungswerte und ersetzen keine eigene Prüfung.
      </p>
    </div>
  )
}

function SmokeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M6 20c0-3 2-4 2-6.5S6 10 6 7" strokeLinecap="round" />
      <path d="M12 20c0-3.5 2.5-4.5 2.5-7.5S12 8.5 12 5" strokeLinecap="round" />
      <path d="M18 20c0-2.5 1.5-3.5 1.5-5.5S18 11 18 9" strokeLinecap="round" />
    </svg>
  )
}

// --- Typen für die Browserschnittstellen (nicht in lib.dom enthalten) -------

interface SpeechRecognitionLike {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  start: () => void
  stop: () => void
  onresult: ((event: { results: Array<Array<{ transcript: string }>> }) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
}

interface WindowWithSpeech extends Window {
  SpeechRecognition?: new () => SpeechRecognitionLike
  webkitSpeechRecognition?: new () => SpeechRecognitionLike
}

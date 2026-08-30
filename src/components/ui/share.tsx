'use client'

import { useEffect, useState } from 'react'
import { Check, Facebook, Link2, Mail, Share2 } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

/**
 * Teilen-Funktionen.
 *
 * Auf Mobilgeraeten mit Web Share API wird das Systemdialogfeld genutzt —
 * das ist der Weg, den Nutzer dort erwarten. Sonst erscheinen einzelne
 * Ziele als echte Links, die auch ohne JavaScript funktionieren.
 */
export function ShareButtons({
  url,
  title,
  text,
  className,
}: {
  url: string
  title: string
  text?: string
  className?: string
}) {
  const [copied, setCopied] = useState(false)
  const [canNativeShare, setCanNativeShare] = useState(false)

  // Erst nach dem Mounten pruefen, damit Server und Client identisch rendern.
  useEffect(() => {
    setCanNativeShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function')
  }, [])

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Zwischenablage nicht verfuegbar — der Nutzer kann die URL manuell kopieren.
      window.prompt('Link kopieren:', url)
    }
  }

  async function nativeShare() {
    try {
      await navigator.share({ title, text, url })
    } catch {
      // Nutzer hat abgebrochen — kein Fehlerfall.
    }
  }

  const encodedUrl = encodeURIComponent(url)
  const encodedTitle = encodeURIComponent(title)

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <span className="mr-1 text-xs text-ink-faint">Teilen</span>

      {canNativeShare ? (
        <ShareButton label="Teilen" onClick={() => void nativeShare()}>
          <Share2 className="size-4" aria-hidden="true" />
        </ShareButton>
      ) : (
        <>
          <ShareLink
            href={`https://wa.me/?text=${encodedTitle}%20${encodedUrl}`}
            label="Bei WhatsApp teilen"
          >
            <WhatsAppIcon />
          </ShareLink>
          <ShareLink
            href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`}
            label="Bei Facebook teilen"
          >
            <Facebook className="size-4" aria-hidden="true" />
          </ShareLink>
          <ShareLink href={`mailto:?subject=${encodedTitle}&body=${encodedUrl}`} label="Per E-Mail teilen">
            <Mail className="size-4" aria-hidden="true" />
          </ShareLink>
        </>
      )}

      <ShareButton label={copied ? 'Link kopiert' : 'Link kopieren'} onClick={() => void copyLink()}>
        {copied ? (
          <Check className="size-4 text-success-500" aria-hidden="true" />
        ) : (
          <Link2 className="size-4" aria-hidden="true" />
        )}
      </ShareButton>

      <span aria-live="polite" className="sr-only">
        {copied ? 'Link wurde in die Zwischenablage kopiert.' : ''}
      </span>
    </div>
  )
}

function ShareButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex size-9 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-paper-sunken hover:text-ink"
    >
      {children}
    </button>
  )
}

function ShareLink({
  href,
  label,
  children,
}: {
  href: string
  label: string
  children: React.ReactNode
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
      className="flex size-9 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-paper-sunken hover:text-ink"
    >
      {children}
    </a>
  )
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2Zm0 18.02h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.25-8.23a8.23 8.23 0 0 1 8.24 8.24c0 4.54-3.7 8.23-8.24 8.23Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.78.97-.15.16-.29.18-.53.06-.25-.13-1.05-.39-1.99-1.23-.74-.66-1.24-1.47-1.38-1.72-.15-.25-.02-.38.1-.5.11-.11.25-.29.37-.44.13-.15.17-.25.25-.41.09-.17.04-.31-.02-.44-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.42l-.48-.01c-.16 0-.43.06-.66.31-.22.25-.86.85-.86 2.07 0 1.21.89 2.39 1.01 2.55.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.47-.07 1.47-.6 1.68-1.19.2-.58.2-1.08.15-1.18-.06-.11-.23-.17-.48-.29Z" />
    </svg>
  )
}

'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Lesefortschritt eines Artikels als schmaler Balken am oberen Rand.
 *
 * Zwei Entscheidungen sind hier wesentlich:
 *
 *  1. Der Balken ist rein visuell und deshalb `aria-hidden`. Dieselbe
 *     Information liegt bereits im Scrollbalken des Browsers; eine sich
 *     staendig aendernde Live-Region waere fuer Screenreader nur Laerm.
 *
 *  2. Der Fortschritt wird direkt am DOM-Knoten gesetzt, nicht ueber React-
 *     State. Ein Zustandswechsel je Scrollbild wuerde den gesamten Teilbaum
 *     neu rendern — fuer eine Anzeige, die nur eine CSS-Transformation
 *     braucht.
 *
 * Bei `prefers-reduced-motion: reduce` entfaellt die weiche Nachfuehrung: Der
 * Balken folgt dann exakt der Scrollposition, statt eigenstaendig zu gleiten.
 */
export function ReadingProgress({ targetId }: { targetId: string }) {
  const barRef = useRef<HTMLDivElement>(null)
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => setReducedMotion(query.matches)
    apply()
    query.addEventListener('change', apply)
    return () => query.removeEventListener('change', apply)
  }, [])

  useEffect(() => {
    const target = document.getElementById(targetId)
    const bar = barRef.current
    if (!target || !bar) return

    let frame = 0

    const measure = () => {
      frame = 0
      const rect = target.getBoundingClientRect()
      // Nur der Teil des Artikels, der ueberhaupt am Bildschirm vorbeilaeuft.
      const scrollable = rect.height - window.innerHeight
      const ratio = scrollable > 0 ? Math.min(1, Math.max(0, -rect.top / scrollable)) : 0
      bar.style.transform = `scaleX(${ratio})`
    }

    const schedule = () => {
      if (frame === 0) frame = window.requestAnimationFrame(measure)
    }

    measure()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)

    // Bilder und Schriften veraendern die Hoehe nach dem ersten Rendern.
    const observer = new ResizeObserver(schedule)
    observer.observe(target)

    return () => {
      if (frame !== 0) window.cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      observer.disconnect()
    }
  }, [targetId])

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-50 h-[3px] print:hidden">
      <div
        ref={barRef}
        className="h-full origin-left scale-x-0 bg-[var(--accent)]"
        style={reducedMotion ? undefined : { transition: 'transform 120ms linear' }}
      />
    </div>
  )
}

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, MessageSquareOff, Trash2 } from 'lucide-react'
import { apiRequest } from '@/lib/client/api'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'

/**
 * Entscheidung ueber einen eingereichten Rezeptkommentar.
 *
 * Drei Wege, bewusst unterschiedlich schwer erreichbar:
 *
 *  - Freigeben ist der Regelfall und braucht keine Rueckfrage.
 *  - Text entfernen loescht nur den Kommentar; die Sterne bleiben im
 *    Durchschnitt. Das ist der richtige Weg bei Beschimpfungen oder Werbung:
 *    Die Wertung ist deswegen nicht ungueltig.
 *  - Bewertung loeschen nimmt auch die Sterne heraus und korrigiert den
 *    Durchschnitt. Nur fuer offensichtliche Fremdeintraege gedacht, deshalb
 *    mit Bestaetigung und in warnender Farbe.
 *
 * Die Berechtigung wird trotz dieser Oberflaeche in der API geprueft.
 */

type Action = 'approve' | 'remove_comment' | 'delete'

export function RatingModeration({ ratingId, recipeTitle }: { ratingId: string; recipeTitle: string }) {
  const router = useRouter()
  const toast = useToast()
  const [busy, setBusy] = useState<Action | null>(null)
  const [confirming, setConfirming] = useState<Action | null>(null)

  async function run(action: Action) {
    setBusy(action)
    const result = await apiRequest<{ message: string }>(`/api/admin/bewertungen/${ratingId}`, {
      method: 'PATCH',
      body: { action },
    })
    setBusy(null)
    setConfirming(null)

    if (!result.ok) {
      toast.error('Nicht gespeichert', result.error)
      return
    }
    toast.success('Gespeichert', result.data.message)
    router.refresh()
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => run('approve')} loading={busy === 'approve'}>
          <Check className="size-4" aria-hidden="true" />
          Freigeben
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setConfirming('remove_comment')}
          loading={busy === 'remove_comment'}
        >
          <MessageSquareOff className="size-4" aria-hidden="true" />
          Text entfernen
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setConfirming('delete')}
          loading={busy === 'delete'}
        >
          <Trash2 className="size-4" aria-hidden="true" />
          Bewertung löschen
        </Button>
      </div>

      <ConfirmDialog
        open={confirming === 'remove_comment'}
        onClose={() => setConfirming(null)}
        onConfirm={() => run('remove_comment')}
        loading={busy === 'remove_comment'}
        title="Text entfernen?"
        description={`Der Kommentar zu „${recipeTitle}“ wird gelöscht. Die Sternwertung bleibt erhalten und zählt weiter im Durchschnitt des Rezeptes.`}
        confirmLabel="Text entfernen"
      />

      <ConfirmDialog
        open={confirming === 'delete'}
        onClose={() => setConfirming(null)}
        onConfirm={() => run('delete')}
        loading={busy === 'delete'}
        destructive
        title="Bewertung löschen?"
        description={`Bewertung und Kommentar zu „${recipeTitle}“ werden vollständig entfernt. Der Durchschnitt des Rezeptes wird entsprechend korrigiert. Das lässt sich nicht rückgängig machen.`}
        confirmLabel="Endgültig löschen"
      />
    </>
  )
}

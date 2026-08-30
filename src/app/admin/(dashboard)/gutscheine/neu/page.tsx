import type { Metadata } from 'next'
import { requirePermission } from '@/lib/server/auth'
import { AdminPageHeader } from '@/components/admin/page-header'
import { CouponForm, EMPTY_COUPON_FORM_VALUES } from '@/components/admin/coupon-form'

export const metadata: Metadata = { title: 'Gutschein anlegen', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

/**
 * Anlage eines Gutscheins.
 *
 * Der neue Gutschein ist standardmaessig aktiv und je Kunde einmal einloesbar —
 * die im Alltag haeufigste Einstellung. Alles Weitere laesst sich im Formular
 * anpassen; die Vorschau darunter zeigt vor dem Speichern, was der Code bewirkt.
 */
export default async function NewCouponPage() {
  await requirePermission('coupons:write')

  return (
    <div>
      <AdminPageHeader
        title="Gutschein anlegen"
        description="Pflichtangaben sind mit einem Stern gekennzeichnet. Der Code ist eindeutig und wird beim Einlösen erneut geprüft."
        backHref="/admin/gutscheine"
        backLabel="Zurück zur Gutscheinliste"
      />

      <CouponForm mode="create" initialValues={EMPTY_COUPON_FORM_VALUES} />
    </div>
  )
}

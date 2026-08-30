import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requirePermission } from '@/lib/server/auth'
import { verifyCsrf } from '@/lib/server/csrf'
import { writeAuditLog } from '@/lib/server/audit'
import { changeOrderStatus, changePaymentStatus } from '@/lib/server/orders'
import { getClientIp, handleRouteError, jsonError, jsonOk, readJson } from '@/lib/server/http'
import { formatPrice } from '@/lib/money'
import { optionalString, priceFromInput } from '@/lib/validation/common'
import {
  CARRIERS,
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  canTransitionOrderStatus,
  orderStatusSchema,
  type Carrier,
  type OrderStatus,
  type PaymentStatus,
} from '@/lib/domain/enums'

export const dynamic = 'force-dynamic'

/**
 * Statuspflege einer Bestellung.
 *
 * Die fachliche Arbeit (Bestandsrueckbuchung, Gutscheinfreigabe, Kunden-
 * kennzahlen, Historie) liegt vollstaendig in @/lib/server/orders und laeuft
 * dort transaktional. Diese Route prueft Herkunft, Berechtigung und Eingaben,
 * uebergibt an die Fachlogik und protokolliert das Ergebnis.
 *
 * Jede Aktion traegt ihre eigene Berechtigung: Stornierung und Erstattung sind
 * bewusst von der allgemeinen Bearbeitung getrennt.
 */

const noteField = optionalString(500, 'Die interne Notiz')

const carrierField = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => (v ?? '').trim())
  .refine(
    (v) => v.length === 0 || (CARRIERS as readonly string[]).includes(v),
    'Bitte wählen Sie einen gültigen Versanddienstleister.',
  )
  .transform((v) => (v.length === 0 ? null : (v as Carrier)))

const trackingField = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => (v ?? '').trim())
  .refine((v) => v.length <= 60, 'Die Sendungsnummer darf höchstens 60 Zeichen haben.')
  .transform((v) => (v.length === 0 ? null : v))

const statusSchema = z
  .object({
    status: orderStatusSchema,
    note: noteField,
    carrier: carrierField,
    trackingNumber: trackingField,
  })
  .superRefine((value, ctx) => {
    // Ohne Dienstleister und Sendungsnummer ist "Versendet" fuer den Kunden wertlos.
    if (value.status !== 'shipped') return
    if (!value.carrier) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['carrier'],
        message: 'Bitte wählen Sie den Versanddienstleister aus.',
      })
    }
    if (!value.trackingNumber) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['trackingNumber'],
        message: 'Bitte erfassen Sie die Sendungsnummer.',
      })
    }
  })

/** Erstattungen laufen ueber die eigene Aktion, damit sie stets einen Betrag tragen. */
const PAYMENT_TARGETS = ['pending', 'paid', 'failed'] as const

const paymentSchema = z.object({
  paymentStatus: z.enum(PAYMENT_TARGETS, {
    errorMap: () => ({ message: 'Bitte wählen Sie einen gültigen Zahlungsstatus.' }),
  }),
  note: noteField,
})

const refundSchema = z.object({
  amount: priceFromInput('Der Erstattungsbetrag').refine(
    (cents) => cents > 0,
    'Bitte geben Sie einen Erstattungsbetrag größer als 0,00 € an.',
  ),
  restock: z.boolean().optional().default(false),
  note: noteField,
})

const actionSchema = z.object({ action: z.enum(['status', 'payment', 'refund']) })

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const csrf = await verifyCsrf(request)
    if (!csrf.ok) return jsonError(csrf.reason ?? 'Ungültige Anfrage.', 403)

    const body = await readJson(request)
    const action = actionSchema.safeParse(body)
    if (!action.success) return jsonError('Die gewünschte Aktion ist nicht bekannt.', 400)

    const { id } = await context.params
    const ip = await getClientIp()

    switch (action.data.action) {
      case 'status':
        return await handleStatus(id, body, ip)
      case 'payment':
        return await handlePayment(id, body, ip)
      case 'refund':
        return await handleRefund(id, body, ip)
    }
  } catch (error) {
    return handleRouteError(error, 'admin:orders:patch')
  }
}

async function loadOrder(id: string) {
  return prisma.order.findUnique({
    where: { id },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      paymentStatus: true,
      totalCents: true,
      refundedCents: true,
    },
  })
}

/** Antwort mit dem frisch gelesenen Zustand, damit die Oberflaeche nicht raten muss. */
async function currentState(id: string, message: string) {
  const order = await loadOrder(id)
  return jsonOk({
    message,
    status: order?.status ?? null,
    paymentStatus: order?.paymentStatus ?? null,
    refundedCents: order?.refundedCents ?? 0,
  })
}

async function handleStatus(id: string, body: unknown, ip: string) {
  const parsed = statusSchema.safeParse(body)
  if (!parsed.success) return fieldErrorResponse(parsed.error)

  const target = parsed.data.status
  // Stornierung ist ein Eingriff in Bestand und Umsatz — eigene Berechtigung.
  const session = await requirePermission(target === 'cancelled' ? 'orders:cancel' : 'orders:write')

  const order = await loadOrder(id)
  if (!order) return jsonError('Diese Bestellung wurde nicht gefunden.', 404)

  const from = order.status as OrderStatus
  if (from === target) {
    return jsonError('Bitte prüfen Sie Ihre Eingaben.', 409, {
      fieldErrors: { status: `Die Bestellung steht bereits auf „${ORDER_STATUS_LABELS[target]}“.` },
    })
  }
  if (!canTransitionOrderStatus(from, target)) {
    return jsonError('Bitte prüfen Sie Ihre Eingaben.', 409, {
      fieldErrors: {
        status: `Von „${ORDER_STATUS_LABELS[from]}“ ist ein Wechsel zu „${ORDER_STATUS_LABELS[target]}“ nicht vorgesehen.`,
      },
    })
  }

  await changeOrderStatus({
    orderId: order.id,
    toStatus: target,
    userId: session.user.id,
    note: parsed.data.note ?? null,
    carrier: parsed.data.carrier,
    trackingNumber: parsed.data.trackingNumber,
  })

  await writeAuditLog({
    userId: session.user.id,
    action: target === 'cancelled' ? 'order.cancelled' : 'order.status_changed',
    entity: 'Order',
    entityId: order.id,
    detail: {
      orderNumber: order.orderNumber,
      from,
      to: target,
      carrier: parsed.data.carrier,
      trackingNumber: parsed.data.trackingNumber,
      note: parsed.data.note ?? null,
    },
    ip,
  })

  return currentState(
    order.id,
    target === 'cancelled'
      ? `Bestellung ${order.orderNumber} wurde storniert.`
      : `Bearbeitungsstatus auf „${ORDER_STATUS_LABELS[target]}“ gesetzt.`,
  )
}

async function handlePayment(id: string, body: unknown, ip: string) {
  const parsed = paymentSchema.safeParse(body)
  if (!parsed.success) return fieldErrorResponse(parsed.error)

  const session = await requirePermission('orders:write')

  const order = await loadOrder(id)
  if (!order) return jsonError('Diese Bestellung wurde nicht gefunden.', 404)

  const target = parsed.data.paymentStatus as PaymentStatus
  if (order.paymentStatus === target) {
    return jsonError('Bitte prüfen Sie Ihre Eingaben.', 409, {
      fieldErrors: {
        paymentStatus: `Die Zahlung steht bereits auf „${PAYMENT_STATUS_LABELS[target]}“.`,
      },
    })
  }
  if (order.refundedCents > 0) {
    return jsonError('Bitte prüfen Sie Ihre Eingaben.', 409, {
      fieldErrors: {
        paymentStatus:
          'Für diese Bestellung wurde bereits eine Erstattung erfasst. Der Zahlungsstatus ergibt sich daraus und lässt sich hier nicht mehr ändern.',
      },
    })
  }

  await changePaymentStatus({
    orderId: order.id,
    toStatus: target,
    userId: session.user.id,
    note: parsed.data.note ?? null,
  })

  await writeAuditLog({
    userId: session.user.id,
    action: 'order.payment_changed',
    entity: 'Order',
    entityId: order.id,
    detail: {
      orderNumber: order.orderNumber,
      from: order.paymentStatus,
      to: target,
      note: parsed.data.note ?? null,
    },
    ip,
  })

  return currentState(order.id, `Zahlungsstatus auf „${PAYMENT_STATUS_LABELS[target]}“ gesetzt.`)
}

async function handleRefund(id: string, body: unknown, ip: string) {
  const parsed = refundSchema.safeParse(body)
  if (!parsed.success) return fieldErrorResponse(parsed.error)

  const session = await requirePermission('orders:refund')

  const order = await loadOrder(id)
  if (!order) return jsonError('Diese Bestellung wurde nicht gefunden.', 404)

  const refundable = order.totalCents - order.refundedCents
  if (refundable <= 0) {
    return jsonError('Bitte prüfen Sie Ihre Eingaben.', 409, {
      fieldErrors: { amount: 'Diese Bestellung ist bereits vollständig erstattet.' },
    })
  }
  if (parsed.data.amount > refundable) {
    return jsonError('Bitte prüfen Sie Ihre Eingaben.', 409, {
      fieldErrors: {
        amount: `Es sind höchstens ${formatPrice(refundable)} erstattbar.`,
      },
    })
  }

  // Der Zielstatus wird bewusst als Teilerstattung uebergeben: die Fachlogik
  // hebt ihn auf "Erstattet" an, sobald der Gesamtbetrag erreicht ist.
  await changePaymentStatus({
    orderId: order.id,
    toStatus: 'partially_refunded',
    userId: session.user.id,
    refundCents: parsed.data.amount,
    restock: parsed.data.restock,
    note: parsed.data.note ?? null,
  })

  await writeAuditLog({
    userId: session.user.id,
    action: 'order.refunded',
    entity: 'Order',
    entityId: order.id,
    detail: {
      orderNumber: order.orderNumber,
      refundCents: parsed.data.amount,
      restock: parsed.data.restock,
      note: parsed.data.note ?? null,
    },
    ip,
  })

  return currentState(
    order.id,
    `Erstattung über ${formatPrice(parsed.data.amount)} wurde erfasst.`,
  )
}

/** Wandelt Zod-Fehler in feldbezogene Meldungen fuer das Formular. */
function fieldErrorResponse(error: z.ZodError) {
  const fieldErrors: Record<string, string> = {}
  for (const issue of error.issues) {
    const path = issue.path.join('.')
    if (path.length > 0 && !fieldErrors[path]) fieldErrors[path] = issue.message
  }
  return jsonError('Bitte prüfen Sie Ihre Eingaben.', 422, { fieldErrors })
}

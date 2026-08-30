import { Badge, type BadgeTone } from '@/components/ui/badge'
import {
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  PROJECT_STATUS_LABELS,
  SUPPORT_STATUS_LABELS,
  type OrderStatus,
  type PaymentStatus,
  type ProjectStatus,
  type SupportStatus,
} from '@/lib/domain/enums'

/**
 * Status-Kennzeichnungen im Verwaltungsbereich.
 *
 * Farbe ist nie der einzige Träger der Information — jedes Badge zeigt den
 * Status ausgeschrieben. Die Farbe beschleunigt das Scannen, sie ersetzt den
 * Text nicht.
 */

const ORDER_TONES: Record<OrderStatus, BadgeTone> = {
  new: 'accent',
  confirmed: 'info',
  picking: 'info',
  packed: 'info',
  shipped: 'success',
  delivered: 'success',
  cancelled: 'neutral',
}

export function OrderStatusBadge({ status }: { status: string }) {
  const key = status as OrderStatus
  return <Badge tone={ORDER_TONES[key] ?? 'neutral'}>{ORDER_STATUS_LABELS[key] ?? status}</Badge>
}

const PAYMENT_TONES: Record<PaymentStatus, BadgeTone> = {
  pending: 'warning',
  paid: 'success',
  partially_refunded: 'info',
  refunded: 'neutral',
  failed: 'danger',
}

export function PaymentStatusBadge({ status }: { status: string }) {
  const key = status as PaymentStatus
  return <Badge tone={PAYMENT_TONES[key] ?? 'neutral'}>{PAYMENT_STATUS_LABELS[key] ?? status}</Badge>
}

const SUPPORT_TONES: Record<SupportStatus, BadgeTone> = {
  new: 'accent',
  in_progress: 'info',
  waiting: 'warning',
  resolved: 'success',
  closed: 'neutral',
}

export function SupportStatusBadge({ status }: { status: string }) {
  const key = status as SupportStatus
  return <Badge tone={SUPPORT_TONES[key] ?? 'neutral'}>{SUPPORT_STATUS_LABELS[key] ?? status}</Badge>
}

const PROJECT_TONES: Record<ProjectStatus, BadgeTone> = {
  new: 'accent',
  in_review: 'info',
  quoted: 'info',
  accepted: 'success',
  in_production: 'warning',
  delivered: 'success',
  rejected: 'neutral',
}

export function ProjectStatusBadge({ status }: { status: string }) {
  const key = status as ProjectStatus
  return <Badge tone={PROJECT_TONES[key] ?? 'neutral'}>{PROJECT_STATUS_LABELS[key] ?? status}</Badge>
}

/** Bestandsanzeige mit Textbegründung, nicht nur Farbe. */
export function StockBadge({ stock, threshold }: { stock: number; threshold: number }) {
  if (stock <= 0) return <Badge tone="danger">Ausverkauft</Badge>
  if (stock <= threshold) return <Badge tone="warning">Nur noch {stock}</Badge>
  return <Badge tone="success">{stock} auf Lager</Badge>
}

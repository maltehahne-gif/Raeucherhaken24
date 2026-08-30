'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Copy, Eye, EyeOff, Pencil, Trash2, TriangleAlert } from 'lucide-react'
import { apiRequest } from '@/lib/client/api'
import { formatPrice, parsePriceToCents, taxFromGross } from '@/lib/money'
import { slugify } from '@/lib/utils/text'
import { cn } from '@/lib/utils/cn'
import { BASE_UNITS, MATERIAL_LABELS, MATERIALS } from '@/lib/domain/enums'
import { BASE_UNIT_LABELS, SEO_LIMITS, TAX_RATE_OPTIONS } from '@/lib/validation/product'
import { Button, ButtonLink, IconButton } from '@/components/ui/button'
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/dialog'
import { Checkbox, Field, FormError, FormHint, Input, Select, Textarea } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'

/**
 * Produktformular und Zeilenaktionen der Produktliste.
 *
 * Die Schluessel von `ProductFormValues` entsprechen exakt den Feldnamen des
 * Zod-Schemas. Dadurch geht der Formularzustand unveraendert als Anfragekoerper
 * zum Server, und jede serverseitige Feldmeldung findet ohne Umweg ihr Feld —
 * es gibt keine zweite Namensliste, die veralten koennte.
 *
 * Der Server ist die einzige Instanz, die Eingaben verbindlich prueft. Im
 * Browser wird nur formatiert und vorbelegt.
 */

export interface ProductFormValues {
  name: string
  subtitle: string
  shortDescription: string
  description: string
  categoryId: string
  slug: string
  sku: string
  articleNumber: string
  priceCents: string
  salePriceCents: string
  saleStartsAt: string
  saleEndsAt: string
  promotionId: string
  taxRateBp: string
  baseUnit: string
  baseUnitAmount: string
  baseUnitReference: string
  weightGrams: string
  shippingWeightGrams: string
  packagingUnit: string
  lengthMm: string
  deliveryDaysMin: string
  deliveryDaysMax: string
  material: string
  usage: string
  tipFinish: string
  stock: string
  lowStockThreshold: string
  allowBackorder: boolean
  active: boolean
  visible: boolean
  bestseller: boolean
  sortOrder: string
  metaTitle: string
  metaDescription: string
}

/** Vorbelegung fuer ein neues Produkt — die Werte entsprechen den Vorgaben im Datenmodell. */
export const EMPTY_PRODUCT_FORM_VALUES: ProductFormValues = {
  name: '',
  subtitle: '',
  shortDescription: '',
  description: '',
  categoryId: '',
  slug: '',
  sku: '',
  articleNumber: '',
  priceCents: '',
  salePriceCents: '',
  saleStartsAt: '',
  saleEndsAt: '',
  promotionId: '',
  taxRateBp: '1900',
  baseUnit: '',
  baseUnitAmount: '',
  baseUnitReference: '',
  weightGrams: '',
  shippingWeightGrams: '',
  packagingUnit: '1',
  lengthMm: '',
  deliveryDaysMin: '2',
  deliveryDaysMax: '4',
  material: '',
  usage: '',
  tipFinish: '',
  stock: '0',
  lowStockThreshold: '5',
  allowBackorder: false,
  active: true,
  visible: true,
  bestseller: false,
  sortOrder: '0',
  metaTitle: '',
  metaDescription: '',
}

export interface ProductCategoryOption {
  id: string
  name: string
}

export interface ProductFormProps {
  mode: 'create' | 'edit'
  /** Nur im Bearbeitungsmodus gesetzt. */
  productId?: string
  categories: ProductCategoryOption[]
  initialValues: ProductFormValues
  /** Berechtigung `products:delete` des angemeldeten Kontos. */
  canDelete?: boolean
  /** Anzahl der Bestellpositionen — sperrt das Löschen. */
  orderItemCount?: number
  /** Weitere Aktionen dieses Produktes, die dieses Formular nicht pflegt. */
  otherPromotionCount?: number
}

export function ProductForm({
  mode,
  productId,
  categories,
  initialValues,
  canDelete = false,
  orderItemCount = 0,
  otherPromotionCount = 0,
}: ProductFormProps) {
  const router = useRouter()
  const toast = useToast()

  const [values, setValues] = useState<ProductFormValues>(initialValues)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [busyAction, setBusyAction] = useState<'delete' | 'deactivate' | 'duplicate' | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  // Im Bearbeitungsmodus gilt der URL-Pfad als bewusst gesetzt und wird nicht
  // mehr automatisch nachgezogen — bestehende Links duerfen nicht brechen.
  const [slugFollowsName, setSlugFollowsName] = useState(mode === 'create')

  const deletionBlocked = orderItemCount > 0

  function update<K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }))
    setErrors((current) => {
      if (!current[key]) return current
      const next = { ...current }
      delete next[key]
      return next
    })
  }

  function changeName(name: string) {
    setValues((current) => ({
      ...current,
      name,
      slug: slugFollowsName ? slugify(name) : current.slug,
    }))
    setErrors((current) => {
      if (!current.name && !current.slug) return current
      const next = { ...current }
      delete next.name
      if (slugFollowsName) delete next.slug
      return next
    })
  }

  /** Springt zum ersten beanstandeten Feld, damit lange Formulare bedienbar bleiben. */
  function focusFirstError(fieldErrors: Record<string, string>) {
    const first = Object.keys(fieldErrors)[0]
    if (!first) return
    const element = document.querySelector<HTMLElement>(`[name="${first}"]`)
    element?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    element?.focus({ preventScroll: true })
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setFormError(null)
    setErrors({})

    const result = await apiRequest<{
      id: string
      redirectTo: string
      message?: string
      promotionId?: string | null
    }>(mode === 'create' ? '/api/admin/produkte' : `/api/admin/produkte/${productId}`, {
      method: mode === 'create' ? 'POST' : 'PATCH',
      body: values,
    })

    if (!result.ok) {
      setSaving(false)
      setFormError(result.error)
      if (result.fieldErrors) {
        setErrors(result.fieldErrors)
        focusFirstError(result.fieldErrors)
      }
      toast.error('Speichern nicht möglich', result.error)
      return
    }

    if (mode === 'create') {
      toast.success('Produkt angelegt', `„${values.name}“ steht jetzt im Sortiment.`)
      router.push(result.data.redirectTo)
      router.refresh()
      return
    }

    setSaving(false)
    // Wurde soeben eine Aktion angelegt, muss das Formular deren Id kennen —
    // sonst entstuende beim naechsten Speichern eine zweite Aktion.
    setValues((current) => ({ ...current, promotionId: result.data.promotionId ?? '' }))
    toast.success('Änderungen gespeichert', result.data.message)
    router.refresh()
  }

  async function deleteProduct() {
    if (!productId) return
    setBusyAction('delete')
    const result = await apiRequest<{ redirectTo: string; message?: string }>(
      `/api/admin/produkte/${productId}`,
      { method: 'DELETE' },
    )
    if (!result.ok) {
      setBusyAction(null)
      setConfirmDelete(false)
      toast.error('Löschen nicht möglich', result.error)
      return
    }
    toast.success('Produkt gelöscht', result.data.message)
    router.push(result.data.redirectTo)
    router.refresh()
  }

  async function deactivate() {
    if (!productId) return
    setBusyAction('deactivate')
    const result = await apiRequest<{ active: boolean; message?: string }>(
      `/api/admin/produkte/${productId}`,
      { method: 'PATCH', body: { intent: 'visibility', active: false } },
    )
    setBusyAction(null)
    if (!result.ok) {
      toast.error('Deaktivieren nicht möglich', result.error)
      return
    }
    setValues((current) => ({ ...current, active: false }))
    toast.success('Produkt deaktiviert', result.data.message)
    router.refresh()
  }

  async function duplicate() {
    if (!productId) return
    setBusyAction('duplicate')
    const result = await apiRequest<{ redirectTo: string; message?: string }>(
      `/api/admin/produkte/${productId}`,
      { method: 'POST' },
    )
    if (!result.ok) {
      setBusyAction(null)
      toast.error('Duplizieren nicht möglich', result.error)
      return
    }
    toast.success('Kopie angelegt', result.data.message)
    router.push(result.data.redirectTo)
    router.refresh()
  }

  const priceCents = parsePriceToCents(values.priceCents)
  const taxRateBp = Number.parseInt(values.taxRateBp, 10)
  const taxHint =
    priceCents !== null && priceCents >= 0 && Number.isFinite(taxRateBp)
      ? `Bruttopreis ${formatPrice(priceCents)} — davon ${formatPrice(taxFromGross(priceCents, taxRateBp))} Umsatzsteuer.`
      : 'Bruttopreis inklusive Umsatzsteuer, Eingabe mit Komma (Beispiel: 19,90).'

  return (
    <>
      <form onSubmit={submit} noValidate className="space-y-5 pb-24">
        {formError && (
          <FormError>
            {formError}
            {Object.keys(errors).length > 0 && (
              <span className="mt-1 block text-xs">
                Die betroffenen Felder sind unten rot markiert.
              </span>
            )}
          </FormError>
        )}

        {/* 1 — Grunddaten */}
        <FormSection
          title="Grunddaten"
          description="Name, Texte und Einordnung. Diese Angaben erscheinen im Shop und in der Suche."
        >
          <Field label="Produktname" required error={errors.name} className="sm:col-span-2">
            <Input
              name="name"
              value={values.name}
              onChange={(e) => changeName(e.target.value)}
              maxLength={160}
              autoComplete="off"
              placeholder="z. B. Silberbach S 130"
            />
          </Field>

          <Field
            label="Untertitel"
            description="Ein Satz unter dem Namen, der den Nutzen auf den Punkt bringt."
            error={errors.subtitle}
            className="sm:col-span-2"
          >
            <Input
              name="subtitle"
              value={values.subtitle}
              onChange={(e) => update('subtitle', e.target.value)}
              maxLength={200}
              placeholder="Leichter S-Haken aus V2A für Forelle und Makrele"
            />
          </Field>

          <Field
            label="Kurzbeschreibung"
            description="Für Produktkacheln und Suchergebnisse — zwei bis drei Zeilen."
            error={errors.shortDescription}
            hint={`${values.shortDescription.length}/400`}
            className="sm:col-span-2"
          >
            <Textarea
              name="shortDescription"
              rows={3}
              value={values.shortDescription}
              onChange={(e) => update('shortDescription', e.target.value)}
              maxLength={400}
            />
          </Field>

          <Field
            label="Beschreibung"
            required
            description="Der ausführliche Text auf der Produktseite. Mindestens 20 Zeichen."
            error={errors.description}
            hint={`${values.description.length} Zeichen`}
            className="sm:col-span-2"
          >
            <Textarea
              name="description"
              rows={10}
              value={values.description}
              onChange={(e) => update('description', e.target.value)}
              maxLength={20_000}
            />
          </Field>

          <Field label="Kategorie" required error={errors.categoryId}>
            <Select
              name="categoryId"
              value={values.categoryId}
              onChange={(e) => update('categoryId', e.target.value)}
            >
              <option value="">Bitte wählen …</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="URL-Pfad"
            required
            description="Teil der Produktadresse. Nach der Veröffentlichung möglichst nicht mehr ändern."
            error={errors.slug}
            hint={values.slug ? <span className="tabular">/produkt/{values.slug}</span> : undefined}
          >
            <Input
              name="slug"
              value={values.slug}
              onChange={(e) => {
                setSlugFollowsName(false)
                update('slug', e.target.value)
              }}
              maxLength={96}
              autoComplete="off"
              className="tabular"
              placeholder="silberbach-s-130"
            />
          </Field>

          <Field
            label="SKU"
            required
            description="Interne Kennung, eindeutig über das gesamte Sortiment."
            error={errors.sku}
          >
            <Input
              name="sku"
              value={values.sku}
              onChange={(e) => update('sku', e.target.value.toUpperCase())}
              maxLength={48}
              autoComplete="off"
              className="tabular"
              placeholder="HAK-0001-V2A-130"
            />
          </Field>

          <Field
            label="Artikelnummer"
            required
            description="Die Nummer aus Ihrer Warenwirtschaft, ebenfalls eindeutig."
            error={errors.articleNumber}
          >
            <Input
              name="articleNumber"
              value={values.articleNumber}
              onChange={(e) => update('articleNumber', e.target.value.toUpperCase())}
              maxLength={48}
              autoComplete="off"
              className="tabular"
              placeholder="RH-HAK-0001"
            />
          </Field>
        </FormSection>

        {/* 2 — Preis */}
        <FormSection
          title="Preis"
          description="Alle Beträge sind Bruttopreise für Endkunden. Ein Angebotspreis wird als befristete Aktion hinterlegt."
        >
          <Field label="Preis" required error={errors.priceCents}>
            <Input
              name="priceCents"
              value={values.priceCents}
              onChange={(e) => update('priceCents', e.target.value)}
              inputMode="decimal"
              autoComplete="off"
              className="tabular"
              placeholder="19,90"
              trailing={<span aria-hidden="true">€</span>}
            />
          </Field>

          <Field label="Steuersatz" required error={errors.taxRateBp}>
            <Select
              name="taxRateBp"
              value={values.taxRateBp}
              onChange={(e) => update('taxRateBp', e.target.value)}
            >
              {TAX_RATE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          <FormHint className="sm:col-span-2">{taxHint}</FormHint>

          <div className="grid gap-5 sm:col-span-2 sm:grid-cols-3">
            <Field
              label="Angebotspreis"
              description="Leer lassen, wenn kein Angebot läuft."
              error={errors.salePriceCents}
            >
              <Input
                name="salePriceCents"
                value={values.salePriceCents}
                onChange={(e) => update('salePriceCents', e.target.value)}
                inputMode="decimal"
                autoComplete="off"
                className="tabular"
                placeholder="17,90"
                trailing={<span aria-hidden="true">€</span>}
              />
            </Field>

            <Field label="Aktion ab" error={errors.saleStartsAt}>
              <Input
                name="saleStartsAt"
                type="datetime-local"
                value={values.saleStartsAt}
                onChange={(e) => update('saleStartsAt', e.target.value)}
                className="tabular"
              />
            </Field>
            <Field label="Aktion bis" error={errors.saleEndsAt}>
              <Input
                name="saleEndsAt"
                type="datetime-local"
                value={values.saleEndsAt}
                onChange={(e) => update('saleEndsAt', e.target.value)}
                className="tabular"
              />
            </Field>
          </div>

          {otherPromotionCount > 0 && (
            <FormHint className="sm:col-span-2">
              Für dieses Produkt sind {otherPromotionCount} weitere Aktionen hinterlegt. Dieses Formular
              ändert ausschließlich die oben angezeigte Aktion.
            </FormHint>
          )}

          <div className="grid gap-5 sm:col-span-2 sm:grid-cols-3">
            <Field
              label="Grundpreiseinheit"
              description="Nur nötig, wenn eine Grundpreisangabe verpflichtend ist (z. B. Räuchermehl)."
              error={errors.baseUnit}
            >
              <Select
                name="baseUnit"
                value={values.baseUnit}
                onChange={(e) => update('baseUnit', e.target.value)}
              >
                <option value="">Keine Grundpreisangabe</option>
                {BASE_UNITS.map((unit) => (
                  <option key={unit} value={unit}>
                    {BASE_UNIT_LABELS[unit] ?? unit}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Inhalt" description="Menge in der Packung." error={errors.baseUnitAmount}>
              <Input
                name="baseUnitAmount"
                type="number"
                min={1}
                step={1}
                value={values.baseUnitAmount}
                onChange={(e) => update('baseUnitAmount', e.target.value)}
                className="tabular"
                placeholder="500"
              />
            </Field>
            <Field
              label="Referenzmenge"
              description="Bezugsgröße, z. B. 1000 für „je 1 kg“."
              error={errors.baseUnitReference}
            >
              <Input
                name="baseUnitReference"
                type="number"
                min={1}
                step={1}
                value={values.baseUnitReference}
                onChange={(e) => update('baseUnitReference', e.target.value)}
                className="tabular"
                placeholder="1000"
              />
            </Field>
          </div>
        </FormSection>

        {/* 3 — Logistik */}
        <FormSection
          title="Logistik"
          description="Gewichte und Maße bestimmen Versandkosten und Lieferzeitangabe im Shop."
        >
          <Field label="Gewicht (g)" description="Gewicht des Artikels ohne Verpackung." error={errors.weightGrams}>
            <Input
              name="weightGrams"
              type="number"
              min={0}
              step={1}
              value={values.weightGrams}
              onChange={(e) => update('weightGrams', e.target.value)}
              className="tabular"
            />
          </Field>

          <Field
            label="Versandgewicht (g)"
            description="Gewicht inklusive Verpackung."
            error={errors.shippingWeightGrams}
          >
            <Input
              name="shippingWeightGrams"
              type="number"
              min={0}
              step={1}
              value={values.shippingWeightGrams}
              onChange={(e) => update('shippingWeightGrams', e.target.value)}
              className="tabular"
            />
          </Field>

          <Field
            label="Verpackungsmenge"
            required
            description="Stück je Verpackungseinheit. 1, wenn einzeln verkauft wird."
            error={errors.packagingUnit}
          >
            <Input
              name="packagingUnit"
              type="number"
              min={1}
              step={1}
              value={values.packagingUnit}
              onChange={(e) => update('packagingUnit', e.target.value)}
              className="tabular"
            />
          </Field>

          <Field label="Länge (mm)" error={errors.lengthMm}>
            <Input
              name="lengthMm"
              type="number"
              min={0}
              step={1}
              value={values.lengthMm}
              onChange={(e) => update('lengthMm', e.target.value)}
              className="tabular"
            />
          </Field>

          <Field
            label="Lieferzeit ab (Werktage)"
            required
            error={errors.deliveryDaysMin}
          >
            <Input
              name="deliveryDaysMin"
              type="number"
              min={0}
              step={1}
              value={values.deliveryDaysMin}
              onChange={(e) => update('deliveryDaysMin', e.target.value)}
              className="tabular"
            />
          </Field>

          <Field label="Lieferzeit bis (Werktage)" required error={errors.deliveryDaysMax}>
            <Input
              name="deliveryDaysMax"
              type="number"
              min={0}
              step={1}
              value={values.deliveryDaysMax}
              onChange={(e) => update('deliveryDaysMax', e.target.value)}
              className="tabular"
            />
          </Field>
        </FormSection>

        {/* 4 — Eigenschaften */}
        <FormSection
          title="Eigenschaften"
          description="Diese Angaben werden im Shop gefiltert und im Produktvergleich gegenübergestellt."
        >
          <Field label="Werkstoff" error={errors.material}>
            <Select
              name="material"
              value={values.material}
              onChange={(e) => update('material', e.target.value)}
            >
              <option value="">Keine Angabe</option>
              {MATERIALS.map((material) => (
                <option key={material} value={material}>
                  {MATERIAL_LABELS[material] ?? material}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Verwendung" description="Einsatzgebiet, z. B. „Fisch“ oder „Wurst“." error={errors.usage}>
            <Input
              name="usage"
              value={values.usage}
              onChange={(e) => update('usage', e.target.value)}
              maxLength={120}
              placeholder="Fisch"
            />
          </Field>

          <Field
            label="Spitzenausführung"
            description="z. B. „handgeschliffen“ oder „stumpf“."
            error={errors.tipFinish}
            className="sm:col-span-2"
          >
            <Input
              name="tipFinish"
              value={values.tipFinish}
              onChange={(e) => update('tipFinish', e.target.value)}
              maxLength={120}
              placeholder="handgeschliffen"
            />
          </Field>
        </FormSection>

        {/* 5 — Lager */}
        <FormSection
          title="Lager"
          description="Jede Änderung des Bestands wird im Lagerjournal mit Ihrem Konto festgehalten."
        >
          <Field label="Bestand" required error={errors.stock}>
            <Input
              name="stock"
              type="number"
              min={0}
              step={1}
              value={values.stock}
              onChange={(e) => update('stock', e.target.value)}
              className="tabular"
            />
          </Field>

          <Field
            label="Meldegrenze"
            required
            description="Ab diesem Bestand erscheint das Produkt im Dashboard unter „Niedrige Bestände“."
            error={errors.lowStockThreshold}
          >
            <Input
              name="lowStockThreshold"
              type="number"
              min={0}
              step={1}
              value={values.lowStockThreshold}
              onChange={(e) => update('lowStockThreshold', e.target.value)}
              className="tabular"
            />
          </Field>

          <div className="sm:col-span-2">
            <Checkbox
              name="allowBackorder"
              checked={values.allowBackorder}
              onChange={(e) => update('allowBackorder', e.target.checked)}
              label="Lieferung ohne Bestand zulassen"
              description="Für Sonderanfertigungen und Artikel, die auf Zuruf gefertigt werden. Der Bestand darf dann rechnerisch unter null gehen."
              error={errors.allowBackorder}
            />
          </div>
        </FormSection>

        {/* 6 — Sichtbarkeit */}
        <FormSection
          title="Sichtbarkeit"
          description="Ein Produkt erscheint im Shop nur, wenn es aktiv und sichtbar ist."
        >
          <div className="space-y-3 sm:col-span-2">
            <Checkbox
              name="active"
              checked={values.active}
              onChange={(e) => update('active', e.target.checked)}
              label="Aktiv"
              description="Inaktive Produkte sind nicht bestellbar und tauchen weder in Listen noch in der Suche auf."
              error={errors.active}
            />
            <Checkbox
              name="visible"
              checked={values.visible}
              onChange={(e) => update('visible', e.target.checked)}
              label="Im Shop sichtbar"
              description="Ausgeschaltet bleibt das Produkt aus Kategorien und Suche heraus — nützlich für Artikel, die nur über einen direkten Link angeboten werden."
              error={errors.visible}
            />
            <Checkbox
              name="bestseller"
              checked={values.bestseller}
              onChange={(e) => update('bestseller', e.target.checked)}
              label="Als Bestseller kennzeichnen"
              description="Hebt das Produkt auf der Startseite und in Listen hervor."
              error={errors.bestseller}
            />
          </div>

          <Field
            label="Sortierung"
            required
            description="Kleinere Werte stehen in der Kategorie weiter vorn."
            error={errors.sortOrder}
          >
            <Input
              name="sortOrder"
              type="number"
              step={1}
              value={values.sortOrder}
              onChange={(e) => update('sortOrder', e.target.value)}
              className="tabular"
            />
          </Field>
        </FormSection>

        {/* 7 — SEO */}
        <FormSection
          title="Suchmaschinen"
          description="Bleiben die Felder leer, werden Produktname und Kurzbeschreibung verwendet."
        >
          <Field
            label="Meta-Titel"
            error={errors.metaTitle}
            hint={<CharacterCount value={values.metaTitle.length} limits={SEO_LIMITS.metaTitle} />}
            description={`Empfohlen sind bis zu ${SEO_LIMITS.metaTitle.recommended} Zeichen — längere Titel kürzt Google in der Trefferliste.`}
            className="sm:col-span-2"
          >
            <Input
              name="metaTitle"
              value={values.metaTitle}
              onChange={(e) => update('metaTitle', e.target.value)}
              maxLength={SEO_LIMITS.metaTitle.max}
            />
          </Field>

          <Field
            label="Meta-Beschreibung"
            error={errors.metaDescription}
            hint={
              <CharacterCount value={values.metaDescription.length} limits={SEO_LIMITS.metaDescription} />
            }
            description={`Empfohlen sind bis zu ${SEO_LIMITS.metaDescription.recommended} Zeichen. Formulieren Sie den Nutzen, nicht nur die Produktdaten.`}
            className="sm:col-span-2"
          >
            <Textarea
              name="metaDescription"
              rows={3}
              value={values.metaDescription}
              onChange={(e) => update('metaDescription', e.target.value)}
              maxLength={SEO_LIMITS.metaDescription.max}
            />
          </Field>
        </FormSection>

        {/* Gefahrenbereich */}
        {mode === 'edit' && (canDelete || deletionBlocked) && (
          <Card className="border-danger-100">
            <CardHeader>
              <div>
                <CardTitle as="h2">Produkt entfernen</CardTitle>
                <CardDescription>
                  {deletionBlocked
                    ? 'Dieses Produkt wurde bereits bestellt und bleibt deshalb erhalten.'
                    : 'Das Löschen entfernt das Produkt endgültig aus dem Sortiment.'}
                </CardDescription>
              </div>
            </CardHeader>
            <CardBody className="flex flex-wrap items-center gap-3">
              {deletionBlocked ? (
                <>
                  <p className="flex min-w-0 flex-1 items-start gap-2 text-sm leading-relaxed text-ink-soft">
                    <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning-500" aria-hidden="true" />
                    <span>
                      Das Produkt ist in {orderItemCount}{' '}
                      {orderItemCount === 1 ? 'Bestellposition' : 'Bestellpositionen'} enthalten. Bestellungen
                      sind Belege und müssen den Artikel weiterhin ausweisen können. Deaktivieren Sie das
                      Produkt stattdessen — es verschwindet dann aus Shop und Suche, bleibt aber in allen
                      Bestellungen nachvollziehbar.
                    </span>
                  </p>
                  {values.active && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void deactivate()}
                      loading={busyAction === 'deactivate'}
                      disabled={busyAction !== null}
                    >
                      <EyeOff className="size-4" aria-hidden="true" />
                      Produkt deaktivieren
                    </Button>
                  )}
                </>
              ) : (
                <>
                  <p className="min-w-0 flex-1 text-sm leading-relaxed text-ink-soft">
                    Bilder, technische Daten, Varianten und Aktionen dieses Produktes werden mitgelöscht.
                    Dieser Schritt lässt sich nicht rückgängig machen.
                  </p>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => setConfirmDelete(true)}
                    disabled={busyAction !== null}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                    Produkt löschen
                  </Button>
                </>
              )}
            </CardBody>
          </Card>
        )}

        {/* Aktionsleiste — bleibt am unteren Rand erreichbar. */}
        <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-2 border-t border-[var(--border-subtle)] bg-[var(--surface-page)]/95 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <ButtonLink href="/admin/produkte" variant="ghost" size="sm">
            Abbrechen
          </ButtonLink>
          {mode === 'edit' && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void duplicate()}
              loading={busyAction === 'duplicate'}
              disabled={saving || busyAction !== null}
            >
              <Copy className="size-4" aria-hidden="true" />
              Duplizieren
            </Button>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Button type="submit" size="sm" loading={saving} disabled={busyAction !== null}>
              {mode === 'create' ? 'Produkt anlegen' : 'Änderungen speichern'}
            </Button>
          </div>
        </div>
      </form>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={deleteProduct}
        loading={busyAction === 'delete'}
        destructive
        title="Produkt endgültig löschen?"
        description={`„${values.name}“ wird mit allen Bildern, technischen Daten, Varianten, Preisstaffeln und Aktionen entfernt. Vorhandene Warenkörbe verlieren diesen Artikel. Der Vorgang lässt sich nicht rückgängig machen.`}
        confirmLabel="Endgültig löschen"
        cancelLabel="Abbrechen"
      />
    </>
  )
}

function FormSection({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle as="h2">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
      </CardHeader>
      <CardBody className="grid gap-5 sm:grid-cols-2">{children}</CardBody>
    </Card>
  )
}

/** Zeichenzaehler mit Farbwechsel ab der empfohlenen Laenge. */
function CharacterCount({
  value,
  limits,
}: {
  value: number
  limits: { recommended: number; max: number }
}) {
  return (
    <span
      className={cn(
        'tabular',
        value > limits.recommended ? 'font-medium text-warning-700' : 'text-ink-faint',
      )}
    >
      {value}/{limits.recommended} Zeichen
      {value > limits.recommended ? ` (Maximum ${limits.max})` : ''}
    </span>
  )
}

/**
 * Zeilenaktionen der Produktliste.
 *
 * Bearbeiten ist ein echter Link, damit er sich in einem neuen Tab oeffnen
 * laesst. Die schreibenden Aktionen erscheinen nur mit der Berechtigung
 * `products:write` — geprueft wird sie zusaetzlich in der Route.
 */
export function ProductRowActions({
  productId,
  productName,
  active,
  canWrite,
}: {
  productId: string
  productName: string
  active: boolean
  canWrite: boolean
}) {
  const router = useRouter()
  const toast = useToast()
  const [busy, setBusy] = useState<'toggle' | 'duplicate' | null>(null)

  async function toggleActive() {
    setBusy('toggle')
    const result = await apiRequest<{ active: boolean; message?: string }>(
      `/api/admin/produkte/${productId}`,
      { method: 'PATCH', body: { intent: 'visibility', active: !active } },
    )
    setBusy(null)
    if (!result.ok) {
      toast.error(active ? 'Deaktivieren nicht möglich' : 'Aktivieren nicht möglich', result.error)
      return
    }
    toast.success(active ? 'Produkt deaktiviert' : 'Produkt aktiviert', result.data.message)
    router.refresh()
  }

  async function duplicate() {
    setBusy('duplicate')
    const result = await apiRequest<{ redirectTo: string; message?: string }>(
      `/api/admin/produkte/${productId}`,
      { method: 'POST' },
    )
    if (!result.ok) {
      setBusy(null)
      toast.error('Duplizieren nicht möglich', result.error)
      return
    }
    toast.success('Kopie angelegt', result.data.message)
    router.push(result.data.redirectTo)
    router.refresh()
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <ButtonLink
        href={`/admin/produkte/${productId}`}
        variant="ghost"
        size="sm"
        aria-label={`„${productName}“ bearbeiten`}
      >
        <Pencil className="size-4" aria-hidden="true" />
        <span className="hidden xl:inline">Bearbeiten</span>
      </ButtonLink>

      {canWrite && (
        <>
          <IconButton
            label={`„${productName}“ duplizieren`}
            onClick={() => void duplicate()}
            disabled={busy !== null}
          >
            <Copy className="size-4" aria-hidden="true" />
          </IconButton>
          <IconButton
            label={active ? `„${productName}“ deaktivieren` : `„${productName}“ aktivieren`}
            onClick={() => void toggleActive()}
            disabled={busy !== null}
          >
            {active ? (
              <EyeOff className="size-4" aria-hidden="true" />
            ) : (
              <Eye className="size-4" aria-hidden="true" />
            )}
          </IconButton>
        </>
      )}
    </div>
  )
}

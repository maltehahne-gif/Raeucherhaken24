'use client'

import { Fragment, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Eye,
  EyeOff,
  KeyRound,
  LogOut,
  Pencil,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  UserCheck,
  UserX,
} from 'lucide-react'
import { apiRequest } from '@/lib/client/api'
import { cn } from '@/lib/utils/cn'
import { assessPassword, PASSWORD_MIN_LENGTH } from '@/lib/validation/user'
import { Button, ButtonLink, IconButton } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { Checkbox, Field, FormError, FormHint, Input, Select } from '@/components/ui/field'
import { Table, TableWrap, Tbody, Td, Th, Thead, Tr } from '@/components/ui/table'
import { useToast } from '@/components/ui/toast'

/**
 * Oberflaeche der Mitarbeiter- und Rollenverwaltung.
 *
 * Die Schluessel von `UserFormValues` entsprechen exakt den Feldnamen des
 * Zod-Schemas (src/lib/validation/user.ts): Der Formularzustand geht
 * unveraendert als Anfragekoerper zum Server, und jede serverseitige
 * Feldmeldung findet ohne Umweg ihr Feld.
 *
 * Sperren, die sich aus dem eigenen Konto ergeben (keine Selbstdeaktivierung,
 * kein Selbst-Hochstufen), sind hier nur sichtbar gemacht. Durchgesetzt werden
 * sie in der API — eine ausgegraute Schaltflaeche ist kein Schutz.
 */

export interface UserFormValues {
  firstName: string
  lastName: string
  email: string
  roleId: string
  active: boolean
  password: string
  passwordConfirm: string
}

export const EMPTY_USER_FORM_VALUES: UserFormValues = {
  firstName: '',
  lastName: '',
  email: '',
  roleId: '',
  active: true,
  password: '',
  passwordConfirm: '',
}

export interface UserRoleOption {
  id: string
  name: string
  description: string | null
}

export interface UserFormProps {
  mode: 'create' | 'edit'
  /** Nur im Bearbeitungsmodus gesetzt. */
  userId?: string
  initialValues: UserFormValues
  roles: UserRoleOption[]
  /** Das bearbeitete Konto ist das Konto der angemeldeten Person. */
  isSelf?: boolean
  /** Offene Sitzungen dieses Kontos — nur im Bearbeitungsmodus. */
  openSessions?: number
}

export function UserForm({
  mode,
  userId,
  initialValues,
  roles,
  isSelf = false,
  openSessions = 0,
}: UserFormProps) {
  const router = useRouter()
  const toast = useToast()

  const [values, setValues] = useState<UserFormValues>(initialValues)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [busyAction, setBusyAction] = useState<'delete' | 'sessions' | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const selectedRole = roles.find((role) => role.id === values.roleId) ?? null

  function update<K extends keyof UserFormValues>(key: K, value: UserFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }))
    setErrors((current) => {
      if (!current[key]) return current
      const next = { ...current }
      delete next[key]
      return next
    })
  }

  /** Springt zum ersten beanstandeten Feld, damit die Meldung nicht übersehen wird. */
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
    setErrors({})
    setFormError(null)

    const result = await apiRequest<{ id: string; redirectTo?: string; message?: string }>(
      mode === 'create' ? '/api/admin/mitarbeiter' : `/api/admin/mitarbeiter/${userId}`,
      { method: mode === 'create' ? 'POST' : 'PATCH', body: values },
    )

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
      toast.success('Konto angelegt', result.data.message)
      router.push(result.data.redirectTo ?? '/admin/mitarbeiter')
      router.refresh()
      return
    }

    setSaving(false)
    // Ein gesetztes Passwort wird nie zurückgelesen; die Felder werden geleert.
    setValues((current) => ({ ...current, password: '', passwordConfirm: '' }))
    setShowPassword(false)
    toast.success('Änderungen gespeichert', result.data.message)
    router.refresh()
  }

  async function revokeSessions() {
    if (!userId) return
    setBusyAction('sessions')
    const result = await apiRequest<{ revoked: number; message?: string }>(
      `/api/admin/mitarbeiter/${userId}`,
      { method: 'PATCH', body: { intent: 'sessions' } },
    )
    setBusyAction(null)
    if (!result.ok) {
      toast.error('Abmelden nicht möglich', result.error)
      return
    }
    toast.success('Sitzungen beendet', result.data.message)
    router.refresh()
  }

  async function deleteUser() {
    if (!userId) return
    setBusyAction('delete')
    const result = await apiRequest<{ redirectTo: string; message?: string }>(
      `/api/admin/mitarbeiter/${userId}`,
      { method: 'DELETE' },
    )
    if (!result.ok) {
      setBusyAction(null)
      setDeleteOpen(false)
      toast.error('Löschen nicht möglich', result.error)
      return
    }
    toast.success('Konto gelöscht', result.data.message)
    router.push(result.data.redirectTo)
    router.refresh()
  }

  const passwordRequired = mode === 'create'
  const fullName = `${values.firstName} ${values.lastName}`.trim()

  return (
    <>
      <form onSubmit={submit} noValidate className="space-y-5 pb-24">
        {formError && (
          <FormError>
            {formError}
            {Object.keys(errors).length > 0 && (
              <span className="mt-1 block text-xs">Die betroffenen Felder sind unten rot markiert.</span>
            )}
          </FormError>
        )}

        {/* 1 — Person */}
        <FormSection
          title="Person"
          description="Der Name erscheint im Protokoll und an jeder Buchung. Die E-Mail-Adresse ist zugleich die Anmeldekennung."
        >
          <Field label="Vorname" required error={errors.firstName}>
            <Input
              name="firstName"
              value={values.firstName}
              onChange={(e) => update('firstName', e.target.value)}
              maxLength={60}
              autoComplete="given-name"
            />
          </Field>

          <Field label="Nachname" required error={errors.lastName}>
            <Input
              name="lastName"
              value={values.lastName}
              onChange={(e) => update('lastName', e.target.value)}
              maxLength={60}
              autoComplete="family-name"
            />
          </Field>

          <Field
            label="E-Mail-Adresse"
            required
            error={errors.email}
            description="Anmeldekennung. Eine Adresse kann nur einem Konto gehören."
            className="sm:col-span-2"
          >
            <Input
              name="email"
              type="email"
              value={values.email}
              onChange={(e) => update('email', e.target.value)}
              maxLength={160}
              autoComplete="off"
              spellCheck={false}
              inputMode="email"
            />
          </Field>
        </FormSection>

        {/* 2 — Rolle und Zugang */}
        <FormSection
          title="Rolle und Zugang"
          description="Die Rolle bestimmt, welche Bereiche der Verwaltung sichtbar und bedienbar sind."
        >
          <Field
            label="Rolle"
            required
            error={errors.roleId}
            description={
              isSelf
                ? 'Die eigene Rolle lässt sich nicht ändern — das verhindert, dass sich jemand selbst zusätzliche Rechte gibt.'
                : (selectedRole?.description ?? 'Die Rechte je Rolle stehen unter „Rollen und Rechte“.')
            }
          >
            <Select
              name="roleId"
              value={values.roleId}
              onChange={(e) => update('roleId', e.target.value)}
              disabled={isSelf}
            >
              <option value="">Bitte wählen …</option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </Select>
          </Field>

          <div className="flex flex-col justify-center gap-1.5">
            <Checkbox
              name="active"
              checked={values.active}
              onChange={(e) => update('active', e.target.checked)}
              disabled={isSelf}
              error={errors.active}
              label="Konto ist aktiv"
              description={
                isSelf
                  ? 'Ihr eigenes Konto können Sie nicht deaktivieren.'
                  : 'Deaktivierte Konten können sich nicht anmelden; alle offenen Sitzungen werden dabei sofort beendet.'
              }
            />
          </div>
        </FormSection>

        {/* 3 — Passwort */}
        <FormSection
          title={passwordRequired ? 'Passwort' : 'Neues Passwort'}
          description={
            passwordRequired
              ? `Mindestens ${PASSWORD_MIN_LENGTH} Zeichen. Übermitteln Sie das Passwort auf einem anderen Weg als per E-Mail.`
              : 'Leer lassen, um das bisherige Passwort zu behalten. Ein neu gesetztes Passwort gilt sofort.'
          }
        >
          <Field
            label={passwordRequired ? 'Passwort' : 'Neues Passwort'}
            required={passwordRequired}
            error={errors.password}
          >
            <Input
              name="password"
              type={showPassword ? 'text' : 'password'}
              value={values.password}
              onChange={(e) => update('password', e.target.value)}
              maxLength={200}
              autoComplete="new-password"
              spellCheck={false}
              trailing={
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
                  title={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
                  className="flex size-10 items-center justify-center rounded-md text-ink-muted transition-colors hover:text-ink"
                >
                  {showPassword ? (
                    <EyeOff className="size-4" aria-hidden="true" />
                  ) : (
                    <Eye className="size-4" aria-hidden="true" />
                  )}
                </button>
              }
            />
            <PasswordStrength password={values.password} />
          </Field>

          <Field
            label="Passwort wiederholen"
            required={passwordRequired}
            error={errors.passwordConfirm}
          >
            <Input
              name="passwordConfirm"
              type={showPassword ? 'text' : 'password'}
              value={values.passwordConfirm}
              onChange={(e) => update('passwordConfirm', e.target.value)}
              maxLength={200}
              autoComplete="new-password"
              spellCheck={false}
            />
          </Field>

          <div className="sm:col-span-2">
            <FormHint>
              Das Passwort wird als scrypt-Hash gespeichert und lässt sich nicht wieder anzeigen.
              {mode === 'edit' && !isSelf
                ? ' Nach dem Setzen wird das Konto überall abgemeldet und muss sich neu anmelden.'
                : mode === 'edit'
                  ? ' Ihre eigene Sitzung bleibt dabei bestehen.'
                  : ''}
            </FormHint>
          </div>
        </FormSection>

        {/* 4 — Sitzungen und Entfernen */}
        {mode === 'edit' && (
          <Card className={isSelf ? undefined : 'border-danger-100'}>
            <CardHeader>
              <div className="min-w-0">
                <CardTitle as="h2">Zugang beenden</CardTitle>
                <CardDescription>
                  {isSelf
                    ? 'Für das eigene Konto sind diese Schritte gesperrt.'
                    : 'Abmelden beendet nur die offenen Sitzungen. Löschen entfernt das Konto dauerhaft.'}
                </CardDescription>
              </div>
            </CardHeader>
            <CardBody className="space-y-4">
              {isSelf ? (
                <p className="flex items-start gap-2.5 text-sm leading-relaxed text-ink-soft">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-ink-muted" aria-hidden="true" />
                  <span>
                    Sie bearbeiten Ihr eigenes Konto. Deaktivieren, Löschen und der Rollenwechsel sind
                    gesperrt, damit sich niemand selbst aussperrt oder heraufstuft. Eine zweite Person mit
                    der Berechtigung „Mitarbeitende verwalten“ kann diese Schritte für Sie ausführen.
                  </span>
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-4">
                    <p className="min-w-0 flex-1 text-sm leading-relaxed text-ink-soft">
                      {openSessions === 0
                        ? 'Derzeit ist keine Sitzung dieses Kontos offen.'
                        : `Derzeit ${openSessions === 1 ? 'ist eine Sitzung' : `sind ${openSessions} Sitzungen`} offen. Beim Abmelden wird an allen Geräten sofort eine neue Anmeldung verlangt.`}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void revokeSessions()}
                      loading={busyAction === 'sessions'}
                      disabled={busyAction !== null || openSessions === 0}
                    >
                      <LogOut className="size-4" aria-hidden="true" />
                      Überall abmelden
                    </Button>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 border-t border-[var(--border-subtle)] pt-4">
                    <p className="min-w-0 flex-1 text-sm leading-relaxed text-ink-soft">
                      Beim Löschen verlieren die Protokolleinträge dieses Kontos ihre Zuordnung zur Person.
                      Wer die Nachvollziehbarkeit braucht, deaktiviert das Konto stattdessen.
                    </p>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => setDeleteOpen(true)}
                      disabled={busyAction !== null}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                      Konto löschen
                    </Button>
                  </div>
                </>
              )}
            </CardBody>
          </Card>
        )}

        {/* Aktionsleiste — bleibt am unteren Rand erreichbar. */}
        <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-2 border-t border-[var(--border-subtle)] bg-[var(--surface-page)]/95 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <ButtonLink href="/admin/mitarbeiter" variant="ghost" size="sm">
            Abbrechen
          </ButtonLink>
          <div className="ml-auto flex items-center gap-2">
            <Button type="submit" size="sm" loading={saving} disabled={busyAction !== null}>
              {mode === 'create' ? 'Konto anlegen' : 'Änderungen speichern'}
            </Button>
          </div>
        </div>
      </form>

      <Dialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Konto endgültig löschen?"
        size="sm"
        dismissible={busyAction !== 'delete'}
        footer={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteOpen(false)}
              disabled={busyAction !== null}
            >
              Abbrechen
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => void deleteUser()}
              loading={busyAction === 'delete'}
              disabled={busyAction !== null}
            >
              Endgültig löschen
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-ink-soft">
          Das Konto von {fullName.length > 0 ? fullName : values.email} wird vollständig entfernt.
          Offene Sitzungen enden sofort, eine Anmeldung ist danach nicht mehr möglich.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          Bereits erfasste Bestandsbuchungen, Statuswechsel und Protokolleinträge bleiben erhalten,
          verlieren aber den Namen und erscheinen künftig ohne Bearbeiter. Dieser Schritt lässt sich
          nicht rückgängig machen.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          Soll die Zuordnung nachvollziehbar bleiben, deaktivieren Sie das Konto stattdessen: Es kann
          sich nicht mehr anmelden, bleibt in der Übersicht aber sichtbar.
        </p>
      </Dialog>
    </>
  )
}

/**
 * Staerkeanzeige zum eingegebenen Passwort.
 * Bewertet mit derselben Funktion, die der Server zur Annahme verwendet —
 * so kann die Anzeige nicht besser aussehen, als die Pruefung urteilt.
 */
function PasswordStrength({ password }: { password: string }) {
  const assessment = useMemo(() => assessPassword(password), [password])
  if (password.length === 0) return null

  const tone =
    assessment.score >= 3 ? 'success' : assessment.score === 2 ? 'warning' : 'danger'
  const barClass =
    tone === 'success' ? 'bg-success-500' : tone === 'warning' ? 'bg-warning-500' : 'bg-danger-500'
  const textClass =
    tone === 'success' ? 'text-success-700' : tone === 'warning' ? 'text-warning-700' : 'text-danger-700'

  return (
    <div className="mt-1.5">
      <div className="flex items-center gap-2">
        <span
          className="flex h-1.5 flex-1 gap-1"
          role="img"
          aria-label={`Passwortstärke: ${assessment.label}`}
        >
          {[0, 1, 2, 3].map((index) => (
            <span
              key={index}
              className={cn(
                'h-full flex-1 rounded-full',
                index < assessment.score ? barClass : 'bg-paper-muted',
              )}
            />
          ))}
        </span>
        <span className={cn('text-xs font-medium', textClass)}>{assessment.label}</span>
      </div>
      {assessment.hints.length > 0 && (
        <p className="mt-1 text-xs leading-relaxed text-ink-muted">{assessment.hints.join(' ')}</p>
      )}
    </div>
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

/**
 * Zeilenaktionen der Mitarbeiterliste.
 *
 * Bearbeiten ist ein echter Link, damit er sich in einem neuen Tab oeffnen
 * laesst. Der Schnellschalter fehlt beim eigenen Konto — dort waere er nur
 * eine Schaltflaeche, die der Server ohnehin ablehnt.
 */
export function UserRowActions({
  userId,
  name,
  active,
  isSelf,
  canWrite,
}: {
  userId: string
  name: string
  active: boolean
  isSelf: boolean
  canWrite: boolean
}) {
  const router = useRouter()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  async function setActive(next: boolean) {
    setBusy(true)
    const result = await apiRequest<{ active: boolean; message?: string }>(
      `/api/admin/mitarbeiter/${userId}`,
      { method: 'PATCH', body: { intent: 'activation', active: next } },
    )
    setBusy(false)
    setConfirmOpen(false)
    if (!result.ok) {
      toast.error(next ? 'Aktivieren nicht möglich' : 'Deaktivieren nicht möglich', result.error)
      return
    }
    toast.success(next ? 'Konto aktiviert' : 'Konto deaktiviert', result.data.message)
    router.refresh()
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <ButtonLink
        href={`/admin/mitarbeiter/${userId}`}
        variant="ghost"
        size="sm"
        aria-label={`Konto von ${name} bearbeiten`}
      >
        <Pencil className="size-4" aria-hidden="true" />
        <span className="hidden xl:inline">Bearbeiten</span>
      </ButtonLink>

      {canWrite && !isSelf && (
        <IconButton
          label={active ? `Konto von ${name} deaktivieren` : `Konto von ${name} aktivieren`}
          onClick={() => (active ? setConfirmOpen(true) : void setActive(true))}
          disabled={busy}
        >
          {active ? (
            <UserX className="size-4" aria-hidden="true" />
          ) : (
            <UserCheck className="size-4" aria-hidden="true" />
          )}
        </IconButton>
      )}

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Konto deaktivieren?"
        size="sm"
        dismissible={!busy}
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setConfirmOpen(false)} disabled={busy}>
              Abbrechen
            </Button>
            <Button variant="danger" size="sm" onClick={() => void setActive(false)} loading={busy}>
              Konto deaktivieren
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-ink-soft">
          {name} kann sich danach nicht mehr anmelden. Alle offenen Sitzungen dieses Kontos werden
          sofort beendet — auch eine gerade laufende Bearbeitung bricht damit ab.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          Das Konto bleibt mit allen Daten erhalten und kann jederzeit wieder aktiviert werden.
        </p>
      </Dialog>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Rollen und Rechte
// ---------------------------------------------------------------------------

export interface RoleMatrixRole {
  id: string
  key: string
  name: string
  description: string | null
  system: boolean
  userCount: number
  permissions: string[]
  /** Gesperrt: die Rolle „Inhaber“ behält immer alle Rechte. */
  locked: boolean
}

export interface PermissionGroupView {
  group: string
  items: Array<{ key: string; name: string }>
}

interface RoleChange {
  role: RoleMatrixRole
  added: string[]
  removed: string[]
}

/**
 * Rechtematrix: Berechtigungen als Zeilen, Rollen als Spalten.
 *
 * Gespeichert wird je Rolle mit einem eigenen Aufruf — schlaegt eine Rolle
 * fehl (etwa wegen des Aussperrschutzes), bleiben die uebrigen Aenderungen
 * bestehen und nur die betroffene Spalte springt zurueck.
 */
export function RolePermissionMatrix({
  roles,
  groups,
}: {
  roles: RoleMatrixRole[]
  groups: PermissionGroupView[]
}) {
  const router = useRouter()
  const toast = useToast()

  const initial = useMemo(
    () => Object.fromEntries(roles.map((role) => [role.id, role.permissions])) as Record<string, string[]>,
    [roles],
  )
  const [saved, setSaved] = useState<Record<string, string[]>>(initial)
  const [draft, setDraft] = useState<Record<string, string[]>>(initial)
  const [saving, setSaving] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [roleToDelete, setRoleToDelete] = useState<RoleMatrixRole | null>(null)
  const [deleting, setDeleting] = useState(false)

  const permissionNames = useMemo(() => {
    const map = new Map<string, string>()
    for (const group of groups) {
      for (const item of group.items) map.set(item.key, item.name)
    }
    return map
  }, [groups])

  function selectionOf(role: RoleMatrixRole): string[] {
    return draft[role.id] ?? role.permissions
  }

  function toggle(role: RoleMatrixRole, key: string, checked: boolean) {
    setDraft((current) => {
      const list = current[role.id] ?? role.permissions
      const next = checked ? [...new Set([...list, key])] : list.filter((entry) => entry !== key)
      return { ...current, [role.id]: next }
    })
  }

  const changes: RoleChange[] = useMemo(() => {
    const result: RoleChange[] = []
    for (const role of roles) {
      if (role.locked) continue
      const before = new Set(saved[role.id] ?? role.permissions)
      const after = new Set(draft[role.id] ?? role.permissions)
      const added = [...after].filter((key) => !before.has(key))
      const removed = [...before].filter((key) => !after.has(key))
      if (added.length > 0 || removed.length > 0) result.push({ role, added, removed })
    }
    return result
  }, [roles, saved, draft])

  function discard() {
    setDraft(saved)
    setConfirmOpen(false)
  }

  async function save() {
    setSaving(true)
    const accepted: Record<string, string[]> = {}
    const rejected: Array<{ name: string; error: string }> = []

    for (const change of changes) {
      const result = await apiRequest<{ id: string; permissions: string[]; message?: string }>(
        `/api/admin/rollen/${change.role.id}`,
        { method: 'PATCH', body: { permissions: draft[change.role.id] ?? change.role.permissions } },
      )
      if (result.ok) accepted[change.role.id] = result.data.permissions
      else rejected.push({ name: change.role.name, error: result.error })
    }

    const nextSaved = { ...saved, ...accepted }
    setSaved(nextSaved)
    // Abgelehnte Rollen zurücksetzen, damit die Matrix den Serverstand zeigt.
    setDraft((current) => {
      const next = { ...current }
      for (const change of changes) {
        if (!(change.role.id in accepted)) next[change.role.id] = nextSaved[change.role.id] ?? change.role.permissions
      }
      return { ...next, ...accepted }
    })

    setSaving(false)
    setConfirmOpen(false)

    const savedCount = Object.keys(accepted).length
    if (savedCount > 0) {
      toast.success(
        savedCount === 1 ? 'Rechte gespeichert' : `${savedCount} Rollen gespeichert`,
        'Die Änderung gilt für die betroffenen Konten ab der nächsten Aktion.',
      )
    }
    for (const failure of rejected) {
      toast.error(`„${failure.name}“ nicht geändert`, failure.error)
    }
    router.refresh()
  }

  async function deleteRole() {
    if (!roleToDelete) return
    setDeleting(true)
    const result = await apiRequest<{ redirectTo: string; message?: string }>(
      `/api/admin/rollen/${roleToDelete.id}`,
      { method: 'DELETE' },
    )
    setDeleting(false)
    if (!result.ok) {
      toast.error('Löschen nicht möglich', result.error)
      return
    }
    toast.success('Rolle gelöscht', result.data.message)
    setRoleToDelete(null)
    router.refresh()
  }

  const changedRights = changes.reduce((sum, change) => sum + change.added.length + change.removed.length, 0)

  return (
    <>
      <TableWrap>
        <Table className="min-w-[56rem]">
          <caption className="sr-only">
            Berechtigungen je Rolle. Ein gesetztes Häkchen bedeutet: Konten dieser Rolle dürfen die
            Aktion ausführen.
          </caption>
          <Thead>
            <Tr>
              <Th className="sticky left-0 z-10 bg-paper-sunken">Berechtigung</Th>
              {roles.map((role) => (
                <Th key={role.id} align="center" className="min-w-[9rem]">
                  <span className="block text-sm font-semibold text-ink normal-case">{role.name}</span>
                  <span className="mt-0.5 block text-2xs font-normal tracking-normal text-ink-faint normal-case">
                    {role.userCount === 1 ? '1 Konto' : `${role.userCount} Konten`}
                    {role.system ? ' · Systemrolle' : ''}
                  </span>
                  {role.locked && (
                    <span className="mt-1 inline-flex">
                      <Badge tone="accent">Alle Rechte</Badge>
                    </span>
                  )}
                  {!role.system && role.userCount === 0 && (
                    <span className="mt-1 inline-flex">
                      <IconButton
                        label={`Rolle „${role.name}“ löschen`}
                        size="xs"
                        onClick={() => setRoleToDelete(role)}
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                      </IconButton>
                    </span>
                  )}
                </Th>
              ))}
            </Tr>
          </Thead>
          <Tbody>
            {groups.map((group) => (
              <Fragment key={group.group}>
                <Tr className="hover:bg-transparent">
                  <Td
                    colSpan={roles.length + 1}
                    className="bg-paper-sunken/70 text-2xs font-semibold tracking-wider text-ink-muted uppercase"
                  >
                    {group.group}
                  </Td>
                </Tr>
                {group.items.map((item) => (
                  <Tr key={item.key}>
                    <Td className="sticky left-0 z-10 bg-[var(--surface-raised)]">
                      <span className="block text-sm font-medium text-ink">{item.name}</span>
                      <span className="tabular block text-xs text-ink-faint">{item.key}</span>
                    </Td>
                    {roles.map((role) => {
                      const checked = role.locked || selectionOf(role).includes(item.key)
                      return (
                        <Td key={role.id} align="center">
                          <label className="mx-auto flex size-10 cursor-pointer items-center justify-center rounded-md hover:bg-paper-sunken has-[:disabled]:cursor-not-allowed has-[:disabled]:hover:bg-transparent">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={role.locked || saving}
                              onChange={(e) => toggle(role, item.key, e.target.checked)}
                              className="size-[18px] cursor-pointer rounded-xs border border-[var(--border-strong)] accent-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
                            />
                            <span className="sr-only">
                              {item.name} für Rolle {role.name}
                            </span>
                          </label>
                        </Td>
                      )
                    })}
                  </Tr>
                ))}
              </Fragment>
            ))}
          </Tbody>
        </Table>
      </TableWrap>

      <div className="sticky bottom-0 mt-4 -mx-4 flex flex-wrap items-center gap-3 border-t border-[var(--border-subtle)] bg-[var(--surface-page)]/95 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <p className="min-w-0 flex-1 text-sm text-ink-muted" aria-live="polite">
          {changes.length === 0
            ? 'Keine offenen Änderungen.'
            : `${changedRights} ${changedRights === 1 ? 'Änderung' : 'Änderungen'} an ${changes.length} ${changes.length === 1 ? 'Rolle' : 'Rollen'} — noch nicht gespeichert.`}
        </p>
        <Button variant="ghost" size="sm" onClick={discard} disabled={changes.length === 0 || saving}>
          Verwerfen
        </Button>
        <Button size="sm" onClick={() => setConfirmOpen(true)} disabled={changes.length === 0 || saving}>
          <KeyRound className="size-4" aria-hidden="true" />
          Rechte speichern
        </Button>
      </div>

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Rechte ändern?"
        size="md"
        dismissible={!saving}
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setConfirmOpen(false)} disabled={saving}>
              Abbrechen
            </Button>
            <Button size="sm" onClick={() => void save()} loading={saving}>
              Änderungen speichern
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-ink-soft">
          Die Änderung wirkt sofort auf alle Konten der betroffenen Rollen — auch auf gerade
          angemeldete. Entzogene Rechte lassen sich hier jederzeit wieder erteilen.
        </p>
        <ul className="mt-4 space-y-3">
          {changes.map((change) => (
            <li key={change.role.id} className="rounded-lg border border-[var(--border-subtle)] px-4 py-3">
              <p className="text-sm font-semibold text-ink">
                {change.role.name}{' '}
                <span className="font-normal text-ink-muted">
                  ({change.role.userCount === 1 ? '1 Konto' : `${change.role.userCount} Konten`})
                </span>
              </p>
              {change.added.length > 0 && (
                <p className="mt-1 text-xs leading-relaxed text-success-700">
                  Neu erteilt: {change.added.map((key) => permissionNames.get(key) ?? key).join(', ')}
                </p>
              )}
              {change.removed.length > 0 && (
                <p className="mt-1 text-xs leading-relaxed text-danger-700">
                  Entzogen: {change.removed.map((key) => permissionNames.get(key) ?? key).join(', ')}
                </p>
              )}
            </li>
          ))}
        </ul>
      </Dialog>

      <Dialog
        open={roleToDelete !== null}
        onClose={() => setRoleToDelete(null)}
        title="Rolle löschen?"
        size="sm"
        dismissible={!deleting}
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setRoleToDelete(null)} disabled={deleting}>
              Abbrechen
            </Button>
            <Button variant="danger" size="sm" onClick={() => void deleteRole()} loading={deleting}>
              Rolle löschen
            </Button>
          </>
        }
      >
        <p className="flex items-start gap-2.5 text-sm leading-relaxed text-ink-soft">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning-500" aria-hidden="true" />
          <span>
            Die Rolle „{roleToDelete?.name}“ wird dauerhaft entfernt. Ihr ist derzeit kein Konto
            zugeordnet, deshalb verliert niemand seinen Zugang. Dieser Schritt lässt sich nicht
            rückgängig machen.
          </span>
        </p>
      </Dialog>
    </>
  )
}

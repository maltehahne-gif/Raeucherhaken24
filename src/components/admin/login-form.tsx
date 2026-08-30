'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LogIn } from 'lucide-react'
import { Field, Input, FormError } from '@/components/ui/field'
import { Button } from '@/components/ui/button'
import { apiRequest } from '@/lib/client/api'

/**
 * Anmeldeformular.
 *
 * Die Fehlermeldung ist für „Konto unbekannt“ und „falsches Passwort“
 * identisch — sonst ließe sich damit prüfen, welche Adressen existieren.
 */
export function LoginForm() {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return

    setSubmitting(true)
    setError(null)

    const data = new FormData(event.currentTarget)
    const result = await apiRequest<{ redirectTo: string }>('/api/admin/auth', {
      method: 'POST',
      body: {
        email: String(data.get('email') ?? ''),
        password: String(data.get('password') ?? ''),
      },
    })

    if (!result.ok) {
      setSubmitting(false)
      setError(result.error)
      return
    }

    router.push(result.data.redirectTo)
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
      {error && <FormError>{error}</FormError>}

      <Field label="E-Mail-Adresse" required>
        <Input name="email" type="email" autoComplete="username" autoFocus required />
      </Field>

      <Field label="Passwort" required>
        <Input name="password" type="password" autoComplete="current-password" required />
      </Field>

      <Button type="submit" size="lg" fullWidth loading={submitting}>
        <LogIn className="size-4.5" aria-hidden="true" />
        Anmelden
      </Button>
    </form>
  )
}

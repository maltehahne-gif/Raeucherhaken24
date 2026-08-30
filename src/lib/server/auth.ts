import 'server-only'
import { cookies, headers } from 'next/headers'
import { prisma } from '@/lib/db'
import { generateToken, hashIp, sha256, verifyPassword } from '@/lib/server/crypto'
import { AppError } from '@/lib/server/http'
import {
  checkLoginRateLimit,
  pruneLoginAttempts,
  recordLoginAttempt,
  RATE_LIMITS,
} from '@/lib/server/rate-limit'
import type { PermissionKey } from '@/lib/server/permissions'

/**
 * Serverseitige Authentifizierung fuer den Admin-Bereich.
 *
 * Sessions sind opake Zufallstoken. In der Datenbank liegt nur deren SHA-256-
 * Hash, im Browser nur der Token selbst — ein Datenbankleck erlaubt damit keine
 * Session-Uebernahme. Nach erfolgreichem Login wird stets eine neue Session-ID
 * vergeben (Rotation gegen Session Fixation).
 */

export const SESSION_COOKIE = 'rh24_session'
const SESSION_TTL_MS = 8 * 60 * 60 * 1000 // 8 Stunden
const SESSION_REFRESH_THRESHOLD_MS = 30 * 60 * 1000

export interface AuthUser {
  id: string
  email: string
  firstName: string
  lastName: string
  roleKey: string
  roleName: string
  permissions: string[]
}

export interface AuthSession {
  user: AuthUser
  csrfToken: string
  expiresAt: Date
}

function sessionCookieOptions(expires: Date) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires,
  }
}

/** Legt eine neue Session an und setzt das Cookie. */
export async function createSession(userId: string): Promise<{ token: string; csrfToken: string }> {
  const token = generateToken(32)
  const csrfToken = generateToken(32)
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)

  const h = await headers()
  const forwarded = h.get('x-forwarded-for')?.split(',')[0]?.trim()

  await prisma.session.create({
    data: {
      tokenHash: sha256(token),
      userId,
      csrfToken,
      userAgent: h.get('user-agent')?.slice(0, 250) ?? null,
      ipHash: forwarded ? hashIp(forwarded) : null,
      expiresAt,
    },
  })

  const store = await cookies()
  store.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt))
  return { token, csrfToken }
}

/** Liest die aktuelle Session; null, wenn nicht angemeldet oder abgelaufen. */
export async function getSession(): Promise<AuthSession | null> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (!token) return null

  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: {
      user: {
        include: { role: { include: { permissions: { include: { permission: true } } } } },
      },
    },
  })

  if (!session) return null
  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined)
    return null
  }
  if (!session.user.active) {
    await prisma.session.deleteMany({ where: { userId: session.userId } }).catch(() => undefined)
    return null
  }

  // Sliding Expiration: nur schreiben, wenn es sich lohnt.
  if (Date.now() - session.lastSeenAt.getTime() > SESSION_REFRESH_THRESHOLD_MS) {
    await prisma.session
      .update({
        where: { id: session.id },
        data: { lastSeenAt: new Date(), expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
      })
      .catch(() => undefined)
  }

  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      firstName: session.user.firstName,
      lastName: session.user.lastName,
      roleKey: session.user.role.key,
      roleName: session.user.role.name,
      permissions: session.user.role.permissions.map((rp) => rp.permission.key),
    },
    csrfToken: session.csrfToken,
    expiresAt: session.expiresAt,
  }
}

/** Meldet den aktuellen Nutzer ab und loescht die Session serverseitig. */
export async function destroySession(): Promise<void> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: sha256(token) } }).catch(() => undefined)
  }
  store.delete(SESSION_COOKIE)
}

/** Beendet alle Sessions eines Nutzers (z. B. bei Deaktivierung). */
export async function destroyAllSessionsForUser(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } })
}

export interface LoginResult {
  ok: boolean
  error?: string
  retryAfterSeconds?: number
  user?: AuthUser
}

/**
 * Loginpruefung mit Rate-Limiting je IP und je Konto.
 *
 * Die Fehlermeldung ist bewusst identisch fuer "Konto existiert nicht" und
 * "falsches Passwort" (keine Nutzerkonten-Aufzaehlung). Bei unbekanntem Konto
 * wird trotzdem ein Hash verifiziert, damit die Antwortzeit nicht verraet,
 * ob die Adresse existiert.
 */
export async function login(emailRaw: string, password: string, ip: string): Promise<LoginResult> {
  const email = emailRaw.trim().toLowerCase()
  const ipKey = `login:ip:${hashIp(ip)}`
  const userKey = `login:user:${email}`
  const { limit, windowMs } = RATE_LIMITS.login

  const [ipLimit, userLimit] = await Promise.all([
    checkLoginRateLimit(ipKey, limit * 3, windowMs),
    checkLoginRateLimit(userKey, limit, windowMs),
  ])

  if (!ipLimit.allowed || !userLimit.allowed) {
    const retryAfterSeconds = Math.max(ipLimit.retryAfterSeconds, userLimit.retryAfterSeconds)
    return {
      ok: false,
      error: `Zu viele Anmeldeversuche. Bitte versuchen Sie es in ${Math.ceil(retryAfterSeconds / 60)} Minuten erneut.`,
      retryAfterSeconds,
    }
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: { role: { include: { permissions: { include: { permission: true } } } } },
  })

  // Dummy-Hash mit denselben Parametern, um Timing-Unterschiede zu vermeiden.
  const storedHash =
    user?.passwordHash ??
    'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
  const passwordOk = await verifyPassword(password, storedHash)

  if (!user || !passwordOk || !user.active) {
    await Promise.all([recordLoginAttempt(ipKey, false), recordLoginAttempt(userKey, false)])
    return { ok: false, error: 'E-Mail-Adresse oder Passwort ist nicht korrekt.' }
  }

  // Session Fixation: bestehende Sessions dieses Kontos verwerfen und neu vergeben.
  await destroyAllSessionsForUser(user.id)
  await createSession(user.id)

  await Promise.all([
    recordLoginAttempt(ipKey, true),
    recordLoginAttempt(userKey, true),
    prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
    pruneLoginAttempts().catch(() => undefined),
  ])

  return {
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      roleKey: user.role.key,
      roleName: user.role.name,
      permissions: user.role.permissions.map((rp) => rp.permission.key),
    },
  }
}

/** Erzwingt eine angemeldete Session; wirft sonst 401. */
export async function requireSession(): Promise<AuthSession> {
  const session = await getSession()
  if (!session) throw new AppError('Bitte melden Sie sich an.', 401)
  return session
}

/** Erzwingt eine bestimmte Berechtigung; wirft 401 bzw. 403. */
export async function requirePermission(permission: PermissionKey): Promise<AuthSession> {
  const session = await requireSession()
  if (!session.user.permissions.includes(permission)) {
    throw new AppError('Für diese Aktion fehlt Ihnen die Berechtigung.', 403)
  }
  return session
}

/** Entfernt abgelaufene Sessions. */
export async function pruneSessions(): Promise<void> {
  await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } })
}

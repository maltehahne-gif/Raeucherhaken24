import { describe, expect, it } from 'vitest'
import { generateToken, hashIp, hashPassword, safeEqual, sha256, verifyPassword } from '@/lib/server/crypto'
import {
  DEFAULT_ROLES,
  hasAnyPermission,
  hasPermission,
  isPermissionKey,
  PERMISSION_KEYS,
  permissionsByGroup,
} from '@/lib/server/permissions'
import { canTransitionOrderStatus, ORDER_STATUSES, type OrderStatus } from '@/lib/domain/enums'
import { verifyFileContent } from '@/lib/server/uploads'
import { checkRateLimit, resetRateLimits } from '@/lib/server/rate-limit'

/**
 * Sicherheit.
 *
 * Passworthashing, Berechtigungen, Statusübergänge, Dateiprüfung und
 * Ratenbegrenzung. Jeder dieser Bausteine schützt entweder Geld oder Daten.
 */

describe('Passworthashing', () => {
  it('erzeugt für dasselbe Passwort unterschiedliche Hashes', async () => {
    const a = await hashPassword('EinSicheresPasswort1')
    const b = await hashPassword('EinSicheresPasswort1')
    // Unterschiedliches Salz — sonst wäre eine Rainbow Table möglich.
    expect(a).not.toBe(b)
  })

  it('prüft das richtige Passwort erfolgreich', async () => {
    const hash = await hashPassword('EinSicheresPasswort1')
    expect(await verifyPassword('EinSicheresPasswort1', hash)).toBe(true)
  })

  it('weist ein falsches Passwort zurück', async () => {
    const hash = await hashPassword('EinSicheresPasswort1')
    expect(await verifyPassword('EinSicheresPasswort2', hash)).toBe(false)
    expect(await verifyPassword('', hash)).toBe(false)
  })

  it('speichert das Passwort nicht im Klartext', async () => {
    const hash = await hashPassword('EinSicheresPasswort1')
    expect(hash).not.toContain('EinSicheresPasswort1')
    expect(hash.startsWith('scrypt$')).toBe(true)
  })

  it('lehnt zu kurze Passwörter ab', async () => {
    await expect(hashPassword('kurz')).rejects.toThrow()
  })

  it('stürzt bei einem beschädigten Hash nicht ab', async () => {
    expect(await verifyPassword('irgendwas', 'kaputt')).toBe(false)
    expect(await verifyPassword('irgendwas', '')).toBe(false)
    expect(await verifyPassword('irgendwas', 'scrypt$1$2$3$4$5')).toBe(false)
  })

  it('behandelt unterschiedlich kodierte, gleiche Zeichen als gleich', async () => {
    // "ä" kann als ein Zeichen oder als a + Kombinationszeichen ankommen.
    const composed = 'Rauchergerät2024'.normalize('NFC')
    const decomposed = 'Rauchergerät2024'.normalize('NFD')
    const hash = await hashPassword(composed)
    expect(await verifyPassword(decomposed, hash)).toBe(true)
  })
})

describe('Token und Hashes', () => {
  it('erzeugt eindeutige, URL-taugliche Token', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => generateToken(32)))
    expect(tokens.size).toBe(200)
    for (const token of tokens) expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('hasht IP-Adressen und gibt sie nicht im Klartext preis', () => {
    const hashed = hashIp('203.0.113.42')
    expect(hashed).not.toContain('203.0.113.42')
    expect(hashed).toHaveLength(32)
    expect(hashIp('203.0.113.42')).toBe(hashed)
    expect(hashIp('203.0.113.43')).not.toBe(hashed)
  })

  it('liefert für sha256 stabile Werte', () => {
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('vergleicht Zeichenketten sicher', () => {
    expect(safeEqual('geheim', 'geheim')).toBe(true)
    expect(safeEqual('geheim', 'geheiM')).toBe(false)
    expect(safeEqual('geheim', 'kurz')).toBe(false)
    expect(safeEqual('', '')).toBe(true)
  })
})

describe('Berechtigungen', () => {
  it('kennt alle Rollen mit gültigen Berechtigungen', () => {
    for (const role of DEFAULT_ROLES) {
      for (const permission of role.permissions) {
        expect(isPermissionKey(permission)).toBe(true)
      }
    }
  })

  it('gibt dem Inhaber alle Rechte', () => {
    const owner = DEFAULT_ROLES.find((r) => r.key === 'owner')
    expect(owner?.permissions).toHaveLength(PERMISSION_KEYS.length)
  })

  it('nimmt der Administration die Rechteverwaltung', () => {
    const admin = DEFAULT_ROLES.find((r) => r.key === 'admin')
    expect(admin?.permissions).not.toContain('roles:write')
  })

  it('gibt Lager und Versand keine Rechteverwaltung und keine Erstattungen', () => {
    const staff = DEFAULT_ROLES.find((r) => r.key === 'staff')
    expect(staff?.permissions).not.toContain('users:write')
    expect(staff?.permissions).not.toContain('orders:refund')
    expect(staff?.permissions).not.toContain('settings:write')
  })

  it('gibt dem Kundenservice keinen Schreibzugriff auf Produkte', () => {
    const support = DEFAULT_ROLES.find((r) => r.key === 'support')
    expect(support?.permissions).toContain('support:write')
    expect(support?.permissions).not.toContain('products:write')
    expect(support?.permissions).not.toContain('inventory:write')
  })

  it('prüft einzelne Berechtigungen', () => {
    expect(hasPermission(['orders:read'], 'orders:read')).toBe(true)
    expect(hasPermission(['orders:read'], 'orders:write')).toBe(false)
    expect(hasPermission([], 'orders:read')).toBe(false)
  })

  it('prüft Berechtigungsgruppen', () => {
    expect(hasAnyPermission(['orders:read'], ['orders:write', 'orders:read'])).toBe(true)
    expect(hasAnyPermission(['orders:read'], ['users:write'])).toBe(false)
  })

  it('gruppiert alle Berechtigungen vollständig', () => {
    const groups = permissionsByGroup()
    const total = groups.reduce((sum, group) => sum + group.items.length, 0)
    expect(total).toBe(PERMISSION_KEYS.length)
  })
})

describe('Bestellstatus-Übergänge', () => {
  it('lässt den üblichen Weg zu', () => {
    expect(canTransitionOrderStatus('new', 'confirmed')).toBe(true)
    expect(canTransitionOrderStatus('confirmed', 'picking')).toBe(true)
    expect(canTransitionOrderStatus('picking', 'packed')).toBe(true)
    expect(canTransitionOrderStatus('packed', 'shipped')).toBe(true)
    expect(canTransitionOrderStatus('shipped', 'delivered')).toBe(true)
  })

  it('verhindert Sprünge nach hinten', () => {
    expect(canTransitionOrderStatus('shipped', 'new')).toBe(false)
    expect(canTransitionOrderStatus('delivered', 'picking')).toBe(false)
  })

  it('verhindert das Überspringen des Versands', () => {
    expect(canTransitionOrderStatus('new', 'shipped')).toBe(false)
    expect(canTransitionOrderStatus('picking', 'delivered')).toBe(false)
  })

  it('erlaubt Stornierung nur, solange nichts versendet wurde', () => {
    expect(canTransitionOrderStatus('new', 'cancelled')).toBe(true)
    expect(canTransitionOrderStatus('packed', 'cancelled')).toBe(true)
    expect(canTransitionOrderStatus('shipped', 'cancelled')).toBe(false)
    expect(canTransitionOrderStatus('delivered', 'cancelled')).toBe(false)
  })

  it('lässt aus Endzuständen keinen Wechsel mehr zu', () => {
    for (const target of ORDER_STATUSES) {
      expect(canTransitionOrderStatus('cancelled', target as OrderStatus)).toBe(false)
    }
  })
})

describe('Dateiprüfung', () => {
  function bytes(...values: number[]): Uint8Array {
    const data = new Uint8Array(64)
    data.set(values, 0)
    return data
  }

  const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
  const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0)
  const PDF = bytes(0x25, 0x50, 0x44, 0x46, 0x2d)

  it('erkennt erlaubte Formate am Inhalt', () => {
    expect(verifyFileContent(PNG, 'skizze.png').mime).toBe('image/png')
    expect(verifyFileContent(JPEG, 'foto.jpg').mime).toBe('image/jpeg')
    expect(verifyFileContent(JPEG, 'foto.jpeg').mime).toBe('image/jpeg')
    expect(verifyFileContent(PDF, 'zeichnung.pdf').mime).toBe('application/pdf')
  })

  it('weist eine Datei ab, deren Endung nicht zum Inhalt passt', () => {
    // Der klassische Angriff: ausführbarer Inhalt mit harmloser Endung.
    expect(() => verifyFileContent(PNG, 'skizze.pdf')).toThrow()
  })

  it('weist unbekannte Formate ab', () => {
    const executable = bytes(0x4d, 0x5a, 0x90, 0x00)
    expect(() => verifyFileContent(executable, 'programm.png')).toThrow()
  })

  it('weist als Bild getarntes HTML ab', () => {
    const html = new TextEncoder().encode('<html><script>alert(1)</script></html>')
    expect(() => verifyFileContent(html, 'bild.png')).toThrow()
  })

  it('weist leere Dateien ab', () => {
    expect(() => verifyFileContent(new Uint8Array(2), 'leer.png')).toThrow()
  })
})

describe('Ratenbegrenzung', () => {
  it('lässt bis zur Grenze durch und sperrt danach', () => {
    resetRateLimits()
    const key = 'test:limit'
    for (let i = 0; i < 3; i += 1) {
      expect(checkRateLimit(key, 3, 60_000).allowed).toBe(true)
    }
    const blocked = checkRateLimit(key, 3, 60_000)
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0)
  })

  it('zählt je Schlüssel getrennt', () => {
    resetRateLimits()
    checkRateLimit('nutzer:a', 1, 60_000)
    expect(checkRateLimit('nutzer:a', 1, 60_000).allowed).toBe(false)
    expect(checkRateLimit('nutzer:b', 1, 60_000).allowed).toBe(true)
  })

  it('meldet die verbleibenden Versuche', () => {
    resetRateLimits()
    expect(checkRateLimit('test:rest', 5, 60_000).remaining).toBe(4)
    expect(checkRateLimit('test:rest', 5, 60_000).remaining).toBe(3)
  })
})

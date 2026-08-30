import {
  createHash,
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
  type ScryptOptions,
} from 'node:crypto'

/**
 * promisify() waehlt bei scrypt die Ueberladung ohne Options-Objekt.
 * Deshalb ein eigener, korrekt typisierter Wrapper.
 */
function scrypt(
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, options, (err, derivedKey) => {
      if (err) reject(err)
      else resolve(derivedKey)
    })
  })
}

/**
 * Passwort-Hashing mit scrypt aus der Node-Standardbibliothek.
 *
 * Bewusst ohne native Zusatzabhaengigkeit: scrypt ist ein speicherharter KDF,
 * in Node fest eingebaut und damit ohne Build-Toolchain ueberall lauffaehig.
 * Format: scrypt$N$r$p$<salt-base64>$<hash-base64>
 */
const SCRYPT_N = 16_384
const SCRYPT_R = 8
const SCRYPT_P = 1
const KEY_LENGTH = 64
const SALT_LENGTH = 16
// scrypt braucht ca. 128 * N * r Bytes; der Default-Puffer von Node ist zu klein.
const MAX_MEMORY = 128 * SCRYPT_N * SCRYPT_R * 2

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12) {
    throw new Error('Passwort muss mindestens 12 Zeichen lang sein')
  }
  const salt = randomBytes(SALT_LENGTH)
  const derived = await scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: MAX_MEMORY,
  })
  return [
    'scrypt',
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString('base64'),
    derived.toString('base64'),
  ].join('$')
}

/**
 * Prueft ein Passwort gegen einen gespeicherten Hash.
 * Der Vergleich erfolgt in konstanter Zeit.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const [, nRaw, rRaw, pRaw, saltB64, hashB64] = parts
  const N = Number.parseInt(nRaw, 10)
  const r = Number.parseInt(rRaw, 10)
  const p = Number.parseInt(pRaw, 10)
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false

  let expected: Buffer
  try {
    expected = Buffer.from(hashB64, 'base64')
  } catch {
    return false
  }
  if (expected.length === 0) return false

  try {
    const derived = await scrypt(
      password.normalize('NFKC'),
      Buffer.from(saltB64, 'base64'),
      expected.length,
      { N, r, p, maxmem: Math.max(MAX_MEMORY, 128 * N * r * 2) },
    )
    return timingSafeEqual(derived, expected)
  } catch {
    return false
  }
}

/** Kryptografisch sicherer, URL-tauglicher Zufallstoken. */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

/** SHA-256 als Hex. Fuer Session-Token, IP-Pseudonymisierung, Datei-Checksummen. */
export function sha256(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex')
}

/**
 * Pseudonymisiert eine IP-Adresse fuer Rate-Limiting und Logs.
 * Ohne Pepper waere der Hash trivial rueckrechenbar.
 */
export function hashIp(ip: string): string {
  const pepper = process.env.IP_HASH_SECRET ?? 'raeucherhaken24-dev-pepper'
  return sha256(`${pepper}:${ip}`).slice(0, 32)
}

/** Zeitkonstanter String-Vergleich fuer Tokens (CSRF, Gutscheincodes o. Ae.). */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) {
    // Trotzdem vergleichen, um Laengenunterschiede nicht ueber die Laufzeit zu verraten.
    timingSafeEqual(bufA, bufA)
    return false
  }
  return timingSafeEqual(bufA, bufB)
}

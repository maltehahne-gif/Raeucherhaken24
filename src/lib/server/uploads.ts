import 'server-only'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { generateToken, sha256 } from '@/lib/server/crypto'
import { AppError } from '@/lib/server/http'
import { UPLOAD_LIMITS } from '@/lib/validation/project'

/**
 * Sichere Dateiannahme für Sonderanfertigungen.
 *
 * Die Prüfung erfolgt in dieser Reihenfolge, jede Stufe kann ablehnen:
 *   1. Anzahl und Größe (vor dem Einlesen begrenzt)
 *   2. Dateiendung und gemeldeter MIME-Typ (Vorfilter, nicht vertrauenswürdig)
 *   3. INHALT — die ersten Bytes müssen zum behaupteten Typ passen
 *   4. Zusätzliche Inhaltsprüfung auf eingebettetes Skript-Markup
 *
 * Schritt 3 ist der eigentliche Schutz: Angaben aus dem Browser sind frei
 * wählbar, die Signatur am Dateianfang nicht. Eine als „foto.png“ deklarierte
 * HTML-Datei fällt dort durch.
 *
 * Gespeichert wird ausschließlich unter einem serverseitig vergebenen Namen
 * außerhalb des öffentlichen Verzeichnisses. Der Originalname wird nur zur
 * Anzeige gespeichert und beim Rendern escaped.
 */

export interface StoredFile {
  storedName: string
  originalName: string
  mimeType: string
  sizeBytes: number
  checksum: string
}

/** Magische Bytes je erlaubtem Typ. */
const SIGNATURES: Array<{ mime: string; extension: string; test: (bytes: Uint8Array) => boolean }> = [
  {
    mime: 'image/jpeg',
    extension: 'jpg',
    test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    mime: 'image/png',
    extension: 'png',
    test: (b) =>
      b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a,
  },
  {
    mime: 'image/gif',
    extension: 'gif',
    test: (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38,
  },
  {
    mime: 'image/webp',
    extension: 'webp',
    // "RIFF" .... "WEBP"
    test: (b) =>
      b[0] === 0x52 &&
      b[1] === 0x49 &&
      b[2] === 0x46 &&
      b[3] === 0x46 &&
      b[8] === 0x57 &&
      b[9] === 0x45 &&
      b[10] === 0x42 &&
      b[11] === 0x50,
  },
  {
    mime: 'application/pdf',
    extension: 'pdf',
    test: (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46,
  },
]

function uploadDir(): string {
  const configured = process.env.UPLOAD_DIR ?? './storage/uploads'
  return resolve(process.cwd(), configured)
}

/** Entfernt alles, was in einem Dateinamen gefährlich werden kann. */
function safeOriginalName(name: string): string {
  return name
    // Steuerzeichen entfernen (u0000 bis u001F sowie DEL)
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/[\\/]/g, '_')
    .replace(/\.{2,}/g, '.')
    .trim()
    .slice(0, 150)
}

function extensionOf(name: string): string {
  const match = name.toLowerCase().match(/\.([a-z0-9]{1,8})$/)
  return match ? match[1] : ''
}

/**
 * Prüft eine einzelne Datei und gibt den erkannten Typ zurück.
 * Wirft mit einer für Endnutzer verständlichen Meldung.
 */
export function verifyFileContent(bytes: Uint8Array, originalName: string): { mime: string; extension: string } {
  if (bytes.length < 12) {
    throw new AppError(`Die Datei „${safeOriginalName(originalName)}“ ist leer oder unvollständig.`, 400)
  }

  const detected = SIGNATURES.find((signature) => signature.test(bytes))
  if (!detected) {
    throw new AppError(
      `„${safeOriginalName(originalName)}“ konnte nicht als Bild oder PDF erkannt werden. Erlaubt sind JPG, PNG, WEBP, GIF und PDF.`,
      415,
    )
  }

  // Endung und tatsächlicher Inhalt müssen zusammenpassen.
  const extension = extensionOf(originalName)
  const expected = detected.extension === 'jpg' ? ['jpg', 'jpeg'] : [detected.extension]
  if (extension.length > 0 && !expected.includes(extension)) {
    throw new AppError(
      `Bei „${safeOriginalName(originalName)}“ passt die Dateiendung nicht zum Inhalt. Bitte laden Sie die Datei unverändert hoch.`,
      415,
    )
  }

  // Bei SVG-artigem oder HTML-artigem Inhalt in einer angeblichen Bilddatei
  // greift bereits die Signaturprüfung. Zusätzlich prüfen wir den Anfang der
  // Datei auf Markup, das auf eine getarnte Datei hindeutet.
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 512)).toLowerCase()
  if (head.includes('<script') || head.includes('<!doctype html') || head.includes('<html')) {
    throw new AppError(`„${safeOriginalName(originalName)}“ enthält unerwarteten Inhalt und wurde abgelehnt.`, 415)
  }

  return { mime: detected.mime, extension: detected.extension }
}

/**
 * Nimmt Dateien aus einem FormData entgegen, prüft und speichert sie.
 * Gibt die Metadaten für die Datenbank zurück.
 */
export async function storeUploads(files: File[], reference: string): Promise<StoredFile[]> {
  if (files.length === 0) return []

  if (files.length > UPLOAD_LIMITS.maxFiles) {
    throw new AppError(`Bitte laden Sie höchstens ${UPLOAD_LIMITS.maxFiles} Dateien hoch.`, 400)
  }

  let totalBytes = 0
  for (const file of files) {
    if (file.size > UPLOAD_LIMITS.maxBytesPerFile) {
      throw new AppError(
        `„${safeOriginalName(file.name)}“ ist größer als ${Math.round(UPLOAD_LIMITS.maxBytesPerFile / 1024 / 1024)} MB.`,
        413,
      )
    }
    totalBytes += file.size
  }
  if (totalBytes > UPLOAD_LIMITS.maxBytesTotal) {
    throw new AppError(
      `Die Dateien sind zusammen größer als ${Math.round(UPLOAD_LIMITS.maxBytesTotal / 1024 / 1024)} MB.`,
      413,
    )
  }

  const directory = join(uploadDir(), reference)
  await mkdir(directory, { recursive: true })

  const stored: StoredFile[] = []
  for (const file of files) {
    const buffer = new Uint8Array(await file.arrayBuffer())
    const { mime, extension } = verifyFileContent(buffer, file.name)

    // Der Name auf der Platte stammt ausschließlich vom Server.
    const storedName = `${reference}/${generateToken(16)}.${extension}`
    await writeFile(join(uploadDir(), storedName), buffer, { mode: 0o640 })

    stored.push({
      storedName,
      originalName: safeOriginalName(file.name),
      mimeType: mime,
      sizeBytes: buffer.byteLength,
      checksum: sha256(Buffer.from(buffer)),
    })
  }

  return stored
}

/**
 * Liefert den absoluten Pfad einer gespeicherten Datei.
 * Verhindert das Ausbrechen aus dem Uploadverzeichnis (Path Traversal).
 */
export function resolveStoredPath(storedName: string): string {
  const base = uploadDir()
  const target = resolve(base, storedName)
  if (!target.startsWith(`${base}/`) && target !== base) {
    throw new AppError('Datei nicht gefunden.', 404)
  }
  return target
}

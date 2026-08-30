import { headers } from 'next/headers'
import { prisma } from '@/lib/db'
import { hashIp } from '@/lib/server/crypto'
import { verifyCsrf } from '@/lib/server/csrf'
import { projectSchema, UPLOAD_LIMITS } from '@/lib/validation/project'
import { storeUploads } from '@/lib/server/uploads'
import { nextNumber } from '@/lib/server/numbering'
import { checkRateLimit, RATE_LIMITS } from '@/lib/server/rate-limit'
import { handleRouteError, jsonError, jsonOk } from '@/lib/server/http'

export const dynamic = 'force-dynamic'

/**
 * Anfrage für eine Sonderanfertigung entgegennehmen.
 *
 * Die Anfrage kommt als multipart/form-data, weil Skizzen und technische
 * Unterlagen mitgeschickt werden können. Dateien werden inhaltsbasiert geprüft
 * (siehe src/lib/server/uploads.ts) und außerhalb des öffentlichen
 * Verzeichnisses gespeichert.
 *
 * Projekt und Anhänge entstehen in einer Transaktion: Schlägt das Speichern
 * fehl, existiert kein halbes Projekt in der Datenbank.
 */
export async function POST(request: Request) {
  try {
    const csrf = await verifyCsrf(request)
    if (!csrf.ok) return jsonError(csrf.reason ?? 'Ungültige Anfrage.', 403)

    const h = await headers()
    const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '0.0.0.0'
    const limit = checkRateLimit(
      `projekt:${hashIp(ip)}`,
      RATE_LIMITS.upload.limit,
      RATE_LIMITS.upload.windowMs,
    )
    if (!limit.allowed) {
      return jsonError('Zu viele Anfragen. Bitte versuchen Sie es später erneut.', 429)
    }

    const contentType = request.headers.get('content-type') ?? ''
    if (!contentType.includes('multipart/form-data')) {
      return jsonError('Ungültiges Anfrageformat.', 415)
    }

    const form = await request.formData()

    const raw: Record<string, unknown> = {}
    for (const [key, value] of form.entries()) {
      if (typeof value === 'string') raw[key] = value
    }
    // Checkboxen kommen als 'on' bzw. fehlen ganz.
    raw.wantsConsultation = form.get('wantsConsultation') === 'on'
    raw.allowCatalogRelease = form.get('allowCatalogRelease') === 'on'

    const parsed = projectSchema.safeParse(raw)
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const path = issue.path.join('.')
        if (path && !fieldErrors[path]) fieldErrors[path] = issue.message
      }
      return jsonError('Bitte prüfen Sie Ihre Eingaben.', 422, { fieldErrors })
    }

    const input = parsed.data
    const files = form
      .getAll('attachments')
      .filter((entry): entry is File => entry instanceof File && entry.size > 0)

    if (files.length > UPLOAD_LIMITS.maxFiles) {
      return jsonError(`Bitte laden Sie höchstens ${UPLOAD_LIMITS.maxFiles} Dateien hoch.`, 400)
    }

    const year = new Date().getFullYear()

    // Nummer zuerst ziehen: Sie dient als Ordnername für die Anhänge.
    const projectNumber = await prisma.$transaction((tx) => nextNumber(tx, 'project', year))
    const stored = await storeUploads(files, projectNumber)

    const project = await prisma.customProject.create({
      data: {
        projectNumber,
        projectName: input.projectName,
        contactName: input.contactName,
        company: input.company ?? null,
        email: input.email,
        phone: input.phone ?? null,
        foodType: input.foodType,
        purpose: input.purpose,
        targetLoadGrams: input.targetLoadGrams ?? null,
        goalDescription: input.goalDescription,
        totalLengthMm: input.totalLengthMm ?? null,
        wireDiameterTenthMm: input.wireDiameterTenthMm ?? null,
        prongCount: input.prongCount ?? null,
        prongLengthMm: input.prongLengthMm ?? null,
        openingWidthMm: input.openingWidthMm ?? null,
        shape: input.shape ?? null,
        additionalDimensions: input.additionalDimensions ?? null,
        material: input.material,
        tipFinish: input.tipFinish ?? null,
        surface: input.surface ?? null,
        quantity: input.quantity ?? 1,
        wantsConsultation: input.wantsConsultation ?? false,
        allowCatalogRelease: input.allowCatalogRelease ?? false,
        specConfirmed: input.specConfirmed,
        attachments: {
          create: stored.map((file) => ({
            storedName: file.storedName,
            originalName: file.originalName,
            mimeType: file.mimeType,
            sizeBytes: file.sizeBytes,
            checksum: file.checksum,
          })),
        },
      },
      select: { projectNumber: true },
    })

    return jsonOk({
      projectNumber: project.projectNumber,
      redirectTo: `/sonderanfertigung/${project.projectNumber}`,
      attachmentCount: stored.length,
    })
  } catch (error) {
    return handleRouteError(error, 'sonderanfertigung:post')
  }
}

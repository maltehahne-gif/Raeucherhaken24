/**
 * Setzt den Saisonmodus und den Hinweisbanner von der Kommandozeile.
 *
 * Im laufenden Betrieb geschieht das über den Verwaltungsbereich unter
 * /admin/saison. Dieses Skript ist für Fälle gedacht, in denen der
 * Verwaltungsbereich nicht erreichbar ist — etwa beim Aufsetzen eines Systems
 * oder in einem Deployment-Schritt.
 *
 * Aufruf:
 *   npx tsx scripts/set-season.ts weihnachten "Letzte Versandtermine ..."
 *   npx tsx scripts/set-season.ts normal
 */
import { PrismaClient } from '@prisma/client'
import { SEASONAL_THEMES, SEASONAL_THEME_LABELS } from '../src/lib/domain/enums'

const prisma = new PrismaClient()

async function main() {
  const [themeArg, bannerText, bannerLink] = process.argv.slice(2)

  if (!themeArg || !(SEASONAL_THEMES as readonly string[]).includes(themeArg)) {
    console.log('\nVerfügbare Saisonmodi:')
    for (const key of SEASONAL_THEMES) {
      console.log(`  ${key.padEnd(14)} ${SEASONAL_THEME_LABELS[key]}`)
    }
    console.log('\nAufruf: npx tsx scripts/set-season.ts <modus> ["Bannertext"] ["/link"]\n')
    process.exitCode = themeArg ? 1 : 0
    return
  }

  const values: Array<[string, string]> = [
    ['shop:seasonal_theme', themeArg],
    ['shop:banner_active', bannerText ? 'true' : 'false'],
    ['shop:banner_text', bannerText ?? ''],
    ['shop:banner_link', bannerLink ?? ''],
  ]

  for (const [key, value] of values) {
    await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } })
  }

  // Den in der Datenbank gepflegten Modus ebenfalls als aktiv markieren,
  // damit Verwaltungsbereich und Storefront denselben Zustand zeigen.
  await prisma.seasonalTheme.updateMany({ data: { active: false } })
  await prisma.seasonalTheme.updateMany({ where: { key: themeArg }, data: { active: true } })

  console.log(
    `\nSaisonmodus: ${SEASONAL_THEME_LABELS[themeArg as keyof typeof SEASONAL_THEME_LABELS]}` +
      `${bannerText ? `\nBanner:      ${bannerText}` : '\nBanner:      ausgeblendet'}\n`,
  )
  console.log('Die Änderung gilt sofort für alle Besucher.\n')
}

main()
  .catch((error: unknown) => {
    console.error(`\nFehler: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
  .finally(() => {
    void prisma.$disconnect()
  })

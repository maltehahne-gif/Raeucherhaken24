/**
 * Legt ein Verwaltungskonto an.
 *
 * Der Weg über ein Skript ist Absicht: Es gibt bewusst keine Oberfläche, über
 * die sich ohne Anmeldung ein Konto anlegen ließe. Wer dieses Skript ausführen
 * kann, hat bereits Zugriff auf den Server.
 *
 * Aufruf: npm run admin:create
 */
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { PrismaClient } from '@prisma/client'
import { hashPassword } from '../src/lib/server/crypto'
import { DEFAULT_ROLES, PERMISSIONS, PERMISSION_KEYS } from '../src/lib/server/permissions'

const prisma = new PrismaClient()

const MIN_PASSWORD_LENGTH = 12

async function main() {
  const rl = createInterface({ input: stdin, output: stdout })

  try {
    console.log('\nVerwaltungskonto anlegen\n')

    // Rollen und Berechtigungen anlegen, falls die Datenbank noch leer ist.
    await ensureRolesAndPermissions()

    const roles = await prisma.role.findMany({
      orderBy: { key: 'asc' },
      select: { id: true, key: true, name: true, description: true },
    })

    const email = (await rl.question('E-Mail-Adresse: ')).trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('Das ist keine gültige E-Mail-Adresse.')
    }

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      throw new Error(`Für ${email} existiert bereits ein Konto.`)
    }

    const firstName = (await rl.question('Vorname: ')).trim()
    const lastName = (await rl.question('Nachname: ')).trim()
    if (firstName.length < 2 || lastName.length < 2) {
      throw new Error('Bitte geben Sie Vor- und Nachnamen an.')
    }

    console.log('\nVerfügbare Rollen:')
    roles.forEach((role, index) => {
      console.log(`  ${index + 1}) ${role.name.padEnd(20)} ${role.description ?? ''}`)
    })

    const roleAnswer = (await rl.question('\nRolle (Nummer): ')).trim()
    const roleIndex = Number.parseInt(roleAnswer, 10) - 1
    const role = roles[roleIndex]
    if (!role) {
      throw new Error('Diese Rolle gibt es nicht.')
    }

    console.log(`\nDas Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen lang sein.`)
    const password = await rl.question('Passwort: ')
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new Error(`Das Passwort ist zu kurz (mindestens ${MIN_PASSWORD_LENGTH} Zeichen).`)
    }

    const confirmation = await rl.question('Passwort wiederholen: ')
    if (password !== confirmation) {
      throw new Error('Die Passwörter stimmen nicht überein.')
    }

    const user = await prisma.user.create({
      data: {
        email,
        firstName,
        lastName,
        passwordHash: await hashPassword(password),
        roleId: role.id,
      },
      select: { email: true },
    })

    console.log(`\nKonto angelegt: ${user.email} (${role.name})`)
    console.log('Anmeldung unter /admin/anmelden\n')
  } finally {
    rl.close()
    await prisma.$disconnect()
  }
}

/**
 * Stellt sicher, dass Rollen und Berechtigungen existieren.
 * Ohne diesen Schritt schlägt das Anlegen auf einer frischen Datenbank fehl,
 * die noch nicht geseedet wurde.
 */
async function ensureRolesAndPermissions() {
  const permissionCount = await prisma.permission.count()
  if (permissionCount === 0) {
    for (const key of PERMISSION_KEYS) {
      const definition = PERMISSIONS[key]
      await prisma.permission.create({
        data: { key, name: definition.name, group: definition.group },
      })
    }
    console.log(`${PERMISSION_KEYS.length} Berechtigungen angelegt.`)
  }

  const roleCount = await prisma.role.count()
  if (roleCount > 0) return

  const permissions = await prisma.permission.findMany({ select: { id: true, key: true } })
  const byKey = new Map(permissions.map((p) => [p.key, p.id]))

  for (const role of DEFAULT_ROLES) {
    await prisma.role.create({
      data: {
        key: role.key,
        name: role.name,
        description: role.description,
        system: role.system,
        permissions: {
          create: role.permissions
            .map((key) => byKey.get(key))
            .filter((id): id is string => Boolean(id))
            .map((permissionId) => ({ permissionId })),
        },
      },
    })
  }
  console.log(`${DEFAULT_ROLES.length} Rollen angelegt.`)
}

main().catch((error: unknown) => {
  console.error(`\nFehler: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
  void prisma.$disconnect()
})

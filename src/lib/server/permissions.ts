/**
 * RBAC: Berechtigungen, Rollen und deren Standardzuordnung.
 *
 * Berechtigungen sind feingranular (`bereich:aktion`) und werden ueber Rollen
 * an Mitarbeitende vergeben. Jede sicherheitsrelevante Admin-Aktion prueft
 * serverseitig genau eine dieser Berechtigungen.
 */

export const PERMISSIONS = {
  'dashboard:view': { name: 'Dashboard einsehen', group: 'Allgemein' },

  'products:read': { name: 'Produkte einsehen', group: 'Katalog' },
  'products:write': { name: 'Produkte anlegen und bearbeiten', group: 'Katalog' },
  'products:delete': { name: 'Produkte löschen', group: 'Katalog' },
  'categories:write': { name: 'Kategorien verwalten', group: 'Katalog' },

  'inventory:read': { name: 'Lagerbestände einsehen', group: 'Lager' },
  'inventory:write': { name: 'Lagerbestände buchen', group: 'Lager' },

  'orders:read': { name: 'Bestellungen einsehen', group: 'Bestellungen' },
  'orders:write': { name: 'Bestellungen bearbeiten', group: 'Bestellungen' },
  'orders:cancel': { name: 'Bestellungen stornieren', group: 'Bestellungen' },
  'orders:refund': { name: 'Erstattungen erfassen', group: 'Bestellungen' },

  'customers:read': { name: 'Kunden einsehen', group: 'CRM' },
  'customers:write': { name: 'Kunden bearbeiten', group: 'CRM' },

  'coupons:read': { name: 'Gutscheine einsehen', group: 'Marketing' },
  'coupons:write': { name: 'Gutscheine verwalten', group: 'Marketing' },
  'marketing:write': { name: 'Saison und Banner steuern', group: 'Marketing' },

  'support:read': { name: 'Supportanfragen einsehen', group: 'Support' },
  'support:write': { name: 'Supportanfragen bearbeiten', group: 'Support' },

  'projects:read': { name: 'Sonderanfertigungen einsehen', group: 'Sonderanfertigungen' },
  'projects:write': { name: 'Sonderanfertigungen bearbeiten', group: 'Sonderanfertigungen' },

  'content:write': { name: 'Rezepte und Inhalte pflegen', group: 'Inhalte' },

  'users:read': { name: 'Mitarbeitende einsehen', group: 'Administration' },
  'users:write': { name: 'Mitarbeitende verwalten', group: 'Administration' },
  'roles:write': { name: 'Rollen und Rechte verwalten', group: 'Administration' },
  'settings:write': { name: 'Systemeinstellungen ändern', group: 'Administration' },
  'audit:read': { name: 'Protokoll einsehen', group: 'Administration' },
} as const

export type PermissionKey = keyof typeof PERMISSIONS
export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as PermissionKey[]

export function isPermissionKey(value: string): value is PermissionKey {
  return Object.prototype.hasOwnProperty.call(PERMISSIONS, value)
}

/** Berechtigungen nach Gruppe, fuer die Rollenverwaltung im Admin. */
export function permissionsByGroup(): Array<{
  group: string
  items: Array<{ key: PermissionKey; name: string }>
}> {
  const groups = new Map<string, Array<{ key: PermissionKey; name: string }>>()
  for (const key of PERMISSION_KEYS) {
    const def = PERMISSIONS[key]
    const list = groups.get(def.group) ?? []
    list.push({ key, name: def.name })
    groups.set(def.group, list)
  }
  return [...groups.entries()].map(([group, items]) => ({ group, items }))
}

export interface RoleDefinition {
  key: string
  name: string
  description: string
  system: boolean
  permissions: readonly PermissionKey[]
}

const ALL: readonly PermissionKey[] = PERMISSION_KEYS

export const DEFAULT_ROLES: readonly RoleDefinition[] = [
  {
    key: 'owner',
    name: 'Inhaber',
    description: 'Uneingeschränkter Zugriff auf alle Bereiche inklusive Rollenverwaltung.',
    system: true,
    permissions: ALL,
  },
  {
    key: 'admin',
    name: 'Administration',
    description: 'Vollzugriff auf den Shopbetrieb, ohne Änderung der Rollenrechte.',
    system: true,
    permissions: ALL.filter((p) => p !== 'roles:write'),
  },
  {
    key: 'manager',
    name: 'Shop-Management',
    description: 'Katalog, Lager, Bestellungen, Kunden und Marketing.',
    system: true,
    permissions: [
      'dashboard:view',
      'products:read',
      'products:write',
      'categories:write',
      'inventory:read',
      'inventory:write',
      'orders:read',
      'orders:write',
      'orders:cancel',
      'orders:refund',
      'customers:read',
      'customers:write',
      'coupons:read',
      'coupons:write',
      'marketing:write',
      'support:read',
      'support:write',
      'projects:read',
      'projects:write',
      'content:write',
    ],
  },
  {
    key: 'staff',
    name: 'Lager & Versand',
    description: 'Kommissionierung, Versand und Bestandsbuchungen.',
    system: true,
    permissions: [
      'dashboard:view',
      'products:read',
      'inventory:read',
      'inventory:write',
      'orders:read',
      'orders:write',
    ],
  },
  {
    key: 'support',
    name: 'Kundenservice',
    description: 'Supportanfragen, Kundenakten und Einsicht in Bestellungen.',
    system: true,
    permissions: [
      'dashboard:view',
      'products:read',
      'orders:read',
      'customers:read',
      'customers:write',
      'support:read',
      'support:write',
      'projects:read',
      'projects:write',
    ],
  },
]

/** Prueft, ob eine Berechtigungsliste eine bestimmte Berechtigung enthaelt. */
export function hasPermission(granted: readonly string[], required: PermissionKey): boolean {
  return granted.includes(required)
}

/** Prueft, ob mindestens eine der geforderten Berechtigungen vorliegt. */
export function hasAnyPermission(granted: readonly string[], required: readonly PermissionKey[]): boolean {
  return required.some((r) => granted.includes(r))
}

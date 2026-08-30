import type { NextConfig } from 'next'

/**
 * Erlaubte Herkunft fuer den Entwicklungsserver.
 *
 * In Codespaces oder Gitpod laeuft der Browser nicht auf demselben Rechner wie
 * der Server: Die Seite kommt ueber eine weitergeleitete Adresse
 * (`<name>-3000.app.github.dev`). Next.js behandelt solche Anfragen im
 * Entwicklungsmodus als fremde Herkunft und verweigert unter anderem die
 * internen Anfragen des Entwicklungswerkzeugs. Die Adresse wird deshalb aus
 * den Umgebungsvariablen der Plattform abgeleitet und ausdruecklich erlaubt.
 *
 * Das betrifft ausschliesslich `next dev`. Im Produktivbetrieb hat diese
 * Einstellung keine Wirkung.
 */
function devOrigins(): string[] {
  const origins: string[] = []
  const codespace = process.env.CODESPACE_NAME
  if (codespace) {
    const domain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN ?? 'app.github.dev'
    origins.push(`${codespace}-3000.${domain}`)
  }
  return origins
}

const nextConfig: NextConfig = {
  allowedDevOrigins: devOrigins(),
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [360, 480, 640, 768, 1024, 1280, 1536, 1920],
    imageSizes: [64, 96, 128, 192, 256, 384],
  },
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  eslint: { ignoreDuringBuilds: false },
  typescript: { ignoreBuildErrors: false },
}

export default nextConfig

/**
 * Ersatz für das Paket `server-only` im Testlauf.
 *
 * Das echte Paket wirft beim Import außerhalb einer Server-Umgebung — genau
 * das ist im Betrieb erwünscht, im Test aber hinderlich. Der Ersatz ist leer;
 * die Schutzwirkung im Produktionsbundle bleibt davon unberührt, weil die
 * Ersetzung ausschließlich in vitest.config.ts greift.
 */
export {}

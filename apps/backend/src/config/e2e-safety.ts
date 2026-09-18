export function assertE2eDatabase(
  mode: string | undefined,
  databaseUrl: string | undefined,
): void {
  if (mode !== 'true') return;
  if (!databaseUrl) throw new Error('E2E requires DATABASE_URL');
  const target = new URL(databaseUrl);
  if (
    !['postgres:', 'postgresql:'].includes(target.protocol) ||
    !['localhost', '127.0.0.1'].includes(target.hostname) ||
    target.pathname !== '/larcarvalho_test'
  ) {
    throw new Error('E2E must target the local larcarvalho_test database');
  }
}

export function runtimeStoragePaths(role: string): { dataDir: string; tokensDir: string } {
  const safeRole = role.replace(/[^a-z0-9_-]/gi, '-').toLowerCase();
  const root = `.sphere-data/${safeRole}`;

  return {
    dataDir: `${root}/wallet`,
    tokensDir: `${root}/tokens`
  };
}

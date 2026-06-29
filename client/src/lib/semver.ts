export interface SemVer {
  major: number;
  minor: number;
  patch: number;
}

export function parseSemVer(version: string): SemVer {
  const clean = version.replace(/^v/, '');
  const [major, minor, patch] = clean.split('.').map(Number);
  return { major: major || 0, minor: minor || 0, patch: patch || 0 };
}

export function isNewerVersion(current: string, next: string): boolean {
  const curr = parseSemVer(current);
  const nxt = parseSemVer(next);
  if (nxt.major !== curr.major) return nxt.major > curr.major;
  if (nxt.minor !== curr.minor) return nxt.minor > curr.minor;
  return nxt.patch > curr.patch;
}

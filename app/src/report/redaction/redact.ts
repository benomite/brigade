// Ce qui quitte la machine dans un signalement (#1974) : `redact(text)` masque les secrets, remplace le dossier personnel
// par `~` et retire ce qui vient du dépôt de l'utilisateur. Pur, sans effet de bord, idempotent.

export const MASK = "[redacted]";
export const CONTENT_REPOSITORY = "[repository content removed]";

const entropie = (s: string): number => {
  const accounts = new Map<string, number>();
  for (const c of s) accounts.set(c, (accounts.get(c) ?? 0) + 1);
  let h = 0;
  for (const n of accounts.values()) h -= (n / s.length) * Math.log2(n / s.length);
  return h;
};

const RULES: Array<[RegExp, string | ((...m: string[]) => string)]> = [
  // Contenu du dépôt : blocs de code, citations, corps d'issue ou de PR cités.
  [/```[\s\S]*?(?:```|$)/g, CONTENT_REPOSITORY],
  [/^[ \t]*(?:issue|pull request|pr)\b[^\n]{0,40}\bbody:[^\n]*(?:\n(?![ \t]*\n)[^\n]*)*/gim, CONTENT_REPOSITORY],
  [/(?:^[ \t]*>[^\n]*(?:\n|$))+/gm, `${CONTENT_REPOSITORY}\n`],
  // Secrets.
  [/-----BEGIN [A-Z ]*PRIVATE KEY(?: BLOCK)?-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY(?: BLOCK)?-----|$)/g, MASK],
  [/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+(?::[^\s/@]*)?@/gi, (_m, schema) => `${schema}${MASK}@`],
  [/\b(Authorization\s*:\s*)[^\r\n]+/gi, (_m, head) => `${head}${MASK}`],
  [/\b(Bearer|Basic)\s+(?!\[redacted\])[A-Za-z0-9._~+/=-]+/gi, (_m, schema) => `${schema} ${MASK}`],
  [/\b([A-Za-z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD)[A-Za-z0-9_]*)[ \t]*=[ \t]*(?:"[^"\n]*"|'[^'\n]*'|[^\s"']+)/gi, (_m, name) => `${name}=${MASK}`],
  [/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/g, MASK],
  // Dossier personnel.
  [/(?:\/home|\/Users)\/[^/\\\s:"'<>|]+/g, "~"],
  [/\b[A-Za-z]:[\\/]Users[\\/][^/\\\s:"'<>|]+/gi, "~"],
  // Longues chaînes à forte entropie.
  [/[A-Za-z0-9+_=-]{32,}/g, (m) => (/[A-Za-z]/.test(m) && /\d/.test(m) && entropie(m) >= 3.5 ? MASK : m)],
];

export const redact = (text: string): string => {
  let output = text;
  for (const [motive, remplacement] of RULES) output = output.replace(motive, remplacement as string);
  return output;
};

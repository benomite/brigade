// Ce qui quitte la machine dans un signalement (#1974) : `redact(text)` masque les secrets, remplace le dossier personnel
// par `~` et retire ce qui vient du dépôt de l'utilisateur. Pur, sans effet de bord, idempotent.

export const MASQUE = "[redacted]";
export const CONTENU_DEPOT = "[repository content removed]";

const entropie = (s: string): number => {
  const comptes = new Map<string, number>();
  for (const c of s) comptes.set(c, (comptes.get(c) ?? 0) + 1);
  let h = 0;
  for (const n of comptes.values()) h -= (n / s.length) * Math.log2(n / s.length);
  return h;
};

const REGLES: Array<[RegExp, string | ((...m: string[]) => string)]> = [
  // Contenu du dépôt : blocs de code, citations, corps d'issue ou de PR cités.
  [/```[\s\S]*?(?:```|$)/g, CONTENU_DEPOT],
  [/^[ \t]*(?:issue|pull request|pr)\b[^\n]{0,40}\bbody:[^\n]*(?:\n(?![ \t]*\n)[^\n]*)*/gim, CONTENU_DEPOT],
  [/(?:^[ \t]*>[^\n]*(?:\n|$))+/gm, `${CONTENU_DEPOT}\n`],
  // Secrets.
  [/-----BEGIN [A-Z ]*PRIVATE KEY(?: BLOCK)?-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY(?: BLOCK)?-----|$)/g, MASQUE],
  [/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+(?::[^\s/@]*)?@/gi, (_m, schema) => `${schema}${MASQUE}@`],
  [/\b(Authorization\s*:\s*)[^\r\n]+/gi, (_m, tete) => `${tete}${MASQUE}`],
  [/\b(Bearer|Basic)\s+(?!\[redacted\])[A-Za-z0-9._~+/=-]+/gi, (_m, schema) => `${schema} ${MASQUE}`],
  [/\b([A-Za-z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD)[A-Za-z0-9_]*)[ \t]*=[ \t]*(?:"[^"\n]*"|'[^'\n]*'|[^\s"']+)/gi, (_m, nom) => `${nom}=${MASQUE}`],
  [/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/g, MASQUE],
  // Dossier personnel.
  [/(?:\/home|\/Users)\/[^/\\\s:"'<>|]+/g, "~"],
  [/\b[A-Za-z]:[\\/]Users[\\/][^/\\\s:"'<>|]+/gi, "~"],
  // Longues chaînes à forte entropie.
  [/[A-Za-z0-9+_=-]{32,}/g, (m) => (/[A-Za-z]/.test(m) && /\d/.test(m) && entropie(m) >= 3.5 ? MASQUE : m)],
];

export const redact = (text: string): string => {
  let sortie = text;
  for (const [motif, remplacement] of REGLES) sortie = sortie.replace(motif, remplacement as string);
  return sortie;
};

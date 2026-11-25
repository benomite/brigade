// Les fils des agents et le digest de la veille, tels que `facts` les donne (ticket 4274, épique 4025, spec
// 2026-11-23-autonomy-trust-control.md, T1 et C2) : le journal du jour de la vue du projet se tire des fils, et sa carte du
// matin du digest. Ni l'un ni l'autre n'est une alerte : rien d'ici ne part en notification.

// Un geste du fil d'un agent : quand, la ligne, sa raison, son issue, et sa sorte — ce qui le range dans le journal.
export type GesteDuFil = { at: string; line: string; reason: string; outcome: string; kind: string };
// Les fils lus, par agent ; `illisibles`, les gestes qui n'ont pas cette forme, que le journal compte sans les inventer. Ou
// pourquoi les fils ne se lisent pas du tout.
export type FilsLus = { fils: Record<string, GesteDuFil[]>; illisibles: number } | { illisible: string };
// Le digest de la veille, ligne par ligne, dans l'ordre où le runtime l'écrit ; ou pourquoi il ne se lit pas.
export type DigestLu = { lignes: string[] } | { illisible: string };

const FILS_ILLISIBLES = "the agents' threads are not readable";
const DIGEST_ILLISIBLE = "yesterday's digest is not readable";

const unGeste = (un: unknown): un is GesteDuFil => {
  if (typeof un !== "object" || un === null) return false;
  const { at, line, reason, outcome, kind } = un as Record<string, unknown>;
  return typeof at === "string" && !Number.isNaN(Date.parse(at)) && typeof line === "string" && typeof reason === "string" && typeof outcome === "string" && typeof kind === "string";
};

// Le champ `fils` d'un `facts` : un objet, une liste de gestes par agent. Absent, rien n'est dit ; d'une autre forme, il
// est illisible en entier ; un geste d'une autre forme est compté, pas montré.
export function filsLus(brut: unknown): FilsLus | undefined {
  if (brut === undefined || brut === null) return undefined;
  const objet = typeof brut === "object" && !Array.isArray(brut);
  if (!objet) return { illisible: FILS_ILLISIBLES };
  const listes = Object.entries(brut as Record<string, unknown>);
  if (!listes.every(([, gestes]) => Array.isArray(gestes))) return { illisible: FILS_ILLISIBLES };
  let illisibles = 0;
  const fils: Record<string, GesteDuFil[]> = {};
  for (const [agent, gestes] of listes as [string, unknown[]][]) {
    fils[agent] = gestes.filter(unGeste);
    illisibles += gestes.length - fils[agent].length;
  }
  return { fils, illisibles };
}

// Le champ `digest` d'un `facts` : un texte, une ligne par chose dite ; les lignes vides n'en sont pas. Absent, rien n'est
// dit ; d'une autre forme, il est illisible.
export function digestLu(brut: unknown): DigestLu | undefined {
  if (brut === undefined || brut === null) return undefined;
  return typeof brut === "string" ? { lignes: brut.split("\n").map((ligne) => ligne.trim()).filter((ligne) => ligne.length > 0) } : { illisible: DIGEST_ILLISIBLE };
}

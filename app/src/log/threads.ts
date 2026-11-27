// Les fils des agents et le digest de la veille, tels que `facts` les donne (ticket 4274, épique 4025, spec
// 2026-11-23-autonomy-trust-control.md, T1 et C2) : le journal du jour de la vue du projet se tire des fils, et sa carte du
// matin du digest. Ni l'un ni l'autre n'est une alerte : rien d'ici ne part en notification.

// Un geste du fil d'un agent : quand, la ligne, sa raison, son issue, et sa sorte — ce qui le range dans le journal.
export type ActionOfThread = { at: string; line: string; reason: string; outcome: string; kind: string };
// Les fils lus, par agent ; `illisibles`, les gestes qui n'ont pas cette forme, que le journal compte sans les inventer. Ou
// pourquoi les fils ne se lisent pas du tout.
export type ThreadsRead = { fils: Record<string, ActionOfThread[]>; illisibles: number } | { illisible: string };
// Le digest de la veille : sa ligne des pannes vues d'abord par le chef — ou ce qui dit qu'il ne la porte pas —, puis ses
// autres lignes dans l'ordre où le runtime les écrit ; ou pourquoi il ne se lit pas.
export type DigestRead = { vuesParLeChef: string; lignes: string[] } | { illisible: string };

// Les mots qui font, dans le digest, la ligne du compte des pannes vues d'abord par le chef (spec, « seen first by the
// chef ») : le digest du runtime les écrit tels quels, et seule cette constante les cherche.
export const VIEWS_PAR_THE_CHEF = "seen first by the chef";
const WITHOUT_THE_ACCOUNT = `outages ${VIEWS_PAR_THE_CHEF}: not said by the digest`;

const THREADS_UNREADABLE = "the agents' threads are not readable";
const DIGEST_UNREADABLE = "yesterday's digest is not readable";

const oneAction = (oneOf: unknown): oneOf is ActionOfThread => {
  if (typeof oneOf !== "object" || oneOf === null) return false;
  const { at, line, reason, outcome, kind } = oneOf as Record<string, unknown>;
  return typeof at === "string" && !Number.isNaN(Date.parse(at)) && typeof line === "string" && typeof reason === "string" && typeof outcome === "string" && typeof kind === "string";
};

// Le champ `fils` d'un `facts` : un objet, une liste de gestes par agent. Absent, rien n'est dit ; d'une autre forme, il
// est illisible en entier ; un geste d'une autre forme est compté, pas montré.
export function threadsRead(raw: unknown): ThreadsRead | undefined {
  if (raw === undefined || raw === null) return undefined;
  const object = typeof raw === "object" && !Array.isArray(raw);
  if (!object) return { illisible: THREADS_UNREADABLE };
  const lists = Object.entries(raw as Record<string, unknown>);
  if (!lists.every(([, actions]) => Array.isArray(actions))) return { illisible: THREADS_UNREADABLE };
  let unreadable = 0;
  const threads: Record<string, ActionOfThread[]> = {};
  for (const [agent, actions] of lists as [string, unknown[]][]) {
    threads[agent] = actions.filter(oneAction);
    unreadable += actions.length - threads[agent].length;
  }
  return { fils: threads, illisibles: unreadable };
}

// Le champ `digest` d'un `facts` : un texte, une ligne par chose dite ; les lignes vides n'en sont pas. La ligne qui dit les
// pannes vues d'abord par le chef passe devant ; sans elle, le digest le dit à sa place. Absent, rien n'est dit ; d'une autre
// forme, il est illisible.
export function digestRead(raw: unknown): DigestRead | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "string") return { illisible: DIGEST_UNREADABLE };
  const lines = raw.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
  const account = lines.findIndex((line) => line.toLowerCase().includes(VIEWS_PAR_THE_CHEF));
  return account < 0 ? { vuesParLeChef: WITHOUT_THE_ACCOUNT, lignes: lines } : { vuesParLeChef: lines[account] as string, lignes: lines.toSpliced(account, 1) };
}

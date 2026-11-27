// La limite que GitHub pose aux appels du compte, telle que `facts` la porte (runtime, entrée `github`, ticket 2144) :
// `{ limit: 'primary' | 'secondary-writes' | 'secondary-concurrency', since, backAt }`, absente quand les appels passent.
// L'état est celui du compte, pas du projet : chaque projet du compte la reçoit dans ses `facts`, et la bande de chacun
// la dit (alerts.ts). Une ligne : quelle limite, en clair, depuis quand, retour vers quelle heure — à l'heure locale du
// chef, jamais le nom brut de la limite ni le texte de GitHub. Elle tombe d'elle-même au premier `facts` qui ne la porte plus.
// Rien n'y est cru sur parole : une entrée qui n'est pas un objet n'est pas donnée ; un nom de limite inconnu (un runtime
// plus récent) ou une heure illisible ne la font pas taire — la ligne dit ce qui se lit, le reste est omis.
import { hourHM } from "../format.ts";

export type LimitOfAccount = { limit: string; since?: string; backAt?: string };

// Chaque limite en clair, dans la ligne, puis le nom que GitHub lui donne, dans son détail.
const LIMITS: Record<string, { dit: string; nom: string }> = {
  primary: { dit: "the hourly quota is spent", nom: "GitHub's hourly rate limit (the account's calls per hour)" },
  "secondary-writes": { dit: "too many writes per minute", nom: "GitHub's secondary rate limit on writes per minute" },
  "secondary-concurrency": { dit: "too many requests at once", nom: "GitHub's secondary rate limit on concurrent requests" },
};

const instant = (value: unknown): string | undefined => (typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : undefined);

// `github`, de la racine de `facts`.
export function limitRead(value: unknown): { github?: LimitOfAccount } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const { limit, since, backAt } = value as Record<string, unknown>;
  const sinceWhen = instant(since);
  const resumption = instant(backAt);
  return { github: { limit: typeof limit === "string" ? limit : "", ...(sinceWhen === undefined ? {} : { since: sinceWhen }), ...(resumption === undefined ? {} : { backAt: resumption }) } };
}

// La ligne de la bande, et son détail.
export function lineOfTheLimit({ limit, since, backAt }: LimitOfAccount): { dit: string; pourquoi: string } {
  const known = Object.hasOwn(LIMITS, limit) ? LIMITS[limit] : undefined;
  const what = known === undefined ? "" : `: ${known.dit}`;
  const sinceWhen = since === undefined ? "" : `${what === "" ? "" : ","} since ${hourHM(since)}`;
  const back = backAt === undefined ? "a time GitHub does not give" : hourHM(backAt);
  return {
    dit: `GitHub is rate-limiting calls${what}${sinceWhen}, back around ${back}`,
    pourquoi: `${known?.nom ?? "A GitHub rate limit"}: it holds every project of this account, not this one alone`,
  };
}

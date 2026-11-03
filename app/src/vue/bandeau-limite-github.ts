// La limite que GitHub pose aux appels du compte, telle que `facts` la porte (runtime, entrée `github`, ticket 2144) :
// `{ limit: 'primary' | 'secondary-writes' | 'secondary-concurrency', since, backAt }`, absente quand les appels passent.
// L'état est celui du compte, pas du projet : chaque projet du compte la reçoit dans ses `facts`, et la bande de chacun
// la dit (alertes.ts). Une ligne : quelle limite, en clair, depuis quand, retour vers quelle heure — à l'heure locale du
// chef, jamais le nom brut de la limite ni le texte de GitHub. Elle tombe d'elle-même au premier `facts` qui ne la porte plus.
// Rien n'y est cru sur parole : une entrée qui n'est pas un objet n'est pas donnée ; un nom de limite inconnu (un runtime
// plus récent) ou une heure illisible ne la font pas taire — la ligne dit ce qui se lit, le reste est omis.
import { heureHM } from "../format.ts";

export type LimiteDuCompte = { limit: string; since?: string; backAt?: string };

// Chaque limite en clair, dans la ligne, puis le nom que GitHub lui donne, dans son détail.
const LIMITES: Record<string, { dit: string; nom: string }> = {
  primary: { dit: "the hourly quota is spent", nom: "GitHub's hourly rate limit (the account's calls per hour)" },
  "secondary-writes": { dit: "too many writes per minute", nom: "GitHub's secondary rate limit on writes per minute" },
  "secondary-concurrency": { dit: "too many requests at once", nom: "GitHub's secondary rate limit on concurrent requests" },
};

const instant = (valeur: unknown): string | undefined => (typeof valeur === "string" && !Number.isNaN(Date.parse(valeur)) ? valeur : undefined);

// `github`, de la racine de `facts`.
export function limiteLue(valeur: unknown): { github?: LimiteDuCompte } {
  if (typeof valeur !== "object" || valeur === null || Array.isArray(valeur)) return {};
  const { limit, since, backAt } = valeur as Record<string, unknown>;
  const depuis = instant(since);
  const reprise = instant(backAt);
  return { github: { limit: typeof limit === "string" ? limit : "", ...(depuis === undefined ? {} : { since: depuis }), ...(reprise === undefined ? {} : { backAt: reprise }) } };
}

// La ligne de la bande, et son détail.
export function ligneDeLaLimite({ limit, since, backAt }: LimiteDuCompte): { dit: string; pourquoi: string } {
  const connue = Object.hasOwn(LIMITES, limit) ? LIMITES[limit] : undefined;
  const quoi = connue === undefined ? "" : `: ${connue.dit}`;
  const depuis = since === undefined ? "" : `${quoi === "" ? "" : ","} since ${heureHM(since)}`;
  const retour = backAt === undefined ? "a time GitHub does not give" : heureHM(backAt);
  return {
    dit: `GitHub is rate-limiting calls${quoi}${depuis}, back around ${retour}`,
    pourquoi: `${connue?.nom ?? "A GitHub rate limit"}: it holds every project of this account, not this one alone`,
  };
}

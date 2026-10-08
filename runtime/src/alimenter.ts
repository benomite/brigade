// Alimente le rail depuis GitHub : à chaque sondage, l'écart entre les issues
// qui portent le label et le rail devient des faits au journal. C'est un écart,
// pas un flux — un sondage manqué se rattrape au suivant, sans rien rejouer.
import { LABEL, ouvrirGitHub, type GitHub, type Issue } from "./github.ts";
import type { FaitRail } from "./evenements/rail.ts";
import type { Journal } from "./journal.ts";
import { lireRail, ticketDuRail } from "./projections/rail.ts";
import { ouvrirRail, type Rail } from "./rail.ts";
import { ConfigInvalide, type Runtime } from "./runtime.ts";

const AUTEUR = "github";

// `prio:1` → 1. Sans label de priorité : rien, le ticket passe après les autres.
export function priorite(labels: string[]): number | null {
  const niveaux = labels.flatMap((label) => /^prio:(\d+)$/.exec(label)?.[1] ?? []).map(Number);
  return niveaux.length === 0 ? null : Math.min(...niveaux);
}

type Depart = { ticket: number; reason: "closed" | "unfired" | "gone"; updatedAt: string | null };

// Reporte sur le rail ce que GitHub dit. Rend le nombre de faits écrits.
export async function alimenter(journal: Journal, github: GitHub, cible: { projet: string; depot: string }): Promise<number> {
  const sondage = await github.tickets();
  if (sondage.inchange) return 0;
  const presentes = new Map(sondage.issues.map((issue) => [issue.number, issue]));
  let complet = true;

  // Un ticket du rail absent de la liste : son issue dit pourquoi.
  const departs: Depart[] = [];
  for (const { ticket } of lireRail(journal.base)) {
    if (presentes.has(ticket)) continue;
    const issue = await github.issue(ticket);
    if (!issue) departs.push({ ticket, reason: "gone", updatedAt: null });
    else if (issue.state === "closed") departs.push({ ticket, reason: "closed", updatedAt: issue.updatedAt });
    else if (!issue.labels.includes(LABEL)) departs.push({ ticket, reason: "unfired", updatedAt: issue.updatedAt });
    // Rouverte ou relabellisée entre les deux requêtes : le prochain sondage tranchera.
    else complet = false;
  }

  // Clé unique : deux sondages du même changement — ou, plus tard, le sondage
  // et le webhook — n'écrivent qu'une ligne.
  const noter = (ticket: number, fait: FaitRail, updatedAt: string | null): number => {
    const dedupKey = updatedAt === null ? undefined : `github:${cible.depot}#${ticket}:${fait.type}:${updatedAt}`;
    if (journal.ajouter({ project: cible.projet, ticket, author: AUTEUR, dedupKey, ...fait })) return 1;
    complet = false;
    return 0;
  };

  const ecrits = journal.base.transaction(() => {
    let nombre = 0;
    for (const issue of sondage.issues) {
      const connu = ticketDuRail(journal.base, issue.number);
      const { title } = issue;
      const priority = priorite(issue.labels);
      if (!connu) {
        const payload = { title, priority, createdAt: issue.createdAt, url: issue.url };
        nombre += noter(issue.number, { type: "ticket.arrived", payload }, issue.updatedAt);
      } else if (connu.title !== title || connu.priority !== priority) {
        nombre += noter(issue.number, { type: "ticket.changed", payload: { title, priority } }, issue.updatedAt);
      }
    }
    for (const { ticket, reason, updatedAt } of departs) {
      if (ticketDuRail(journal.base, ticket)) nombre += noter(ticket, { type: "ticket.left", payload: { reason } }, updatedAt);
    }
    return nombre;
  });
  if (complet) sondage.confirmer();
  return ecrits;
}

export type ConfigRail = {
  // `<owner>/<repo>` : le dépôt GitHub dont le projet sert les issues.
  depot: string;
  dureeBailMs: number;
  gh: string;
};

const BAIL_PAR_DEFAUT_S = 600;

// Lit la configuration du rail dans l'environnement. Le dépôt n'a pas de
// défaut : le nom de projet est un identifiant court, il ne le désigne pas.
export function configRail(env: Record<string, string | undefined>): ConfigRail {
  const depot = env.BRIGADE_GITHUB_REPO;
  if (!depot) throw new ConfigInvalide("BRIGADE_GITHUB_REPO n'est pas défini");
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(depot)) {
    throw new ConfigInvalide(`BRIGADE_GITHUB_REPO invalide : « ${depot} » — attendu <owner>/<repo>`);
  }
  const bail = env.BRIGADE_LEASE_SECONDS || String(BAIL_PAR_DEFAUT_S);
  if (!/^[1-9][0-9]*$/.test(bail)) {
    throw new ConfigInvalide(`BRIGADE_LEASE_SECONDS invalide : « ${bail} » — attendu un nombre entier de secondes`);
  }
  return { depot, dureeBailMs: Number(bail) * 1000, gh: env.BRIGADE_GH_BIN || "gh" };
}

export type RuntimeAvecRail = Runtime & { rail: Rail };

export type OptionsRail = ConfigRail & {
  // Par défaut, le vrai `gh`.
  github?: GitHub;
  maintenant?: () => Date;
};

// Donne son rail au runtime : sondé dès maintenant puis à chaque tick, et
// relevé (baux échus, 86 passés) à chaque réveil.
export function avecRail(runtime: Runtime, options: OptionsRail): RuntimeAvecRail {
  const { projet, journal } = runtime;
  const github = options.github ?? ouvrirGitHub({ depot: options.depot, bin: options.gh });
  const rail = ouvrirRail(journal, { projet, dureeBailMs: options.dureeBailMs, maintenant: options.maintenant });

  let arrete = false;
  let enCours = false;
  const sonder = async () => {
    // Un sondage plus lent que le tick n'en lance pas un second.
    if (enCours || arrete) return;
    enCours = true;
    try {
      await alimenter(journal, github, { projet, depot: options.depot });
    } catch (erreur) {
      // `gh` en panne (réseau, connexion expirée) : le rail reste tel quel, et
      // le tick suivant réessaie. L'échec va à journald, pas au journal — une
      // ligne par minute de panne n'y raconterait rien.
      if (!arrete) console.error(`brigade : sondage GitHub en échec — ${erreur instanceof Error ? erreur.message : String(erreur)}`);
    } finally {
      enCours = false;
    }
  };

  runtime.surReveil((cause) => {
    rail.relever();
    if (cause === "tick") void sonder();
  });
  rail.relever();
  void sonder();

  return {
    ...runtime,
    rail,
    arreter(signal) {
      arrete = true;
      github.fermer();
      runtime.arreter(signal);
    },
  };
}

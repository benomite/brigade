// Alimente le rail depuis GitHub : à chaque sondage, l'écart entre les issues
// qui portent le label et le rail devient des faits au journal. C'est un écart,
// pas un flux — un sondage manqué se rattrape au suivant, sans rien rejouer.
import { calibrage } from "./calibrage.ts";
import { fiche, porteFiche, type Fiche } from "./fiche.ts";
import { LABEL, ouvrirGitHub, type GitHub, type Issue } from "./github.ts";
import type { FaitRail } from "./evenements/rail.ts";
import type { Journal } from "./journal.ts";
import { lireRail, ticketDuRail } from "./projections/rail.ts";
import { ouvrirRail, type Rail } from "./rail.ts";
import { ConfigInvalide, type Runtime } from "./runtime.ts";

const AUTEUR = "github";

// `prio:1` → 1, de 1 à 9. Sans label de priorité, ou avec un label hors de
// cette plage : rien, le ticket passe après les autres.
export function priorite(labels: string[]): number | null {
  const niveaux = labels.flatMap((label) => /^prio:([1-9])$/.exec(label)?.[1] ?? []).map(Number);
  return niveaux.length === 0 ? null : Math.min(...niveaux);
}

// Ce qu'une issue doit porter pour devenir un ticket. Une issue qui ne le porte
// pas est écartée seule : elle ne doit pas faire échouer le report des autres.
function lisible(issue: Issue): boolean {
  return (
    Number.isSafeInteger(issue.number) &&
    [issue.title, issue.createdAt, issue.updatedAt, issue.url].every((champ) => typeof champ === "string" && champ !== "")
  );
}

// La fiche de chaque issue, telle qu'elle a été lue à sa dernière modification.
// Cache, pas état : le perdre coûte une lecture des commentaires par ticket.
export type FichesLues = Map<number, { updatedAt: string; fiche: Fiche | null }>;

// Ceux dont un commentaire fait foi : le propriétaire du dépôt, les membres de
// son organisation, ses collaborateurs. Tout le monde peut commenter une issue
// publique, et une fiche dit quoi cuisiner.
const DE_CONFIANCE = ["OWNER", "MEMBER", "COLLABORATOR"];

// Lit la fiche d'une issue dans ses commentaires, puis ce que seul GitHub
// sait : si chaque ticket attendu existe.
async function lireFiche(github: GitHub, issue: Issue, presentes: Map<number, Issue>): Promise<Fiche | null> {
  const corps: string[] = [];
  for (const commentaire of await github.commentaires(issue.number)) {
    if (DE_CONFIANCE.includes(commentaire.association)) corps.push(commentaire.body);
    else if (porteFiche(commentaire.body)) {
      console.error(
        `brigade : fiche ignorée sur le ticket #${issue.number} — posée par ${commentaire.author || "un inconnu"}, qui n'a pas la main sur le dépôt (${commentaire.association})`,
      );
    }
  }
  const lue = fiche(corps);
  for (const attendu of lue?.waitsFor ?? []) {
    if (attendu === issue.number) lue?.problems.push(`attend : #${attendu} est ce ticket lui-même`);
    else if (!presentes.has(attendu) && !(await github.issue(attendu))) lue?.problems.push(`attend : #${attendu} ne désigne aucune issue du dépôt`);
  }
  return lue;
}

type Depart = { ticket: number; reason: "closed" | "unfired" | "gone"; updatedAt: string | null };

// Reporte sur le rail ce que GitHub dit. Rend le nombre de faits écrits.
export async function alimenter(
  journal: Journal,
  github: GitHub,
  cible: { projet: string; depot: string },
  fiches: FichesLues = new Map(),
): Promise<number> {
  const sondage = await github.tickets();
  if (sondage.inchange) return 0;
  const presentes = new Map(sondage.issues.map((issue) => [issue.number, issue]));
  let complet = true;

  // Les commentaires ne se relisent que pour une issue qui a changé : en poser
  // un, l'éditer ou le supprimer fait bouger son `updated_at` (mesuré contre
  // GitHub le 2026-10-08).
  for (const numero of [...fiches.keys()]) if (!presentes.has(numero)) fiches.delete(numero);
  for (const issue of sondage.issues) {
    if (lisible(issue) && fiches.get(issue.number)?.updatedAt !== issue.updatedAt) {
      fiches.set(issue.number, { updatedAt: issue.updatedAt, fiche: await lireFiche(github, issue, presentes) });
    }
  }

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
      if (!lisible(issue)) {
        console.error(`brigade : issue GitHub illisible, écartée du rail — ${JSON.stringify(issue)}`);
        continue;
      }
      const connu = ticketDuRail(journal.base, issue.number);
      const { title } = issue;
      const priority = priorite(issue.labels);
      const { model, effort } = calibrage(issue.labels);
      const card = fiches.get(issue.number)?.fiche ?? null;
      if (!connu) {
        const payload = { title, priority, createdAt: issue.createdAt, url: issue.url, model, effort, card };
        nombre += noter(issue.number, { type: "ticket.arrived", payload }, issue.updatedAt);
      } else if (
        connu.title !== title ||
        connu.priority !== priority ||
        connu.model !== model ||
        connu.effort !== effort ||
        JSON.stringify(connu.card) !== JSON.stringify(card)
      ) {
        nombre += noter(issue.number, { type: "ticket.changed", payload: { title, priority, model, effort, card } }, issue.updatedAt);
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

// Trois fois le délai d'inactivité, la moitié du plafond de durée : un cook
// qui lit longuement avant d'écrire garde son ticket.
const BAIL_PAR_DEFAUT_S = 1800;

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

export type RuntimeAvecRail = Runtime & {
  rail: Rail;
  // Abonne un écouteur aux sondages qui ont changé le rail : ce que GitHub y
  // pose n'attend pas le tick suivant pour être vu. Rend de quoi le désabonner.
  surSondage(ecouter: () => void): () => void;
};

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
  const fiches: FichesLues = new Map();
  const ecouteurs = new Set<() => void>();
  const sonder = async () => {
    // Un sondage plus lent que le tick n'en lance pas un second.
    if (enCours || arrete) return;
    enCours = true;
    try {
      const ecrits = await alimenter(journal, github, { projet, depot: options.depot }, fiches);
      if (ecrits > 0 && !arrete) for (const ecouter of [...ecouteurs]) ecouter();
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
    surSondage(ecouter) {
      if (arrete) return () => {};
      ecouteurs.add(ecouter);
      return () => ecouteurs.delete(ecouter);
    },
    arreter(signal) {
      arrete = true;
      ecouteurs.clear();
      github.fermer();
      runtime.arreter(signal);
    },
  };
}

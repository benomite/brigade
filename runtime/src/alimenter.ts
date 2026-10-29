// Alimente le rail depuis GitHub : à chaque sondage, l'écart entre les issues
// qui portent le label et le rail devient des faits au journal. C'est un écart,
// pas un flux — un sondage manqué se rattrape au suivant, sans rien rejouer.
import { createHash } from "node:crypto";
import { abandonnerEnChaine } from "./abandon-en-chaine.ts";
import { marquerAttentes } from "./attente.ts";
import { calibrage } from "./calibrage.ts";
import { cycles, direCycle, signalerAttentesLevees } from "./dependances.ts";
import { fiche, porteFiche, type Fiche } from "./fiche.ts";
import { HORS_CUISINE, LABEL, ouvrirGitHub, type GitHub, type Issue } from "./github.ts";
import { LimiteGitHubAtteinte } from "./limite-github.ts";
import type { FaitRail } from "./events/rail.ts";
import type { Journal } from "./journal.ts";
import { communsDuRail, DEPARTS_QUI_LEVENT, feuNonVu, lireRail, sortDuTicket, ticketDuRail } from "./projections/rail.ts";
import { ouvrirRail, type Rail } from "./rail.ts";
import { ConfigInvalide, type Runtime } from "./runtime.ts";
import { refusEn } from "./zones.ts";
import { ficheSurLeNouvelArbre, renommagesMerges } from "./pause/reprise.ts";

const AUTEUR = "github";

// `prio:1` → 1, de 1 à 9 — et `prio:0`, qui passe devant tout : celle que la
// pass pose sur la réparation d'une base rouge. Sans label de priorité, ou
// avec un label hors de cette plage : rien, le ticket passe après les autres.
export function priorite(labels: string[]): number | null {
  const niveaux = labels.flatMap((label) => /^prio:([0-9])$/.exec(label)?.[1] ?? []).map(Number);
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
// `stable` : la fiche ne tient qu'à l'issue. Sinon elle tient aussi à ce qui
// peut changer sans que l'issue bouge — un ticket attendu qui n'existe pas
// encore, ou qui n'est jamais entré sur le rail et peut être fermé sans y
// passer, un auteur qui n'a pas encore la main sur le dépôt — et se relit à
// chaque sondage.
// `fermees` : les issues attendues que GitHub dit fermées et dont le journal
// ne sait rien — elles n'ont jamais été sur le rail.
export type FichesLues = Map<number, { updatedAt: string; fiche: Fiche | null; stable: boolean; fermees?: Issue[] }>;

// Ceux dont un commentaire fait foi : le propriétaire du dépôt, les membres de
// son organisation, ses collaborateurs. Tout le monde peut commenter une issue
// publique, et une fiche dit quoi cuisiner.
export const DE_CONFIANCE = ["OWNER", "MEMBER", "COLLABORATOR"];

// Un ticket attendu dont seul GitHub dira la fermeture : le journal ne le sait
// ni servi ni fermé — inconnu, ou parti du rail l'issue encore ouverte.
const aGuetter = (sort: ReturnType<typeof sortDuTicket>) => sort === null || (sort.outcome === "left" && !DEPARTS_QUI_LEVENT.includes(sort.reason ?? ""));

// Lit la fiche d'une issue dans ses commentaires, puis ce que seul GitHub
// sait : si chaque ticket attendu existe, et — pour celui dont le journal ne
// sait rien — s'il est fermé. `relecture` : l'issue n'a pas bougé depuis la
// lecture précédente, ce qui a déjà été dit ne se redit pas.
async function lireFiche(
  journal: Journal,
  github: GitHub,
  issue: Issue,
  presentes: Map<number, Issue>,
  relecture: boolean,
): Promise<{ fiche: Fiche | null; stable: boolean; fermees: Issue[] }> {
  const corps: string[] = [];
  const fermees: Issue[] = [];
  let stable = true;
  for (const commentaire of await github.commentaires(issue.number)) {
    if (DE_CONFIANCE.includes(commentaire.association)) corps.push(commentaire.body);
    else if (porteFiche(commentaire.body)) {
      stable = false;
      if (relecture) continue;
      console.error(
        `brigade : fiche ignorée sur le ticket #${issue.number} — posée par ${commentaire.author || "un inconnu"}, qui n'a pas la main sur le dépôt (${commentaire.association})`,
      );
    }
  }
  const lue = fiche(corps);
  for (const attendu of lue?.waitsFor ?? []) {
    if (attendu === issue.number) lue?.problems.push(`attend : #${attendu} est ce ticket lui-même`);
    else if (!presentes.has(attendu)) {
      const autre = await github.issue(attendu);
      if (!autre) {
        stable = false;
        lue?.problems.push(`attend : #${attendu} ne désigne aucune issue du dépôt`);
      } else if (autre.pr) {
        lue?.problems.push(`attend : #${attendu} est une PR, pas un ticket`);
      } else if (aGuetter(sortDuTicket(journal.base, attendu))) {
        // Ni servie ni fermée au journal : jamais entrée sur le rail, ou partie
        // l'issue encore ouverte (`fire` retiré, `hors-cuisine`). Fermée, elle
        // ne sera jamais servie — l'attente tombe, à écrire (#1834). Ouverte,
        // elle peut le devenir sans que rien ne bouge sur le rail.
        if (autre.state === "closed") fermees.push(autre);
        else stable = false;
      }
    }
  }
  return { fiche: lue, stable, fermees };
}

// Les retraits de `fire` lus pour chaque issue retenue, tels que GitHub les
// date, à sa dernière modification. Cache, pas état.
export type RetraitsLus = Map<number, { updatedAt: string; retraits: string[] }>;

const apres = (instant: string, borne: string) => new Date(instant).getTime() > new Date(borne).getTime();

type Depart = { ticket: number; reason: "closed" | "unfired" | "gone" | "hors-cuisine"; updatedAt: string | null };

// Reporte sur le rail ce que GitHub dit. Rend le nombre de faits écrits.
export async function alimenter(
  journal: Journal,
  github: GitHub,
  cible: { projet: string; depot: string },
  fiches: FichesLues = new Map(),
  retraitsLus: RetraitsLus = new Map(),
): Promise<number> {
  const sondage = await github.tickets();
  if (sondage.inchange) return 0;
  const presentes = new Map(sondage.issues.map((issue) => [issue.number, issue]));
  // Un ticket `hors-cuisine` n'entre pas sur le rail, `fire` ou non : il existe
  // (on peut l'attendre), mais la box ne le sert pas.
  const servables = sondage.issues.filter((issue) => !(Array.isArray(issue.labels) && issue.labels.includes(HORS_CUISINE)));
  let complet = true;

  // Les commentaires ne se relisent que pour une issue qui a changé : en poser
  // un, l'éditer ou le supprimer fait bouger son `updated_at` (mesuré contre
  // GitHub le 2026-10-08).
  for (const numero of [...fiches.keys()]) if (!presentes.has(numero)) fiches.delete(numero);
  for (const issue of servables) {
    if (!lisible(issue)) continue;
    const connue = fiches.get(issue.number);
    const relecture = connue?.updatedAt === issue.updatedAt;
    // Stable à sa lecture, elle ne l'est plus si un ticket qu'elle attend a
    // quitté le rail depuis, l'issue ouverte : seul GitHub en dira la fermeture.
    const guettee = (connue?.fiche?.waitsFor ?? []).some((attendu) => !presentes.has(attendu) && aGuetter(sortDuTicket(journal.base, attendu)));
    if (relecture && connue.stable && !guettee) continue;
    const lue = await lireFiche(journal, github, issue, presentes, relecture);
    fiches.set(issue.number, { updatedAt: issue.updatedAt, ...lue });
    // Ce qui la réparerait ne modifie pas cette issue, donc pas la liste : le
    // sondage reste inconditionnel tant qu'elle n'est pas stable.
    if (!lue.stable) complet = false;
  }

  // Un cycle ne tient à aucune fiche seule : il se cherche sur toutes, à chaque
  // sondage, et se porte en problème sur la fiche de chacun de ses tickets.
  // Un ticket déjà servi n'est attendu par personne : il ne ferme aucune boucle.
  const pasServi = (numero: number) => sortDuTicket(journal.base, numero)?.outcome !== "served";
  const enCycle = cycles(
    new Map(servables.filter(lisible).map((issue) => [issue.number, (fiches.get(issue.number)?.fiche?.waitsFor ?? []).filter(pasServi)])),
  );
  // Un ticket du rail absent de la liste : son issue dit pourquoi.
  const departs: Depart[] = [];
  for (const { ticket } of lireRail(journal.base)) {
    const listee = presentes.get(ticket);
    if (listee && servables.includes(listee)) continue;
    const issue = listee ?? (await github.issue(ticket));
    if (!issue) departs.push({ ticket, reason: "gone", updatedAt: null });
    else if (issue.state === "closed") departs.push({ ticket, reason: "closed", updatedAt: issue.updatedAt });
    else if (issue.labels.includes(HORS_CUISINE)) departs.push({ ticket, reason: "hors-cuisine", updatedAt: issue.updatedAt });
    else if (!issue.labels.includes(LABEL)) departs.push({ ticket, reason: "unfired", updatedAt: issue.updatedAt });
    // Rouverte ou relabellisée entre les deux requêtes : le prochain sondage tranchera.
    else complet = false;
  }

  // Un ticket retenu dont `fire` a été retiré puis reposé entre deux sondages :
  // la liste ne l'a jamais vu partir, l'historique de l'issue le dit. Compte
  // comme le geste si le retrait suit la retenue ; avant elle, il ne la lève
  // pas, et la file le dit.
  const reposes = new Map<number, string>();
  const nonVus = new Map<number, string>();
  for (const issue of servables) {
    if (!lisible(issue)) continue;
    const retenu = ticketDuRail(journal.base, issue.number);
    if (retenu?.state !== "86") continue;
    let lu = retraitsLus.get(issue.number);
    if (lu?.updatedAt !== issue.updatedAt) {
      try {
        lu = { updatedAt: issue.updatedAt, retraits: await github.retraitsDeFire(issue.number) };
      } catch (erreur) {
        if (erreur instanceof LimiteGitHubAtteinte) throw erreur;
        // Illisible : le sondage suivant le redemande.
        complet = false;
        continue;
      }
      retraitsLus.set(issue.number, lu);
    }
    const entree = journal.duTicket(issue.number).findLast((fait) => fait.type === "ticket.arrived")?.at;
    // Le dernier retrait depuis que le ticket est entré sur le rail : un retrait
    // que le rail avait vu l'a fait sortir, et l'entrée est celle d'après.
    const retrait = lu.retraits.filter((instant) => entree === undefined || apres(instant, entree)).at(-1);
    if (retrait === undefined) continue;
    if (apres(retrait, retenu.since)) reposes.set(issue.number, retrait);
    else if (feuNonVu(journal.base, issue.number) !== retrait) nonVus.set(issue.number, retrait);
  }
  for (const numero of [...retraitsLus.keys()]) if (!presentes.has(numero)) retraitsLus.delete(numero);

  // Clé unique : deux sondages du même changement — ou, plus tard, le sondage
  // et le webhook — n'écrivent qu'une ligne. Un changement porte en plus
  // l'empreinte de ce qu'il dit : ce que le rail lit d'une issue peut changer
  // sans qu'elle bouge — une fiche qu'un runtime précédent ne lisait pas, un
  // ticket attendu enfin créé. Et le numéro du dernier fait du ticket : un
  // cycle fait, défait puis refait par la fiche d'un autre redit de celui-ci
  // ce que le journal a déjà porté, et doit s'écrire quand même.
  const noter = (ticket: number, fait: FaitRail, updatedAt: string | null): number => {
    const empreinte =
      fait.type === "ticket.changed"
        ? `:${createHash("sha256").update(JSON.stringify(fait.payload)).digest("hex").slice(0, 16)}:${journal.duTicket(ticket).at(-1)?.seq ?? 0}`
        : "";
    const dedupKey = updatedAt === null ? undefined : `github:${cible.depot}#${ticket}:${fait.type}:${updatedAt}${empreinte}`;
    if (journal.ajouter({ project: cible.projet, ticket, author: AUTEUR, dedupKey, ...fait })) return 1;
    complet = false;
    return 0;
  };

  const ecrits = journal.base.transaction(() => {
    let nombre = 0;
    // Après un renommage du code mergé, une zone se lit sur les nouveaux
    // chemins : la fiche de l'issue garde ceux que le chef a écrits.
    const renommages = renommagesMerges(journal.base);
    // Le retrait vu après coup : le ticket quitte le rail, puis y rentre ci-dessous.
    for (const [ticket, retrait] of reposes) nombre += noter(ticket, { type: "ticket.left", payload: { reason: "unfired" } }, `${retrait}:repose`);
    for (const [ticket, retrait] of nonVus) nombre += noter(ticket, { type: "ticket.fire-unseen", payload: { removedAt: retrait } }, `${retrait}:non-vu`);
    for (const issue of servables) {
      if (!lisible(issue)) {
        console.error(`brigade : issue GitHub illisible, écartée du rail — ${JSON.stringify(issue)}`);
        continue;
      }
      const connu = ticketDuRail(journal.base, issue.number);
      const { title } = issue;
      const priority = priorite(issue.labels);
      const { model, effort } = calibrage(issue.labels);
      const lue = ficheSurLeNouvelArbre(fiches.get(issue.number)?.fiche ?? null, renommages);
      const cycle = enCycle.get(issue.number);
      const card = lue && cycle ? { ...lue, problems: [...lue.problems, direCycle(cycle)] } : lue;
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
    // Une issue attendue, fermée hors du rail — sans y être jamais entrée, ou
    // après l'avoir quitté ouverte : le journal l'apprend ici, une fois, et
    // celui qui l'attend ne l'attend plus (#1834).
    for (const { fermees = [] } of fiches.values()) {
      for (const fermee of fermees) {
        if (ticketDuRail(journal.base, fermee.number) || !aGuetter(sortDuTicket(journal.base, fermee.number))) continue;
        nombre += noter(fermee.number, { type: "ticket.left", payload: { reason: "closed" } }, fermee.updatedAt);
      }
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
  // Les chemins du dépôt qui n'appartiennent à aucun ticket : ce que presque
  // tous touchent (la doc vivante, un changelog). Aucun par défaut.
  communs: string[];
};

// Trois fois le délai d'inactivité, la moitié du plafond de durée : un cook
// qui lit longuement avant d'écrire garde son ticket.
const BAIL_PAR_DEFAUT_S = 1800;

// Lit la configuration du rail dans l'environnement. Le dépôt n'a pas de
// défaut : le nom de projet est un identifiant court, il ne le désigne pas.
export function configRail(env: Record<string, string | undefined>): ConfigRail {
  const depot = env.BRIGADE_GITHUB_REPO;
  if (!depot) throw new ConfigInvalide("BRIGADE_GITHUB_REPO is not set");
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(depot)) {
    throw new ConfigInvalide(`BRIGADE_GITHUB_REPO invalid: “${depot}” — expected <owner>/<repo>`);
  }
  const bail = env.BRIGADE_LEASE_SECONDS || String(BAIL_PAR_DEFAUT_S);
  if (!/^[1-9][0-9]*$/.test(bail)) {
    throw new ConfigInvalide(`BRIGADE_LEASE_SECONDS invalid: “${bail}” — expected a whole number of seconds`);
  }
  const communs = [...new Set((env.BRIGADE_COMMON_PATHS ?? "").split(",").map((chemin) => chemin.trim()).filter(Boolean))];
  for (const chemin of communs) {
    const pourquoi = refusEn(chemin);
    if (pourquoi !== null) {
      throw new ConfigInvalide(`BRIGADE_COMMON_PATHS invalid: “${chemin}” ${pourquoi} — expected paths relative to its root, separated by commas`);
    }
  }
  return { depot, dureeBailMs: Number(bail) * 1000, gh: env.BRIGADE_GH_BIN || "gh", communs };
}

export type RuntimeAvecRail = Runtime & {
  rail: Rail;
  // Abonne un écouteur aux sondages qui ont changé le rail : ce que GitHub y
  // pose n'attend pas le tick suivant pour être vu. Rend de quoi le désabonner.
  surSondage(ecouter: () => void): () => void;
};

export type OptionsRail = Omit<ConfigRail, "communs"> & {
  // Par défaut, aucun.
  communs?: string[];
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

  // Le rail se relit du journal seul : ce que la configuration dit des chemins
  // communs y entre, quand elle change.
  const communs = [...(options.communs ?? [])].sort();
  if (JSON.stringify(communs) !== JSON.stringify(communsDuRail(journal.base))) {
    journal.ajouter({ project: projet, ticket: null, author: "runtime", type: "rail.commons", payload: { paths: communs } });
  }

  let arrete = false;
  let enCours = false;
  // La limite de GitHub atteinte se dit une fois, pas à chaque tick d'attente.
  let limiteDite = false;
  const echec = (quoi: string, erreur: unknown) => {
    if (arrete) return;
    if (erreur instanceof LimiteGitHubAtteinte) {
      if (!limiteDite) console.error(`brigade : ${quoi} — ${erreur.message}`);
      limiteDite = true;
      return;
    }
    console.error(`brigade : ${quoi} — ${erreur instanceof Error ? erreur.message : String(erreur)}`);
  };
  const fiches: FichesLues = new Map();
  const retraitsLus: RetraitsLus = new Map();
  const ecouteurs = new Set<() => void>();
  const sonder = async () => {
    // Un sondage plus lent que le tick n'en lance pas un second.
    if (enCours || arrete) return;
    enCours = true;
    try {
      const ecrits = await alimenter(journal, github, { projet, depot: options.depot }, fiches, retraitsLus);
      if (ecrits > 0 && !arrete) for (const ecouter of [...ecouteurs]) ecouter();
      // Un départ n'arrive que par un sondage : c'est le moment de le dire.
      if (!arrete) await signalerAttentesLevees(journal, github, projet);
      // De même, la racine d'une attente abandonnée part, puis revient, par un sondage.
      if (!arrete) await abandonnerEnChaine(journal, github, projet);
      limiteDite = false;
    } catch (erreur) {
      // `gh` en panne (réseau, connexion expirée) : le rail reste tel quel, et
      // le tick suivant réessaie. L'échec va à journald, pas au journal — une
      // ligne par minute de panne n'y raconterait rien.
      echec("sondage GitHub en échec", erreur);
    } finally {
      enCours = false;
    }
  };

  // L'issue d'un ticket mis en WAITING, ou qui en sort, le dit : le geste du
  // chef s'écrit au journal par un autre process, qui réveille celui-ci. Une
  // mise à jour à la fois ; un échec se rattrape au réveil suivant.
  let marquage = false;
  const marquer = async () => {
    if (marquage || arrete) return;
    marquage = true;
    try {
      await marquerAttentes(journal, github, projet);
    } catch (erreur) {
      echec("attentes non marquées sur GitHub", erreur);
    } finally {
      marquage = false;
    }
  };

  runtime.surReveil((cause) => {
    rail.relever();
    void marquer();
    if (cause === "tick") void sonder();
  });
  rail.relever();
  void marquer();
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

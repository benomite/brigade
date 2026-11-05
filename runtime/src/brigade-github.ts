// Un projet servi sur l'état GitHub seul (épique #2053, spec
// `docs/superpowers/specs/2026-11-02-github-only-state.md`) : le tour d'une
// station qui prend, cuisine et merge les tickets en ne lisant et n'écrivant
// que GitHub — ni relais de prise, ni boîte aux lettres, ni journal qui
// arbitre. Aucune station n'y est principale : chacune prend, chacune relit,
// chacune merge, et l'arrêt de l'une n'arrête pas les autres.
//
// C'est le seul chemin (#2061) : la cuisine d'un runtime par projet (`main.ts`)
// comme celle de chaque projet d'une station (`station/cuisine.ts`), qui est ce
// que la box fait tourner, l'ouvrent à l'ouverture. Une station qui ne peut pas
// le servir le dit, et ne cuisine rien pour le projet.
//
// Ce module enchaîne les contrats de l'épique, il ne les refait pas : l'état
// d'un ticket et de la base (`github-etat/etats.ts`, #2057), la prise
// (`github-etat/prise.ts`, #2056), la relecture et le merge
// (`github-etat/fusion.ts`, #2058). Le cook et la relecture sont ceux
// d'aujourd'hui — worktree du dépôt de la station, cloison, consignes du cook
// et du reviewer —, lancés ici sans journal.
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { calibrage as calibrageDesLabels, complet, type Calibrage } from "./calibrage.ts";
import { environnementHorsGitHub, ticketJoint } from "./bac-a-sable/hors-github.ts";
import { dansLeBacASableLocal, type BacASableLocal } from "./bac-a-sable/local.ts";
import { argumentsClaude, consigne, environnementCook, lireFlux, verdict } from "./claude.ts";
import { envelopper, type Cloison, type Lancement } from "./cloison.ts";
import type { Depot } from "./depot.ts";
import type { Plafonds } from "./events/guardrails.ts";
import { etatDuTicket, LABEL_IN_PASS, LABEL_TAKEN } from "./github-etat/etats.ts";
import { fermeReparation, type GitHubDeLaFermeture } from "./base-rouge/ferme-reparation.ts";
import { estUneReparation, ouvreReparation, type CheckDeLaBase, type GitHubDeLaReparation } from "./base-rouge/ouvre-reparation.ts";
import { lireInstantane, REQUETE, type Instantane } from "./github-etat/instantane.ts";
import { estLaPauseDeGitHub, LimiteGitHubAtteinte } from "./limite-github.ts";
import { lacher, prendre, purger } from "./github-etat/prise.ts";
import { fusionner, relire, type GitHubDeLaFusion, type Jugement, type PRAFusionner } from "./github-etat/fusion.ts";
import { HORS_CUISINE, type GitHub, type Issue, type PR } from "./github.ts";
import { relanceDeLaBase, type GitHubDeLaRelance } from "./relance-main-rouge.ts";
import type { GardesDuTour } from "./github-seul/garde-fous/garde-fous.ts";
import { environnementClaude } from "./jeton-claude.ts";
import { argumentsReviewer, consigneDeRelecture, lireRelecture } from "./reviewer.ts";
import { superviser, type Supervise } from "./superviseur.ts";
import { chronometre, enregistrerTemps } from "./temps-ticket/mesure.ts";

// Un ticket tel que le tour le lit : une issue ouverte qui porte `fire`.
export type TicketLu = Pick<Issue, "number" | "title" | "labels" | "state">;

// La prise d'un ticket (`github-etat/prise.ts`, #2056), liée à la station qui
// l'appelle et au client GitHub qui la porte. `prendre` poste sa prise si
// personne ne tient le ticket, et y pose `taken` si elle l'emporte ; `lacher`
// la retire ; `purger` retire le `taken` que personne ne tient plus (facultatif :
// une prise sans `purger` ne purge pas).
export type Prise = {
  prendre(issue: Pick<Issue, "number" | "labels">): Promise<{ prise: boolean }>;
  lacher(issue: Pick<Issue, "number" | "labels">): Promise<boolean>;
  purger?(issue: Pick<Issue, "number" | "labels">): Promise<boolean>;
};

// La prise de #2056, liée à la station et au client du tour.
export const priseDeLaStation = (github: GitHubDuTour, station: string): Prise => ({
  prendre: (issue) => prendre(issue, { github, station }),
  lacher: (issue) => lacher(issue, { github, station }),
  purger: (issue) => purger(issue, { github }),
});

// Ce que le tour lit et écrit de GitHub : ce que demandent la relecture et le
// merge, plus les tickets, la PR d'un ticket, les checks de la base, les
// labels et l'ouverture d'une PR.
export type GitHubDuTour = GitHubDeLaFusion &
  Pick<GitHub, "labelliser" | "delabelliser" | "ouvrirPR"> &
  GitHubDeLaReparation &
  GitHubDeLaFermeture & {
    // Les retraits de labels de l'issue, que la prise lit pour le lâcher du chef.
    retraitsDeLabels(numero: number): Promise<{ label: string; createdAt: string }[]>;
    // Les issues ouvertes qui portent `fire`, dans l'ordre où les servir.
    fires(): Promise<TicketLu[]>;
    // Les issues dont le ticket dépend (`Depends on #N` dans son corps) et qui
    // sont encore ouvertes : tant qu'il y en a, le ticket n'est pas à prendre.
    dependancesOuvertes(issue: number): Promise<number[]>;
    // La PR qui livre le ticket, ou null. `version` change avec tout ce que
    // GitHub change à la PR.
    prDuTicket(issue: number): Promise<(PRAFusionner & Pick<PR, "version">) | null>;
    // Les checks du dernier commit de la branche d'intégration.
    checksDeLaBase(): Promise<CheckDeLaBase[]>;
    // Le corps de l'issue, où le ticket dit sa zone.
    corpsDuTicket(issue: number): Promise<string>;
    // Les PR ouvertes : la branche dont chacune est la tête, et les fichiers qu'elle change.
    prsOuvertes(): Promise<{ branche: string; fichiers: string[] }[]>;
  } & GitHubDeLaRelance;

const normalise = (texte: string) => texte.replace(/^\.\//, "").replace(/\/+$/, "");

// La zone d'un ticket : les chemins de sa section `Zone` (un titre markdown),
// séparés par des virgules ou des lignes, avec ou sans puce et accents graves.
// Sans section, ou vide, le ticket n'a pas de zone.
export function zoneDuCorps(corps: string): string[] {
  const lignes = corps.split(/\r?\n/);
  const debut = lignes.findIndex((ligne) => /^#{1,6}\s*zone\s*:?\s*$/i.test(ligne.trim()));
  if (debut === -1) return [];
  const fin = lignes.findIndex((ligne, rang) => rang > debut && /^#{1,6}\s/.test(ligne.trim()));
  return lignes
    .slice(debut + 1, fin === -1 ? undefined : fin)
    .flatMap((ligne) => ligne.replace(/^\s*[-*+]\s+/, "").split(","))
    .map((morceau) => normalise(morceau.trim().replace(/^`+|`+$/g, "").trim()))
    .filter((morceau) => morceau !== "" && !/\s/.test(morceau));
}

// Deux chemins se recoupent s'ils sont égaux, ou si l'un contient l'autre.
export const secoupent = (a: string, b: string): boolean => {
  const [x, y] = [normalise(a), normalise(b)];
  return x === y || y.startsWith(`${x}/`) || x.startsWith(`${y}/`);
};

// Le cook d'un ticket pris : la branche qu'il a poussée, ou pourquoi il n'a
// rien livré — et ce que ses tests et ses gates ont pris, en millisecondes,
// quand un cuisinier sait le dire (`temps-ticket/`) : celui de la station ne
// le sait pas, aucun lanceur ne mesure les gates de ses cooks.
export type Cuisiner = (ticket: TicketLu, calibrage: Calibrage) => Promise<({ branche: string } | { echec: string }) & { testsMs?: number }>;
// La relecture de la PR d'un ticket, par la station qui passe.
export type Juger = (ticket: TicketLu, pr: PRAFusionner) => Promise<Jugement>;

// La branche du cook d'un ticket : la même sur toutes les stations, pour que
// chacune retrouve sa PR.
export const runDuTicket = (issue: number) => `${issue}-github`;
export const brancheDuTicket = (issue: number) => `cook/${runDuTicket(issue)}`;

export type OptionsDeStation = {
  // Le nom de la station : celui de ses prises et de ses verdicts.
  nom: string;
  // Combien de cooks elle tient à la fois.
  places: number;
  // La branche d'intégration, que visent ses PR.
  base: string;
  github: GitHubDuTour;
  prise: Prise;
  cuisiner: Cuisiner;
  juger: Juger;
  // Ce que la station fournit (#2187) : un ticket qui demande une capacité
  // qu'elle n'a pas, par un label `needs:<capacité>`, n'est jamais pris ici.
  capacites?: readonly string[];
  // Les garde-fous (#2213) : le « stop », le disjoncteur, le quota et
  // l'arbitre, lus avant chaque prise. Absents, rien ne retient.
  gardes?: Pick<GardesDuTour, "retenue" | "redire" | "quitter">;
  // Où va ce qui rate sans arrêter le tour.
  avertir?: (message: string) => void;
  // Le clone du projet : le temps de chaque ticket que la station merge
  // s'ajoute à son `.claude/brigade/temps-tickets.json` (#2342). Absent, rien
  // ne s'écrit.
  clone?: string;
  // L'horloge des phases de ces temps. Par défaut, la vraie.
  maintenant?: () => Date;
};

// Le préfixe du label par lequel un ticket demande une capacité.
export const PREFIXE_BESOIN = "needs:";

// Les capacités qu'un ticket demande, lues de ses seuls labels.
export const besoinsDuTicket = (labels: readonly string[]): string[] => labels.filter((label) => label.startsWith(PREFIXE_BESOIN)).map((label) => label.slice(PREFIXE_BESOIN.length));

export type StationGitHub = {
  // Un tour : relit et merge ce qui est en pass, puis prend ce que ses places
  // libres permettent et lance leurs cooks, sans les attendre.
  tour(): Promise<void>;
  // Les tickets que ses cooks cuisinent.
  enCuisine(): number[];
  // Attend que ses cooks en vol aient fini.
  calme(): Promise<void>;
  // Attend les relectures et les merges en cours, hors du tour (#2329).
  relu(): Promise<void>;
  // Le tour ne reprendra pas : ce qu'il tient chez l'arbitre est rendu.
  quitter?(): Promise<void>;
  // Posé par la boucle : le pass a bougé (#2333). Les `TOURS_PRESSES` tours
  // suivants viennent à `ATTENTE_PRESSEE_MS` au plus l'un de l'autre, le premier
  // tout de suite si `maintenant` (une livraison à relire).
  presser?: (maintenant?: boolean) => void;
};

// Les issues dont un corps dit dépendre : les numéros d'une ligne `Depends on
// #N` (un ou plusieurs, séparés par une virgule, `and` ou `&`).
export function dependancesDuCorps(corps: string): number[] {
  const numeros = new Set<number>();
  for (const [, liste = ""] of corps.matchAll(/^[ \t>*-]*Depends on[ \t]+(#\d+(?:[ \t]*(?:,|and|&)?[ \t]*#\d+)*)/gim)) {
    for (const [, numero] of liste.matchAll(/#(\d+)/g)) numeros.add(Number(numero));
  }
  return [...numeros];
}

// Après une livraison, un verdict ou une fusion tentée (mergée, branche mise à
// jour, CI qui tourne encore), la station tourne de nouveau dans les 30 s,
// quelques fois, puis reprend son intervalle (#2333). Un tour coûte 2 points
// GraphQL : seul un fait neuf presse, jamais un tour où rien n'a bougé.
export const TOURS_PRESSES = 4;
export const ATTENTE_PRESSEE_MS = 30_000;

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

// Ce qui juge une livraison : une PR qui y touche attend le chef (`pass.ts`).
const JUGES = [".claude/brigade/", ".github/workflows/"];
// Le label d'un ticket qui attend un geste du chef.
export const A_LA_MAIN = "blocked-on-human";

// Le rang d'un ticket dans l'ordre de service : le plus petit `prio:N` qu'il porte.
const rangDePriorite = (ticket: Pick<TicketLu, "labels">): number =>
  Math.min(Number.POSITIVE_INFINITY, ...ticket.labels.map((label) => /^prio:(\d+)$/.exec(label)?.[1]).filter((n) => n !== undefined).map(Number));

// Combien de cooks sans livraison, pour un même ticket, avant qu'il sorte de la cuisine.
export const ECHECS_MAX = 3;
const MARQUE_D_ECHEC = "<!-- brigade:echec";

// Combien de fois une livraison repart au cook avant de sortir de la cuisine.
export const RENVOIS_MAX = 2;

// Au plus cinq livraisons en pass : tant que le projet en compte autant, aucune
// station sur l'état GitHub seul ne prend de ticket neuf (#2300). Le pass se
// vide moins vite que les cooks livrent ; l'amas s'y relit à chaque tour et s'y
// met en conflit à chaque merge.
export const PASS_MAX = 5;

// Les tickets en pass : ceux qui portent `in-pass`, hors ceux que ce tour vient
// de renvoyer à un cook — la liste lue peut porter encore leur label.
export const enPass = (tickets: readonly Pick<TicketLu, "number" | "labels">[], renvoyes: ReadonlySet<number> = new Set()): number =>
  tickets.filter((ticket) => ticket.labels.includes(LABEL_IN_PASS) && !renvoyes.has(ticket.number)).length;
const MARQUE_DE_RENVOI = "<!-- brigade:renvoi";

// Les commentaires de `marque` qui comptent pour le ticket : ceux d'après le
// dernier retrait de `hors-cuisine`, que GitHub date pour toutes les stations
// (#2430). Relancer un ticket remet à zéro ses renvois et ses cooks sans
// livraison. Des retraits illisibles ne remettent rien à zéro.
const depuisLeRelancement = async (github: Pick<GitHubDuTour, "retraitsDeLabels">, numero: number, commentaires: { body: string; createdAt: string }[], marque: string) => {
  const retraits = await github.retraitsDeLabels(numero).catch(() => []);
  const relance = Math.max(0, ...retraits.filter((r) => r.label === HORS_CUISINE).map((r) => Date.parse(r.createdAt)).filter((t) => !Number.isNaN(t)));
  return commentaires.filter((c) => c.body.startsWith(marque) && !(Date.parse(c.createdAt) <= relance));
};

// Le motif d'un verdict, sous son marqueur et sa ligne « Changes requested ».
const motifDuVerdict = (commentaires: { id: number; body: string }[], id: number) => commentaires.find((c) => c.id === id)?.body.split("\n").slice(2).join("\n").trim() || "see the PR";

export function stationGitHub(options: OptionsDeStation): StationGitHub {
  const { nom, places, base, github, prise, cuisiner, juger, gardes } = options;
  const avertir = options.avertir ?? ((texte: string) => console.error(texte));
  const capacites = new Set(options.capacites ?? []);
  const enVol = new Map<number, Promise<void>>();
  const ouvrirLaReparation = ouvreReparation({ github, base });
  // Le parcours de chaque ticket, de sa prise à son merge, phase par phase (#2342).
  const chrono = chronometre(options.maintenant);
  const servir = (issue: number) => {
    const temps = chrono.servir(issue);
    if (temps === null || options.clone === undefined) return;
    try {
      enregistrerTemps(options.clone, temps);
    } catch (erreur) {
      avertir(`brigade : the time of #${issue} could not be recorded on ${nom} — ${message(erreur)}`);
    }
  };
  const fermerLaReparation = fermeReparation({ github, base });
  // Les tickets que la station tient sans cook (#2179) : celui d'un cook qui a
  // levé — GitHub qui limite ses appels, par exemple —, ou la prise qu'un
  // runtime arrêté a laissée. Chacun garde sa place jusqu'à ce qu'un tour le
  // rende sur l'issue : un échec ne libère jamais une place pour un autre.
  const aRendre = new Map<number, TicketLu>();
  let premierTour = true;
  // Les PR dont la fusion n'a pas abouti — GitHub a refusé le merge, ou la
  // mise à jour de la branche est demandée —, et ce qu'elles étaient alors :
  // leur tête, leur version et la base. Elle ne se retente qu'une fois l'une
  // d'elles changée (#2198) : une PR approuvée dont la CI tourne encore ne
  // coûte pas un merge refusé à chaque tour.
  const tentees = new Map<number, string>();
  // Les PR dont la CI était attendue, et ce qu'elles étaient alors : une CI
  // qui tourne presse les tours une fois par tête, pas à chaque tour (#2333).
  const attendues = new Map<number, string>();
  // Les livraisons que la station relit et merge en ce moment, hors du tour (#2329).
  const enRelecture = new Map<number, Promise<void>>();
  // Un merge à la fois : chaque merge attend le précédent.
  let serie: Promise<unknown> = Promise.resolve();
  const enSerie = <T>(faire: () => Promise<T>): Promise<T> => {
    const suite = serie.then(faire, faire);
    serie = suite.catch(() => undefined);
    return suite;
  };

  // Le cook d'un ticket pris, jusqu'à sa livraison en pass ; sans livraison,
  // le ticket est rendu sur l'issue, et pourquoi s'y dit.
  const cuire = async (ticket: TicketLu, calibrage: Calibrage) => {
    const issue = ticket.number;
    try {
      const fait = await cuisiner(ticket, calibrage);
      if (fait.testsMs !== undefined) chrono.tests(issue, fait.testsMs);
      if ("branche" in fait) {
        chrono.marquer(issue, "attentePasse");
        // Un renvoi pousse sur la branche d'une PR encore ouverte : elle porte
        // déjà la livraison, il n'en faut pas une seconde.
        const ouverte = await github.prDuTicket(issue);
        if (ouverte === null || ouverte.state !== "open") await github.ouvrirPR({ branche: fait.branche, base, titre: `#${issue} — ${ticket.title}`, corps: `Closes #${issue}\n\nCooked by station \`${nom}\`.` });
        // `in-pass` avant le retrait de `taken` : entre les deux, aucune
        // station ne lit le ticket libre.
        await github.labelliser(issue, [LABEL_IN_PASS]);
        await github.delabelliser(issue, LABEL_TAKEN);
        // Livrée : sa relecture part tout de suite, pas au prochain tour (#2333).
        station.presser?.(true);
        return;
      }
      // Le même ticket qui rate cook après cook ne repart pas sans fin : à
      // `ECHECS_MAX` cooks sans livraison, il sort de la cuisine (#2209).
      // Illisibles, ses commentaires ne retiennent pas le rendu : l'échec compte pour un.
      // Compté depuis le dernier retrait de `hors-cuisine` (#2430).
      const echecs = (await depuisLeRelancement(github, issue, await github.commentaires(issue).catch(() => []), MARQUE_D_ECHEC)).length + 1;
      await github.commenter(issue, `${MARQUE_D_ECHEC} n=${echecs} -->\nStation \`${nom}\`: the cook stopped without a delivery — ${fait.echec}${echecs >= ECHECS_MAX ? `\n\nTaken off the kitchen (\`${HORS_CUISINE}\`) after ${echecs} cooks without a delivery: a human decides.` : ""}`);
      if (echecs >= ECHECS_MAX) {
        chrono.oublier(issue);
        await github.labelliser(issue, [HORS_CUISINE]);
      }
      await prise.lacher({ number: issue, labels: [...ticket.labels, LABEL_TAKEN] });
    } catch (erreur) {
      avertir(`brigade : #${issue} sur ${nom} — ${message(erreur)}`);
      aRendre.set(issue, ticket);
    } finally {
      enVol.delete(issue);
    }
  };

  // Renvoie au cook une livraison rouge ou refusée : la raison s'écrit sur
  // l'issue, que le cook lit, et `in-pass` tombe — le ticket redevient libre, et
  // la station qui le prend reprend sa branche, sous sa PR. Au-delà de
  // `RENVOIS_MAX`, il sort de la cuisine (`hors-cuisine`) : un humain décide.
  // Un ticket renvoyé sort du pass dans le tour même : il ne compte plus pour le plafond.
  const renvoyes = new Set<number>();
  const renvoyer = async (ticket: TicketLu, sha: string, raison: string) => {
    const tous = (await github.commentaires(ticket.number)).filter((c) => c.body.startsWith(MARQUE_DE_RENVOI));
    // Compté depuis le dernier retrait de `hors-cuisine` (#2430).
    const renvois = await depuisLeRelancement(github, ticket.number, tous, MARQUE_DE_RENVOI);
    // Une tête déjà renvoyée ne l'est pas deux fois : la liste des tickets lue
    // sous ETag peut porter encore `in-pass` un tour de plus (#2189, 23:07).
    // Mais il doit quitter le pass : si le retrait de \`in-pass\` avait échoué
    // (GitHub qui limite ses appels), il se refait, sans second commentaire (#2319).
    if (tous.some((c) => c.body.includes(` sha=${sha} `))) {
      if (ticket.labels.includes(LABEL_IN_PASS)) await github.delabelliser(ticket.number, LABEL_IN_PASS);
      return;
    }
    const deja = renvois.length;
    if (deja >= RENVOIS_MAX) {
      await github.commenter(ticket.number, `${MARQUE_DE_RENVOI} n=${deja + 1} sha=${sha} -->\nStation \`${nom}\`: still not mergeable after ${deja} sends back — ${raison}\n\nTaken off the kitchen (\`${HORS_CUISINE}\`): a human decides.`);
      await github.labelliser(ticket.number, [HORS_CUISINE]);
      chrono.oublier(ticket.number);
    } else {
      await github.commenter(ticket.number, `${MARQUE_DE_RENVOI} n=${deja + 1} sha=${sha} -->\nStation \`${nom}\`: sent back to a cook (${deja + 1}/${RENVOIS_MAX}) — ${raison}`);
    }
    await github.delabelliser(ticket.number, LABEL_IN_PASS);
    renvoyes.add(ticket.number);
    // De retour en cuisine : le temps jusqu'au cook suivant est de la cuisson.
    if (deja < RENVOIS_MAX) chrono.marquer(ticket.number, "cuisson");
  };

  // Une base rouge relance d'abord ses jobs en échec, une fois (#2323).
  const relancerLaBase = relanceDeLaBase(github, avertir, nom);

  const tour = async () => {
    renvoyes.clear();
    const checksDeLaBase = await relancerLaBase(await github.checksDeLaBase());
    // Rouge après sa relance, la base a son ticket de réparation : un seul par commit (#2339).
    const { erreur } = await ouvrirLaReparation(checksDeLaBase);
    if (erreur !== undefined) avertir(`brigade : ${base} is red but its repair ticket could not be opened on ${nom} — ${erreur}`);
    const lus = await github.fires();
    // Verte, ses tickets de réparation encore ouverts se ferment (#2340) ; un échec attend le tour suivant.
    await fermerLaReparation(checksDeLaBase, lus).catch((echec) => avertir(`brigade : ${base} is green but its repair ticket could not be closed on ${nom} — ${echec instanceof Error ? echec.message : String(echec)}`));
    const tickets = lus.filter((ticket) => !ticket.labels.includes(HORS_CUISINE));
    const libres: TicketLu[] = [];
    // Les PR ouvertes, lues au premier besoin, une fois par tour.
    let ouvertes: Awaited<ReturnType<GitHubDuTour["prsOuvertes"]>> | null = null;
    for (const ticket of tickets) {
      const enPass = ticket.labels.includes(LABEL_IN_PASS);
      const pr = enPass ? await github.prDuTicket(ticket.number) : null;
      // La base ne gèle pas tout le pass : elle ne retient une livraison que
      // rouge sur un check que cette livraison doit elle-même passer (#2279).
      const etat = etatDuTicket({ state: ticket.state, labels: ticket.labels, pr }, null);
      // N'importe quelle station relit et merge : GitHub refuse un merge sur
      // une base qui a bougé, et le second de deux merges.
      if (etat === "pass" && pr !== null && pr.enConflit === true) {
        // En conflit avec la base : ni la mise à jour ni le merge ne passent, et
        // rien d'autre ne la débloque. Elle repart à un cook, qui la remet sur la
        // base (#2209).
        try {
          await renvoyer(ticket, pr.sha, "the PR conflicts with the base: merge the base into the branch, resolve the conflicts, run the gates, and commit");
        } catch (erreur) {
          avertir(`brigade : pass de #${ticket.number} sur ${nom} — ${message(erreur)}`);
        }
        continue;
      }
      if (etat === "pass" && pr !== null) {
        // Une livraison qui touche à ce qui la juge (gates, CI, réglages) ne se
        // merge pas sur le seul verdict du reviewer : un cook pourrait s'y rendre
        // vert seul. Elle attend le chef (#2209).
        ouvertes ??= await github.prsOuvertes();
        const sienne = ouvertes.find((ouverte) => ouverte.branche === brancheDuTicket(ticket.number));
        const juges = sienne?.fichiers.filter((fichier) => JUGES.some((juge) => fichier.startsWith(juge))) ?? [];
        if (juges.length > 0) {
          if (!ticket.labels.includes(A_LA_MAIN)) {
            await github.commenter(ticket.number, `Station \`${nom}\`: this delivery changes what judges it (${juges.map((f) => `\`${f}\``).join(", ")}), so it is not merged on the review alone. Review it and merge it by hand: PR #${pr.number}.`);
            await github.labelliser(ticket.number, [A_LA_MAIN]);
          }
          continue;
        }
        // Un workflow qui ne tourne que sur la base (les tests Windows) n'a pas
        // de check sur la PR : rouge, il ne la retient pas.
        // La seule exception est la réparation de la base elle-même : elle doit la
        // débloquer, et sa CI, sur sa tête, reste exigée par `fusionner`.
        const siens = new Set((await github.ci(pr.sha)).map((check) => check.name));
        if (checksDeLaBase.some((check) => check.outcome === "red" && check.name !== undefined && siens.has(check.name)) && !estUneReparation(await github.corpsDuTicket(ticket.number), ticket.labels)) continue;
        // La relecture tourne hors du tour, comme un cook (#2329) : un `claude`
        // de plusieurs minutes ne retient plus les merges, les autres relectures
        // ni les prises. Les merges, eux, passent un à un.
        if (enRelecture.has(ticket.number) || enRelecture.size >= PASS_MAX) continue;
        const relireEtFusionner = async () => {
        // Le pass a bougé : un verdict neuf, un merge, une mise à jour, un refus,
        // un renvoi, ou une CI attendue sur une tête neuve (#2333).
        let bouge = false;
        try {
          const rendu = await relire(pr, {
            github,
            station: nom,
            juger: async (lue) => {
              chrono.marquer(ticket.number, "revue");
              const jugement = await juger(ticket, lue);
              chrono.marquer(ticket.number, "ci");
              bouge = true;
              return jugement;
            },
          });
          const tentee = JSON.stringify([pr.sha, pr.version ?? null, checksDeLaBase]);
          if (tentees.get(pr.number) !== tentee) {
            // Le merge demandé à GitHub ouvre sa phase ; mergée, le temps du ticket s'écrit.
            const fusion = await enSerie(() =>
              fusionner(pr, {
                commentaires: (numero) => github.commentaires(numero),
                commenter: (numero, corps) => github.commenter(numero, corps),
                mettreAJour: (numero, sha) => github.mettreAJour(numero, sha),
                ci: (sha) => github.ci(sha),
                merger: (numero, sha) => {
                  chrono.marquer(ticket.number, "merge");
                  return github.merger(numero, sha);
                },
              }),
            );
            if (fusion.issue === "ci-attendue" || fusion.issue === "mise-a-jour") chrono.marquer(ticket.number, "ci");
            if (fusion.issue === "mergee") servir(ticket.number);
            if (fusion.issue === "ci-attendue") {
              if (attendues.get(pr.number) !== tentee) bouge = true;
              attendues.set(pr.number, tentee);
            } else {
              attendues.delete(pr.number);
              if (fusion.issue !== "non-approuvee" && fusion.issue !== "close") bouge = true;
            }
            if (fusion.issue === "refusee" || fusion.issue === "mise-a-jour") tentees.set(pr.number, tentee);
            else tentees.delete(pr.number);
            if (fusion.issue === "refusee") avertir(`brigade : merge of #${ticket.number} on ${nom} refused by GitHub — ${fusion.motif}; retried once its PR or the base changes`);
            // Rouge : la livraison repart à un cook, avec pourquoi (#2209).
            if (fusion.issue === "ci-rouge") await renvoyer(ticket, pr.sha, `the CI is red on \`${pr.sha.slice(0, 7)}\`: ${(await github.ci(pr.sha)).filter((c) => c.outcome === "red").map((c) => c.name).join(", ")}`);
          }
          // Refusée par la relecture sur sa tête : elle repart aussi (#2209).
          if (rendu !== null && rendu.verdict !== "approve" && rendu.sha === pr.sha) await renvoyer(ticket, pr.sha, `the review requested changes: ${motifDuVerdict(await github.commentaires(pr.number), rendu.commentaire)}`);
        } catch (erreur) {
          avertir(`brigade : pass de #${ticket.number} sur ${nom} — ${message(erreur)}`);
        } finally {
          enRelecture.delete(ticket.number);
          if (bouge) station.presser?.();
        }
        };
        enRelecture.set(ticket.number, relireEtFusionner());
      }
      // Libre : aucun état, et aucun label d'état — un `in-pass` dont la PR
      // vient d'être mergée n'est pas à reprendre.
      if (etat === null && !enPass && !ticket.labels.includes(LABEL_TAKEN)) libres.push(ticket);
      // Au premier tour, un `taken` sans cook ici est peut-être une prise
      // qu'un runtime d'avant a laissée : `lacher` ne rend que si c'est la sienne.
      if (premierTour && ticket.labels.includes(LABEL_TAKEN) && !enPass && !enVol.has(ticket.number)) aRendre.set(ticket.number, ticket);
      // À chaque tour, un `taken` que personne ne tient — le retrait d'un
      // lâcher a échoué, ici ou sur une autre station — perd son label : le
      // ticket redevient libre au tour suivant. Un ticket en pass, en vol ici
      // ou déjà à rendre n'est pas un orphelin.
      if (ticket.labels.includes(LABEL_TAKEN) && !enPass && !enVol.has(ticket.number) && !aRendre.has(ticket.number)) {
        try {
          await prise.purger?.(ticket);
        } catch (erreur) {
          avertir(`brigade : purge du \`taken\` de #${ticket.number} sur ${nom} — ${message(erreur)}`);
        }
      }
    }
    premierTour = false;
    for (const [numero, ticket] of aRendre) {
      try {
        await prise.lacher({ number: numero, labels: [...new Set([...ticket.labels, LABEL_TAKEN])] });
        aRendre.delete(numero);
      } catch (erreur) {
        // GitHub refuse encore : le ticket garde sa place, le tour suivant réessaie.
        avertir(`brigade : rendre #${numero} sur ${nom} — ${message(erreur)}`);
        break;
      }
    }
    // Une zone tenue : un de ses chemins en recoupe un que change une PR
    // ouverte qui n'est pas celle du ticket.
    const tenue = async (ticket: TicketLu): Promise<boolean> => {
      const zone = zoneDuCorps(await github.corpsDuTicket(ticket.number));
      if (zone.length === 0) return false;
      ouvertes ??= await github.prsOuvertes();
      const propre = brancheDuTicket(ticket.number);
      return ouvertes.some((pr) => pr.branche !== propre && pr.fichiers.some((fichier) => zone.some((entree) => secoupent(entree, fichier))));
    };
    // Les plus prioritaires d'abord (`prio:0` avant `prio:1`…, sans `prio:` en
    // dernier), puis les plus anciens (#2209).
    libres.sort((x, y) => rangDePriorite(x) - rangDePriorite(y) || x.number - y.number);
    for (const ticket of libres) {
      if (enVol.size + aRendre.size >= places) break;
      // Le pass est plein : aucun ticket neuf ne se prend avant qu'il ne redescende.
      if (enPass(tickets, renvoyes) >= PASS_MAX) break;
      if (enVol.has(ticket.number)) continue;
      // Une capacité qui manque à la station : le ticket attend celle qui l'a.
      if (besoinsDuTicket(ticket.labels).some((besoin) => !capacites.has(besoin))) continue;
      // Un ticket sans calibrage complet ne part pas.
      const calibrage = calibrageDesLabels(ticket.labels);
      if (!complet(calibrage)) continue;
      // Une dépendance ouverte retient le ticket ; sans lecture de GitHub, il attend aussi.
      try {
        if ((await github.dependancesOuvertes(ticket.number)).length > 0) continue;
      } catch (erreur) {
        avertir(`brigade : dépendances de #${ticket.number} sur ${nom} — ${message(erreur)}`);
        continue;
      }
      // Sa zone est tenue par une PR ouverte : il attend qu'elle soit mergée ou fermée.
      if (await tenue(ticket)) continue;
      // Un garde-fou retient la cuisine : ni ce ticket ni un autre ne se prend.
      if (gardes !== undefined && (await gardes.retenue(enVol.size)) !== null) break;
      let pris: { prise: boolean };
      try {
        pris = await prise.prendre(ticket);
      } catch (erreur) {
        // La prise a pu partir avant le refus : le ticket est à rendre, et le tour s'arrête là.
        aRendre.set(ticket.number, ticket);
        throw erreur;
      }
      if (!pris.prise) continue;
      chrono.prendre(ticket.number);
      enVol.set(ticket.number, cuire(ticket, calibrage));
    }
    await gardes?.redire(enVol.size);
  };

  const station: StationGitHub = {
    tour,
    enCuisine: () => [...enVol.keys()],
    relu: async () => {
      while (enRelecture.size > 0) await Promise.all(enRelecture.values());
    },
    calme: async () => {
      while (enVol.size > 0 || enRelecture.size > 0) await Promise.all([...enVol.values(), ...enRelecture.values()]);
    },
    quitter: async () => {
      await gardes?.quitter();
    },
  };
  return station;
}

export type OptionsDuProjet = {
  // La station GitHub seul, ou pourquoi elle ne peut pas tourner ici.
  station: () => StationGitHub | { refus: string };
  // Entre deux tours. Par défaut, deux minutes.
  intervalleMs?: number;
  // Avant le premier tour (#2436) : la station décale ses projets, pour ne pas
  // tous les lire à son démarrage. Par défaut, aucun délai.
  premierTourMs?: number;
  avertir?: (message: string) => void;
  // Ce que le runtime a décidé, pour qu'il se lise ailleurs que dans son log (`github-seul-etat.ts`).
  noter?: (decision: { etat: "accepted" } | { etat: "refused"; reason: string }) => void;
};

// Un projet ouvert : ses cooks, et son arrêt. `refus` : la station ne peut pas
// le servir, et ne cuisine rien pour lui.
export type ProjetOuvert = { arreter(): Promise<void>; enCuisine(): number[]; refus?: string };

// Ouvre le projet : un tour de la station, puis un autre l'intervalle passé,
// jusqu'à l'arrêt.
export function brancherBrigadeGithub(options: OptionsDuProjet): ProjetOuvert {
  const avertir = options.avertir ?? ((texte: string) => console.error(texte));
  const station = options.station();
  if ("refus" in station) {
    options.noter?.({ etat: "refused", reason: station.refus });
    avertir(`brigade : this runtime cannot serve the project on GitHub-only state — ${station.refus}; it cooks nothing for it`);
    return { refus: station.refus, arreter: async () => {}, enCuisine: () => [] };
  }
  options.noter?.({ etat: "accepted" });
  avertir("brigade : GitHub-only state — this station takes, cooks, reviews and merges the project's tickets from GitHub only");
  const intervalleMs = options.intervalleMs ?? 120_000;
  let arrete = false;
  let minuterie: NodeJS.Timeout | undefined;
  let enCours: Promise<void> = Promise.resolve();
  const presseeMs = Math.min(ATTENTE_PRESSEE_MS, intervalleMs);
  let enTour = false;
  // Quand vient le prochain tour programmé.
  let echeance = 0;
  // Les tours pressés qui restent (#2333), et le délai qu'un fait du pass a
  // demandé pendant un tour : il vaut pour le tour d'après.
  let presses = 0;
  let demande: number | undefined;
  const programmer = (delai: number) => {
    clearTimeout(minuterie);
    echeance = Date.now() + delai;
    minuterie = setTimeout(tourner, delai);
  };
  const tourner = () => {
    enTour = true;
    enCours = (async () => {
      try {
        await station.tour();
      } catch (erreur) {
        // La pause de GitHub est dite une fois au journal, pas à chaque tour (#2436).
        if (!estLaPauseDeGitHub(erreur)) avertir(`brigade : tour GitHub seul — ${message(erreur)}`);
      }
      enTour = false;
      const delai = demande === 0 ? 0 : presses > 0 ? presseeMs : intervalleMs;
      if (presses > 0) presses -= 1;
      demande = undefined;
      if (!arrete) programmer(delai);
    })();
  };
  // Un fait du pass rapproche les tours suivants, sans attendre l'intervalle
  // (#2333) ; un pass où rien ne bouge garde l'intervalle et son coût.
  station.presser = (maintenant = false) => {
    if (arrete) return;
    const delai = maintenant ? 0 : presseeMs;
    if (enTour) {
      presses = TOURS_PRESSES;
      demande = Math.min(demande ?? delai, delai);
      return;
    }
    // Le tour programmé est le premier des tours pressés.
    presses = TOURS_PRESSES - 1;
    if (echeance - Date.now() > delai) programmer(delai);
  };
  if ((options.premierTourMs ?? 0) > 0) programmer(options.premierTourMs as number);
  else tourner();
  return {
    // Les tickets que ses cooks cuisinent : ce qu'une mise à jour attend (#2189).
    enCuisine: () => station.enCuisine(),
    arreter: async () => {
      arrete = true;
      clearTimeout(minuterie);
      await enCours;
      await station.quitter?.();
    },
  };
}

// Le client du tour, sur le client GitHub du runtime (`github.ts`).
export function clientDuTour(github: GitHub, base: string, depotGitHub?: string): GitHubDuTour {
  const { mettreAJour } = github;
  const { retraitsDeLabels } = github;
  const { prsOuvertes } = github;
  if (mettreAJour === undefined) throw new Error("this GitHub client cannot update a branch");
  if (prsOuvertes === undefined) throw new Error("this GitHub client cannot list the files of the open PRs");
  const { teteDeLaBase } = github;
  if (retraitsDeLabels === undefined) throw new Error("this GitHub client cannot read the label removals of an issue");
  // Le dernier sondage lu : rendu tel quel quand GitHub dit que rien n'a changé.
  let derniers: TicketLu[] = [];
  // L'état du tour en une requête GraphQL (#2301), lu par `checksDeLaBase`, ce
  // que le tour lit en premier : ses tickets, ses PR, leur CI et la base en
  // sortent, sans un appel REST de plus. Sans GraphQL, le REST d'avant.
  const [proprietaire, nomDuDepot] = (depotGitHub ?? "").split("/");
  const { lireGraphql } = github;
  const parGraphql = lireGraphql !== undefined && proprietaire && nomDuDepot ? lireGraphql.bind(github) : null;
  let instantane: Instantane | null = null;
  const prDeLInstantane = (issue: number) => instantane?.prs.find((pr) => pr.branche === brancheDuTicket(issue));
  return {
    checksDeLaBase: async () => {
      if (parGraphql === null) return github.ci(base);
      try {
        instantane = lireInstantane(await parGraphql(REQUETE, { owner: proprietaire as string, repo: nomDuDepot as string, base: `refs/heads/${base}` }));
        return instantane.baseIncomplete ? github.ci(base) : instantane.base;
      } catch (erreur) {
        // GitHub qui limite ses appels se dit comme avant ; toute autre panne de
        // la lecture GraphQL laisse ce tour au REST, sans arrêter la cuisine.
        instantane = null;
        if (erreur instanceof LimiteGitHubAtteinte) throw erreur;
        return github.ci(base);
      }
    },
    fires: async () => {
      if (instantane !== null && !instantane.incomplet) return instantane.tickets;
      const sonde = await github.tickets();
      if (sonde.inchange) return derniers;
      derniers = sonde.issues.filter((issue) => !issue.pr);
      sonde.confirmer();
      return derniers;
    },
    dependancesOuvertes: async (numero) => {
      const dependances = dependancesDuCorps((await github.issue(numero))?.body ?? "").filter((dependance) => dependance !== numero);
      const etats = await Promise.all(dependances.map(async (dependance) => (await github.issue(dependance))?.state));
      return dependances.filter((_, rang) => etats[rang] === "open");
    },
    // Une PR ouverte se lit dans l'instantané ; une PR mergée ou fermée n'y est
    // pas, et se lit en REST — ce qui n'arrive qu'une fois par ticket.
    prDuTicket: async (issue) => {
      const lue = prDeLInstantane(issue);
      if (lue === undefined) return github.prDeBranche(brancheDuTicket(issue));
      return { number: lue.number, url: "", base, sha: lue.sha, state: "open", merged: false, enRetard: lue.enRetard, ...(lue.enConflit ? { enConflit: true } : {}), mergeePar: null, version: lue.version };
    },
    // Lue seulement quand la base est rouge : sans elle, le ticket de réparation
    // ne s'ouvre pas et le tour le dit.
    teteDeLaBase: async () => {
      if (teteDeLaBase === undefined) throw new Error("this GitHub client cannot read the head of the integration branch");
      return teteDeLaBase.call(github, base);
    },
    issuesDepuis: (instant) => github.issuesDepuis(instant),
    creerIssue: (issue) => github.creerIssue(issue),
    fermerIssue: (numero) => github.fermerIssue(numero),
    journalDuCheck: (check) => github.journalDuCheck(check),
    ci: async (sha) => {
      const lue = instantane?.prs.find((pr) => pr.sha === sha);
      return lue === undefined || lue.ciIncomplete ? github.ci(sha) : lue.ci;
    },
    corpsDuTicket: async (issue) => (await github.issue(issue))?.body ?? "",
    // Des PR ou des fichiers que la requête a tronqués ou mal rendus (un renommage
    // perd son ancien chemin) : tout se relit en REST, pour ne rien juger de moins.
    prsOuvertes: async () => (instantane !== null && !instantane.prsTronquees && !instantane.prs.some((pr) => pr.fichiersIncomplets) ? instantane.prs.map(({ branche, fichiers }) => ({ branche, fichiers })) : (await prsOuvertes.call(github)).map(({ branche, fichiers }) => ({ branche, fichiers }))),
    // GitHub rend les commentaires dans l'ordre où il les a reçus : leur rang
    // départage, comme leur id, deux commentaires de la même seconde.
    commentaires: async (numero) => (await github.commentaires(numero)).map((lu, rang) => ({ id: rang + 1, body: lu.body, association: lu.association, createdAt: lu.createdAt })),
    commenter: (numero, corps) => github.commenter(numero, corps),
    retraitsDeLabels: (numero) => retraitsDeLabels.call(github, numero),
    etatDuRun: (run) => github.etatDuRun(run),
    relancerLesEchecs: (run) => github.relancerLesEchecs(run),
    mettreAJour: (numero, sha) => mettreAJour.call(github, numero, sha),
    merger: (numero, sha) => github.merger(numero, sha),
    labelliser: (numero, labels) => github.labelliser(numero, labels),
    delabelliser: (numero, label) => github.delabelliser(numero, label),
    ouvrirPR: (pr) => github.ouvrirPR(pr),
  };
}

// Un lancement de `claude` sous supervision : le cook, ou le reviewer.
// `flux` rendu : là où son flux s'est écrit, s'il ne l'a pas été où demandé.
export type Lancer = (lancement: Lancement & { cwd: string; env: NodeJS.ProcessEnv; flux: string }) => Pick<Supervise, "fin"> & { flux?: string };

export type OptionsDuDepot = {
  nom: string;
  places: number;
  base: string;
  // `owner/name` du projet.
  depotGitHub: string;
  // L'état du tour lu en une requête GraphQL (#2301) ; `false` : le REST
  // d'avant, ce que mesurent les tests du coût par ticket.
  graphql?: boolean;
  github: GitHub;
  // Le dépôt de la station, d'où partent les worktrees de ses cooks.
  depot: Pick<Depot, "preparer" | "reprendre" | "connait" | "retirer" | "ranger" | "pousser" | "commits" | "changes" | "diff"> & Partial<Pick<Depot, "tete">>;
  // La prise de #2056, liée à la station.
  prise: (github: GitHubDuTour, station: string) => Prise;
  claude: string;
  env: NodeJS.ProcessEnv;
  cloison: Cloison | null;
  // Le bac à sable de Claude Code, quand la cuisine est sur le poste du chef.
  bacASable?: BacASableLocal | null;
  plafonds: Plafonds;
  graceMs: number;
  reviewer: Calibrage;
  // Où s'écrit le flux de chaque lancement.
  flux: string;
  // Ce que la station fournit, tel que le projet le déclare.
  capacites?: readonly string[];
  lancer?: Lancer;
  // Les garde-fous (#2213), dont le lancement gardé des cooks et des
  // relectures.
  gardes?: GardesDuTour;
  avertir?: (message: string) => void;
  // Ce qui regarde le tour par son client GitHub, sans rien y changer : la
  // retenue de la cuisine (`retenue/tour.ts`).
  observer?: (github: GitHubDuTour) => GitHubDuTour;
  // Le clone du projet, où s'écrit le temps des tickets mergés (#2342).
  clone?: string;
};

const lireLeFlux = (fichier: string) => lireFlux(existsSync(fichier) ? readFileSync(fichier, "utf8") : "");

// La station GitHub seul de ce runtime, ou pourquoi elle ne peut pas tourner.
export function stationDuDepot(options: OptionsDuDepot): StationGitHub | { refus: string } {
  if (!/^[A-Za-z0-9._/-]+$/.test(options.nom)) return { refus: `the station name ${JSON.stringify(options.nom)} cannot sign a claim or a verdict` };
  if (options.github.retraitsDeLabels === undefined) return { refus: "the GitHub client cannot read the label removals of an issue" };
  if (options.github.mettreAJour === undefined) return { refus: "the GitHub client cannot update a branch" };
  if (options.github.prsOuvertes === undefined) return { refus: "the GitHub client cannot list the files of the open PRs" };
  const { nom, base, depot, depotGitHub, cloison } = options;
  mkdirSync(options.flux, { recursive: true });
  const lancer: Lancer = options.lancer ?? options.gardes?.lancer ?? (({ commande, args, cwd, env, flux }) => superviser({ commande, args, cwd, env, plafonds: options.plafonds, graceMs: options.graceMs, flux }));
  // Le cook n'a besoin d'aucun `gh` : son ticket lui est remis dans sa
  // consigne, et la station pousse sa branche et ouvre sa PR. Rien ne fait
  // donc parler son `gh` au nom du chef (`bac-a-sable/hors-github.ts`).
  const env = () => environnementClaude(environnementHorsGitHub(environnementCook(options.env), { bacASable: Boolean(options.bacASable) }), options.env);
  const github = (options.observer ?? ((client: GitHubDuTour) => client))(
    clientDuTour(options.github, base, options.graphql === false ? undefined : depotGitHub),
  );

  const cuisiner: Cuisiner = async (ticket, calibrage) => {
    const run = runDuTicket(ticket.number);
    // Le ticket, lu ici : dans le bac à sable, le `gh` du cook n'a aucun
    // identifiant, et `gh issue view` lui serait refusé.
    let joint: string;
    try {
      const [lue, commentaires] = await Promise.all([options.github.issue(ticket.number), options.github.commentaires(ticket.number)]);
      if (lue === null) throw new Error("the issue no longer exists");
      joint = ticketJoint({ number: ticket.number, title: lue.title, body: lue.body ?? "", commentaires });
    } catch (erreur) {
      return { echec: `its ticket could not be read on GitHub: ${message(erreur)}` };
    }
    let lieu: { worktree: string; branche: string };
    // Le run d'un ticket est toujours le même : la branche d'un cook précédent
    // (livrée, ou refusée par la pass) est encore là, et `preparer` ne sait pas
    // la recréer. Le cook en repart, comme d'un renvoi — et elle n'est pas à
    // jeter s'il échoue : elle porte une livraison.
    const reprise = depot.connait(brancheDuTicket(ticket.number));
    try {
      lieu = reprise ? { worktree: await depot.reprendre(run, brancheDuTicket(ticket.number)), branche: brancheDuTicket(ticket.number) } : await depot.preparer(run);
    } catch (erreur) {
      return { echec: `its worktree could not be prepared: ${message(erreur)}` };
    }
    const { worktree, branche } = lieu;
    // La tête que le cook reprend : s'il n'y ajoute rien, il n'a rien livré
    // (#2372) — sans quoi la pass ressort une tête déjà renvoyée, et le ticket
    // boucle entre elle et les cooks sans qu'aucun échec ne compte.
    const avant = reprise && depot.tete !== undefined ? depot.tete(branche) : null;
    const flux = join(options.flux, `${run}.flux.jsonl`);
    const texte = consigne({ ticket: ticket.number, titre: ticket.title, depot: depotGitHub, base, joint });
    const lancement = envelopper(cloison, { commande: options.claude, args: dansLeBacASableLocal(options.bacASable, argumentsClaude(texte, calibrage), worktree) }, { cwd: worktree, depot: "ecriture" });
    const lance = lancer({ ...lancement, cwd: worktree, env: env(), flux });
    const fin = await lance.fin;
    const conclusion = fin.arret !== null ? `guard:${fin.arret.reason}` : verdict(lireLeFlux(lance.flux ?? flux), fin.code);
    if (conclusion !== "done") {
      depot.retirer(worktree, reprise ? undefined : branche);
      return { echec: fin.erreur ?? conclusion };
    }
    await depot.ranger(worktree, branche);
    if (depot.commits(branche) === 0) return { echec: "the cook committed nothing" };
    if (avant !== null && depot.tete?.(branche) === avant) return { echec: "the cook added nothing since its last delivery" };
    try {
      depot.pousser(branche);
    } catch (erreur) {
      return { echec: `its branch could not be pushed: ${message(erreur)}` };
    }
    return { branche };
  };

  const juger: Juger = async (ticket, pr) => {
    const branche = brancheDuTicket(ticket.number);
    const run = `review-${ticket.number}-github`;
    const worktree = await depot.reprendre(run, branche);
    try {
      const issue = await options.github.issue(ticket.number);
      const diff = { fichiers: depot.changes(branche), texte: depot.diff(branche) };
      const texte = consigneDeRelecture({ depot: depotGitHub, base, ticket: { number: ticket.number, title: ticket.title, body: issue?.body ?? "" }, commentaires: [], compteRendu: null, diff });
      const flux = join(options.flux, `${run}-${pr.sha.slice(0, 12)}.flux.jsonl`);
      const lancement = envelopper(cloison, { commande: options.claude, args: dansLeBacASableLocal(options.bacASable, argumentsReviewer(texte, options.reviewer), worktree) }, { cwd: worktree, depot: "lecture" });
      const lance = lancer({ ...lancement, cwd: worktree, env: env(), flux });
      await lance.fin;
      const lue = lireRelecture(lireLeFlux(lance.flux ?? flux).message);
      if ("illisible" in lue) throw new Error(`the review of PR #${pr.number} is unreadable: ${lue.illisible}`);
      const { verdict: couleur, summary, findings } = lue.relecture;
      const constats = findings.map((constat) => `- ${constat.severity === "blocking" ? "**Blocking**" : "Remark"}${constat.file === null ? "" : ` (\`${constat.file}\`)`}: ${constat.text}`);
      return { verdict: couleur === "green" ? "approve" : "request-changes", motif: [summary, ...constats].join("\n") };
    } finally {
      depot.retirer(worktree);
    }
  };

  return stationGitHub({ nom, places: options.places, base, github, prise: options.prise(github, nom), cuisiner, juger, capacites: options.capacites ?? [], ...(options.gardes === undefined ? {} : { gardes: options.gardes }), ...(options.avertir === undefined ? {} : { avertir: options.avertir }), ...(options.clone === undefined ? {} : { clone: options.clone }) });
}

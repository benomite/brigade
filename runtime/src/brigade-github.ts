// Un projet servi sur l'état GitHub seul (épique #2053, spec
// `docs/superpowers/specs/2026-11-02-github-only-state.md`) : le tour d'une
// station qui prend, cuisine et merge les tickets en ne lisant et n'écrivant
// que GitHub — ni relais de prise, ni boîte aux lettres, ni journal qui
// arbitre. Aucune station n'y est principale : chacune prend, chacune relit,
// chacune merge, et l'arrêt de l'une n'arrête pas les autres.
//
// Un interrupteur par projet le choisit : `githubOnlyState` dans les réglages
// de son dépôt (`.claude/brigade/projet.json`), lu à l'ouverture de la cuisine
// — celle d'un runtime par projet (`main.ts`) comme celle de chaque projet
// d'une station (`station/cuisine.ts`), qui est ce que la box fait tourner.
// Absent ou éteint, la cuisine ouvre l'ancien chemin, tel quel.
// Allumé, ses stations ne lancent plus aucun cook de l'ancien chemin, et c'est
// le tour d'ici qui prend, cuisine et merge.
//
// Ce module enchaîne les contrats de l'épique, il ne les refait pas : l'état
// d'un ticket et de la base (`github-etat/etats.ts`, #2057), la relecture et
// le merge (`github-etat/fusion.ts`, #2058). La prise (`prendre`, `lacher`,
// #2056) est reçue : tant que son module n'est pas dans ce runtime, la
// cuisine le dit et garde l'ancien chemin. Le cook et la relecture sont ceux
// d'aujourd'hui — worktree du dépôt de la station, cloison, consignes du cook
// et du reviewer —, lancés ici sans journal.
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { calibrage as calibrageDesLabels, complet, type Calibrage } from "./calibrage.ts";
import { dansLeBacASableLocal, type BacASableLocal } from "./bac-a-sable/local.ts";
import { argumentsClaude, consigne, environnementCook, lireFlux, verdict } from "./claude.ts";
import { envelopper, type Cloison, type Lancement } from "./cloison.ts";
import type { Depot } from "./depot.ts";
import type { Check } from "./events/pass.ts";
import type { Plafonds } from "./events/guardrails.ts";
import { etatDeLaBase, etatDuTicket, LABEL_IN_PASS, LABEL_TAKEN } from "./github-etat/etats.ts";
import { lacher, prendre } from "./github-etat/prise.ts";
import { fusionner, relire, type GitHubDeLaFusion, type Jugement, type PRAFusionner } from "./github-etat/fusion.ts";
import { HORS_CUISINE, type GitHub, type Issue } from "./github.ts";
import { environnementClaude } from "./jeton-claude.ts";
import type { ReglagesProjet } from "./reglages-projet/reglages.ts";
import { argumentsReviewer, consigneDeRelecture, lireRelecture } from "./reviewer.ts";
import { superviser, type Supervise } from "./superviseur.ts";

// Un ticket tel que le tour le lit : une issue ouverte qui porte `fire`.
export type TicketLu = Pick<Issue, "number" | "title" | "labels" | "state">;

// La prise d'un ticket (`github-etat/prise.ts`, #2056), liée à la station qui
// l'appelle et au client GitHub qui la porte. `prendre` poste sa prise si
// personne ne tient le ticket, et y pose `taken` si elle l'emporte ; `lacher`
// la retire.
export type Prise = {
  prendre(issue: Pick<Issue, "number" | "labels">): Promise<{ prise: boolean }>;
  lacher(issue: Pick<Issue, "number" | "labels">): Promise<boolean>;
};

// La prise de #2056, liée à la station et au client du tour.
export const priseDeLaStation = (github: GitHubDuTour, station: string): Prise => ({
  prendre: (issue) => prendre(issue, { github, station }),
  lacher: (issue) => lacher(issue, { github, station }),
});

// Ce que le tour lit et écrit de GitHub : ce que demandent la relecture et le
// merge, plus les tickets, la PR d'un ticket, les checks de la base, les
// labels et l'ouverture d'une PR.
export type GitHubDuTour = GitHubDeLaFusion &
  Pick<GitHub, "labelliser" | "delabelliser" | "ouvrirPR"> & {
    // Les retraits de labels de l'issue, que la prise lit pour le lâcher du chef.
    retraitsDeLabels(numero: number): Promise<{ label: string; createdAt: string }[]>;
    // Les issues ouvertes qui portent `fire`, dans l'ordre où les servir.
    fires(): Promise<TicketLu[]>;
    // La PR qui livre le ticket, ou null.
    prDuTicket(issue: number): Promise<PRAFusionner | null>;
    // Les checks du dernier commit de la branche d'intégration.
    checksDeLaBase(): Promise<Pick<Check, "outcome">[]>;
  };

// Le cook d'un ticket pris : la branche qu'il a poussée, ou pourquoi il n'a
// rien livré.
export type Cuisiner = (ticket: TicketLu, calibrage: Calibrage) => Promise<{ branche: string } | { echec: string }>;
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
  // Où va ce qui rate sans arrêter le tour.
  avertir?: (message: string) => void;
};

export type StationGitHub = {
  // Un tour : relit et merge ce qui est en pass, puis prend ce que ses places
  // libres permettent et lance leurs cooks, sans les attendre.
  tour(): Promise<void>;
  // Les tickets que ses cooks cuisinent.
  enCuisine(): number[];
  // Attend que ses cooks en vol aient fini.
  calme(): Promise<void>;
};

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

export function stationGitHub(options: OptionsDeStation): StationGitHub {
  const { nom, places, base, github, prise, cuisiner, juger } = options;
  const avertir = options.avertir ?? ((texte: string) => console.error(texte));
  const enVol = new Map<number, Promise<void>>();
  // Les tickets que la station tient sans cook (#2179) : celui d'un cook qui a
  // levé — GitHub qui limite ses appels, par exemple —, ou la prise qu'un
  // runtime arrêté a laissée. Chacun garde sa place jusqu'à ce qu'un tour le
  // rende sur l'issue : un échec ne libère jamais une place pour un autre.
  const aRendre = new Map<number, TicketLu>();
  let premierTour = true;

  // Le cook d'un ticket pris, jusqu'à sa livraison en pass ; sans livraison,
  // le ticket est rendu sur l'issue, et pourquoi s'y dit.
  const cuire = async (ticket: TicketLu, calibrage: Calibrage) => {
    const issue = ticket.number;
    try {
      const fait = await cuisiner(ticket, calibrage);
      if ("branche" in fait) {
        await github.ouvrirPR({ branche: fait.branche, base, titre: `#${issue} — ${ticket.title}`, corps: `Closes #${issue}\n\nCooked by station \`${nom}\`.` });
        // `in-pass` avant le retrait de `taken` : entre les deux, aucune
        // station ne lit le ticket libre.
        await github.labelliser(issue, [LABEL_IN_PASS]);
        await github.delabelliser(issue, LABEL_TAKEN);
        return;
      }
      await github.commenter(issue, `Station \`${nom}\`: the cook stopped without a delivery — ${fait.echec}`);
      await prise.lacher({ number: issue, labels: [...ticket.labels, LABEL_TAKEN] });
    } catch (erreur) {
      avertir(`brigade : #${issue} sur ${nom} — ${message(erreur)}`);
      aRendre.set(issue, ticket);
    } finally {
      enVol.delete(issue);
    }
  };

  const tour = async () => {
    const etatBase = etatDeLaBase(await github.checksDeLaBase());
    const tickets = (await github.fires()).filter((ticket) => !ticket.labels.includes(HORS_CUISINE));
    const libres: TicketLu[] = [];
    for (const ticket of tickets) {
      const enPass = ticket.labels.includes(LABEL_IN_PASS);
      const pr = enPass ? await github.prDuTicket(ticket.number) : null;
      const etat = etatDuTicket({ state: ticket.state, labels: ticket.labels, pr }, etatBase);
      // N'importe quelle station relit et merge : GitHub refuse un merge sur
      // une base qui a bougé, et le second de deux merges.
      if (etat === "pass" && pr !== null) {
        try {
          await relire(pr, { github, station: nom, juger: (lue) => juger(ticket, lue) });
          await fusionner(pr, github);
        } catch (erreur) {
          avertir(`brigade : pass de #${ticket.number} sur ${nom} — ${message(erreur)}`);
        }
      }
      // Libre : aucun état, et aucun label d'état — un `in-pass` dont la PR
      // vient d'être mergée n'est pas à reprendre.
      if (etat === null && !enPass && !ticket.labels.includes(LABEL_TAKEN)) libres.push(ticket);
      // Au premier tour, un `taken` sans cook ici est peut-être une prise
      // qu'un runtime d'avant a laissée : `lacher` ne rend que si c'est la sienne.
      if (premierTour && ticket.labels.includes(LABEL_TAKEN) && !enPass && !enVol.has(ticket.number)) aRendre.set(ticket.number, ticket);
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
    for (const ticket of libres) {
      if (enVol.size + aRendre.size >= places) break;
      if (enVol.has(ticket.number)) continue;
      // Un ticket sans calibrage complet ne part pas, comme sur l'ancien chemin.
      const calibrage = calibrageDesLabels(ticket.labels);
      if (!complet(calibrage)) continue;
      let pris: { prise: boolean };
      try {
        pris = await prise.prendre(ticket);
      } catch (erreur) {
        // La prise a pu partir avant le refus : le ticket est à rendre, et le tour s'arrête là.
        aRendre.set(ticket.number, ticket);
        throw erreur;
      }
      if (!pris.prise) continue;
      enVol.set(ticket.number, cuire(ticket, calibrage));
    }
  };

  return {
    tour,
    enCuisine: () => [...enVol.keys()],
    calme: async () => {
      while (enVol.size > 0) await Promise.all(enVol.values());
    },
  };
}

// L'interrupteur, tel que les réglages du dépôt le portent.
export const surGitHubSeul = (reglages: Pick<ReglagesProjet, "githubOnlyState"> | null): boolean => reglages?.githubOnlyState === true;

export type OptionsDuProjet<A> = {
  // Les réglages que la branche d'intégration porte, lus à l'ouverture.
  reglages: Pick<ReglagesProjet, "githubOnlyState"> | null;
  // L'ancien chemin, ouvert tel quel quand l'interrupteur est éteint — ou que
  // la station GitHub seul ne peut pas tourner.
  ancien: () => A;
  // La station GitHub seul, ou pourquoi elle ne peut pas tourner ici.
  station: () => StationGitHub | { refus: string };
  // Entre deux tours. Par défaut, trente secondes.
  intervalleMs?: number;
  avertir?: (message: string) => void;
};

export type ProjetOuvert<A> = { chemin: "ancien"; ancien: A } | { chemin: "github"; arreter(): Promise<void> };

// Ouvre le projet sur le chemin que dit son interrupteur. Allumé, un tour de
// la station, puis un autre l'intervalle passé, jusqu'à l'arrêt ; l'ancien
// chemin n'est pas ouvert.
export function brancherBrigadeGithub<A>(options: OptionsDuProjet<A>): ProjetOuvert<A> {
  const avertir = options.avertir ?? ((texte: string) => console.error(texte));
  if (!surGitHubSeul(options.reglages)) return { chemin: "ancien", ancien: options.ancien() };
  const station = options.station();
  if ("refus" in station) {
    avertir(`brigade : GitHub-only state is on in the project settings, but this runtime cannot serve it — ${station.refus}; the old path is kept`);
    return { chemin: "ancien", ancien: options.ancien() };
  }
  avertir("brigade : GitHub-only state — this station takes, cooks, reviews and merges the project's tickets from GitHub only");
  const intervalleMs = options.intervalleMs ?? 30_000;
  let arrete = false;
  let minuterie: NodeJS.Timeout | undefined;
  let enCours: Promise<void> = Promise.resolve();
  const tourner = () => {
    enCours = (async () => {
      try {
        await station.tour();
      } catch (erreur) {
        avertir(`brigade : tour GitHub seul — ${message(erreur)}`);
      }
      if (!arrete) minuterie = setTimeout(tourner, intervalleMs);
    })();
  };
  tourner();
  return {
    chemin: "github",
    arreter: async () => {
      arrete = true;
      clearTimeout(minuterie);
      await enCours;
    },
  };
}

// Le client du tour, sur le client GitHub du runtime (`github.ts`).
export function clientDuTour(github: GitHub, base: string): GitHubDuTour {
  const { mettreAJour } = github;
  const { retraitsDeLabels } = github;
  if (mettreAJour === undefined) throw new Error("this GitHub client cannot update a branch");
  if (retraitsDeLabels === undefined) throw new Error("this GitHub client cannot read the label removals of an issue");
  // Le dernier sondage lu : rendu tel quel quand GitHub dit que rien n'a changé.
  let derniers: TicketLu[] = [];
  return {
    fires: async () => {
      const sonde = await github.tickets();
      if (sonde.inchange) return derniers;
      derniers = sonde.issues.filter((issue) => !issue.pr);
      sonde.confirmer();
      return derniers;
    },
    prDuTicket: (issue) => github.prDeBranche(brancheDuTicket(issue)),
    checksDeLaBase: () => github.ci(base),
    // GitHub rend les commentaires dans l'ordre où il les a reçus : leur rang
    // départage, comme leur id, deux commentaires de la même seconde.
    commentaires: async (numero) => (await github.commentaires(numero)).map((lu, rang) => ({ id: rang + 1, body: lu.body, association: lu.association, createdAt: lu.createdAt })),
    commenter: (numero, corps) => github.commenter(numero, corps),
    retraitsDeLabels: (numero) => retraitsDeLabels.call(github, numero),
    mettreAJour: (numero, sha) => mettreAJour.call(github, numero, sha),
    merger: (numero, sha) => github.merger(numero, sha),
    labelliser: (numero, labels) => github.labelliser(numero, labels),
    delabelliser: (numero, label) => github.delabelliser(numero, label),
    ouvrirPR: (pr) => github.ouvrirPR(pr),
  };
}

// Un lancement de `claude` sous supervision : le cook, ou le reviewer.
export type Lancer = (lancement: Lancement & { cwd: string; env: NodeJS.ProcessEnv; flux: string }) => Pick<Supervise, "fin">;

export type OptionsDuDepot = {
  nom: string;
  places: number;
  base: string;
  // `owner/name` du projet.
  depotGitHub: string;
  github: GitHub;
  // Le dépôt de la station, d'où partent les worktrees de ses cooks.
  depot: Pick<Depot, "preparer" | "reprendre" | "connait" | "retirer" | "ranger" | "pousser" | "commits" | "changes" | "diff">;
  // La prise de #2056, liée à la station ; null tant que son module n'est pas
  // dans ce runtime.
  prise: ((github: GitHubDuTour, station: string) => Prise) | null;
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
  lancer?: Lancer;
  avertir?: (message: string) => void;
};

const lireLeFlux = (fichier: string) => lireFlux(existsSync(fichier) ? readFileSync(fichier, "utf8") : "");

// La station GitHub seul de ce runtime, ou pourquoi elle ne peut pas tourner.
export function stationDuDepot(options: OptionsDuDepot): StationGitHub | { refus: string } {
  if (options.prise === null) return { refus: "the claim module (`github-etat/prise.ts`, #2056) is not in this runtime" };
  if (!/^[A-Za-z0-9._/-]+$/.test(options.nom)) return { refus: `the station name ${JSON.stringify(options.nom)} cannot sign a claim or a verdict` };
  if (options.github.retraitsDeLabels === undefined) return { refus: "the GitHub client cannot read the label removals of an issue" };
  if (options.github.mettreAJour === undefined) return { refus: "the GitHub client cannot update a branch" };
  const { nom, base, depot, depotGitHub, cloison } = options;
  mkdirSync(options.flux, { recursive: true });
  const lancer: Lancer = options.lancer ?? (({ commande, args, cwd, env, flux }) => superviser({ commande, args, cwd, env, plafonds: options.plafonds, graceMs: options.graceMs, flux }));
  const env = () => environnementClaude(environnementCook(options.env), options.env);
  const github = clientDuTour(options.github, base);

  const cuisiner: Cuisiner = async (ticket, calibrage) => {
    const run = runDuTicket(ticket.number);
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
    const flux = join(options.flux, `${run}.flux.jsonl`);
    const texte = consigne({ ticket: ticket.number, titre: ticket.title, depot: depotGitHub, base });
    const lancement = envelopper(cloison, { commande: options.claude, args: dansLeBacASableLocal(options.bacASable, argumentsClaude(texte, calibrage), worktree) }, { cwd: worktree, depot: "ecriture" });
    const fin = await lancer({ ...lancement, cwd: worktree, env: env(), flux }).fin;
    const conclusion = fin.arret !== null ? `guard:${fin.arret.reason}` : verdict(lireLeFlux(flux), fin.code);
    if (conclusion !== "done") {
      depot.retirer(worktree, reprise ? undefined : branche);
      return { echec: fin.erreur ?? conclusion };
    }
    await depot.ranger(worktree, branche);
    if (depot.commits(branche) === 0) return { echec: "the cook committed nothing" };
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
      await lancer({ ...lancement, cwd: worktree, env: env(), flux }).fin;
      const lue = lireRelecture(lireLeFlux(flux).message);
      if ("illisible" in lue) throw new Error(`the review of PR #${pr.number} is unreadable: ${lue.illisible}`);
      const { verdict: couleur, summary, findings } = lue.relecture;
      const constats = findings.map((constat) => `- ${constat.severity === "blocking" ? "**Blocking**" : "Remark"}${constat.file === null ? "" : ` (\`${constat.file}\`)`}: ${constat.text}`);
      return { verdict: couleur === "green" ? "approve" : "request-changes", motif: [summary, ...constats].join("\n") };
    } finally {
      depot.retirer(worktree);
    }
  };

  return stationGitHub({ nom, places: options.places, base, github, prise: options.prise(github, nom), cuisiner, juger, ...(options.avertir === undefined ? {} : { avertir: options.avertir }) });
}

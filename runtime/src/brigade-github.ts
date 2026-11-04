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
import { environnementHorsGitHub, ticketJoint } from "./bac-a-sable/hors-github.ts";
import { dansLeBacASableLocal, type BacASableLocal } from "./bac-a-sable/local.ts";
import { argumentsClaude, consigne, environnementCook, lireFlux, verdict } from "./claude.ts";
import { envelopper, type Cloison, type Lancement } from "./cloison.ts";
import type { Depot } from "./depot.ts";
import type { Check } from "./events/pass.ts";
import type { Plafonds } from "./events/guardrails.ts";
import { etatDuTicket, LABEL_IN_PASS, LABEL_TAKEN } from "./github-etat/etats.ts";
import { lireInstantane, REQUETE, type Instantane } from "./github-etat/instantane.ts";
import { LimiteGitHubAtteinte } from "./limite-github.ts";
import { lacher, prendre, purger } from "./github-etat/prise.ts";
import { fusionner, relire, type GitHubDeLaFusion, type Jugement, type PRAFusionner } from "./github-etat/fusion.ts";
import { HORS_CUISINE, type GitHub, type Issue, type PR } from "./github.ts";
import type { GardesDuTour } from "./github-seul/garde-fous/garde-fous.ts";
import { environnementClaude } from "./jeton-claude.ts";
import type { ReglagesProjet } from "./reglages-projet/reglages.ts";
import { argumentsReviewer, consigneDeRelecture, lireRelecture } from "./reviewer.ts";
import { superviser, type Supervise } from "./superviseur.ts";

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
  Pick<GitHub, "labelliser" | "delabelliser" | "ouvrirPR"> & {
    // Les retraits de labels de l'issue, que la prise lit pour le lâcher du chef.
    retraitsDeLabels(numero: number): Promise<{ label: string; createdAt: string }[]>;
    // Les issues ouvertes qui portent `fire`, dans l'ordre où les servir.
    fires(): Promise<TicketLu[]>;
    // La PR qui livre le ticket, ou null. `version` change avec tout ce que
    // GitHub change à la PR.
    prDuTicket(issue: number): Promise<(PRAFusionner & Pick<PR, "version">) | null>;
    // Les checks du dernier commit de la branche d'intégration.
    checksDeLaBase(): Promise<Array<Pick<Check, "outcome"> & Partial<Pick<Check, "name" | "url">>>>;
    // Le corps de l'issue, où le ticket dit sa zone.
    corpsDuTicket(issue: number): Promise<string>;
    // Les PR ouvertes : la branche dont chacune est la tête, et les fichiers qu'elle change.
    prsOuvertes(): Promise<{ branche: string; fichiers: string[] }[]>;
  };

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
  // Les garde-fous de l'ancien chemin (#2213) : le « stop », le disjoncteur,
  // le quota et l'arbitre, lus avant chaque prise. Absents, rien ne retient.
  gardes?: Pick<GardesDuTour, "retenue" | "redire" | "quitter">;
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
  // Le tour ne reprendra pas : ce qu'il tient chez l'arbitre est rendu.
  quitter?(): Promise<void>;
};

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

// Le motif d'un verdict, sous son marqueur et sa ligne « Changes requested ».
const motifDuVerdict = (commentaires: { id: number; body: string }[], id: number) => commentaires.find((c) => c.id === id)?.body.split("\n").slice(2).join("\n").trim() || "see the PR";

export function stationGitHub(options: OptionsDeStation): StationGitHub {
  const { nom, places, base, github, prise, cuisiner, juger, gardes } = options;
  const avertir = options.avertir ?? ((texte: string) => console.error(texte));
  const enVol = new Map<number, Promise<void>>();
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

  // Le cook d'un ticket pris, jusqu'à sa livraison en pass ; sans livraison,
  // le ticket est rendu sur l'issue, et pourquoi s'y dit.
  const cuire = async (ticket: TicketLu, calibrage: Calibrage) => {
    const issue = ticket.number;
    try {
      const fait = await cuisiner(ticket, calibrage);
      if ("branche" in fait) {
        // Un renvoi pousse sur la branche d'une PR encore ouverte : elle porte
        // déjà la livraison, il n'en faut pas une seconde.
        const ouverte = await github.prDuTicket(issue);
        if (ouverte === null || ouverte.state !== "open") await github.ouvrirPR({ branche: fait.branche, base, titre: `#${issue} — ${ticket.title}`, corps: `Closes #${issue}\n\nCooked by station \`${nom}\`.` });
        // `in-pass` avant le retrait de `taken` : entre les deux, aucune
        // station ne lit le ticket libre.
        await github.labelliser(issue, [LABEL_IN_PASS]);
        await github.delabelliser(issue, LABEL_TAKEN);
        return;
      }
      // Le même ticket qui rate cook après cook ne repart pas sans fin : à
      // `ECHECS_MAX` cooks sans livraison, il sort de la cuisine (#2209).
      // Illisibles, ses commentaires ne retiennent pas le rendu : l'échec compte pour un.
      const echecs = (await github.commentaires(issue).catch(() => [])).filter((c) => c.body.startsWith(MARQUE_D_ECHEC)).length + 1;
      await github.commenter(issue, `${MARQUE_D_ECHEC} n=${echecs} -->\nStation \`${nom}\`: the cook stopped without a delivery — ${fait.echec}${echecs >= ECHECS_MAX ? `\n\nTaken off the kitchen (\`${HORS_CUISINE}\`) after ${echecs} cooks without a delivery: a human decides.` : ""}`);
      if (echecs >= ECHECS_MAX) await github.labelliser(issue, [HORS_CUISINE]);
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
    const renvois = (await github.commentaires(ticket.number)).filter((c) => c.body.startsWith(MARQUE_DE_RENVOI));
    // Une tête déjà renvoyée ne l'est pas deux fois : la liste des tickets lue
    // sous ETag peut porter encore `in-pass` un tour de plus (#2189, 23:07).
    // Mais il doit quitter le pass : si le retrait de \`in-pass\` avait échoué
    // (GitHub qui limite ses appels), il se refait, sans second commentaire (#2319).
    if (renvois.some((c) => c.body.includes(` sha=${sha} `))) {
      if (ticket.labels.includes(LABEL_IN_PASS)) await github.delabelliser(ticket.number, LABEL_IN_PASS);
      return;
    }
    const deja = renvois.length;
    if (deja >= RENVOIS_MAX) {
      await github.commenter(ticket.number, `${MARQUE_DE_RENVOI} n=${deja + 1} sha=${sha} -->\nStation \`${nom}\`: still not mergeable after ${deja} sends back — ${raison}\n\nTaken off the kitchen (\`${HORS_CUISINE}\`): a human decides.`);
      await github.labelliser(ticket.number, [HORS_CUISINE]);
    } else {
      await github.commenter(ticket.number, `${MARQUE_DE_RENVOI} n=${deja + 1} sha=${sha} -->\nStation \`${nom}\`: sent back to a cook (${deja + 1}/${RENVOIS_MAX}) — ${raison}`);
    }
    await github.delabelliser(ticket.number, LABEL_IN_PASS);
    renvoyes.add(ticket.number);
  };

  const tour = async () => {
    renvoyes.clear();
    const checksDeLaBase = await github.checksDeLaBase();
    const tickets = (await github.fires()).filter((ticket) => !ticket.labels.includes(HORS_CUISINE));
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
        // vert seul. Comme sur l'ancien chemin, elle attend le chef (#2209).
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
        const siens = new Set((await github.ci(pr.sha)).map((check) => check.name));
        if (checksDeLaBase.some((check) => check.outcome === "red" && check.name !== undefined && siens.has(check.name))) continue;
        try {
          const rendu = await relire(pr, { github, station: nom, juger: (lue) => juger(ticket, lue) });
          const tentee = JSON.stringify([pr.sha, pr.version ?? null, checksDeLaBase]);
          if (tentees.get(pr.number) !== tentee) {
            const fusion = await fusionner(pr, github);
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
        }
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
    // dernier), puis les plus anciens : l'ordre de l'ancien rail (#2209).
    libres.sort((x, y) => rangDePriorite(x) - rangDePriorite(y) || x.number - y.number);
    for (const ticket of libres) {
      if (enVol.size + aRendre.size >= places) break;
      // Le pass est plein : aucun ticket neuf ne se prend avant qu'il ne redescende.
      if (enPass(tickets, renvoyes) >= PASS_MAX) break;
      if (enVol.has(ticket.number)) continue;
      // Un ticket sans calibrage complet ne part pas, comme sur l'ancien chemin.
      const calibrage = calibrageDesLabels(ticket.labels);
      if (!complet(calibrage)) continue;
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
      enVol.set(ticket.number, cuire(ticket, calibrage));
    }
    await gardes?.redire(enVol.size);
  };

  return {
    tour,
    enCuisine: () => [...enVol.keys()],
    calme: async () => {
      while (enVol.size > 0) await Promise.all(enVol.values());
    },
    quitter: async () => {
      await gardes?.quitter();
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
  // Entre deux tours. Par défaut, deux minutes.
  intervalleMs?: number;
  avertir?: (message: string) => void;
};

export type ProjetOuvert<A> = { chemin: "ancien"; ancien: A } | { chemin: "github"; arreter(): Promise<void>; enCuisine(): number[] };

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
  const intervalleMs = options.intervalleMs ?? 120_000;
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
    // Une PR ouverte se lit dans l'instantané ; une PR mergée ou fermée n'y est
    // pas, et se lit en REST — ce qui n'arrive qu'une fois par ticket.
    prDuTicket: async (issue) => {
      const lue = prDeLInstantane(issue);
      if (lue === undefined) return github.prDeBranche(brancheDuTicket(issue));
      return { number: lue.number, url: "", base, sha: lue.sha, state: "open", merged: false, enRetard: lue.enRetard, ...(lue.enConflit ? { enConflit: true } : {}), mergeePar: null, version: lue.version };
    },
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
  // Les garde-fous de l'ancien chemin (#2213), dont le lancement gardé des
  // cooks et des relectures.
  gardes?: GardesDuTour;
  avertir?: (message: string) => void;
};

const lireLeFlux = (fichier: string) => lireFlux(existsSync(fichier) ? readFileSync(fichier, "utf8") : "");

// La station GitHub seul de ce runtime, ou pourquoi elle ne peut pas tourner.
export function stationDuDepot(options: OptionsDuDepot): StationGitHub | { refus: string } {
  if (options.prise === null) return { refus: "the claim module (`github-etat/prise.ts`, #2056) is not in this runtime" };
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
  const github = clientDuTour(options.github, base, options.graphql === false ? undefined : depotGitHub);

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

  return stationGitHub({ nom, places: options.places, base, github, prise: options.prise(github, nom), cuisiner, juger, ...(options.gardes === undefined ? {} : { gardes: options.gardes }), ...(options.avertir === undefined ? {} : { avertir: options.avertir }) });
}

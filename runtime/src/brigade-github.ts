// Un projet servi sur l'état GitHub seul (épique #2053, spec
// `docs/superpowers/specs/2026-11-02-github-only-state.md`) : le tour d'une
// station qui prend, cuisine et merge les tickets en ne lisant et n'écrivant
// que GitHub — ni relais de prise, ni boîte aux lettres, ni journal qui
// arbitre. Aucune station n'y est principale : chacune prend, chacune relit,
// chacune merge, et l'arrêt de l'une n'arrête pas les autres.
//
// Un interrupteur par projet le choisit : `githubOnlyState` dans les réglages
// de son dépôt (`.claude/brigade/projet.json`), relu à chaque tour. Absent ou
// éteint, le tour est celui d'avant, appelé tel quel : ce module ne le connaît
// que comme une fonction, et ne lui touche pas. Allumé, c'est le tour d'ici,
// et celui d'avant n'est pas appelé.
//
// Les contrats de l'épique — `prendre` (#2056), `etatDuTicket` (#2057),
// `relire` et `fusionnable` (#2058) — sont reçus, pas importés : ce module ne
// décide ni qui gagne une prise, ni ce qu'est l'état d'un ticket, ni quand une
// PR se merge. Il les enchaîne. Le cook, lui, est celui d'aujourd'hui :
// worktree, gates et bac à sable ne changent pas.
import { HORS_CUISINE, type GitHub, type Issue } from "./github.ts";
import type { ReglagesProjet } from "./reglages-projet/reglages.ts";

// Les labels que la station pose (spec, « The proposal ») : le ticket pris,
// puis livré en pass.
export const LABEL_PRIS = "taken";
export const LABEL_EN_PASS = "in-pass";

// L'état d'un ticket tel que GitHub seul le dit (`etatDuTicket`, #2057) ;
// null : aucun, le ticket est libre.
export type EtatGitHub = "pris" | "en-pass" | "attente" | "base-rouge";

// Les contrats, liés à la station qui les appelle.
export type Contrats = {
  // Poste la prise de la station sur l'issue, et rend la station qui la tient
  // — la prise la plus ancienne —, ou null.
  prendre(issue: number): Promise<string | null>;
  // Rend le ticket : la prise de la station est retirée sur l'issue.
  lacher(issue: number): Promise<void>;
  etatDuTicket(issue: number): Promise<EtatGitHub | null>;
  // Relit la PR et poste le verdict, si aucune station ne l'a encore jugée.
  relire(pr: number): Promise<void>;
  // Vrai si la PR est approuvée et à jour de sa base ; en retard, la mise à
  // jour est demandée à GitHub, et c'est faux.
  fusionnable(pr: number): Promise<boolean>;
  // Merge la PR ; faux si GitHub refuse — une autre station l'a déjà mergée.
  fusionner(pr: number): Promise<boolean>;
};

// Ce que le tour lit et écrit de GitHub, en dehors des contrats.
export type GitHubDuTour = Pick<GitHub, "labelliser" | "delabelliser" | "commenter" | "ouvrirPR"> & {
  // Les issues ouvertes qui portent `fire`, dans l'ordre où les servir.
  fires(): Promise<Array<Pick<Issue, "number" | "title" | "labels">>>;
  // La PR ouverte qui livre le ticket, ou null.
  prDuTicket(issue: number): Promise<number | null>;
};

// Le cook d'un ticket, tel qu'il est aujourd'hui : la branche qu'il a poussée,
// ou pourquoi il n'a rien livré.
export type Cuisiner = (issue: number) => Promise<{ branche: string } | { echec: string }>;

export type OptionsDeStation = {
  // Le nom de la station : celui de ses prises.
  nom: string;
  // Combien de cooks elle tient à la fois.
  places: number;
  // La branche d'intégration, que visent ses PR.
  base: string;
  github: GitHubDuTour;
  contrats: Contrats;
  cuisiner: Cuisiner;
  // Où va ce qui rate sans arrêter le tour.
  avertir?: (message: string) => void;
};

export type StationGitHub = {
  // Un tour : merge ce qui est en pass et fusionnable, puis prend ce que ses
  // places libres permettent et lance leurs cooks, sans les attendre.
  tour(): Promise<void>;
  // Les tickets que ses cooks cuisinent.
  enCuisine(): number[];
  // Attend que ses cooks en vol aient fini.
  calme(): Promise<void>;
};

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

export function stationGitHub(options: OptionsDeStation): StationGitHub {
  const { nom, places, base, github, contrats, cuisiner } = options;
  const avertir = options.avertir ?? ((texte: string) => console.error(texte));
  const enVol = new Map<number, Promise<void>>();

  // Le cook d'un ticket pris, jusqu'à sa livraison en pass ; sans livraison,
  // le ticket est rendu, et pourquoi se dit sur l'issue.
  const cuire = async (ticket: Pick<Issue, "number" | "title">) => {
    const { number: issue, title } = ticket;
    try {
      const fait = await cuisiner(issue);
      if ("branche" in fait) {
        await github.ouvrirPR({ branche: fait.branche, base, titre: `#${issue} — ${title}`, corps: `Closes #${issue}\n\nCooked by station **${nom}**.` });
        await github.labelliser(issue, [LABEL_EN_PASS]);
        await github.delabelliser(issue, LABEL_PRIS);
        return;
      }
      await github.commenter(issue, `Station **${nom}**: the cook stopped without a delivery — ${fait.echec}`);
      await github.delabelliser(issue, LABEL_PRIS);
      await contrats.lacher(issue);
    } catch (erreur) {
      avertir(`brigade : #${issue} sur ${nom} — ${message(erreur)}`);
    } finally {
      enVol.delete(issue);
    }
  };

  const tour = async () => {
    const tickets = (await github.fires()).filter((ticket) => !ticket.labels.includes(HORS_CUISINE));
    const libres: typeof tickets = [];
    for (const ticket of tickets) {
      const etat = await contrats.etatDuTicket(ticket.number);
      if (etat === null) libres.push(ticket);
      if (etat !== "en-pass") continue;
      // N'importe quelle station relit et merge : GitHub refuse un merge sur
      // une base qui a bougé, et le second de deux merges.
      try {
        const pr = await github.prDuTicket(ticket.number);
        if (pr === null) continue;
        await contrats.relire(pr);
        if (await contrats.fusionnable(pr)) await contrats.fusionner(pr);
      } catch (erreur) {
        avertir(`brigade : pass de #${ticket.number} sur ${nom} — ${message(erreur)}`);
      }
    }
    for (const ticket of libres) {
      if (enVol.size >= places) break;
      if (enVol.has(ticket.number)) continue;
      if ((await contrats.prendre(ticket.number)) !== nom) continue;
      await github.labelliser(ticket.number, [LABEL_PRIS]);
      enVol.set(ticket.number, cuire(ticket));
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

export type Chemin = "github" | "ancien";

export type OptionsDuProjet = {
  // Les réglages du dépôt, relus à chaque tour (`suivis.relire` de
  // `lireLeDepot`). Une lecture qui lève garde le chemin du tour d'avant.
  reglages: () => Pick<ReglagesProjet, "githubOnlyState"> | null;
  // Un tour de la station d'avant — relais, boîte aux lettres, journal —,
  // appelé tel quel quand l'interrupteur est éteint.
  ancien: () => Promise<void>;
  station: Pick<StationGitHub, "tour">;
  // Entre deux tours. Par défaut, trente secondes.
  intervalleMs?: number;
  avertir?: (message: string) => void;
};

export type ProjetBranche = {
  // Le chemin du dernier tour, null avant le premier.
  chemin(): Chemin | null;
  // N'en lance plus, et attend la fin du tour en cours.
  arreter(): Promise<void>;
};

// Branche le projet : un tour, puis un autre l'intervalle passé, jusqu'à
// l'arrêt ; chacun prend son chemin selon l'interrupteur qu'il vient de lire.
export function brancherBrigadeGithub(options: OptionsDuProjet): ProjetBranche {
  const avertir = options.avertir ?? ((texte: string) => console.error(texte));
  const intervalleMs = options.intervalleMs ?? 30_000;
  let allume = false;
  let chemin: Chemin | null = null;
  let arrete = false;
  let minuterie: NodeJS.Timeout | undefined;
  let enCours: Promise<void> = Promise.resolve();

  const lireInterrupteur = () => {
    try {
      allume = surGitHubSeul(options.reglages());
    } catch (erreur) {
      avertir(`brigade : interrupteur de l'état GitHub seul non relu — ${message(erreur)} ; il reste ${allume ? "allumé" : "éteint"}`);
    }
  };

  const tourner = () => {
    enCours = (async () => {
      lireInterrupteur();
      chemin = allume ? "github" : "ancien";
      try {
        await (allume ? options.station.tour() : options.ancien());
      } catch (erreur) {
        avertir(`brigade : tour ${chemin} — ${message(erreur)}`);
      }
      if (!arrete) minuterie = setTimeout(tourner, intervalleMs);
    })();
  };
  tourner();

  return {
    chemin: () => chemin,
    arreter: async () => {
      arrete = true;
      clearTimeout(minuterie);
      await enCours;
    },
  };
}

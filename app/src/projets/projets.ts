// Ajouter un projet depuis l'app, sans terminal : le chef choisit le dépôt
// GitHub, les stations qui le servent et sa principale — celle qui fait
// tourner son manager et sa pass —, et valide. L'app écrit la demande dans le
// gist de chaque station choisie (demande.ts) ; chaque station la lit là,
// prépare le projet et l'ajoute à sa configuration (runtime/src/projects/). La
// principale recommandée est une station serveur, toujours allumée ; choisir
// l'app d'un ordinateur se dit au moment du choix : la cuisine s'arrête quand
// on la ferme.
//
// Rien ici n'a de défaut que le chef n'ait vu : le calibrage et le plafond de
// cooks sont ses décisions, et ce qui manque est signalé champ par champ, sans
// rien écrire. Retirer le projet le retire de la demande de chaque station :
// elle le retire de sa configuration.
import type { GitHubDesStations } from "../stations/github.ts";
import type { StationVue } from "../stations/stations.ts";
import { documentDeDemande, FICHIER_PROJETS, FICHIER_SUIVI, lireDemande, lireSuivi, type Calibre, type EtatDuProjet, type ProjetDemande } from "./demande.ts";
import type { DepotDuChef } from "./github.ts";

// Le calibrage que la station accepte : ses deux listes fermées (runtime/src/calibrage.ts).
export const MODELES = ["opus", "sonnet", "haiku"] as const;
export const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;

export type SaisieDuProjet = {
  depot: string;
  base: string;
  // Les gists des stations choisies, et celui de la principale.
  stations: string[];
  principale: string;
  cooks: string;
  manager: Calibre;
  reviewer: Calibre;
  // Quand le chef a ouvert le parcours.
  ouvertLe: string;
};
export type Champ = "depot" | "base" | "stations" | "principale" | "cooks" | "manager-modele" | "manager-effort" | "reviewer-modele" | "reviewer-effort";
export type Signales = Partial<Record<Champ, string>>;

// Une station d'un projet, telle que la home la montre.
export type StationDuProjet = { id: string; nom: string; principale: boolean; etat: EtatDuProjet | "attendu"; dit: string; autoriser: string[] };
export type ProjetVu = {
  nom: string;
  depot: string;
  base: string;
  stations: StationDuProjet[];
  // Du parcours ouvert au projet servi par sa principale — la mesure que la spec borne à dix minutes.
  servi: string | null;
};
// `recommandee` : la principale que l'app propose d'office — une station serveur ; `avertissements` :
// ce qui se dit quand le chef choisit telle station pour principale.
export type VuDesProjets = { a: string; projets: ProjetVu[]; recommandee: string | null; avertissements: Record<string, string>; sans?: string };
export type Ajout = { ajoute: string } | { signales: Signales } | { refus: string };
export type Retrait = { retire: string } | { refus: string };

// Un dépôt GitHub : `<owner>/<repo>`.
const DEPOT = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?\/[A-Za-z0-9_.-]{1,100}$/;
const BRANCHE = /^[A-Za-z0-9._/-]{1,200}$/;
const NOM = /^[a-z0-9][a-z0-9-]*$/;

const texte = (recu: unknown) => (typeof recu === "string" ? recu.trim() : "");
const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

// Ce que la vue envoie, ramené à des textes : rien n'y est cru sur parole.
export function lireSaisie(recu: unknown): SaisieDuProjet {
  const { depot, base, stations, principale, cooks, manager, reviewer, ouvertLe } = (recu ?? {}) as Record<string, unknown>;
  const calibre = (lu: unknown): Calibre => ({ modele: texte((lu as Calibre | undefined)?.modele), effort: texte((lu as Calibre | undefined)?.effort) });
  return {
    depot: texte(depot),
    base: texte(base),
    stations: Array.isArray(stations) ? [...new Set(stations.map(texte).filter((id) => id !== ""))] : [],
    principale: texte(principale),
    cooks: texte(cooks),
    manager: calibre(manager),
    reviewer: calibre(reviewer),
    ouvertLe: texte(ouvertLe),
  };
}

// Le nom du projet, tiré de son dépôt : celui de son état et de son clone sur la station.
export function nomDuProjet(depot: string): string {
  return (depot.split("/")[1] ?? "")
    .toLowerCase()
    .replace(/\.git$/, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Une station est l'app d'un ordinateur quand sa machine est un Mac ou un PC Windows ;
// un Linux est tenu pour un serveur, allumé en permanence.
export const estUnOrdinateur = (station: Pick<StationVue, "machine">) => /^(macOS|Windows)\b/.test(station.machine);

// La principale que l'app recommande : une station serveur, en ligne d'abord.
export function principaleRecommandee(stations: readonly StationVue[]): string | undefined {
  const serveurs = stations.filter((station) => station.etat !== "illisible" && !estUnOrdinateur(station));
  return (serveurs.find((station) => station.etat === "en-ligne") ?? serveurs[0])?.id;
}

// Ce que l'app dit au moment où le chef choisit cette principale.
export function avertissement(station: Pick<StationVue, "nom" | "machine"> | undefined): string | undefined {
  if (station === undefined || !estUnOrdinateur(station)) return undefined;
  return `${station.nom} is a computer's app: this project's kitchen stops whenever you close the app there. A server station, always on, is recommended.`;
}

// Les champs qui empêchent de valider, chacun avec sa raison. Aucun : la saisie peut partir.
export function refusDeSaisie(saisie: SaisieDuProjet, stations: readonly StationVue[], existants: readonly string[]): Signales {
  const signales: Signales = {};
  const signaler = (champ: Champ, raison: string | undefined) => {
    if (raison !== undefined) signales[champ] = raison;
  };
  const nom = nomDuProjet(saisie.depot);
  signaler(
    "depot",
    saisie.depot === ""
      ? "Choose the project's GitHub repository — `<owner>/<name>`."
      : !DEPOT.test(saisie.depot) || saisie.depot.endsWith(".git")
        ? `“${saisie.depot.slice(0, 60)}” is not a GitHub repository: expected \`<owner>/<name>\`.`
        : !NOM.test(nom)
          ? "This repository's name gives no project name: letters, digits and dashes."
          : existants.includes(nom)
            ? `A project named ${nom} is already on your stations: remove it first.`
            : undefined,
  );
  signaler("base", saisie.base === "" ? "The integration branch is missing: the branch the kitchen delivers to." : BRANCHE.test(saisie.base) ? undefined : `“${saisie.base.slice(0, 60)}” is not a branch name.`);
  const connues = new Set(stations.map(({ id }) => id));
  signaler("stations", saisie.stations.length === 0 ? "Choose at least one station to serve this project." : saisie.stations.some((id) => !connues.has(id)) ? "A chosen station is no longer paired with this app." : undefined);
  signaler("principale", saisie.principale === "" ? "Choose its main station: the one that runs its manager and its pass." : saisie.stations.includes(saisie.principale) ? undefined : "The main station must be one of the chosen stations.");
  signaler("cooks", saisie.cooks === "" ? "How many cooks may the main station run at once for this project?" : /^[1-9][0-9]{0,2}$/.test(saisie.cooks) ? undefined : "The number of cooks is a whole number, 1 or more.");
  for (const role of ["manager", "reviewer"] as const) {
    const { modele, effort } = saisie[role];
    signaler(`${role}-modele`, (MODELES as readonly string[]).includes(modele) ? undefined : `Choose the ${role}'s model.`);
    signaler(`${role}-effort`, (EFFORTS as readonly string[]).includes(effort) ? undefined : `Choose the ${role}'s effort.`);
  }
  return signales;
}

// Une durée, telle que la home la dit.
function duree(ms: number): string {
  const secondes = Math.max(0, Math.round(ms / 1000));
  return secondes < 60 ? `${secondes} s` : `${Math.floor(secondes / 60)} min ${String(secondes % 60).padStart(2, "0")} s`;
}

// Les projets se relisent quand les stations se relisent (stations/stations.ts) : c'est à
// chaque lecture des stations que l'app demande `relire`.
export type OptionsProjets = {
  github: GitHubDesStations;
  // Les stations appairées, telles que la dernière lecture les donne.
  stations: () => readonly StationVue[] | undefined;
  depots: () => Promise<DepotDuChef[]>;
  surLecture: (vu: VuDesProjets) => void;
  maintenant?: () => number;
};

export type Projets = {
  vu(): VuDesProjets | undefined;
  relire(): Promise<VuDesProjets>;
  depots(): Promise<{ depots: DepotDuChef[] } | { refus: string }>;
  ajouter(recu: unknown): Promise<Ajout>;
  retirer(nom: unknown): Promise<Retrait>;
  // Les pages GitHub où autoriser brigade, telles que les stations les ont publiées.
  pages(): string[];
};

export function tenirProjets(options: OptionsProjets): Projets {
  const { github } = options;
  const maintenant = options.maintenant ?? Date.now;
  let vu: VuDesProjets | undefined;
  let enCours: Promise<VuDesProjets> | undefined;
  // Les écritures se suivent : deux gestes du chef ne réécrivent pas la même demande en même temps.
  let ecritures: Promise<unknown> = Promise.resolve();
  const enFile = <T>(geste: () => Promise<T>): Promise<T> => {
    const suite = ecritures.then(geste, geste);
    ecritures = suite.catch(() => undefined);
    return suite;
  };
  const appairees = () => options.stations() ?? [];

  // La demande et le suivi de chaque station appairée.
  const lireTout = async () =>
    Promise.all(
      appairees().map(async (station) => {
        const fichiers = await github.lire(station.id);
        return { station, demande: lireDemande(fichiers?.[FICHIER_PROJETS]), suivi: lireSuivi(fichiers?.[FICHIER_SUIVI]) };
      }),
    );

  const choix = () => {
    const stations = appairees();
    return {
      recommandee: principaleRecommandee(stations) ?? null,
      avertissements: Object.fromEntries(stations.flatMap((station) => {
        const dit = avertissement(station);
        return dit === undefined ? [] : [[station.id, dit]];
      })),
    };
  };

  const lire = async (): Promise<VuDesProjets> => {
    const instant = maintenant();
    try {
      const lus = await lireTout();
      const projets = new Map<string, ProjetVu>();
      for (const { station, demande, suivi } of lus) {
        for (const projet of demande ?? []) {
          const vu = projets.get(projet.nom) ?? { nom: projet.nom, depot: projet.depot, base: projet.base, stations: [], servi: null };
          const dit = suivi.find(({ nom }) => nom === projet.nom);
          vu.stations.push({ id: station.id, nom: station.nom, principale: projet.principale, etat: dit?.etat ?? "attendu", dit: dit?.dit ?? `${station.nom} has not read it yet: it reads what the app asks every 30 s`, autoriser: dit?.autoriser ?? [] });
          if (projet.principale && dit?.etat === "servi" && dit.serviLe !== null) {
            const depuis = projet.ouvertLe ?? projet.demandeLe;
            vu.servi = depuis === null ? null : `served by ${station.nom} ${duree(Date.parse(dit.serviLe) - Date.parse(depuis))} after “add a project” was opened`;
          }
          projets.set(projet.nom, vu);
        }
      }
      for (const projet of projets.values()) projet.stations.sort((a, b) => Number(b.principale) - Number(a.principale) || a.nom.localeCompare(b.nom));
      vu = { a: new Date(instant).toISOString(), projets: [...projets.values()].sort((a, b) => a.nom.localeCompare(b.nom)), ...choix() };
    } catch (erreur) {
      vu = { a: new Date(instant).toISOString(), projets: vu?.projets ?? [], ...choix(), sans: `the projects on your stations could not be read on GitHub — ${message(erreur)}` };
    }
    options.surLecture(vu);
    return vu;
  };

  const relire = () => {
    enCours ??= lire().finally(() => (enCours = undefined));
    return enCours;
  };

  // Réécrit la demande de chaque station : `changer` rend ses projets, à partir de ceux d'avant.
  const reecrire = async (changer: (station: StationVue, avant: ProjetDemande[]) => ProjetDemande[]) => {
    const lus = await lireTout();
    const illisible = lus.find(({ demande }) => demande === null);
    if (illisible !== undefined) throw new Error(`what this app wrote on ${illisible.station.nom}'s gist (${FICHIER_PROJETS}) is unreadable: nothing was changed`);
    const ecrits: string[] = [];
    for (const { station, demande } of lus) {
      const avant = demande ?? [];
      const apres = changer(station, avant);
      if (JSON.stringify(apres) === JSON.stringify(avant)) continue;
      await github.ecrire(station.id, { [FICHIER_PROJETS]: documentDeDemande(apres) });
      ecrits.push(station.nom);
    }
    return ecrits;
  };

  const ajouter = (recu: unknown): Promise<Ajout> =>
    enFile(async () => {
      const saisie = lireSaisie(recu);
      const stations = appairees();
      const existants = (await relire()).projets.map(({ nom }) => nom);
      const signales = refusDeSaisie(saisie, stations, existants);
      if (Object.keys(signales).length > 0) return { signales };
      const nom = nomDuProjet(saisie.depot);
      const instant = new Date(maintenant()).toISOString();
      const projet = (principale: boolean): ProjetDemande => ({
        nom,
        depot: saisie.depot,
        base: saisie.base,
        principale,
        cooks: Number(saisie.cooks),
        manager: saisie.manager,
        reviewer: saisie.reviewer,
        ouvertLe: Number.isNaN(Date.parse(saisie.ouvertLe)) ? null : new Date(saisie.ouvertLe).toISOString(),
        demandeLe: instant,
      });
      try {
        await reecrire((station, avant) => (saisie.stations.includes(station.id) ? [...avant.filter((p) => p.nom !== nom), projet(station.id === saisie.principale)] : avant));
      } catch (erreur) {
        await relire();
        return { refus: `${nom} was not added: GitHub could not be read or written — ${message(erreur)}` };
      }
      await relire();
      return { ajoute: nom };
    });

  const retirer = (recu: unknown): Promise<Retrait> =>
    enFile(async () => {
      const nom = texte(recu);
      if (nom === "") return { refus: "which project? none was named" };
      try {
        const ecrits = await reecrire((_, avant) => avant.filter((projet) => projet.nom !== nom));
        if (ecrits.length === 0) return { refus: `${nom} is on none of your stations` };
      } catch (erreur) {
        return { refus: `${nom} was not removed: GitHub could not be read or written — ${message(erreur)}` };
      }
      await relire();
      return { retire: nom };
    });

  return {
    vu: () => vu,
    relire,
    async depots() {
      try {
        return { depots: await options.depots() };
      } catch (erreur) {
        return { refus: `your repositories could not be read on GitHub — ${message(erreur)}` };
      }
    },
    ajouter,
    retirer,
    pages: () => [...new Set((vu?.projets ?? []).flatMap(({ stations }) => stations.flatMap(({ autoriser }) => autoriser)))],
  };
}

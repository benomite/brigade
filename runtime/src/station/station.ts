// La station : un seul process par machine, qui sert tous les projets de sa
// configuration. Elle relit cette configuration sans cesse : un projet ajouté
// s'ouvre, un projet retiré s'arrête, une ligne changée rouvre son projet —
// sans redémarrer la station ni toucher aux autres projets.
import { AsyncLocalStorage } from "node:async_hooks";
import { join } from "node:path";
import type { RailsPublies, TicketPublie } from "../appairage/rail-publie.ts";
import type { VeilleConnexionMax } from "../connexion-max/veille.ts";
import { ConfigInvalide, DejaEnCours } from "../runtime.ts";
import { CONFIGURATION, environnementDuProjet, lireFichierDeConfiguration, type ProjetConfigure } from "./configuration.ts";
import type { CodeDeRefus } from "../projets/refus.ts";
import { demenagerVersLAtelier } from "./atelier.ts";
import { ouvrirCuisine, type Cuisine, type OptionsCuisine } from "./cuisine.ts";
import { lirePortes, UNITE_DES_PORTES, type Portes } from "./portes.ts";

export type OptionsStation = {
  // Le répertoire de la station (`BRIGADE_STATION_DIR`) : sa configuration,
  // l'état et les clones de ses projets.
  racine: string;
  // L'environnement de la station, que chaque projet hérite.
  env: Record<string, string | undefined>;
  // Une ligne du journal de service : la station n'en a qu'un, pour tous ses
  // projets.
  dire: (ligne: string) => void;
  ouvrir?: (env: Record<string, string | undefined>, options: OptionsCuisine) => Cuisine;
  // Entre deux relectures de la configuration.
  relectureMs?: number;
  // La connexion Max de la machine, remise à chaque cuisine.
  connexion?: VeilleConnexionMax;
  // Entre deux ticks du runtime de chaque cuisine : une minute, à défaut.
  intervalleTickMs?: number;
  // Le fichier des ports des portes que tient `brigade-station-porte`
  // (`BRIGADE_STATION_PORTES`), ou null : chaque projet sort alors par la
  // porte que sa ligne nomme, ou sans porte.
  portes?: string | null;
};

export type Station = {
  // Relit la configuration, et ouvre ou arrête ce qu'elle a changé.
  relire(): void;
  // Les projets servis, dans l'ordre où ils ont été ouverts.
  projets(): string[];
  // Le dépôt GitHub de chaque projet servi (`<owner>/<repo>`), par son nom.
  depots(): Record<string, string>;
  // Le rail de chaque projet servi, par son nom, tel qu'il se publie
  // (`appairage/rail-publie.ts`) — sauf celui dont la cuisine ne lit aucun
  // rail. Un journal qui ne se lit pas à cet instant donne son dernier rail lu.
  rails(): RailsPublies;
  // Les projets de la configuration que la station n'a pas pu ouvrir, et
  // pourquoi.
  refuses(): Record<string, string>;
  // Pourquoi la station refuse ce projet de sa configuration, ou null.
  refus(nom: string): string | null;
  // La cause de ce refus, pour le chef (`projets/refus.ts`), ou null.
  cause(nom: string): CodeDeRefus | null;
  // Arrête chaque projet, comme un signal arrêtait son runtime.
  arreter(signal: string): void;
};

const RELECTURE_MS = 2000;

// Le projet au nom duquel le code en cours s'exécute : tout ce qu'une cuisine
// arme en s'ouvrant — minuteries, process, rappels — le garde. C'est ainsi que
// le journal de service nomme le projet d'une ligne que la station n'a pas
// écrite elle-même.
const enCours = new AsyncLocalStorage<string>();
export const projetEnCours = (): string | null => enCours.getStore() ?? null;

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

// Les refus que rien dans la configuration ne change : leur remède agit ailleurs
// (un clone refait, un `claude` mis à jour), la station les rejoue donc à chaque relecture.
const CAUSES_A_REESSAYER: ReadonlySet<CodeDeRefus> = new Set(["clone-missing", "sandbox-unusable"]);

// Ce qui, dans une erreur d'ouverture, dit pourquoi le projet est refusé.
const causeDe = (erreur: unknown): CodeDeRefus => {
  if (erreur instanceof DejaEnCours) return "already-served";
  if (erreur instanceof ConfigInvalide) return erreur.code ?? "configuration-invalid";
  return "unexpected";
};

// Ce que la station dit au nom d'un projet : la ligne porte son nom.
export const nommer = (projet: string, ligne: string) => `brigade [${projet}] : ${ligne.replace(/^brigade : /, "")}`;
const auNomDe = (dire: (ligne: string) => void, projet: string) => (ligne: string) => dire(nommer(projet, ligne));

export function ouvrirStation(options: OptionsStation): Station {
  const { racine, env, dire } = options;
  const ouvrir = options.ouvrir ?? ouvrirCuisine;
  const fichier = join(racine, CONFIGURATION);
  const portes = options.portes ?? null;
  // Ce qui, changé, rouvre un projet : sa ligne, et le port de sa porte.
  const ouvertes = new Map<string, { cle: string; depot: string; cuisine: Cuisine }>();
  // Un projet refusé ne se réessaie que si sa ligne ou sa porte change — sauf
  // celui qu'un autre runtime tient encore : il est repris dès qu'il est libre.
  const refuses = new Map<string, { cle: string; motif: string; cause: CodeDeRefus; reessayer: boolean }>();
  // Le dernier rail lu de chaque projet servi.
  const railsLus = new Map<string, TicketPublie[]>();
  let ditsProblemes = "";
  let arretee = false;

  const fermer = (nom: string, motif: string) => {
    const ouverte = ouvertes.get(nom);
    if (!ouverte) return;
    ouvertes.delete(nom);
    try {
      ouverte.cuisine.arreter(motif);
    } catch (erreur) {
      auNomDe(dire, nom)(`arrêt non journalisé — ${message(erreur)}`);
    }
  };

  const portDe = (projet: ProjetConfigure, lus: Portes | null): number | null => lus?.projets[projet.nom] ?? null;
  const cleDe = (projet: ProjetConfigure, lus: Portes | null) => (lus === null ? projet.ligne : `${projet.ligne} porte=${portDe(projet, lus) ?? "-"}`);

  // L'environnement d'un projet : sous les portes de la station, le port de
  // la sienne — jamais celle d'un autre projet, ni celle de la station.
  const environnement = (projet: ProjetConfigure, lus: Portes | null) => {
    const sien = environnementDuProjet(racine, projet, env);
    if (lus === null) return sien;
    if ("BRIGADE_PROXY_PORT" in projet.reglages) throw new ConfigInvalide(`BRIGADE_PROXY_PORT ne se règle pas sur sa ligne : la station donne à chaque projet sa porte (${UNITE_DES_PORTES})`, "proxy-port-set");
    const port = portDe(projet, lus);
    if (port === null) throw new ConfigInvalide(`sa porte n'est pas ouverte — ${UNITE_DES_PORTES} n'a pas écrit son port dans ${portes} (journalctl -u ${UNITE_DES_PORTES}) ; la station l'ouvre dès qu'elle l'est`, "door-not-open");
    return { ...sien, BRIGADE_PROXY_PORT: String(port) };
  };

  const tenter = (projet: ProjetConfigure, lus: Portes | null) => {
    const dit = auNomDe(dire, projet.nom);
    const cle = cleDe(projet, lus);
    try {
      const sien = environnement(projet, lus);
      // Un projet servi avant l'atelier y déménage avant que sa cuisine ne
      // s'ouvre : son clone et ses worktrees, tels quels.
      const { BRIGADE_REPO_DIR: clone, BRIGADE_WORKTREES_DIR: worktrees } = sien;
      if (clone && worktrees) {
        const demenagement = demenagerVersLAtelier(racine, projet.nom, { clone, worktrees }, { cloneDeLaStation: !("BRIGADE_REPO_DIR" in projet.reglages), env: { ...process.env, ...sien } });
        for (const ligne of demenagement.deplaces) dit(`déménagé dans l'atelier de la station — ${ligne}`);
        for (const ligne of demenagement.restes) dit(`pas déménagé dans l'atelier de la station — ${ligne}`);
      }
      const cuisine = enCours.run(projet.nom, () => ouvrir(sien, { dire: dit, connexion: options.connexion, ...(options.intervalleTickMs === undefined ? {} : { intervalleTickMs: options.intervalleTickMs }) }));
      ouvertes.set(projet.nom, { cle, depot: projet.depot, cuisine });
      refuses.delete(projet.nom);
      dit(`servi par la station — ${projet.depot}, branche ${projet.base ?? "déclarée par son dépôt"}, état dans ${cuisine.repertoireEtat}`);
    } catch (erreur) {
      const motif = message(erreur);
      const avant = refuses.get(projet.nom);
      refuses.set(projet.nom, { cle, motif, cause: causeDe(erreur), reessayer: erreur instanceof DejaEnCours || CAUSES_A_REESSAYER.has(causeDe(erreur)) });
      if (avant?.motif !== motif || avant.cle !== cle) dit(`refusé par la station, les autres projets restent servis — ${motif}`);
    }
  };

  const relire = () => {
    if (arretee) return;
    const { projets, problemes } = lireFichierDeConfiguration(fichier);
    const dits = problemes.join("\n");
    if (dits !== ditsProblemes) for (const probleme of problemes) dire(`brigade : station — ${probleme}`);
    ditsProblemes = dits;

    const lus = portes === null ? null : lirePortes(portes);

    const voulus = new Map(projets.map((projet) => [projet.nom, projet]));
    for (const [nom, ouverte] of [...ouvertes]) {
      const voulu = voulus.get(nom);
      if (voulu && cleDe(voulu, lus) === ouverte.cle) continue;
      const seulementLaPorte = voulu !== undefined && ouverte.cle.startsWith(`${voulu.ligne} porte=`);
      auNomDe(dire, nom)(!voulu ? "retiré de la configuration : la station ne le sert plus" : seulementLaPorte ? "sa porte a changé de port : la station le rouvre" : "sa ligne a changé : la station le rouvre");
      fermer(nom, voulu ? "reconfigured" : "removed");
    }
    for (const nom of [...refuses.keys()]) if (!voulus.has(nom)) refuses.delete(nom);
    for (const projet of projets) {
      if (ouvertes.has(projet.nom)) continue;
      const refus = refuses.get(projet.nom);
      if (refus && refus.cle === cleDe(projet, lus) && !refus.reessayer) continue;
      tenter(projet, lus);
    }
  };

  relire();
  const veille = setInterval(relire, options.relectureMs ?? RELECTURE_MS);

  return {
    relire,
    projets: () => [...ouvertes.keys()],
    depots: () => Object.fromEntries([...ouvertes].map(([nom, { depot }]) => [nom, depot])),
    rails: () => {
      for (const nom of [...railsLus.keys()]) if (!ouvertes.has(nom)) railsLus.delete(nom);
      for (const [nom, { cuisine }] of ouvertes) {
        try {
          if (cuisine.rail !== undefined) railsLus.set(nom, cuisine.rail());
        } catch {
          // Un journal qui ne se lit pas à cet instant : son dernier rail lu reste publié.
        }
      }
      return Object.fromEntries(railsLus);
    },
    refuses: () => Object.fromEntries([...refuses].map(([nom, { motif }]) => [nom, motif])),
    refus: (nom) => refuses.get(nom)?.motif ?? null,
    cause: (nom) => refuses.get(nom)?.cause ?? null,
    arreter(signal) {
      if (arretee) return;
      arretee = true;
      clearInterval(veille);
      for (const nom of [...ouvertes.keys()]) fermer(nom, signal);
    },
  };
}

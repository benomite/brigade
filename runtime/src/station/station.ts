// La station : un seul process par machine, qui sert tous les projets de sa
// configuration. Elle relit cette configuration sans cesse : un projet ajouté
// s'ouvre, un projet retiré s'arrête, une ligne changée rouvre son projet —
// sans redémarrer la station ni toucher aux autres projets.
import { AsyncLocalStorage } from "node:async_hooks";
import { join } from "node:path";
import type { VeilleConnexionMax } from "../connexion-max/veille.ts";
import { DejaEnCours } from "../runtime.ts";
import { CONFIGURATION, environnementDuProjet, lireFichierDeConfiguration, type ProjetConfigure } from "./configuration.ts";
import { ouvrirCuisine, type Cuisine, type OptionsCuisine } from "./cuisine.ts";

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
};

export type Station = {
  // Relit la configuration, et ouvre ou arrête ce qu'elle a changé.
  relire(): void;
  // Les projets servis, dans l'ordre où ils ont été ouverts.
  projets(): string[];
  // Les projets de la configuration que la station n'a pas pu ouvrir, et
  // pourquoi.
  refuses(): Record<string, string>;
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

// Ce que la station dit au nom d'un projet : la ligne porte son nom.
export const nommer = (projet: string, ligne: string) => `brigade [${projet}] : ${ligne.replace(/^brigade : /, "")}`;
const auNomDe = (dire: (ligne: string) => void, projet: string) => (ligne: string) => dire(nommer(projet, ligne));

export function ouvrirStation(options: OptionsStation): Station {
  const { racine, env, dire } = options;
  const ouvrir = options.ouvrir ?? ouvrirCuisine;
  const fichier = join(racine, CONFIGURATION);
  const ouvertes = new Map<string, { ligne: string; cuisine: Cuisine }>();
  // Un projet refusé ne se réessaie que si sa ligne change — sauf celui qu'un
  // autre runtime tient encore : il est repris dès qu'il est libre.
  const refuses = new Map<string, { ligne: string; motif: string; reessayer: boolean }>();
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

  const tenter = (projet: ProjetConfigure) => {
    const dit = auNomDe(dire, projet.nom);
    try {
      const cuisine = enCours.run(projet.nom, () => ouvrir(environnementDuProjet(racine, projet, env), { dire: dit, connexion: options.connexion }));
      ouvertes.set(projet.nom, { ligne: projet.ligne, cuisine });
      refuses.delete(projet.nom);
      dit(`servi par la station — ${projet.depot}, branche ${projet.base}, état dans ${cuisine.repertoireEtat}`);
    } catch (erreur) {
      const motif = message(erreur);
      const avant = refuses.get(projet.nom);
      refuses.set(projet.nom, { ligne: projet.ligne, motif, reessayer: erreur instanceof DejaEnCours });
      if (avant?.motif !== motif || avant.ligne !== projet.ligne) dit(`refusé par la station, les autres projets restent servis — ${motif}`);
    }
  };

  const relire = () => {
    if (arretee) return;
    const { projets, problemes } = lireFichierDeConfiguration(fichier);
    const dits = problemes.join("\n");
    if (dits !== ditsProblemes) for (const probleme of problemes) dire(`brigade : station — ${probleme}`);
    ditsProblemes = dits;

    const voulus = new Map(projets.map((projet) => [projet.nom, projet]));
    for (const [nom, ouverte] of [...ouvertes]) {
      const voulu = voulus.get(nom);
      if (voulu?.ligne === ouverte.ligne) continue;
      auNomDe(dire, nom)(voulu ? "sa ligne a changé : la station le rouvre" : "retiré de la configuration : la station ne le sert plus");
      fermer(nom, voulu ? "reconfigured" : "removed");
    }
    for (const nom of [...refuses.keys()]) if (!voulus.has(nom)) refuses.delete(nom);
    for (const projet of projets) {
      if (ouvertes.has(projet.nom)) continue;
      const refus = refuses.get(projet.nom);
      if (refus && refus.ligne === projet.ligne && !refus.reessayer) continue;
      tenter(projet);
    }
  };

  relire();
  const veille = setInterval(relire, options.relectureMs ?? RELECTURE_MS);

  return {
    relire,
    projets: () => [...ouvertes.keys()],
    refuses: () => Object.fromEntries([...refuses].map(([nom, { motif }]) => [nom, motif])),
    arreter(signal) {
      if (arretee) return;
      arretee = true;
      clearInterval(veille);
      for (const nom of [...ouvertes.keys()]) fermer(nom, signal);
    },
  };
}

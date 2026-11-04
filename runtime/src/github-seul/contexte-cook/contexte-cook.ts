// Le contexte d'un cook quand GitHub est le seul état de la cuisine (épique
// #2209, ticket #2216) : les mêmes sources, par les mêmes fonctions, que le
// cook du chemin d'avant (`station.ts`) —
// - les leçons provisoires du projet, puis celles de l'étage commun ;
// - le profil du ticket, avec son carnet ;
// - le setup du worktree, joué avec les secrets, et ce qu'il a dit s'il échoue ;
// - les secrets que le dépôt déclare, avec les valeurs de la machine.
// Les secrets n'en sortent que dans `env`, l'environnement du cook : le texte
// qui part sur GitHub (issue, commentaire, PR) passe par `masquer`.
import type { Base } from "../../base.ts";
import { leconsAInjecter, type LeconRecue } from "../../apprentissage/injection.ts";
import { consigne, VARIABLES_DE_JETON, type SetupEnEchec } from "../../claude.ts";
import { jouerSetup, type Setup } from "../../gates.ts";
import { type DefinitionDeProfil } from "../../profils/definition.ts";
import { carnetDuProfil, profilPrefere, profilsOccupes, type CarnetRecu } from "../../profils/preference.ts";
import { phraseDuSetup } from "../../preparation-depot/setup-en-echec.ts";
import { lireSecrets } from "../../secrets.ts";

// La fin de la sortie d'un setup en échec que le cook lit, comme sur l'ancien chemin.
export const FIN_DE_SETUP_MAX = 2000;

// Ce que la station sait du projet, et qui ne change pas d'un ticket à l'autre.
export type SourcesDuContexte = {
  base: Base;
  projet: string;
  // Le plafond des leçons provisoires reçues (`lirePlafondDesLecons`).
  plafondDesLecons: number;
  // Le texte du carnet du dépôt à la base, null s'il n'y en a pas ou s'il est illisible.
  carnetALaBase: () => string | null;
  // L'étage commun de l'installation, et les profils du projet, relus à chaque lancement.
  commun?: () => LeconRecue[];
  profils?: () => DefinitionDeProfil[];
  // `BRIGADE_SECRETS_FILE`, ou null.
  fichierDeSecrets: string | null;
  // Le jeu des variables que le cook hérite de la station (`environnementCook`).
  envDuCook: NodeJS.ProcessEnv;
  // Les variables qu'un setup ne peut pas faire entrer dans l'environnement du cook.
  interdites?: string[];
  station: string;
  // Le setup se joue par défaut ; un test en met un autre.
  jouer?: typeof jouerSetup;
  avertir?: (texte: string) => void;
};

export type DemandeDeContexte = {
  ticket: number;
  titre: string;
  depot: string;
  base: string;
  // La zone de la fiche du ticket (vide : un généraliste).
  zone: string[];
  worktree: string;
  delaiSetupMs: number;
  // Le ticket qui prépare le dépôt part même si son setup échoue, pour le réparer.
  preparation?: boolean;
  signal?: AbortSignal;
};

export type ContexteDuCook =
  | { pret: true; lecons: LeconRecue[]; carnet: CarnetRecu | null; setup?: SetupEnEchec; env: NodeJS.ProcessEnv; consigne: string; masquer: (texte: string) => string; fuites: (texte: string) => string[] }
  // Rien ne part : des secrets déclarés manquent (`problemes` : des noms, jamais une valeur), ou le setup a échoué.
  | { pret: false; raison: "secrets"; problemes: string[] }
  | { pret: false; raison: "setup"; phrase: string; sortie: string };

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

export async function contexteDuCook(sources: SourcesDuContexte, demande: DemandeDeContexte): Promise<ContexteDuCook> {
  const avertir = sources.avertir ?? ((texte: string) => console.error(texte));

  const secrets = lireSecrets(demande.worktree, sources.fichierDeSecrets);
  if (!secrets.pret) return { pret: false, raison: "secrets", problemes: secrets.problemes };
  const sansSecret = Object.keys(secrets.env).length === 0;
  const masquer = sansSecret ? (texte: string) => texte : secrets.masquer;

  const lecons = [...leconsAInjecter(sources.base, sources.projet, { plafond: sources.plafondDesLecons, carnet: sources.plafondDesLecons > 0 ? sources.carnetALaBase() : null }), ...leconsCommunes(sources, avertir)];
  const carnet = carnetDuCook(sources, demande.zone, avertir);

  const jouer = sources.jouer ?? jouerSetup;
  const envAvantLeSetup = { ...sources.envDuCook, ...secrets.env };
  const setup: Setup = await jouer({ worktree: demande.worktree, ticket: demande.ticket, env: envAvantLeSetup, interdites: sources.interdites ?? VARIABLES_DE_JETON, ...(sansSecret ? {} : { masquer }), delaiMs: demande.delaiSetupMs, ...(demande.signal ? { signal: demande.signal } : {}) });
  let setupEnEchec: SetupEnEchec | undefined;
  if (!setup.pret) {
    const sortie = setup.sortie.trim().slice(-FIN_DE_SETUP_MAX);
    const { fr: phrase } = phraseDuSetup({ code: setup.code, depasse: setup.depasse, sortie }, sources.station);
    if (demande.preparation !== true) return { pret: false, raison: "setup", phrase, sortie };
    setupEnEchec = { phrase, sortie };
  }

  const mission = { ticket: demande.ticket, titre: demande.titre, depot: demande.depot, base: demande.base };
  return {
    pret: true,
    lecons,
    carnet,
    ...(setupEnEchec === undefined ? {} : { setup: setupEnEchec }),
    env: setup.pret ? setup.env : envAvantLeSetup,
    consigne: consigne({ ...mission, lecons, carnet, ...(setupEnEchec === undefined ? {} : { setup: setupEnEchec }) }),
    masquer,
    fuites: secrets.fuites,
  };
}

function leconsCommunes(sources: SourcesDuContexte, avertir: (texte: string) => void): LeconRecue[] {
  if (sources.commun === undefined) return [];
  try {
    return sources.commun();
  } catch (erreur) {
    avertir(`brigade : étage commun illisible, le cook part sans ses leçons — ${message(erreur)}`);
    return [];
  }
}

function carnetDuCook(sources: SourcesDuContexte, zone: string[], avertir: (texte: string) => void): CarnetRecu | null {
  if (sources.profils === undefined) return null;
  try {
    const profil = profilPrefere(sources.profils(), zone, profilsOccupes(sources.base, sources.projet));
    return profil === null ? null : carnetDuProfil(profil);
  } catch (erreur) {
    avertir(`brigade : profils de cook illisibles, le cook part en généraliste — ${message(erreur)}`);
    return null;
  }
}

// Ce qui part sur GitHub — issue, commentaire, PR — ne porte jamais une valeur
// de secret : le texte y passe par le masque du contexte.
export const pourGitHub = (contexte: Extract<ContexteDuCook, { pret: true }>, texte: string): string => contexte.masquer(texte);

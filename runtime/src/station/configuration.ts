// La configuration d'une station : les projets qu'elle sert, une ligne
// chacun. C'est le seul fichier qu'ajouter ou retirer un projet touche — ni
// unité, ni drop-in, ni règle du système.
//
// Une ligne : le nom du projet, son dépôt GitHub, sa branche d'intégration,
// puis, au besoin, des réglages `BRIGADE_…=valeur` propres à ce projet.
//
//   # projet  dépôt              branche  réglages
//   brigade   benomite/brigade   v2
//   espace    benomite/espace    main     BRIGADE_SECRETS_FILE=/srv/secrets/espace.env
//
// Tout le reste vient de la station : son environnement, que chaque projet
// hérite, et ses répertoires, où chaque projet a sa place.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DECISIONS } from "../decisions.ts";
import { NOM_DE_PROJET } from "../runtime.ts";

// Ce que la station porte sous son répertoire (`BRIGADE_STATION_DIR`).
export const CONFIGURATION = "projets";
// L'état de chaque projet : son journal, son verrou, ses runs, ses worktrees.
export const ETATS = "etat";
// Le clone de chaque projet, quand sa ligne n'en nomme pas un autre.
export const CLONES = "clones";

export type ProjetConfigure = {
  nom: string;
  depot: string;
  base: string;
  // Les réglages propres au projet, tels que sa ligne les écrit.
  reglages: Record<string, string>;
  // La ligne, ses blancs ramenés à un : deux lectures qui rendent la même
  // n'ont rien changé au projet.
  ligne: string;
};

export type Configuration = { projets: ProjetConfigure[]; problemes: string[] };

const REGLAGE = /^(BRIGADE_[A-Z0-9_]+)=(.*)$/;

// Ce qu'une ligne ne règle pas : ses trois premiers champs, et ce que la
// station tient elle-même.
const TENUS: Record<string, string> = {
  BRIGADE_PROJECT: "c'est le premier champ de la ligne",
  BRIGADE_GITHUB_REPO: "c'est le deuxième champ de la ligne",
  BRIGADE_BASE_BRANCH: "c'est le troisième champ de la ligne",
  BRIGADE_STATE_DIR: `la station range l'état de chaque projet sous \`${ETATS}/\``,
  BRIGADE_STATION_DIR: "c'est le répertoire de la station, pas d'un projet",
};

// Lit le texte de la configuration. Une ligne illisible n'est que la sienne :
// elle est dite, et les autres projets sont servis.
export function lireConfiguration(texte: string): Configuration {
  const projets: ProjetConfigure[] = [];
  const problemes: string[] = [];
  texte.split("\n").forEach((brute, rang) => {
    const champs = brute.trim().split(/\s+/).filter(Boolean);
    if (champs.length === 0 || champs[0]?.startsWith("#")) return;
    const refuser = (pourquoi: string) => void problemes.push(`ligne ${rang + 1} de la configuration (« ${brute.trim().slice(0, 80)} ») : ${pourquoi}`);
    const [nom = "", depot, base, ...suite] = champs;
    if (depot === undefined || base === undefined) return refuser("attendu le nom du projet, son dépôt GitHub (<owner>/<repo>) et sa branche d'intégration");
    if (!NOM_DE_PROJET.test(nom)) return refuser(`nom de projet invalide — attendu un identifiant court en minuscules, chiffres et tirets (brigade, thermigo)`);
    if (projets.some((projet) => projet.nom === nom)) return refuser(`le projet « ${nom} » a déjà sa ligne`);
    const reglages: Record<string, string> = {};
    for (const champ of suite) {
      const [, cle, valeur] = REGLAGE.exec(champ) ?? [];
      if (cle === undefined || valeur === undefined) return refuser(`« ${champ.slice(0, 40)} » n'est pas un réglage — attendu BRIGADE_…=valeur`);
      if (cle in TENUS) return refuser(`${cle} ne se règle pas sur la ligne : ${TENUS[cle]}`);
      if ((DECISIONS as readonly string[]).includes(cle)) return refuser(`${cle} est une décision du chef : elle vit au journal du projet, pas dans la configuration`);
      if (cle in reglages) return refuser(`${cle} est réglé deux fois`);
      reglages[cle] = valeur;
    }
    projets.push({ nom, depot, base, reglages, ligne: champs.join(" ") });
  });
  return { projets, problemes };
}

// Lit le fichier de configuration. Absent, la station ne sert aucun projet :
// elle est installée, ses projets viendront.
export function lireFichierDeConfiguration(fichier: string): Configuration {
  let texte: string;
  try {
    texte = readFileSync(fichier, "utf8");
  } catch (erreur) {
    if ((erreur as NodeJS.ErrnoException).code === "ENOENT") return { projets: [], problemes: [] };
    return { projets: [], problemes: [`configuration illisible (${fichier}) — ${erreur instanceof Error ? erreur.message : String(erreur)}`] };
  }
  return lireConfiguration(texte);
}

// L'environnement d'un projet : celui de la station, ses lieux, puis les
// réglages de sa ligne. C'est celui qu'un runtime de projet lisait seul.
export function environnementDuProjet(racine: string, projet: ProjetConfigure, env: Record<string, string | undefined>): Record<string, string | undefined> {
  return {
    ...env,
    BRIGADE_REPO_DIR: join(racine, CLONES, projet.nom),
    ...projet.reglages,
    BRIGADE_PROJECT: projet.nom,
    BRIGADE_GITHUB_REPO: projet.depot,
    BRIGADE_BASE_BRANCH: projet.base,
    BRIGADE_STATE_DIR: join(racine, ETATS, projet.nom),
  };
}

// Ce dont un projet a besoin pour que ses tests tournent, lu dans son dépôt :
// son setup de worktree, sa configuration de test (les scripts de test de ses
// `package.json`, ses configurations Playwright ou Cypress, les services de sa
// CI) et ses manifestes (dépendances, `.env` d'exemple, schéma Prisma). Chaque
// besoin trouvé dit ce qui le dit — un fichier, et ce qu'il y fait —, jamais ce
// que le fichier contient : la phrase se lit sans la sortie de rien.
//
// Rien ne s'exécute : le dépôt est lu, pas joué.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { SCRIPT_SETUP } from "../../gates.ts";
import { BESOINS, type Besoin, type Indices } from "./catalogue.ts";

// Un fichier du dépôt, tel que la détection le lit : son chemin relatif, avec
// des `/`, et son contenu — vide pour un dossier (un `.xcodeproj`).
export type FichierLu = { chemin: string; contenu: string };

// Un besoin du projet, et ce qui le dit, dans l'ordre où le dépôt le dit.
export type BesoinDuProjet = { besoin: Besoin; preuves: string[] };

// Les dossiers où l'on ne cherche rien : dépendances installées, sorties de
// build, caches. Un dossier caché n'est lu que s'il est l'un de ceux-là.
const IGNORES = new Set(["node_modules", "vendor", "dist", "build", "out", "target", "coverage", "Pods", "DerivedData", "venv", "__pycache__", "bower_components"]);
const CACHES_LUS = new Set([".github", ".claude", ".devcontainer"]);
const PROFONDEUR_MAX = 4;
const FICHIERS_MAX = 20_000;
const TAILLE_MAX = 512 * 1024;

const INTERESSANTS = [
  /^package\.json$/,
  /^Gemfile$/,
  /^requirements[\w.-]*\.txt$/,
  /^(?:pyproject\.toml|Pipfile|setup\.py|setup\.cfg)$/,
  /^(?:go\.mod|Cargo\.toml|pubspec\.yaml|pom\.xml|global\.json|Package\.swift|AndroidManifest\.xml|schema\.prisma)$/,
  /^build\.gradle(?:\.kts)?$/,
  /^\.env\.(?:example|sample|test|dist|template)$/,
  /^(?:playwright|cypress|wdio)\.conf(?:ig)?\.[cm]?[jt]s$/,
  /^cypress\.json$/,
  /\.(?:csproj|fsproj|sln)$/,
];
const DOSSIERS_INTERESSANTS = /\.(?:xcodeproj|xcworkspace)$/;
const CI = /^\.github\/workflows\/[^/]+\.ya?ml$/;

// Les fichiers du dépôt que la détection lit. Un dépôt énorme n'est lu qu'en
// partie : au-delà de `FICHIERS_MAX` entrées, la lecture s'arrête.
export function lireLeDepot(dossier: string): FichierLu[] {
  const lus: FichierLu[] = [];
  let vus = 0;
  const lire = (chemin: string) => {
    try {
      if (statSync(join(dossier, chemin)).size > TAILLE_MAX) return;
      lus.push({ chemin, contenu: readFileSync(join(dossier, chemin), "utf8") });
    } catch {}
  };
  const parcourir = (relatif: string, profondeur: number) => {
    let entrees;
    try {
      entrees = readdirSync(join(dossier, relatif), { withFileTypes: true });
    } catch {
      return;
    }
    for (const entree of entrees.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      if (++vus > FICHIERS_MAX) return;
      const chemin = relatif === "" ? entree.name : `${relatif}/${entree.name}`;
      if (entree.isDirectory()) {
        if (DOSSIERS_INTERESSANTS.test(entree.name)) lus.push({ chemin, contenu: "" });
        else if (profondeur < PROFONDEUR_MAX && !IGNORES.has(entree.name) && (!entree.name.startsWith(".") || CACHES_LUS.has(entree.name))) parcourir(chemin, profondeur + 1);
      } else if (entree.isFile() && (chemin === SCRIPT_SETUP || CI.test(chemin) || INTERESSANTS.some((motif) => motif.test(entree.name)))) {
        lire(chemin);
      }
    }
  };
  parcourir("", 0);
  return lus;
}

const echapper = (texte: string) => texte.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
const nomDe = (chemin: string) => chemin.slice(chemin.lastIndexOf("/") + 1);
// Un script shell sans ses commentaires.
const sansCommentaires = (texte: string) =>
  texte
    .split("\n")
    .filter((ligne) => !ligne.trimStart().startsWith("#"))
    .join("\n");

// La première de ces commandes que le texte lance, comme un mot de commande.
function commandeLancee(texte: string, commandes: readonly string[]): string | null {
  return commandes.find((commande) => new RegExp(`(?:^|[\\s;&|(\`"'])${echapper(commande)}(?=[\\s;&|)"'\`]|$)`, "m").test(texte)) ?? null;
}

type PaquetJson = { scripts?: Record<string, unknown>; dependencies?: Record<string, unknown>; devDependencies?: Record<string, unknown>; optionalDependencies?: Record<string, unknown>; peerDependencies?: Record<string, unknown> };

function paquetJson(contenu: string): PaquetJson | null {
  try {
    const lu = JSON.parse(contenu) as unknown;
    return lu !== null && typeof lu === "object" && !Array.isArray(lu) ? (lu as PaquetJson) : null;
  } catch {
    return null;
  }
}

// Les scripts d'un `package.json` que les tests jouent : ceux dont le nom dit
// le test, sa préparation, sa base ou sa CI — pas ceux du déploiement.
const SCRIPT_DE_TEST = /(?:^|[:_-])(?:test|tests|e2e|spec|pretest|posttest|setup|db|ci)(?:$|[:_-])/;

function scriptsDeTest(paquet: PaquetJson): string {
  return Object.entries(paquet.scripts ?? {})
    .filter(([nom, script]) => SCRIPT_DE_TEST.test(nom) && typeof script === "string")
    .map(([, script]) => script as string)
    .join("\n");
}

const dependances = (paquet: PaquetJson): string[] => [paquet.dependencies, paquet.devDependencies, paquet.optionalDependencies, paquet.peerDependencies].flatMap((bloc) => (bloc !== null && typeof bloc === "object" ? Object.keys(bloc) : []));

// Ce qu'un fichier dit d'un besoin : la raison, sans le nom du fichier, ou null.
function raisonDans(fichier: FichierLu, indices: Indices): string | null {
  const { chemin, contenu } = fichier;
  const nom = nomDe(chemin);
  for (const { motif, raison } of indices.fichiers ?? []) if (motif.test(chemin)) return raison;
  for (const { fichier: motifDuFichier, motif, raison } of indices.contenus ?? []) if (motifDuFichier.test(chemin) && motif.test(contenu)) return raison;
  if (chemin === SCRIPT_SETUP) {
    const script = sansCommentaires(contenu);
    const commande = commandeLancee(script, indices.commandes ?? []);
    if (commande !== null) return `runs \`${commande}\``;
    const adresse = indices.adresses?.exec(script);
    if (adresse) return `connects to a \`${adresse[0]}\` address`;
    return null;
  }
  if (CI.test(chemin)) {
    const image = (indices.images ?? []).find((une) => new RegExp(`^\\s*image:\\s*["']?${echapper(une)}(?=[:"'\\s]|$)`, "m").test(contenu));
    return image === undefined ? null : `starts a \`${image}\` service for its tests`;
  }
  if (nom === "package.json") {
    const paquet = paquetJson(contenu);
    if (paquet === null) return null;
    const commande = commandeLancee(scriptsDeTest(paquet), indices.commandes ?? []);
    if (commande !== null) return `runs \`${commande}\` in its test scripts`;
    const deps = dependances(paquet);
    const dep = (indices.npm ?? []).find((une) => deps.includes(une));
    return dep === undefined ? null : `depends on \`${dep}\``;
  }
  if (/^\.env\./.test(nom)) {
    const adresse = indices.adresses?.exec(contenu);
    return adresse ? `points at a \`${adresse[0]}\` address` : null;
  }
  if (nom === "schema.prisma") {
    return indices.prisma !== undefined && new RegExp(`provider\\s*=\\s*["']${echapper(indices.prisma)}["']`).test(contenu) ? `declares a \`${indices.prisma}\` datasource` : null;
  }
  const dependance = (paquets: readonly string[] | undefined, motif: (paquet: string) => RegExp) => (paquets ?? []).find((paquet) => motif(echapper(paquet)).test(contenu));
  const trouvee =
    nom === "Gemfile"
      ? dependance(indices.gem, (paquet) => new RegExp(`^\\s*gem\\s+["']${paquet}["']`, "m"))
      : /^(?:requirements[\w.-]*\.txt|pyproject\.toml|Pipfile|setup\.py|setup\.cfg)$/.test(nom)
        ? dependance(indices.pip, (paquet) => new RegExp(`(?:^|["'\\s])${paquet}(?=[\\s<>=~!\\[;,"']|$)`, "im"))
        : nom === "go.mod"
          ? dependance(indices.go, (paquet) => new RegExp(`(?:^|\\s)${paquet}(?:/|\\s)`, "m"))
          : nom === "Cargo.toml"
            ? dependance(indices.cargo, (paquet) => new RegExp(`^\\s*${paquet}\\s*=|^\\[(?:dev-)?dependencies\\.${paquet}\\]`, "m"))
            : /^(?:pom\.xml|build\.gradle(?:\.kts)?)$/.test(nom)
              ? dependance(indices.jvm, (paquet) => new RegExp(`${paquet}(?=[:<.\\s"'])`))
              : undefined;
  return trouvee === undefined ? null : `depends on \`${trouvee}\``;
}

// Ce qui dit un besoin, au plus : la cause se lit d'un coup.
const PREUVES_MAX = 3;
const CHEMIN_CITABLE = /^[\p{L}\p{N}._@+ /-]{1,200}$/u;

// Les besoins du projet, d'après les fichiers de son dépôt, dans l'ordre du
// catalogue. Pur.
export function besoinsDesFichiers(fichiers: readonly FichierLu[]): BesoinDuProjet[] {
  // Le setup d'abord : c'est lui qui échoue le premier sur une station qui n'a pas le besoin.
  // Un chemin que la phrase ne saurait citer tel quel (un saut de ligne, un
  // accent grave) n'en est pas une preuve.
  const ordonnes = fichiers.filter(({ chemin }) => CHEMIN_CITABLE.test(chemin)).sort((a, b) => Number(b.chemin === SCRIPT_SETUP) - Number(a.chemin === SCRIPT_SETUP));
  return BESOINS.flatMap((besoin) => {
    const preuves = ordonnes.flatMap((fichier) => {
      const raison = raisonDans(fichier, besoin.indices);
      return raison === null ? [] : [`\`${fichier.chemin}\` ${raison}`];
    });
    return preuves.length === 0 ? [] : [{ besoin, preuves: preuves.slice(0, PREUVES_MAX) }];
  });
}

// Les besoins du projet, lus dans son clone.
export const besoinsDuDepot = (dossier: string): BesoinDuProjet[] => besoinsDesFichiers(lireLeDepot(dossier));

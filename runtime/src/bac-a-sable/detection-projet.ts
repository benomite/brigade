// Écrit la déclaration du bac à sable d'un projet, depuis ce que son dépôt
// montre de sa chaîne d'outils :
//   node runtime/src/bac-a-sable/detection-projet.ts <dossier du projet>
//
// `/brigade:init` la lance à côté de la déclaration réseau (`reseau-cli.ts`).
// La déclaration, `.claude/brigade/bac-a-sable.json`, tient deux clés :
// `ports`, les ports de la boucle locale que les tests du projet joignent, et
// `ecriture`, les dossiers sous `~` où ses outils écrivent en plus du
// worktree — leurs caches.
//
//   Gradle (`gradlew`, `build.gradle*`)       → `~/.gradle`
//   npm (`package.json`)                      → `~/.npm`
//   Python (`pyproject.toml`, `requirements*.txt`) → le cache de pip, sur le
//                                               Mac et sous Linux
//   Docker Compose (`docker-compose.yml`, `compose.yaml`) → les ports de
//                                               l'hôte que ses services publient
//
// Ce qui ne s'y dit pas n'y est pas. Le démon Gradle écoute la boucle locale
// sur un port tiré au hasard à chaque démarrage : aucun port fixe ne le dit,
// la déclaration n'en invente pas. Docker garde ses identifiants dans
// `~/.docker`, que le bac à sable ne laisse jamais lire (`LECTURES_INTERDITES`)
// et que la déclaration n'ouvre donc pas ; un `Dockerfile` seul ne donne
// rien. Un dépôt qu'elle ne reconnaît pas donne une déclaration vide.
//
// Chaque entrée passe les limites avant d'être écrite : un port de 1 à 65535,
// joint sur la boucle locale ; un dossier sous `~`, sans `..`, qui n'est ni
// sous un des secrets du chef ni au-dessus de l'un d'eux.
//
// Un fichier déjà là n'est jamais réécrit : elle dit les entrées qui lui
// manquent, et c'est l'humain qui les ajoute.
import { existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { enProcess, Sortie, type Appel } from "../appel.ts";
import { lireLeDepot, type FichierLu } from "../installation/besoins/detecter.ts";
import { LECTURES_INTERDITES } from "./configuration.ts";

const USAGE = "usage : node runtime/src/bac-a-sable/detection-projet.ts <dossier du projet>";
const MAL_APPELEE = 64;
const DECLARATION = ".claude/brigade/bac-a-sable.json";

type Declaration = { ports: number[]; ecriture: string[] };
type Entree = { port: number; raison: string } | { ecriture: string; raison: string };

// Les fichiers de la racine que `lireLeDepot` ne lit pas et que la détection regarde.
const A_LA_RACINE = ["gradlew", "Dockerfile", "docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"];
const TAILLE_MAX = 512 * 1024;

const nomDe = (chemin: string) => chemin.slice(chemin.lastIndexOf("/") + 1);
const COMPOSE = /^(?:docker-)?compose\.ya?ml$/;
// Une publication de port de Compose, forme courte : `[hôte:]port_hôte:port_conteneur[/proto]`.
// Seuls les hôtes qui laissent le port joignable sur la boucle locale comptent.
const PUBLICATION = /^\s*-\s*["']?(?:(127\.0\.0\.1|localhost|0\.0\.0\.0):)?([0-9]{1,5}):[0-9]{1,5}(?:\/(?:tcp|udp))?["']?\s*(?:#.*)?$/;

// Un port que la déclaration peut tenir : un entier de 1 à 65535.
const portValable = (port: number) => Number.isInteger(port) && port >= 1 && port <= 65535;

// Un dossier que la déclaration peut ouvrir à l'écriture : sous `~`, sans
// `..`, ni sous un secret du chef ni au-dessus de l'un d'eux.
function ecritureValable(chemin: string): boolean {
  if (!chemin.startsWith("~/")) return false;
  const relatif = chemin.slice(2);
  if (relatif === "" || relatif.split("/").some((segment) => segment === "" || segment === "." || segment === "..")) return false;
  return !LECTURES_INTERDITES.some((secret) => relatif === secret || relatif.startsWith(`${secret}/`) || secret.startsWith(`${relatif}/`));
}

function detecter(fichiers: readonly FichierLu[]): Entree[] {
  const entrees: Entree[] = [];
  const vu = (motif: RegExp) => fichiers.find(({ chemin }) => motif.test(nomDe(chemin)));
  const gradle = vu(/^(?:gradlew|build\.gradle(?:\.kts)?)$/);
  if (gradle) entrees.push({ ecriture: "~/.gradle", raison: `${gradle.chemin}: Gradle writes its caches and its daemon's registry there` });
  const npm = vu(/^package\.json$/);
  if (npm) entrees.push({ ecriture: "~/.npm", raison: `${npm.chemin}: the npm cache` });
  const python = vu(/^(?:pyproject\.toml|requirements[\w.-]*\.txt)$/);
  if (python) {
    entrees.push({ ecriture: "~/Library/Caches/pip", raison: `${python.chemin}: the pip cache on macOS` });
    entrees.push({ ecriture: "~/.cache/pip", raison: `${python.chemin}: the pip cache on Linux` });
  }
  for (const { chemin, contenu } of fichiers.filter(({ chemin }) => COMPOSE.test(nomDe(chemin)))) {
    for (const ligne of contenu.split("\n")) {
      const [, , port] = PUBLICATION.exec(ligne) ?? [];
      if (port !== undefined) entrees.push({ port: Number(port), raison: `${chemin}: a service published on port ${port}` });
    }
  }
  return entrees;
}

// Ce que le dépôt déclare, dans les limites : chaque entrée une fois, dans l'ordre où le dépôt la dit.
function declarer(entrees: readonly Entree[]): Declaration {
  const declaration: Declaration = { ports: [], ecriture: [] };
  for (const entree of entrees) {
    if ("port" in entree) {
      if (portValable(entree.port) && !declaration.ports.includes(entree.port)) declaration.ports.push(entree.port);
    } else if (ecritureValable(entree.ecriture) && !declaration.ecriture.includes(entree.ecriture)) declaration.ecriture.push(entree.ecriture);
  }
  return declaration;
}

// Les fichiers du dépôt que la détection lit : ceux des besoins, et ceux de la racine qu'ils ne lisent pas.
function lireLesFichiers(dossier: string): FichierLu[] {
  const lus = lireLeDepot(dossier);
  for (const nom of A_LA_RACINE) {
    if (lus.some(({ chemin }) => chemin === nom)) continue;
    try {
      const chemin = join(dossier, nom);
      if (!statSync(chemin).isFile() || statSync(chemin).size > TAILLE_MAX) continue;
      lus.push({ chemin: nom, contenu: readFileSync(chemin, "utf8") });
    } catch {}
  }
  return lus;
}

// La déclaration posée, si elle se lit : deux tableaux, et rien d'autre.
function lireLaDeclaration(texte: string): Declaration | null {
  try {
    const lue = JSON.parse(texte) as unknown;
    if (typeof lue !== "object" || lue === null || Array.isArray(lue)) return null;
    const { ports, ecriture } = lue as Record<string, unknown>;
    if (!Array.isArray(ports) || !ports.every((port) => typeof port === "number")) return null;
    if (!Array.isArray(ecriture) || !ecriture.every((dossier) => typeof dossier === "string")) return null;
    return { ports: ports as number[], ecriture: ecriture as string[] };
  } catch {
    return null;
  }
}

const dire = (entree: Entree) => ("port" in entree ? `port ${entree.port}` : `ecriture ${entree.ecriture}`);

function principal({ args, dire: ecrire, redire }: Appel): void {
  const [nommee, ...reste] = args;
  if (nommee === undefined || reste.length > 0 || nommee.startsWith("-")) {
    redire(`brigade : ${USAGE}`);
    throw new Sortie(MAL_APPELEE);
  }
  const nomme = resolve(nommee);
  if (!existsSync(nomme)) {
    redire(`brigade : ${nomme} n'existe pas`);
    throw new Sortie(MAL_APPELEE);
  }
  const dossier = realpathSync(nomme);
  const fichier = join(dossier, DECLARATION);
  const entrees = detecter(lireLesFichiers(dossier));
  const declaration = declarer(entrees);
  const retenues = entrees.filter((entree) => ("port" in entree ? declaration.ports.includes(entree.port) : declaration.ecriture.includes(entree.ecriture)));

  if (!existsSync(fichier)) {
    mkdirSync(dirname(fichier), { recursive: true });
    writeFileSync(fichier, `${JSON.stringify(declaration, null, 2)}\n`);
    ecrire(`bac à sable — ${fichier} : écrit`);
  } else {
    ecrire(`bac à sable — ${fichier} : déjà là, laissé tel quel`);
    let posee: Declaration | null = null;
    try {
      posee = lireLaDeclaration(readFileSync(fichier, "utf8"));
    } catch {}
    if (posee === null) ecrire(`  ILLISIBLE — attendu : {"ports": [<port>…], "ecriture": ["~/<dossier>"…]} ; à corriger à la main`);
    const manquantes = retenues.filter((entree) => posee !== null && ("port" in entree ? !posee.ports.includes(entree.port) : !posee.ecriture.includes(entree.ecriture)));
    for (const entree of manquantes) ecrire(`  MANQUE ${dire(entree)} — ${entree.raison}`);
    if (posee !== null && manquantes.length === 0) ecrire("  toutes les entrées détectées y sont");
  }
  for (const entree of retenues) ecrire(`  ${dire(entree)} ← ${entree.raison}`);
  if (retenues.length === 0) ecrire("  rien de reconnu : déclaration vide");
}

if (import.meta.main) await enProcess(principal);

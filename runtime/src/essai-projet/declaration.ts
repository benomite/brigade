// Comment un projet s'essaie depuis sa carte (#3559, épique #3557) : la
// déclaration `.brigade/try.json` que le bouton « try it » de l'app lit (#3215),
// détectée dans ce que le dépôt montre, jamais devinée.
//
//   {"command": "...", "url": "..."}       une commande, et l'adresse qu'elle sert
//                                          quand son port se lit dans le dépôt ;
//   {"tryable": false, "reason": "..."}    un projet qui ne s'essaie pas d'une
//                                          carte (une app qui veut un appareil).
//
//   Android (`AndroidManifest.xml`, `com.android.application`) → pas essayable
//   Xcode (`*.xcodeproj`, `*.xcworkspace`)                     → pas essayable
//   npm : un script `dev`, sinon `start`, à la racine           → `npm install && npm run dev`
//   Gradle : le plugin `application` ou Spring Boot             → `./gradlew run`, `./gradlew bootRun`
//   Python : Django (`manage.py`), Flask, FastAPI à la racine   → un venv, ses dépendances, le serveur
//
// Un dépôt qu'elle ne reconnaît pas, ou qu'elle ne lit pas, ne donne aucune
// déclaration : rien n'est écrit, aucun ticket ne part. Deux lectures du même
// dépôt : son dossier (`/brigade:init`, `declaration-cli.ts`) et sa branche
// d'intégration dans le clone de la station (le ticket de la cuisine, `ticket.ts`).
import { readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { lireLeDepot, type FichierLu } from "../installation/besoins/detecter.ts";

export const FICHIER_D_ESSAI = ".brigade/try.json";

export type DeclarationDEssai = { command: string; url?: string } | { tryable: false; reason: string };

// La déclaration, et ce qui la dit dans le dépôt : le ticket de la cuisine le cite.
export type Detectee = { declaration: DeclarationDEssai; preuve: string };

// Les fichiers de la racine que `lireLeDepot` ne lit pas et que la détection regarde.
const A_LA_RACINE = ["gradlew", "manage.py", "app.py", "main.py", ...["js", "ts", "mjs", "mts", "cjs", "cts"].map((ext) => `vite.config.${ext}`)];
const TAILLE_MAX = 512 * 1024;
const PROFONDEUR_MAX = 4;

const nomDe = (chemin: string) => chemin.slice(chemin.lastIndexOf("/") + 1);
const profondeurDe = (chemin: string) => chemin.split("/").length - 1;
const GRADLE = /^build\.gradle(?:\.kts)?$/;
const XCODE = /\.(?:xcodeproj|xcworkspace)(?:\/|$)/;

// Un chemin que la détection lit, parmi les fichiers suivis d'une branche.
export function estLu(chemin: string): boolean {
  if (profondeurDe(chemin) === 0) return A_LA_RACINE.includes(chemin) || /^(?:package\.json|requirements\.txt|pyproject\.toml)$/.test(chemin) || GRADLE.test(chemin);
  return profondeurDe(chemin) <= PROFONDEUR_MAX && (nomDe(chemin) === "AndroidManifest.xml" || GRADLE.test(nomDe(chemin)));
}

const portLu = (port: string | undefined): number | null => {
  const lu = Number(port);
  return Number.isInteger(lu) && lu >= 1 && lu <= 65535 ? lu : null;
};

// Le port que dit un script npm : `--port 3000`, `--port=3000`, `-p 3000`, `PORT=3000`.
const portDuScript = (script: string) => portLu(/(?:--port[= ]|(?:^|\s)-p\s+|\bPORT=)(\d{1,5})\b/.exec(script)?.[1]);
// Le port que dit la configuration de Vite : `server: { port: 5173 }`.
const portDeVite = (config: string) => portLu(/\bserver\s*:\s*\{[^}]*?\bport\s*:\s*(\d{1,5})\b/s.exec(config)?.[1]);

const adresse = (port: number | null) => (port === null ? {} : { url: `http://localhost:${port}` });

function depuisNpm(fichiers: readonly FichierLu[], racine: (nom: string) => FichierLu | undefined): Detectee | null {
  const paquet = racine("package.json");
  if (paquet === undefined) return null;
  let scripts: Record<string, unknown>;
  try {
    const lu = JSON.parse(paquet.contenu) as { scripts?: unknown };
    if (typeof lu !== "object" || lu === null || typeof lu.scripts !== "object" || lu.scripts === null) return null;
    scripts = lu.scripts as Record<string, unknown>;
  } catch {
    return null;
  }
  const nom = typeof scripts.dev === "string" ? "dev" : typeof scripts.start === "string" ? "start" : null;
  if (nom === null) return null;
  const script = scripts[nom] as string;
  const vite = fichiers.find(({ chemin }) => /^vite\.config\.[cm]?[jt]s$/.test(chemin));
  const port = portDuScript(script) ?? (vite === undefined ? null : portDeVite(vite.contenu));
  return {
    declaration: { command: nom === "dev" ? "npm install && npm run dev" : "npm install && npm start", ...adresse(port) },
    preuve: `\`package.json\` has a \`${nom}\` script${port === null ? "" : ` serving port ${port}`}`,
  };
}

function depuisGradle(fichiers: readonly FichierLu[], racine: (nom: string) => FichierLu | undefined): Detectee | null {
  // La racine, ou un sous-projet du premier niveau : `gradle init` met l'application dans `app/`.
  const builds = fichiers.filter(({ chemin }) => GRADLE.test(nomDe(chemin)) && profondeurDe(chemin) <= 1);
  const spring = builds.find(({ contenu }) => /org\.springframework\.boot/.test(contenu));
  const application = builds.find(({ contenu }) => /\bid\s*\(?\s*["']application["']|apply\s+plugin\s*:\s*["']application["']|^\s*application\s*$|^\s*application\s*\{/m.test(contenu));
  const trouve = spring ?? application;
  if (trouve === undefined) return null;
  const tache = spring === undefined ? "run" : "bootRun";
  const gradle = racine("gradlew") === undefined ? "gradle" : "./gradlew";
  return {
    declaration: { command: `${gradle} ${tache}` },
    preuve: `\`${trouve.chemin}\` ${spring === undefined ? "applies the Gradle `application` plugin" : "is a Spring Boot application"}`,
  };
}

function depuisPython(racine: (nom: string) => FichierLu | undefined): Detectee | null {
  const requirements = racine("requirements.txt");
  const pyproject = racine("pyproject.toml");
  const dependances = `${requirements?.contenu ?? ""}\n${pyproject?.contenu ?? ""}`;
  const depend = (paquet: string) => new RegExp(`(?:^|["'\\s])${paquet}(?=[\\s<>=~!\\[;,"']|$)`, "im").test(dependances);
  const installer = (enPlus: string) => {
    const quoi = [requirements === undefined ? (pyproject === undefined ? "" : ".") : "-r requirements.txt", enPlus].filter(Boolean).join(" ");
    return `python3 -m venv .venv${quoi === "" ? "" : ` && .venv/bin/pip install ${quoi}`}`;
  };
  if (racine("manage.py") !== undefined) {
    return { declaration: { command: `${installer("")} && .venv/bin/python manage.py runserver 8000`, url: "http://localhost:8000" }, preuve: "`manage.py` is a Django project" };
  }
  if (depend("flask") && racine("app.py") !== undefined) {
    return { declaration: { command: `${installer("")} && .venv/bin/flask --app app run --port 5000`, url: "http://localhost:5000" }, preuve: "`app.py` is a Flask application" };
  }
  if (depend("fastapi")) {
    for (const module of ["main", "app"]) {
      const variable = /^(\w+)\s*=\s*FastAPI\(/m.exec(racine(`${module}.py`)?.contenu ?? "")?.[1];
      if (variable === undefined) continue;
      return {
        declaration: { command: `${installer("uvicorn")} && .venv/bin/uvicorn ${module}:${variable} --port 8000`, url: "http://localhost:8000" },
        preuve: `\`${module}.py\` is a FastAPI application`,
      };
    }
  }
  return null;
}

// La déclaration d'un dépôt, d'après ses fichiers, ou null quand il ne dit pas
// comment il s'essaie. Pur. Un appareil d'abord : une app Android porte souvent
// aussi un `build.gradle` ou un `package.json`, qui ne la rendent pas essayable.
export function declarationDesFichiers(fichiers: readonly FichierLu[]): Detectee | null {
  const racine = (nom: string) => fichiers.find(({ chemin }) => chemin === nom);
  const android = fichiers.find(({ chemin, contenu }) => nomDe(chemin) === "AndroidManifest.xml" || (GRADLE.test(nomDe(chemin)) && /com\.android\.application/.test(contenu)));
  if (android !== undefined) {
    return { declaration: { tryable: false, reason: "An Android app: it runs on a device or an emulator, not from a card." }, preuve: `\`${android.chemin}\` makes it an Android app` };
  }
  const xcode = fichiers.find(({ chemin }) => XCODE.test(chemin));
  if (xcode !== undefined) {
    return { declaration: { tryable: false, reason: "An Xcode app: it runs from Xcode, on a device or a simulator, not from a card." }, preuve: `\`${xcode.chemin.replace(/(\.(?:xcodeproj|xcworkspace))\/.*$/, "$1")}\` makes it an Xcode app` };
  }
  return depuisNpm(fichiers, racine) ?? depuisGradle(fichiers, racine) ?? depuisPython(racine);
}

// Les fichiers d'un dossier que la détection lit : ceux des besoins
// (`lireLeDepot`), et ceux de la racine qu'ils ne lisent pas.
export function fichiersDuDossier(dossier: string): FichierLu[] {
  const lus = lireLeDepot(dossier).filter(({ chemin }) => estLu(chemin) || XCODE.test(chemin));
  for (const nom of A_LA_RACINE) {
    try {
      const chemin = join(dossier, nom);
      if (!statSync(chemin).isFile() || statSync(chemin).size > TAILLE_MAX) continue;
      lus.push({ chemin: nom, contenu: readFileSync(chemin, "utf8") });
    } catch {}
  }
  return lus;
}

// Les fichiers d'une branche que la détection lit, depuis la liste de ses
// fichiers suivis et de quoi en lire un. Une lecture qui échoue lève : un
// fichier qu'on n'a pas lu ne se compte pas comme absent.
export function fichiersDeLaBranche(suivis: readonly string[], lire: (chemin: string) => string | null): FichierLu[] {
  const lus: FichierLu[] = [];
  for (const chemin of suivis) {
    if (XCODE.test(chemin)) {
      lus.push({ chemin, contenu: "" });
      continue;
    }
    if (!estLu(chemin)) continue;
    const contenu = lire(chemin);
    if (contenu === null) throw new Error(`${chemin} is listed on the branch but cannot be read`);
    lus.push({ chemin, contenu });
  }
  return lus;
}

export const texteDeLaDeclaration = (declaration: DeclarationDEssai) => `${JSON.stringify(declaration, null, 2)}\n`;

export type Ecriture = { ecrite: Detectee } | { dejaLa: true } | { rien: true };

// Écrit `.brigade/try.json` dans le dossier d'un projet, s'il n'y est pas et
// que le dépôt dit comment il s'essaie. Un fichier déjà là n'est jamais
// réécrit, même illisible : c'est l'humain qui le corrige.
export function ecrireLaDeclaration(dossier: string): Ecriture {
  const fichier = join(dossier, FICHIER_D_ESSAI);
  try {
    statSync(fichier);
    return { dejaLa: true };
  } catch {}
  const detectee = declarationDesFichiers(fichiersDuDossier(dossier));
  if (detectee === null) return { rien: true };
  mkdirSync(dirname(fichier), { recursive: true });
  try {
    // `wx` : apparu entre-temps, il reste tel quel.
    writeFileSync(fichier, texteDeLaDeclaration(detectee.declaration), { flag: "wx" });
  } catch (erreur) {
    if ((erreur as NodeJS.ErrnoException).code === "EEXIST") return { dejaLa: true };
    throw erreur;
  }
  return { ecrite: detectee };
}

#!/usr/bin/env node
// Doublure de `gh api` pour les gists du compte, sans réseau : chaque gist est
// un fichier JSON du répertoire `FAUX_GISTS`. Elle répond comme GitHub à ce
// que la station et l'app demandent — créer, réécrire des fichiers, lire,
// lister par page —, et chaque appel est noté dans `appels`, une ligne chacun.
// Un fichier `panne` dans le répertoire la fait échouer comme un `gh` sans
// réseau ; `deconnecte`, comme un `gh` connecté à aucun compte (son message et
// son code 4) ; `jeton-refuse`, comme un `gh` dont GitHub refuse le jeton ;
// `limite`, comme un compte dont GitHub limite les appels.
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type Gist = { id: string; description: string; public: boolean; updated_at: string; files: Record<string, { filename: string; content: string }> };

const repertoire = process.env.FAUX_GISTS ?? "";
const args = process.argv.slice(2);
appendFileSync(join(repertoire, "appels"), `${args.join(" ")}\n`);

const sortir = (code: number, erreur: string): never => {
  process.stderr.write(`${erreur}\n`);
  process.exit(code);
};
if (existsSync(join(repertoire, "panne"))) sortir(1, "error connecting to api.github.com");
if (existsSync(join(repertoire, "deconnecte"))) sortir(4, "To get started with GitHub CLI, please run:  gh auth login\nAlternatively, populate the GH_TOKEN environment variable with a GitHub API authentication token.");
if (existsSync(join(repertoire, "jeton-refuse"))) sortir(1, "gh: Bad credentials (HTTP 401)");
if (existsSync(join(repertoire, "limite"))) sortir(1, "gh: API rate limit exceeded for user ID 1. (HTTP 403)");
if (args[0] !== "api") sortir(1, `faux gh : seul \`gh api\` est doublé (${args.join(" ")})`);

const option = (nom: string) => {
  const rang = args.indexOf(nom);
  return rang === -1 ? undefined : args[rang + 1];
};
const methode = option("-X") ?? "GET";
const chemin = args.slice(1).find((arg) => arg.startsWith("/")) ?? "";
const entree = () => JSON.parse(option("--input") === "-" ? readFileSync(0, "utf8") : "{}") as { description?: string; public?: boolean; files?: Record<string, { content: string }> };
const fichier = (id: string) => join(repertoire, `${id}.gist.json`);
const lire = (id: string): Gist | null => (/^[a-z0-9]+$/.test(id) && existsSync(fichier(id)) ? (JSON.parse(readFileSync(fichier(id), "utf8")) as Gist) : null);
// Écrit à côté, puis renommé : un test qui relit le gist pendant qu'une station
// le réécrit ne tombe jamais sur un fichier à moitié écrit.
const ecrire = (gist: Gist) => {
  const brouillon = `${fichier(gist.id)}.${process.pid}.brouillon`;
  writeFileSync(brouillon, JSON.stringify(gist));
  renameSync(brouillon, fichier(gist.id));
};
const rendre = (objet: unknown) => process.stdout.write(`${JSON.stringify(objet)}\n`);
const fichiers = (files: Record<string, { content: string }> = {}) => Object.fromEntries(Object.entries(files).map(([nom, { content }]) => [nom, { filename: nom, content }]));

const [, , id] = /^\/gists(\/([^/?]+))?(\?.*)?$/.exec(chemin) ?? [];
if (!chemin.startsWith("/gists")) sortir(1, `gh: Not Found (HTTP 404)`);

if (methode === "POST" && id === undefined) {
  const corps = entree();
  const nouveau = `g${readdirSync(repertoire).filter((nom) => nom.endsWith(".gist.json")).length + 1}x${process.pid}`;
  const gist: Gist = { id: nouveau, description: corps.description ?? "", public: corps.public ?? false, updated_at: new Date().toISOString(), files: fichiers(corps.files) };
  ecrire(gist);
  rendre(gist);
} else if (methode === "PATCH" && id !== undefined) {
  // GitHub fusionne les fichiers d'un PATCH de son côté : deux réécritures du
  // même gist au même instant — l'enregistrement d'une station et son suivi —
  // gardent chacune les siens. La doublure lit, modifie et récrit : elle le
  // fait sous un verrou, sinon la seconde efface la première.
  const corps = entree();
  const verrou = `${fichier(id)}.verrou`;
  for (;;) {
    try {
      mkdirSync(verrou);
      break;
    } catch {
      // Un verrou laissé par une doublure tuée en plein PATCH ne bloque pas les suivantes.
      try {
        if (Date.now() - statSync(verrou).mtimeMs > 10_000) rmdirSync(verrou);
      } catch {}
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
    }
  }
  // `sortir` quitte le process sans passer par un `finally` : le verrou est levé avant.
  const gist = lire(id);
  if (gist !== null) {
    Object.assign(gist.files, fichiers(corps.files));
    ecrire({ ...gist, updated_at: new Date().toISOString() });
  }
  rmdirSync(verrou);
  rendre(gist ?? sortir(1, "gh: Not Found (HTTP 404)"));
} else if (methode === "GET" && id !== undefined) {
  rendre(lire(id) ?? sortir(1, "gh: Not Found (HTTP 404)"));
} else if (methode === "GET") {
  // La liste ne porte pas le contenu des fichiers, comme celle de GitHub.
  const parametres = new URLSearchParams(chemin.split("?")[1] ?? "");
  const parPage = Number(parametres.get("per_page") ?? 30);
  const page = Number(parametres.get("page") ?? 1);
  const tous = readdirSync(repertoire)
    .filter((nom) => nom.endsWith(".gist.json"))
    .sort()
    .map((nom) => JSON.parse(readFileSync(join(repertoire, nom), "utf8")) as Gist)
    .map(({ files, ...gist }) => ({ ...gist, files: Object.fromEntries(Object.keys(files).map((nom) => [nom, { filename: nom }])) }));
  rendre(tous.slice((page - 1) * parPage, page * parPage));
} else sortir(1, `faux gh : ${methode} ${chemin} n'est pas doublé`);

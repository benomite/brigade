#!/usr/bin/env node
// Doublure de `gh api` pour les gists du compte, sans réseau — la même que
// celle du runtime (runtime/test/appairage/faux-gh-gists.ts) : chaque gist est
// un fichier JSON du répertoire `FAUX_GISTS`. Elle répond comme GitHub à ce
// que la station et l'app demandent — créer, réécrire des fichiers, lire,
// lister par page —, et chaque appel est noté dans `appels`, une ligne chacun.
// Un fichier `panne` dans le répertoire la fait échouer comme un `gh` sans
// réseau.
//
// `repondre` est la doublure elle-même, que `gh` en process (../aides/gh-du-repertoire.ts)
// fait jouer dans le process du test ; lancé par son chemin, ce fichier la joue dans le sien.
import { appendFileSync, existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type Gist = { id: string; description: string; public: boolean; updated_at: string; files: Record<string, { filename: string; content: string }> };

// Ce qu'un `gh` rend : son code de sortie, sa sortie standard et sa sortie d'erreur.
export type Rendu = { code: number; sortie: string; erreurs: string };

class Sortie extends Error {
  readonly rendu: Rendu;
  constructor(rendu: Rendu) {
    super(rendu.erreurs);
    this.rendu = rendu;
  }
}

// `repertoire` : celui des gists (`FAUX_GISTS`) ; `entree` : ce que `gh` lit sur son entrée standard.
export function repondre(repertoire: string, args: readonly string[], entree: () => string): Rendu {
  try {
    return { code: 0, sortie: jouer(repertoire, args, entree), erreurs: "" };
  } catch (erreur) {
    if (erreur instanceof Sortie) return erreur.rendu;
    throw erreur;
  }
}

function jouer(repertoire: string, args: readonly string[], lue: () => string): string {
  appendFileSync(join(repertoire, "appels"), `${args.join(" ")}\n`);

  const sortir = (code: number, erreur: string): never => {
    throw new Sortie({ code, sortie: "", erreurs: `${erreur}\n` });
  };
  if (existsSync(join(repertoire, "panne"))) sortir(1, "error connecting to api.github.com");
  // Un fichier `limite` la fait répondre comme un GitHub qui limite les appels du compte : il porte
  // l'heure où il les rend, en secondes — que `/rate_limit` dit, sans compter pour la limite.
  const limite = join(repertoire, "limite");
  if (existsSync(limite) && args.includes("/rate_limit")) {
    return `${JSON.stringify({ resources: { core: { limit: 5000, remaining: 0, reset: Number(readFileSync(limite, "utf8")) } } })}\n`;
  }
  if (existsSync(limite)) sortir(1, "gh: API rate limit exceeded for user ID 1. (HTTP 403)");
  if (args[0] !== "api") sortir(1, `faux gh : seul \`gh api\` est doublé (${args.join(" ")})`);

  const option = (nom: string) => {
    const rang = args.indexOf(nom);
    return rang === -1 ? undefined : args[rang + 1];
  };
  const methode = option("-X") ?? "GET";
  const chemin = args.slice(1).find((arg) => arg.startsWith("/")) ?? "";
  const entree = () => JSON.parse(option("--input") === "-" ? lue() : "{}") as { description?: string; public?: boolean; files?: Record<string, { content: string } | null> };
  const fichier = (id: string) => join(repertoire, `${id}.gist.json`);
  const lire = (id: string): Gist | null => (/^[a-z0-9]+$/.test(id) && existsSync(fichier(id)) ? (JSON.parse(readFileSync(fichier(id), "utf8")) as Gist) : null);
  // Écrit à côté, puis renommé : un test qui relit le gist pendant qu'une station
  // le réécrit ne tombe jamais sur un fichier à moitié écrit.
  const ecrire = (gist: Gist) => {
    const brouillon = `${fichier(gist.id)}.${process.pid}.brouillon`;
    writeFileSync(brouillon, JSON.stringify(gist));
    renameSync(brouillon, fichier(gist.id));
  };
  const rendre = (objet: unknown) => `${JSON.stringify(objet)}\n`;
  const fichiers = (files: Record<string, { content: string } | null> = {}) => Object.fromEntries(Object.entries(files).flatMap(([nom, fichier]) => (fichier === null ? [] : [[nom, { filename: nom, content: fichier.content }]])));

  const [, , id] = /^\/gists(\/([^/?]+))?(\?.*)?$/.exec(chemin) ?? [];
  if (!chemin.startsWith("/gists")) sortir(1, `gh: Not Found (HTTP 404)`);

  if (methode === "POST" && id === undefined) {
    const corps = entree();
    const nouveau = `g${readdirSync(repertoire).filter((nom) => nom.endsWith(".gist.json")).length + 1}x${process.pid}`;
    const gist: Gist = { id: nouveau, description: corps.description ?? "", public: corps.public ?? false, updated_at: new Date().toISOString(), files: fichiers(corps.files) };
    ecrire(gist);
    return rendre(gist);
  } else if (methode === "PATCH" && id !== undefined) {
    const gist = lire(id) ?? sortir(1, "gh: Not Found (HTTP 404)");
    // Un fichier à `null` est retiré du gist, comme GitHub le fait.
    const demandes = entree().files ?? {};
    for (const [nom, contenu] of Object.entries(demandes)) if (contenu === null) delete gist.files[nom];
    Object.assign(gist.files, fichiers(demandes));
    ecrire({ ...gist, updated_at: new Date().toISOString() });
    return rendre(gist);
  } else if (methode === "GET" && id !== undefined) {
    return rendre(lire(id) ?? sortir(1, "gh: Not Found (HTTP 404)"));
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
    return rendre(tous.slice((page - 1) * parPage, page * parPage));
  }
  return sortir(1, `faux gh : ${methode} ${chemin} n'est pas doublé`);
}

if (import.meta.main) {
  const { code, sortie, erreurs } = repondre(process.env.FAUX_GISTS ?? "", process.argv.slice(2), () => readFileSync(0, "utf8"));
  process.stdout.write(sortie);
  process.stderr.write(erreurs);
  process.exitCode = code;
}

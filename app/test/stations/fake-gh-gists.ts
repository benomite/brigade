#!/usr/bin/env node
// Doublure de `gh api` pour les gists du compte, sans réseau — la même que
// celle du runtime (runtime/test/appairage/faux-gh-gists.ts) : chaque gist est
// un fichier JSON du répertoire `FAUX_GISTS`. Elle répond comme GitHub à ce
// que la station et l'app demandent — créer, réécrire des fichiers, lire,
// lister par page —, et chaque appel est noté dans `appels`, une ligne chacun.
// Un fichier `panne` dans le répertoire la fait échouer comme un `gh` sans
// réseau.
//
// `repondre` est la doublure elle-même, que `gh` en process (../helpers/gh-of-directory.ts)
// fait jouer dans le process du test ; lancé par son chemin, ce fichier la joue dans le sien.
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type Gist = { id: string; description: string; public: boolean; updated_at: string; files: Record<string, { filename: string; content: string }> };

// Ce qu'un `gh` rend : son code de sortie, sa sortie standard et sa sortie d'erreur.
export type Rendered = { code: number; sortie: string; erreurs: string };

class Output extends Error {
  readonly rendu: Rendered;
  constructor(rendered: Rendered) {
    super(rendered.erreurs);
    this.rendu = rendered;
  }
}

// `repertoire` : celui des gists (`FAUX_GISTS`) ; `entree` : ce que `gh` lit sur son entrée standard.
export function reply(directory: string, args: readonly string[], entry: () => string): Rendered {
  try {
    return { code: 0, sortie: play(directory, args, entry), erreurs: "" };
  } catch (error) {
    if (error instanceof Output) return error.rendu;
    throw error;
  }
}

function play(directory: string, args: readonly string[], readEntry: () => string): string {
  appendFileSync(join(directory, "appels"), `${args.join(" ")}\n`);

  const exit = (code: number, error: string): never => {
    throw new Output({ code, sortie: "", erreurs: `${error}\n` });
  };
  if (existsSync(join(directory, "panne"))) exit(1, "error connecting to api.github.com");
  // Un fichier `limite` la fait répondre comme un GitHub qui limite les appels du compte : il porte
  // l'heure où il les rend, en secondes — que `/rate_limit` dit, sans compter pour la limite.
  const limit = join(directory, "limite");
  if (existsSync(limit) && args.includes("/rate_limit")) {
    return `${JSON.stringify({ resources: { core: { limit: 5000, remaining: 0, reset: Number(readFileSync(limit, "utf8")) } } })}\n`;
  }
  if (existsSync(limit)) exit(1, "gh: API rate limit exceeded for user ID 1. (HTTP 403)");
  if (args[0] !== "api") exit(1, `faux gh : seul \`gh api\` est doublé (${args.join(" ")})`);

  const option = (name: string) => {
    const rank = args.indexOf(name);
    return rank === -1 ? undefined : args[rank + 1];
  };
  const method = option("-X") ?? "GET";
  const path = args.slice(1).find((arg) => arg.startsWith("/")) ?? "";
  const entry = () => JSON.parse(option("--input") === "-" ? readEntry() : "{}") as { description?: string; public?: boolean; files?: Record<string, { content: string } | null> };
  const file = (id: string) => join(directory, `${id}.gist.json`);
  const read = (id: string): Gist | null => (/^[a-z0-9]+$/.test(id) && existsSync(file(id)) ? (JSON.parse(readFileSync(file(id), "utf8")) as Gist) : null);
  // Écrit à côté, puis renommé : un test qui relit le gist pendant qu'une station
  // le réécrit ne tombe jamais sur un fichier à moitié écrit.
  const write = (gist: Gist) => {
    const draft = `${file(gist.id)}.${process.pid}.brouillon`;
    writeFileSync(draft, JSON.stringify(gist));
    renameSync(draft, file(gist.id));
  };
  const render = (object: unknown) => `${JSON.stringify(object)}\n`;
  // Une lecture avec `-i`, comme GitHub : ses en-têtes et son ETag ; sous `If-None-Match` qui le porte encore, un 304
  // sans corps, sur lequel `gh` sort en erreur en écrivant tout de même la réponse.
  const reading = (body: string): string => {
    if (!args.includes("-i")) return body;
    const etag = `W/"${createHash("sha1").update(body).digest("hex")}"`;
    const condition = args.find((arg) => arg.startsWith("If-None-Match: "))?.slice("If-None-Match: ".length);
    if (condition === etag) throw new Output({ code: 1, sortie: `HTTP/2.0 304 Not Modified\r\nEtag: ${etag}\r\n\r\n`, erreurs: "gh: HTTP 304\n" });
    return `HTTP/2.0 200 OK\r\nEtag: ${etag}\r\n\r\n${body}`;
  };
  const files = (files: Record<string, { content: string } | null> = {}) => Object.fromEntries(Object.entries(files).flatMap(([name, file]) => (file === null ? [] : [[name, { filename: name, content: file.content }]])));

  const [, , id] = /^\/gists(\/([^/?]+))?(\?.*)?$/.exec(path) ?? [];
  if (!path.startsWith("/gists")) exit(1, `gh: Not Found (HTTP 404)`);

  if (method === "POST" && id === undefined) {
    const body = entry();
    const newOne = `g${readdirSync(directory).filter((name) => name.endsWith(".gist.json")).length + 1}x${process.pid}`;
    const gist: Gist = { id: newOne, description: body.description ?? "", public: body.public ?? false, updated_at: new Date().toISOString(), files: files(body.files) };
    write(gist);
    return render(gist);
  } else if (method === "PATCH" && id !== undefined) {
    const gist = read(id) ?? exit(1, "gh: Not Found (HTTP 404)");
    // Un fichier à `null` est retiré du gist, comme GitHub le fait.
    const requests = entry().files ?? {};
    for (const [name, content] of Object.entries(requests)) if (content === null) delete gist.files[name];
    Object.assign(gist.files, files(requests));
    write({ ...gist, updated_at: new Date().toISOString() });
    return render(gist);
  } else if (method === "GET" && id !== undefined) {
    return reading(render(read(id) ?? exit(1, "gh: Not Found (HTTP 404)")));
  } else if (method === "GET") {
    // La liste ne porte pas le contenu des fichiers, comme celle de GitHub.
    const parameters = new URLSearchParams(path.split("?")[1] ?? "");
    const byPage = Number(parameters.get("per_page") ?? 30);
    const page = Number(parameters.get("page") ?? 1);
    const all = readdirSync(directory)
      .filter((name) => name.endsWith(".gist.json"))
      .sort()
      .map((name) => JSON.parse(readFileSync(join(directory, name), "utf8")) as Gist)
      .map(({ files, ...gist }) => ({ ...gist, files: Object.fromEntries(Object.keys(files).map((name) => [name, { filename: name }])) }));
    return reading(render(all.slice((page - 1) * byPage, page * byPage)));
  }
  return exit(1, `faux gh : ${method} ${path} n'est pas doublé`);
}

if (import.meta.main) {
  const { code, sortie: output, erreurs: errors } = reply(process.env.FAUX_GISTS ?? "", process.argv.slice(2), () => readFileSync(0, "utf8"));
  process.stdout.write(output);
  process.stderr.write(errors);
  process.exitCode = code;
}

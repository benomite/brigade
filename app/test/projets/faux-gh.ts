#!/usr/bin/env node
// Doublure de `gh api` pour le parcours « Add a project », sans réseau : la liste des dépôts du
// compte (`/user/repos`) est le tableau JSON du fichier `depots` de `FAUX_GISTS`, servi par page ;
// tout le reste — les gists des stations — va à la doublure des gists (../stations/faux-gh-gists.ts).
// `repondre` est la doublure elle-même, jouée dans le process du test (../aides/gh-du-repertoire.ts) ;
// lancé par son chemin, ce fichier la joue dans le sien.
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { repondre as repondreDesGists, type Rendu } from "../stations/faux-gh-gists.ts";

export function repondre(repertoire: string, args: readonly string[], entree: () => string): Rendu {
  const chemin = args.slice(1).find((arg) => arg.startsWith("/")) ?? "";
  if (args[0] === "api" && chemin.startsWith("/user/repos")) {
    appendFileSync(join(repertoire, "appels"), `${args.join(" ")}\n`);
    if (existsSync(join(repertoire, "panne"))) return { code: 1, sortie: "", erreurs: "error connecting to api.github.com\n" };
    const parametres = new URLSearchParams(chemin.split("?")[1] ?? "");
    const parPage = Number(parametres.get("per_page") ?? 30);
    const page = Number(parametres.get("page") ?? 1);
    const tous = existsSync(join(repertoire, "depots")) ? (JSON.parse(readFileSync(join(repertoire, "depots"), "utf8")) as unknown[]) : [];
    return { code: 0, sortie: `${JSON.stringify(tous.slice((page - 1) * parPage, page * parPage))}\n`, erreurs: "" };
  }
  return repondreDesGists(repertoire, args, entree);
}

if (import.meta.main) {
  const { code, sortie, erreurs } = repondre(process.env.FAUX_GISTS ?? "", process.argv.slice(2), () => readFileSync(0, "utf8"));
  process.stdout.write(sortie);
  process.stderr.write(erreurs);
  process.exitCode = code;
}

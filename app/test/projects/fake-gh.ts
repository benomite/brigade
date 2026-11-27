#!/usr/bin/env node
// Doublure de `gh api` pour le parcours « Add a project », sans réseau : la liste des dépôts du
// compte (`/user/repos`) est le tableau JSON du fichier `depots` de `FAUX_GISTS`, servi par page ;
// tout le reste — les gists des stations — va à la doublure des gists (../stations/fake-gh-gists.ts).
// `repondre` est la doublure elle-même, jouée dans le process du test (../helpers/gh-of-directory.ts) ;
// lancé par son chemin, ce fichier la joue dans le sien.
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { reply as answerOfGists, type Rendered } from "../stations/fake-gh-gists.ts";

export function reply(directory: string, args: readonly string[], entry: () => string): Rendered {
  const path = args.slice(1).find((arg) => arg.startsWith("/")) ?? "";
  if (args[0] === "api" && path.startsWith("/user/repos")) {
    appendFileSync(join(directory, "appels"), `${args.join(" ")}\n`);
    if (existsSync(join(directory, "panne"))) return { code: 1, sortie: "", erreurs: "error connecting to api.github.com\n" };
    const parameters = new URLSearchParams(path.split("?")[1] ?? "");
    const byPage = Number(parameters.get("per_page") ?? 30);
    const page = Number(parameters.get("page") ?? 1);
    const all = existsSync(join(directory, "depots")) ? (JSON.parse(readFileSync(join(directory, "depots"), "utf8")) as unknown[]) : [];
    return { code: 0, sortie: `${JSON.stringify(all.slice((page - 1) * byPage, page * byPage))}\n`, erreurs: "" };
  }
  return answerOfGists(directory, args, entry);
}

if (import.meta.main) {
  const { code, sortie: output, erreurs: errors } = reply(process.env.FAUX_GISTS ?? "", process.argv.slice(2), () => readFileSync(0, "utf8"));
  process.stdout.write(output);
  process.stderr.write(errors);
  process.exitCode = code;
}

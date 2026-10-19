#!/usr/bin/env node
// Doublure de `gh api` pour le parcours « Add a project », sans réseau : la liste des dépôts du
// compte (`/user/repos`) est le tableau JSON du fichier `depots` de `FAUX_GISTS`, servi par page ;
// tout le reste — les gists des stations — va à la doublure des gists (../stations/faux-gh-gists.ts).
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const repertoire = process.env.FAUX_GISTS ?? "";
const args = process.argv.slice(2);
const chemin = args.slice(1).find((arg) => arg.startsWith("/")) ?? "";
if (args[0] === "api" && chemin.startsWith("/user/repos")) {
  appendFileSync(join(repertoire, "appels"), `${args.join(" ")}\n`);
  if (existsSync(join(repertoire, "panne"))) {
    process.stderr.write("error connecting to api.github.com\n");
    process.exit(1);
  }
  const parametres = new URLSearchParams(chemin.split("?")[1] ?? "");
  const parPage = Number(parametres.get("per_page") ?? 30);
  const page = Number(parametres.get("page") ?? 1);
  const tous = existsSync(join(repertoire, "depots")) ? (JSON.parse(readFileSync(join(repertoire, "depots"), "utf8")) as unknown[]) : [];
  process.stdout.write(`${JSON.stringify(tous.slice((page - 1) * parPage, page * parPage))}\n`);
} else {
  // Dans ce même process, avec les mêmes arguments : un second node par appel doublait le coût de chacun.
  await import("../stations/faux-gh-gists.ts");
}

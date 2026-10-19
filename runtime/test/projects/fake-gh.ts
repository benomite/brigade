#!/usr/bin/env node
// Doublure de `gh` pour une station à qui l'app ajoute un projet, sans réseau :
// `gh repo clone <owner>/<repo> <dossier>` clone l'origine nue
// `$FAUX_ORIGINES/<owner>/<repo>.git` ; les issues du dépôt sont notées dans
// `$FAUX_GISTS/issues` ; tout le reste — les gists du compte —
// va à la doublure des gists (../pairing/fake-gh-gists.ts). Un clone est
// noté dans `$FAUX_GISTS/clones`, une ligne chacun.
import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
if (args[0] === "repo" && args[1] === "clone") {
  const [depot = "", dossier = ""] = args.slice(2);
  const origine = join(process.env.FAUX_ORIGINES ?? "", `${depot}.git`);
  appendFileSync(join(process.env.FAUX_GISTS ?? "", "clones"), `${depot} ${dossier}\n`);
  if (!existsSync(origine)) {
    process.stderr.write(`GraphQL: Could not resolve to a Repository with the name '${depot}'. (repository)\n`);
    process.exit(1);
  }
  execFileSync("git", ["clone", "-q", origine, dossier], { stdio: "inherit" });
} else if (args[0] === "api" && args.some((arg) => /^repos\/[^/]+\/[^/]+\/issues(\?|$)/.test(arg))) {
  // Les issues du dépôt : aucune à lister ; une créée est notée dans
  // `$FAUX_GISTS/issues`, une ligne JSON chacune, et reçoit le numéro suivant.
  const champs = args.flatMap((arg, rang) => (args[rang - 1] === "-f" ? [arg] : []));
  const champ = (nom: string) => champs.flatMap((brut) => (brut.startsWith(`${nom}=`) ? [brut.slice(nom.length + 1)] : []));
  const repondre = (statut: number, corps: unknown) => process.stdout.write(`HTTP/2.0 ${statut}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(corps)}\n`);
  if (args.includes("POST")) {
    const notees = join(process.env.FAUX_GISTS ?? "", "issues");
    const numero = (existsSync(notees) ? readFileSync(notees, "utf8").split("\n").filter(Boolean).length : 0) + 1;
    appendFileSync(notees, `${JSON.stringify({ number: numero, title: champ("title")[0], body: champ("body")[0], labels: champ("labels[]") })}\n`);
    repondre(201, { number: numero });
  } else repondre(200, []);
} else {
  const rendu = spawnSync(process.execPath, [join(import.meta.dirname, "../pairing/fake-gh-gists.ts"), ...args], { stdio: "inherit" });
  process.exit(rendu.status ?? 1);
}

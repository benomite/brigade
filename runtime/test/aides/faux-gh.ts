#!/usr/bin/env node
// Doublure de `gh` : rejoue les réponses dictées dans `reponses.json` et note
// ses appels dans `appels.jsonl`, sans réseau. Les deux fichiers vivent à côté
// du lien par lequel on l'appelle — un répertoire par test. Tant que rien n'a
// été dicté, elle échoue comme un `gh` sans réseau.
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const repertoire = dirname(process.argv[1] ?? "");
const args = process.argv.slice(2);
appendFileSync(join(repertoire, "appels.jsonl"), `${JSON.stringify(args)}\n`);
const fichier = join(repertoire, "reponses.json");
if (!existsSync(fichier)) {
  console.error("gh: connexion impossible");
  process.exit(1);
}
const reponse = JSON.parse(readFileSync(fichier, "utf8"))[args.at(-1) ?? ""];
const condition = args.includes("-H") ? args[args.indexOf("-H") + 1] : "";
const repondre = (statut: number, entetes: string[], corps: string) => {
  process.stdout.write([`HTTP/2.0 ${statut}`, ...entetes, "", corps].join("\r\n"));
  if (statut !== 200) console.error(`gh: HTTP ${statut}`);
  process.exitCode = statut === 200 ? 0 : 1;
};
if (!reponse) repondre(404, [], "{}");
else if (reponse.etag && condition === `If-None-Match: ${reponse.etag}`) repondre(304, [], "");
else {
  const entetes = ["Content-Type: application/json"];
  if (reponse.etag) entetes.push(`Etag: ${reponse.etag}`);
  if (reponse.suivant) entetes.push(`Link: <${reponse.suivant}>; rel="next"`);
  repondre(reponse.statut ?? 200, entetes, JSON.stringify(reponse.corps));
}

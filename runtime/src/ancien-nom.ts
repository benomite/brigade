// Un ancien nom de commande (`commandes.ts`) : `npm run garde-fous` lance ce
// fichier, qui dit le nouveau nom sur la sortie d'erreur, puis lance la commande
// sous son nouveau nom, avec les mêmes arguments, la même entrée et les mêmes
// sorties. Son code de sortie est celui de la commande.
//
// Le nom tapé est celui du script que `npm` lance (`npm_lifecycle_event`).
// Lancé autrement, ce fichier ne sait pas quelle commande il remplace : il le
// dit et sort en 2.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { direAncien, parAncienNom } from "./commandes.ts";

const tape = process.env.npm_lifecycle_event ?? "";
const nouveau = parAncienNom(tape)?.nom;
const scripts: Record<string, string> = JSON.parse(readFileSync(join(import.meta.dirname, "../package.json"), "utf8")).scripts ?? {};
const fichier = nouveau === undefined ? undefined : /^node (src\/[\w-]+\.ts)$/.exec(scripts[nouveau] ?? "")?.[1];
if (nouveau === undefined || fichier === undefined) {
  console.error(`brigade: “${tape}” is not an old command name — \`help\` lists the commands`);
  process.exit(2);
}

console.error(direAncien(tape, nouveau));
const fin = spawnSync(process.execPath, [join(import.meta.dirname, "..", fichier), ...process.argv.slice(2)], { stdio: "inherit" });
if (fin.error) throw fin.error;
if (fin.signal !== null) process.kill(process.pid, fin.signal);
process.exitCode = fin.status ?? 1;

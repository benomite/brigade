// Les commandes de la box sous leur nom anglais (`commandes.ts`, docs/glossary.md) : `help` seule, `manager` étant partie (#4710).
// Les anciens noms de commande sont partis avec l'ancien runtime (#4499).
// Le script de chaque nom est `node src/<fichier>.ts` (premier test). `npm` est éprouvé une fois : l'aide sous son nom.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { principal as aide } from "../src/aide.ts";
import { COMMANDES } from "../src/commandes.ts";
import { appeler, CACHE_DE_COMPILATION } from "./outils.ts";

const RUNTIME = join(import.meta.dirname, "..");
const scripts: Record<string, string> = JSON.parse(readFileSync(join(RUNTIME, "package.json"), "utf8")).scripts;
const DU_DEV = ["test", "typecheck", "start"];

// Lancé sans rien de l'environnement d'un service : ni état, ni dépôt, ni arbitre
// — le cache de compilation seul, qui n'en est pas.
// Sous Windows, `npm` est un `npm.cmd`, que seul un shell lance, et un process
// n'y démarre pas sans ce que Windows lui donne : son système, son répertoire
// temporaire, et pour `npm` le répertoire de ses réglages.
const SOUS_WINDOWS = process.platform === "win32";
const DE_WINDOWS = SOUS_WINDOWS ? Object.fromEntries(["SystemRoot", "windir", "SystemDrive", "ComSpec", "PATHEXT", "TEMP", "TMP", "APPDATA", "LOCALAPPDATA", "USERPROFILE"].flatMap((nom) => (process.env[nom] === undefined ? [] : [[nom, process.env[nom] as string]]))) : {};
const ENV_DE_BASE: Record<string, string> = { ...DE_WINDOWS, PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "/tmp", ...CACHE_DE_COMPILATION };
type Fin = { code: number | null; sortie: string; erreur: string };
function jouer(commande: string[], env: Record<string, string> = {}): Promise<Fin> {
  return new Promise((resoudre, rejeter) => {
    const programme = SOUS_WINDOWS && commande[0] === "npm" ? "npm.cmd" : (commande[0] ?? "");
    const enfant = spawn(programme, commande.slice(1), { cwd: RUNTIME, shell: SOUS_WINDOWS && programme === "npm.cmd", env: { ...ENV_DE_BASE, ...env } });
    let [sortie, erreur] = ["", ""];
    enfant.stdout.on("data", (morceau) => (sortie += morceau));
    enfant.stderr.on("data", (morceau) => (erreur += morceau));
    enfant.on("error", rejeter);
    enfant.on("close", (code) => resoudre({ code, sortie, erreur }));
  });
}
const npm = (nom: string, args: string[] = []) => jouer(["npm", "--silent", "run", nom, ...(args.length > 0 ? ["--", ...args] : [])]);
// Chaque test lance ses commandes sans état ni dépôt, et n'écrit rien : ils se jouent de front.
describe("les commandes du runtime", { concurrency: 4 }, () => {
  test("chaque commande du runtime est dans la table, sous son nom anglais, une fois", () => {
    const anglais = COMMANDES.map(({ nom }) => nom);
    assert.deepEqual(Object.keys(scripts).filter((nom) => !DU_DEV.includes(nom)).sort(), [...anglais].sort());
    for (const nom of anglais) assert.match(scripts[nom] ?? "", /^node src\/[\w-]+\.ts$/, nom);
    assert.equal(new Set(anglais).size, anglais.length);
  });

  test("`manager` n'est plus une commande : l'app lit GitHub (#4710)", () => {
    assert.equal(scripts.manager, undefined);
    assert.deepEqual(COMMANDES.map(({ nom }) => nom), ["help"]);
  });

  test("l'aide ne nomme que les commandes sous leur nom anglais, chacune avec ce qu'elle fait, en anglais", async () => {
    const appel = appeler(aide);
    assert.equal(await appel.fin, 0);
    const lignes = appel.sortie().trimEnd().split("\n");
    assert.equal(lignes[0], "usage: brigade <project> <command> [arguments…]");
    const listees = lignes.slice(lignes.indexOf("Commands:") + 1).map((ligne) => ligne.trim().split(/\s+/)[0]);
    assert.deepEqual(listees, COMMANDES.map(({ nom }) => nom));
    // Rien de français : ni accent, ni ancien mot d'une commande.
    assert.doesNotMatch(appel.sortie(), /[àâçéèêëîïôûùüÿœæ«»]/i);

    const enTrop = appeler(aide, ["status"]);
    assert.equal(await enTrop.fin, 2);
  });

  test("`npm run help` rend l'aide, telle que la commande la dit", async () => {
    const fin = await npm("help");
    assert.equal(fin.code, 0);
    const appel = appeler(aide);
    await appel.fin;
    assert.equal(fin.sortie, appel.sortie());
  });
});

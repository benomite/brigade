// Les commandes de la box sous leur nom anglais (`commandes.ts`, docs/glossary.md),
// et les noms d'avant qui répondent encore jusqu'à la date que CHANGELOG.md annonce.
//
// Codes de sortie éprouvés ici :
//   - un nom anglais lance sa commande : le code est le sien. Lancée sans son
//     environnement (ni BRIGADE_STATE_DIR ni rien), chaque commande le refuse en
//     2 — c'est ce refus, avec son usage, qui prouve qu'elle a été lancée ;
//   - un ancien nom de commande lance la même commande : il écrit d'abord le
//     nouveau nom sur la sortie d'erreur, puis rend le code de la commande — ici
//     2, le même refus, mot pour mot ;
//   - un ancien mot d'une commande (sous-commande ou option) est remplacé par le
//     sien, dit sur la sortie d'erreur : là aussi, le code est celui de la
//     commande — 2, lancée sans son environnement.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { principal as aide } from "../src/aide.ts";
import { COMMANDES, direAncien, enAnglais, FIN_DES_ANCIENS_NOMS, SCRIPT_D_ANCIEN_NOM } from "../src/commandes.ts";
import { appeler } from "./outils.ts";

const RUNTIME = join(import.meta.dirname, "..");
const scripts: Record<string, string> = JSON.parse(readFileSync(join(RUNTIME, "package.json"), "utf8")).scripts;
const DU_DEV = ["test", "typecheck", "start"];
const RENOMMEES = COMMANDES.filter((commande) => commande.ancien !== undefined);
const REFUS = 2;

// Lancé sans rien de l'environnement d'un service : ni état, ni dépôt, ni arbitre.
function jouer(commande: string[]): Promise<{ code: number | null; sortie: string; erreur: string }> {
  return new Promise((resoudre, rejeter) => {
    const enfant = spawn(commande[0] ?? "", commande.slice(1), { cwd: RUNTIME, env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "/tmp" } });
    let [sortie, erreur] = ["", ""];
    enfant.stdout.on("data", (morceau) => (sortie += morceau));
    enfant.stderr.on("data", (morceau) => (erreur += morceau));
    enfant.on("error", rejeter);
    enfant.on("close", (code) => resoudre({ code, sortie, erreur }));
  });
}
const npm = (nom: string, args: string[] = []) => jouer(["npm", "--silent", "run", nom, ...(args.length > 0 ? ["--", ...args] : [])]);

// Ce qui fait refuser chaque commande sans rien toucher : son environnement
// manque, ou ses arguments ne se lisent pas. Et ce que son refus dit d'elle.
const SANS_EFFET: Record<string, { args?: string[]; dit: RegExp }> = {
  installation: { args: ["inconnue"], dit: /run installation -- \[labels/ },
  closing: { dit: /run closing\b/ },
  door: { dit: /the door refuses to start/ },
  "hold-arbiter": { dit: /the arbiter refuses to start/ },
};
const refusDe = (nom: string) => SANS_EFFET[nom] ?? { dit: new RegExp(`run ${nom}\\b`) };

// Chaque test lance ses commandes sans état ni dépôt, et n'écrit rien : ils se jouent de front.
describe("les commandes du runtime", { concurrency: 8 }, () => {
  test("chaque commande du runtime est dans la table, sous son nom anglais ; chaque ancien nom y est, et son script ne fait que l'annoncer", () => {
    const anglais = COMMANDES.map(({ nom }) => nom);
    const anciens = RENOMMEES.map(({ ancien }) => ancien ?? "");
    assert.deepEqual(Object.keys(scripts).filter((nom) => !DU_DEV.includes(nom)).sort(), [...anglais, ...anciens].sort());
    for (const nom of anglais) assert.match(scripts[nom] ?? "", /^node src\/[\w-]+\.ts$/, nom);
    for (const nom of anglais) assert.notEqual(scripts[nom], SCRIPT_D_ANCIEN_NOM, nom);
    for (const ancien of anciens) assert.equal(scripts[ancien], SCRIPT_D_ANCIEN_NOM, ancien);
    // Un nom anglais n'est jamais aussi un ancien nom, ni deux fois dans la table.
    assert.equal(new Set([...anglais, ...anciens]).size, anglais.length + anciens.length);
  });

  test("taper le nom anglais lance la commande : son propre refus, son usage, et aucun ancien nom annoncé", async () => {
    const lancees = COMMANDES.filter(({ nom }) => nom !== "help").map(async ({ nom }) => ({ nom, fin: await npm(nom, refusDe(nom).args) }));
    for (const { nom, fin } of await Promise.all(lancees)) {
      assert.equal(fin.code, REFUS, `${nom} : ${fin.erreur}`);
      assert.match(fin.sortie + fin.erreur, refusDe(nom).dit, nom);
      assert.doesNotMatch(fin.erreur, /is now/, nom);
    }
  });

  test("un ancien nom de commande lance encore la commande : il dit d'abord le nouveau nom et le jour où il cessera de répondre, puis rend ce qu'elle rend, code compris", async () => {
    const lancees = RENOMMEES.map(async ({ nom, ancien = "" }) => ({ nom, ancien, avant: await npm(ancien, refusDe(nom).args), apres: await npm(nom, refusDe(nom).args) }));
    for (const { nom, ancien, avant, apres } of await Promise.all(lancees)) {
      const [annonce, ...reste] = avant.erreur.split("\n");
      assert.equal(annonce, `brigade: “${ancien}” is now “${nom}” — the old name still works until ${FIN_DES_ANCIENS_NOMS}, then stops (CHANGELOG.md)`, ancien);
      // Le même refus que sous le nouveau nom, au mot près, et le même code.
      assert.equal(avant.code, apres.code, ancien);
      assert.equal(avant.code, REFUS, ancien);
      assert.equal(reste.join("\n"), apres.erreur, ancien);
      assert.equal(avant.sortie, apres.sortie, ancien);
    }
  });

  test("un ancien nom lancé sans `npm` ne devine rien : il le dit, en 2", async () => {
    const fin = await jouer([process.execPath, "src/ancien-nom.ts"]);
    assert.equal(fin.code, 2);
    assert.match(fin.erreur, /is not an old command name — `help` lists the commands/);
  });

  // Pour chaque ancien mot : de quoi le placer là où sa commande le lit.
  const placer = (rang: number, mot: string) => (mot.startsWith("--") ? ["inconnue", mot] : rang === 1 ? ["une-station", mot] : [mot]);

  test("chaque commande remplace ses anciens mots par les siens, et le dit : sa sous-commande au rang qu'elle lit, ses options où qu'elles soient", async () => {
    const fichierDe = (nom: string) => /^node (src\/[\w-]+\.ts)$/.exec(scripts[nom] ?? "")?.[1] ?? "";
    const essais = COMMANDES.flatMap(({ nom, mots = {}, rang = 0 }) => Object.entries(mots).map(([ancien, nouveau]) => ({ nom, ancien, nouveau, args: placer(rang, ancien) })));
    assert.ok(essais.length >= 30);
    const lances = essais.map(async (essai) => ({ ...essai, fin: await jouer([process.execPath, fichierDe(essai.nom), ...essai.args]) }));
    for (const { nom, ancien, nouveau, fin } of await Promise.all(lances)) {
      assert.equal(fin.erreur.split("\n")[0], direAncien(ancien, nouveau), `${nom} ${ancien}`);
      assert.equal(fin.code, REFUS, `${nom} ${ancien} : ${fin.erreur}`);
    }
  });

  test("les anciens mots sont remplacés un à un, dits une fois chacun ; les nouveaux, et tout le reste, passent tels quels et en silence", () => {
    const dits: string[] = [];
    assert.deepEqual(enAnglais("grant", ["activer", "merge", "--pour", "4h", "--jusqu-a=18h", "--pour", "activer"], (ligne) => dits.push(ligne)), [
      "enable",
      "merge",
      "--for",
      "4h",
      "--until=18h",
      "--for",
      // Ce n'est pas le rang d'une sous-commande : une valeur, laissée telle quelle.
      "activer",
    ]);
    assert.deepEqual(dits, [direAncien("activer", "enable"), direAncien("--pour", "--for"), direAncien("--jusqu-a", "--until")]);

    const silence: string[] = [];
    assert.deepEqual(enAnglais("grant", ["enable", "merge", "--for", "4h"], (ligne) => silence.push(ligne)), ["enable", "merge", "--for", "4h"]);
    assert.deepEqual(enAnglais("pull", ["annoncer", "rendre"], (ligne) => silence.push(ligne)).slice(0, 1), ["annoncer"]);
    assert.deepEqual(enAnglais("rail", ["voir"], (ligne) => silence.push(ligne)), ["voir"]);
    assert.deepEqual(silence, [direAncien("rendre", "return")]);
  });

  test("l'aide ne nomme que les commandes sous leur nom anglais, chacune avec ce qu'elle fait, en anglais", async () => {
    const appel = appeler(aide);
    assert.equal(await appel.fin, 0);
    const lignes = appel.sortie().trimEnd().split("\n");
    assert.equal(lignes[0], "usage: brigade <project> <command> [arguments…]");
    const listees = lignes.slice(lignes.indexOf("Commands:") + 1).map((ligne) => ligne.trim().split(/\s+/)[0]);
    assert.deepEqual(listees, COMMANDES.map(({ nom }) => nom));
    for (const { ancien } of RENOMMEES) assert.doesNotMatch(appel.sortie(), new RegExp(`(^|[^\\w-])${ancien}([^\\w-]|$)`, "m"), ancien ?? "");
    // Rien de français : ni accent, ni ancien mot d'une commande.
    assert.doesNotMatch(appel.sortie(), /[àâçéèêëîïôûùüÿœæ«»]/i);
    for (const ancien of COMMANDES.flatMap(({ mots = {} }) => Object.keys(mots))) assert.doesNotMatch(appel.sortie(), new RegExp(`(^|\\s)${ancien}([\\s,:]|$)`, "m"), ancien);

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

  test("CHANGELOG.md annonce la fin des anciens noms : chaque ancien nom et chaque ancien mot, son nouveau nom, et le jour où il ne répond plus", () => {
    const changelog = readFileSync(join(RUNTIME, "..", "CHANGELOG.md"), "utf8");
    assert.match(changelog, new RegExp(`From ${FIN_DES_ANCIENS_NOMS}, the old names no longer answer`));
    for (const { nom, ancien } of RENOMMEES) assert.ok(changelog.includes(`| \`${ancien}\` | \`${nom}\` | ${FIN_DES_ANCIENS_NOMS} |`), `${ancien} → ${nom}`);
    for (const { nom, mots = {} } of COMMANDES) {
      for (const [ancien, nouveau] of Object.entries(mots)) assert.ok(changelog.includes(`| \`${nom}\` | \`${ancien}\` | \`${nouveau}\` | ${FIN_DES_ANCIENS_NOMS} |`), `${nom} ${ancien} → ${nouveau}`);
    }
  });
});

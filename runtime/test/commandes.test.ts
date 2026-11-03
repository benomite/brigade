// Les commandes de la box sous leur nom anglais (`commandes.ts`, docs/glossary.md),
// et les noms d'avant qui répondent encore jusqu'à la date que CHANGELOG.md annonce.
//
// Une commande dont le fichier exporte sa `Commande` (src/appel.ts) est jouée
// dans le process du test, telle que son fichier la joue dans le sien ; les
// autres — qui n'en exportent pas — sont lancées par leur fichier. Que le
// fichier d'un script la joue dans son process, des commandes lancées ici le
// prouvent, chacune de son propre refus.
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
import { Sortie, type Commande } from "../src/appel.ts";
import { principal as arbitre } from "../src/arbitre-cli.ts";
import { principal as attente } from "../src/attente-cli.ts";
import { principal as base } from "../src/base-cli.ts";
import { principal as fermeture } from "../src/closing/command.ts";
import { COMMANDES, direAncien, enAnglais, FIN_DES_ANCIENS_NOMS, parAncienNom, SCRIPT_D_ANCIEN_NOM } from "../src/commandes.ts";
import { principal as faits } from "../src/faits.ts";
import { principal as gardeFous } from "../src/garde-fous-cli.ts";
import { principal as grant } from "../src/grant-cli.ts";
import { principal as installation } from "../src/installation-cli.ts";
import { principal as interrupteur } from "../src/interrupteur-cli.ts";
import { principal as manager } from "../src/manager-cli.ts";
import { principal as cloison } from "../src/montrer-cloison.ts";
import { principal as mesures } from "../src/montrer-mesures.ts";
import { principal as pass } from "../src/montrer-pass.ts";
import { principal as rail } from "../src/montrer-rail.ts";
import { principal as station } from "../src/montrer-station.ts";
import { principal as rapport } from "../src/rapport-cli.ts";
import { principal as reglage } from "../src/reglage-cli.ts";
import { principal as relire } from "../src/relire.ts";
import { principal as status } from "../src/status.ts";
import { principal as appairage } from "../src/telephone/appairage-cli.ts";
import { LANCE as LANCE_DES_TELEPHONES } from "../src/telephones.ts";
import { appeler, CACHE_DE_COMPILATION } from "./outils.ts";

const RUNTIME = join(import.meta.dirname, "..");
const scripts: Record<string, string> = JSON.parse(readFileSync(join(RUNTIME, "package.json"), "utf8")).scripts;
const DU_DEV = ["test", "typecheck", "start"];
const RENOMMEES = COMMANDES.filter((commande) => commande.ancien !== undefined);
const REFUS = 2;

// Lancé sans rien de l'environnement d'un service : ni état, ni dépôt, ni arbitre
// — le cache de compilation seul, qui n'en est pas.
// Sous Windows, `npm` est un `npm.cmd`, que seul un shell lance, et un process
// n'y démarre pas sans ce que Windows lui donne : son système, son répertoire
// temporaire, et pour `npm` le répertoire de ses réglages.
const SOUS_WINDOWS = process.platform === "win32";
const DE_WINDOWS = SOUS_WINDOWS ? Object.fromEntries(["SystemRoot", "windir", "SystemDrive", "ComSpec", "PATHEXT", "TEMP", "TMP", "APPDATA", "LOCALAPPDATA", "USERPROFILE"].flatMap((nom) => (process.env[nom] === undefined ? [] : [[nom, process.env[nom] as string]]))) : {};
function jouer(commande: string[], env: Record<string, string> = {}): Promise<{ code: number | null; sortie: string; erreur: string }> {
  return new Promise((resoudre, rejeter) => {
    const programme = SOUS_WINDOWS && commande[0] === "npm" ? "npm.cmd" : (commande[0] ?? "");
    const enfant = spawn(programme, commande.slice(1), { cwd: RUNTIME, shell: SOUS_WINDOWS && programme === "npm.cmd", env: { ...DE_WINDOWS, PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "/tmp", ...CACHE_DE_COMPILATION, ...env } });
    let [sortie, erreur] = ["", ""];
    enfant.stdout.on("data", (morceau) => (sortie += morceau));
    enfant.stderr.on("data", (morceau) => (erreur += morceau));
    enfant.on("error", rejeter);
    enfant.on("close", (code) => resoudre({ code, sortie, erreur }));
  });
}
const npm = (nom: string, args: string[] = []) => jouer(["npm", "--silent", "run", nom, ...(args.length > 0 ? ["--", ...args] : [])]);
// Le script d'une commande joué comme `npm run` le joue — son `node src/….ts`
// depuis runtime/, le nom tapé dans `npm_lifecycle_event` —, sans le `npm` :
// il coûte une demi-seconde de processeur à chaque lancement, et la table en
// lançait une soixantaine (#2085). Que `npm run` lance bien ce script sous ce
// nom, un nom anglais comme un ancien, est éprouvé plus bas, une fois chacun.
const script = (nom: string, args: string[] = []) => {
  const [, fichier = ""] = (scripts[nom] ?? "").split(" ");
  return jouer([process.execPath, fichier, ...args], { npm_lifecycle_event: nom });
};

// La `Commande` que joue chaque fichier qui en exporte une, telle qu'il la joue dans son process. Les fichiers absents
// — sauvegarde, restauration et les deux services — n'en exportent pas : ils sont lancés.
const DANS_LE_TEST: Partial<Record<string, Commande>> = {
  "src/status.ts": status,
  "src/faits.ts": faits,
  "src/montrer-rail.ts": rail,
  "src/relire.ts": relire,
  "src/montrer-pass.ts": pass,
  "src/montrer-station.ts": station,
  "src/reglage-cli.ts": (appel) => reglage(appel),
  "src/interrupteur-cli.ts": interrupteur,
  "src/manager-cli.ts": manager,
  "src/grant-cli.ts": grant,
  "src/attente-cli.ts": (appel) => attente(appel),
  "src/rapport-cli.ts": (appel) => rapport(appel),
  "src/garde-fous-cli.ts": gardeFous,
  "src/base-cli.ts": base,
  "src/installation-cli.ts": installation,
  "src/montrer-mesures.ts": mesures,
  "src/fermeture.ts": fermeture,
  "src/montrer-cloison.ts": cloison,
  "src/arbitre-cli.ts": (appel) => arbitre(appel),
  "src/telephones.ts": (appel) => appairage(appel, { lance: LANCE_DES_TELEPHONES }),
  "src/aide.ts": aide,
};
const fichierDe = (nom: string) => /^node (src\/[\w-]+\.ts)$/.exec(scripts[nom] ?? "")?.[1] ?? "";

// Joue la commande d'un fichier dans le process du test — sur l'environnement que `jouer` donne à un process, ses deux
// sorties tenues à part —, ou le lance s'il n'exporte pas la sienne.
async function parSonFichier(fichier: string, args: string[] = []): Promise<{ code: number | null; sortie: string; erreur: string }> {
  const commande = DANS_LE_TEST[fichier];
  if (commande === undefined) return jouer([process.execPath, fichier, ...args]);
  let [sortie, erreur] = ["", ""];
  const env = { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "/tmp", ...CACHE_DE_COMPILATION };
  try {
    await commande({ args, env, dire: (ligne) => void (sortie += `${ligne}\n`), redire: (ligne) => void (erreur += `${ligne}\n`) });
    return { code: 0, sortie, erreur };
  } catch (e) {
    if (e instanceof Sortie) return { code: e.code, sortie, erreur };
    throw e;
  }
}

// Ce qui fait refuser chaque commande sans rien toucher : son environnement
// manque, ou ses arguments ne se lisent pas. Et ce que son refus dit d'elle.
const SANS_EFFET: Record<string, { args?: string[]; dit: RegExp }> = {
  installation: { args: ["inconnue"], dit: /run installation -- \[labels/ },
  closing: { dit: /run closing\b/ },
  door: { dit: /the door refuses to start/ },
  "hold-arbiter": { dit: /the arbiter refuses to start/ },
  phones: { dit: /usage: brigade <project> phones code\b/ },
};
const refusDe = (nom: string) => SANS_EFFET[nom] ?? { dit: new RegExp(`run ${nom}\\b`) };

// Le refus de chaque commande sous son nom anglais, joué une fois : le test du nom anglais et celui de l'ancien nom
// (qui le compare au sien) lisent la même fin. Rien n'est écrit, la fin ne dépend que de la commande.
const refusSousSonNom = new Map<string, ReturnType<typeof jouer>>();
const sousSonNom = (nom: string) => {
  const fin = refusSousSonNom.get(nom) ?? parSonFichier(fichierDe(nom), refusDe(nom).args);
  refusSousSonNom.set(nom, fin);
  return fin;
};

// Les anciens noms lancés de bout en bout — `ancien-nom.ts` puis le fichier de la commande, chacun dans son process — :
// tous passent par le même fichier, qui ne lit de chacun que sa ligne de la table. Leurs commandes sont de celles que
// le test lance : leur refus sous le nouveau nom est celui d'un process aussi.
const LANCES_DE_BOUT_EN_BOUT = ["sauvegarder", "porte"];

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

  test("taper le nom anglais lance la commande — celle que son fichier joue, dans le test quand il l'exporte — : son propre refus, son usage, et aucun ancien nom annoncé", async () => {
    // Des commandes sont bien lancées par leur fichier, et d'autres jouées ici.
    const lancees = COMMANDES.filter(({ nom }) => DANS_LE_TEST[fichierDe(nom)] === undefined).map(({ nom }) => nom);
    assert.deepEqual(lancees, ["backup", "restore", "door", "hold-arbiter"]);

    const jouees = COMMANDES.filter(({ nom }) => nom !== "help").map(async ({ nom }) => ({ nom, fin: await sousSonNom(nom) }));
    for (const { nom, fin } of await Promise.all(jouees)) {
      assert.equal(fin.code, REFUS, `${nom} : ${fin.erreur}`);
      assert.match(fin.sortie + fin.erreur, refusDe(nom).dit, nom);
      assert.doesNotMatch(fin.erreur, /is now/, nom);
    }
  });

  test("un ancien nom de commande lance encore la commande : il dit d'abord le nouveau nom et le jour où il cessera de répondre, puis rend ce qu'elle rend, code compris — chaque ancien nom mène à la sienne, deux sont lancés de bout en bout", async () => {
    // Ce que `ancien-nom.ts` lit de chaque ancien nom : sa commande, et l'annonce qu'il en fait.
    for (const { nom, ancien = "" } of RENOMMEES) {
      assert.equal(parAncienNom(ancien)?.nom, nom, ancien);
      assert.equal(direAncien(ancien, nom), `brigade: “${ancien}” is now “${nom}” — the old name still works until ${FIN_DES_ANCIENS_NOMS}, then stops (CHANGELOG.md)`, ancien);
    }
    const deBoutEnBout = RENOMMEES.filter(({ ancien = "" }) => LANCES_DE_BOUT_EN_BOUT.includes(ancien));
    assert.equal(deBoutEnBout.length, LANCES_DE_BOUT_EN_BOUT.length);
    const lancees = deBoutEnBout.map(async ({ nom, ancien = "" }) => ({ nom, ancien, avant: await script(ancien, refusDe(nom).args), apres: await sousSonNom(nom) }));
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

  test("`npm run` lance le script d'un ancien nom sous ce nom : il rend ce que rend son script joué sans `npm`", async () => {
    const { nom, ancien = "" } = RENOMMEES[0] ?? { nom: "" };
    const [parNpm, sansNpm] = await Promise.all([npm(ancien, refusDe(nom).args), script(ancien, refusDe(nom).args)]);
    assert.equal(parNpm.code, REFUS, `${ancien} : ${parNpm.erreur}`);
    assert.deepEqual(parNpm, sansNpm, ancien);
  });

  test("un ancien nom lancé sans `npm` ne devine rien : il le dit, en 2", async () => {
    const fin = await jouer([process.execPath, "src/ancien-nom.ts"]);
    assert.equal(fin.code, 2);
    assert.match(fin.erreur, /is not an old command name — `help` lists the commands/);
  });

  // Pour chaque ancien mot : de quoi le placer là où sa commande le lit.
  const placer = (rang: number, mot: string) => (mot.startsWith("--") ? ["inconnue", mot] : rang === 1 ? ["une-station", mot] : [mot]);

  // Chaque commande est jouée par son fichier, dans le test quand il exporte la sienne ; le premier essai est lancé dans
  // son process, quel que soit son fichier : l'ancien mot y est dit sur sa sortie d'erreur.
  test("chaque commande remplace ses anciens mots par les siens, et le dit : sa sous-commande au rang qu'elle lit, ses options où qu'elles soient", async () => {
    const essais = COMMANDES.flatMap(({ nom, mots = {}, rang = 0 }) => Object.entries(mots).map(([ancien, nouveau]) => ({ nom, ancien, nouveau, args: placer(rang, ancien) })));
    assert.ok(essais.length >= 20);
    const lances = essais.map(async (essai, rang) => ({ ...essai, fin: await (rang === 0 ? jouer([process.execPath, fichierDe(essai.nom), ...essai.args]) : parSonFichier(fichierDe(essai.nom), essai.args)) }));
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
    assert.deepEqual(enAnglais("rail", ["voir"], (ligne) => silence.push(ligne)), ["voir"]);
    assert.deepEqual(silence, []);
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

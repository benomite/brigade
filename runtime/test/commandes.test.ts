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
//
// Le script de chaque nom est `node src/<fichier>.ts` (premier test) : chaque
// commande est lancée par ce fichier, sans `npm`, qui coûte un process de plus.
// Un fichier qui se joue à son évaluation (`await` en tête, `process.exit`) est
// réévalué, cas après cas, dans un seul process d'essai (aides/cas-en-process.ts),
// qui rend son code et ses lignes — sauf `installation`, dont les refus passent
// par `process.exit` dans un `try` qui prendrait celui du process d'essai pour
// une erreur : elle est lancée. Un fichier qui ne se joue que lancé
// (`import.meta.main`) l'est toujours, chacun par son nom anglais : c'est ce
// lancement qui prouve qu'`enProcess` le joue.
// `npm` lui-même est éprouvé deux fois — l'aide sous son nom, et un ancien nom,
// que `npm` nomme à `ancien-nom.ts` par `npm_lifecycle_event` : ce lancement
// prouve ce qu'`ancien-nom.ts` fait d'un ancien nom (l'annonce, puis la commande
// lancée, sa sortie et son code). Ce qu'il fait pour chacun des autres ne tient
// qu'à la table (`parAncienNom`, `direAncien`) et au script du nouveau nom : cela
// se lit dans le process du test.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, describe, test } from "node:test";
import { pathToFileURL } from "node:url";
import { principal as aide } from "../src/aide.ts";
import { Sortie, type Commande } from "../src/appel.ts";
import { COMMANDES, direAncien, enAnglais, FIN_DES_ANCIENS_NOMS, parAncienNom, SCRIPT_D_ANCIEN_NOM } from "../src/commandes.ts";
import { casEnProcess } from "./aides/cas-en-process.ts";
import { sansMotFrancais } from "./aides/glossaire.ts";
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
// Le fichier que lance le script d'un nom, et ce qu'il fait lancé comme `npm` le lance.
const fichierDe = (nom: string) => /^node (src\/[\w-]+\.ts)$/.exec(scripts[nom] ?? "")?.[1] ?? "";
const lancerFichier = (nom: string, args: string[] = []) => jouer([process.execPath, fichierDe(nom), ...args]);
// L'ancien nom que `npm` lance lui-même, qui pose `npm_lifecycle_event` : celui d'une commande légère à charger.
const PAR_NPM = "garde-fous";

// Les fichiers qui se jouent à leur évaluation, chacun comparé cas par cas à son lancement (mêmes lignes, même code)
// avant d'être réévalué dans le process d'essai. Le process d'essai mêle les deux sorties : tout s'y lit comme
// l'erreur, où ni l'annonce d'un ancien nom ni un mot français ne doivent paraître.
const EN_CAS = new Set(["measures", "closing", "backup", "restore", "partition", "arbiter", "door", "hold-arbiter"]);
const cas = casEnProcess(ENV_DE_BASE);
after(() => cas.fermer());
const evaluer = async (fichier: string, args: string[] = []): Promise<Fin> => {
  const rendu = await cas.jouer({ module: join(RUNTIME, fichier), args, cwd: RUNTIME });
  return { code: rendu.code, sortie: "", erreur: rendu.sortie };
};
// Une commande jouée comme son nom anglais la joue : son fichier, lancé ou réévalué.
const jouerFichier = (nom: string, args: string[] = []) => (EN_CAS.has(nom) ? evaluer(fichierDe(nom), args) : lancerFichier(nom, args));

// Une commande dont le fichier ne la joue que lancé (`if (import.meta.main) await enProcess(…)`) s'importe sans se
// jouer : sa `principal`, celle que `enProcess` joue, se joue dans le process du test, sans environnement. Ce que
// `enProcess` en fait — la sortie d'erreur pour `redire`, le code de sortie pour `Sortie` — le refus de chaque
// commande sous son nom, lancée, le prouve.
const JOUEE_SEULEMENT_LANCEE = /^if \(import\.meta\.main\) await enProcess\(/m;
async function principalDe(nom: string): Promise<Commande | undefined> {
  const fichier = join(RUNTIME, fichierDe(nom));
  if (!JOUEE_SEULEMENT_LANCEE.test(readFileSync(fichier, "utf8"))) return undefined;
  return ((await import(pathToFileURL(fichier).href)) as { principal?: Commande }).principal;
}
async function jouerIci(principal: Commande, args: string[]): Promise<Fin> {
  let [sortie, erreur] = ["", ""];
  try {
    await principal({ args, env: {}, dire: (ligne) => (sortie += `${ligne}\n`), redire: (ligne) => (erreur += `${ligne}\n`) });
    return { code: 0, sortie, erreur };
  } catch (fin) {
    if (!(fin instanceof Sortie)) throw fin;
    return { code: fin.code, sortie, erreur };
  }
}

// Ce qui fait refuser chaque commande sans rien toucher : son environnement
// manque, ou ses arguments ne se lisent pas. Et ce que son refus dit d'elle.
const SANS_EFFET: Record<string, { args?: string[]; dit: RegExp }> = {
  installation: { args: ["inconnue"], dit: /run installation -- \[labels/ },
  closing: { dit: /run closing\b/ },
  door: { dit: /the door refuses to start/ },
  "hold-arbiter": { dit: /the arbiter refuses to start/ },
};
const refusDe = (nom: string) => SANS_EFFET[nom] ?? { dit: new RegExp(`run ${nom}\\b`) };

// Le refus de chaque commande sous son nom anglais, joué une fois : le test du nom anglais et, pour la commande de
// `PAR_NPM`, celui de son ancien nom (qui le compare au sien) lisent la même fin. Rien n'est écrit, la fin ne dépend que de la commande.
const refusSousSonNom = new Map<string, ReturnType<typeof jouer>>();
const sousSonNom = (nom: string) => {
  const fin = refusSousSonNom.get(nom) ?? jouerFichier(nom, refusDe(nom).args);
  refusSousSonNom.set(nom, fin);
  return fin;
};

// Chaque ancien mot d'une commande, placé là où sa commande le lit.
const placer = (rang: number, mot: string) => (mot.startsWith("--") ? ["inconnue", mot] : rang === 1 ? ["une-station", mot] : [mot]);
const ESSAIS = COMMANDES.flatMap(({ nom, mots = {}, rang = 0 }) => Object.entries(mots).map(([ancien, nouveau]) => ({ nom, ancien, nouveau, args: placer(rang, ancien) })));

// Chaque test lance ses commandes sans état ni dépôt, et n'écrit rien : ils se jouent de front.
describe("les commandes du runtime", { concurrency: 4 }, () => {
  test("chaque commande du runtime est dans la table, sous son nom anglais ; chaque ancien nom y est, et son script ne fait que l'annoncer", () => {
    const anglais = COMMANDES.map(({ nom }) => nom);
    const anciens = RENOMMEES.map(({ ancien }) => ancien ?? "");
    assert.deepEqual(Object.keys(scripts).filter((nom) => !DU_DEV.includes(nom)).sort(), [...anglais, ...anciens].sort());
    for (const nom of anglais) assert.match(scripts[nom] ?? "", /^node src\/[\w-]+\.ts$/, nom);
    for (const nom of anglais) assert.notEqual(scripts[nom], SCRIPT_D_ANCIEN_NOM, nom);
    for (const ancien of anciens) assert.equal(scripts[ancien], SCRIPT_D_ANCIEN_NOM, ancien);
    // Un nom anglais n'est jamais aussi un ancien nom, ni deux fois dans la table.
    assert.equal(new Set([...anglais, ...anciens]).size, anglais.length + anciens.length);
    // Les anciens mots, dont chacun a son essai plus bas.
    assert.ok(ESSAIS.length >= 20);
    // L'ancien nom que `npm` lance lui-même, plus bas, en est un.
    assert.equal(scripts[PAR_NPM], SCRIPT_D_ANCIEN_NOM);
  });

  // Une commande, un test : chacun joue son fichier, et se juge à sa propre durée.
  for (const { nom } of COMMANDES.filter(({ nom }) => nom !== "help")) {
    test(`\`${nom}\` : taper son nom anglais lance la commande — son propre refus, son usage, et aucun ancien nom annoncé`, async () => {
      const fin = await sousSonNom(nom);
      assert.equal(fin.code, REFUS, `${nom} : ${fin.erreur}`);
      assert.match(fin.sortie + fin.erreur, refusDe(nom).dit, nom);
      assert.doesNotMatch(fin.erreur, /is now/, nom);
      // Le refus que rend aussi son ancien nom, s'il en a un (`ancien-nom.ts` lance ce même fichier) : en anglais.
      sansMotFrancais((fin.sortie + fin.erreur).trimEnd().split("\n"));
    });
  }

  test(`\`${PAR_NPM}\`, lancé par \`npm\`, lance encore sa commande : il dit d'abord le nouveau nom et le jour où il cessera de répondre, puis rend ce qu'elle rend, code compris`, async () => {
    const nom = parAncienNom(PAR_NPM)?.nom ?? "";
    const [avant, apres] = await Promise.all([npm(PAR_NPM, refusDe(nom).args), sousSonNom(nom)]);
    const [annonce, ...reste] = avant.erreur.split("\n");
    assert.equal(annonce, `brigade: “${PAR_NPM}” is now “${nom}” — the old name still works until ${FIN_DES_ANCIENS_NOMS}, then stops (CHANGELOG.md)`);
    // Le même refus que sous le nouveau nom, au mot près, et le même code.
    assert.equal(avant.code, apres.code);
    assert.equal(avant.code, REFUS);
    assert.equal(reste.join("\n"), apres.erreur);
    assert.equal(avant.sortie, apres.sortie);
  });

  test("chaque ancien nom mène `ancien-nom.ts` à sa commande : son nouveau nom, que l'annonce dit avec le jour où il cessera de répondre, et le fichier de ce nom", () => {
    for (const { nom, ancien = "" } of RENOMMEES) {
      // Ce qu'`ancien-nom.ts` lit pour l'ancien nom que `npm` lui donne : la commande, puis le fichier de son script.
      assert.equal(parAncienNom(ancien)?.nom, nom, ancien);
      assert.notEqual(fichierDe(nom), "", ancien);
      assert.equal(direAncien(ancien, nom), `brigade: “${ancien}” is now “${nom}” — the old name still works until ${FIN_DES_ANCIENS_NOMS}, then stops (CHANGELOG.md)`, ancien);
    }
    // Un nom anglais n'est l'ancien nom de rien : il ne mène nulle part.
    for (const { nom } of COMMANDES) assert.equal(parAncienNom(nom), undefined, nom);
  });

  test("un ancien nom lancé sans `npm` ne devine rien : il le dit, en 2", async () => {
    const fin = await evaluer("src/ancien-nom.ts");
    assert.equal(fin.code, 2);
    assert.match(fin.erreur, /is not an old command name — `help` lists the commands/);
  });

  for (const { nom } of COMMANDES.filter(({ mots = {} }) => Object.keys(mots).length > 0)) {
    test(`\`${nom}\` remplace ses anciens mots par les siens, et le dit : sa sous-commande au rang qu'elle lit, ses options où qu'elles soient`, async () => {
      const principal = await principalDe(nom);
      const lances = ESSAIS.filter((essai) => essai.nom === nom).map(async (essai) => ({ ...essai, fin: await (principal === undefined ? jouerFichier(nom, essai.args) : jouerIci(principal, essai.args)) }));
      for (const { ancien, nouveau, fin } of await Promise.all(lances)) {
        assert.equal(fin.erreur.split("\n")[0], direAncien(ancien, nouveau), `${nom} ${ancien}`);
        assert.equal(fin.code, REFUS, `${nom} ${ancien} : ${fin.erreur}`);
      }
    });
  }

  test("les anciens mots sont remplacés un à un, dits une fois chacun ; les nouveaux, et tout le reste, passent tels quels et en silence", () => {
    const dits: string[] = [];
    assert.deepEqual(enAnglais("waiting", ["poser", "17", "--quoi", "un avis", "--de=Marie", "--quoi", "poser"], (ligne) => dits.push(ligne)), [
      "set",
      "17",
      "--what",
      "un avis",
      "--from=Marie",
      "--what",
      // Ce n'est pas le rang d'une sous-commande : une valeur, laissée telle quelle.
      "poser",
    ]);
    assert.deepEqual(dits, [direAncien("poser", "set"), direAncien("--quoi", "--what"), direAncien("--de", "--from")]);

    const silence: string[] = [];
    assert.deepEqual(enAnglais("waiting", ["set", "17", "--what", "x"], (ligne) => silence.push(ligne)), ["set", "17", "--what", "x"]);
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

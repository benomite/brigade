// Le process de la station, remplacé seul (#2190) : la station demande « redémarre-moi sur X »,
// l'app arrête ce seul process et lance X depuis ses données. L'app, ses seconds et ses shells
// gardent leurs pids, rien ne s'écrit dans le paquet de l'app, et une version qui ne démarre pas
// rend la main à celle d'avant. De vrais process — la station passe par poste/station.ts et son
// enveloppe, le second et le shell par le registre des terminaux —, contre des stations d'essai :
// chacune dit sa version dans `en-service`, comme la vraie. Aucun test n'attend une durée.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { test, type TestContext } from "node:test";
import { jusqua, mort, repertoireTemporaire, vivant } from "../../../runtime/test/outils.ts";
import { PRINCIPAL } from "../../src/poste/role.ts";
import {
  DEMANDE,
  demanderRedemarrage,
  EN_SERVICE,
  lireEtatDesVersions,
  tenirProcessDeStation,
  VARIABLE_DES_VERSIONS,
  type Issue,
  type OptionsProcessDeStation,
} from "../../src/station-process/superviseur.ts";
import { ouvrirTerminaux, type Lancement, type Terminal } from "../../src/terminaux.ts";
import { CACHE_DE_COMPILATION } from "../aides/cache-de-compilation.ts";
import { SANS_POSIX } from "../aides/posix.ts";

const FAUX_CLAUDE = join(import.meta.dirname, "../aides/faux-claude.sh");

// Une station d'essai : elle dit sa version et son pid dans `en-service`, puis tourne jusqu'au
// SIGTERM que son enveloppe lui donne quand l'app ferme son entrée.
const SAINE = `import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const racine = process.env.BRIGADE_STATION_DIR;
const { version } = JSON.parse(readFileSync(join(import.meta.dirname, "../../package.json"), "utf8"));
const fichier = join(racine, "en-service");
writeFileSync(fichier + "." + process.pid, JSON.stringify({ version, pid: process.pid, depuis: new Date().toISOString(), servis: [], refuses: {} }));
renameSync(fichier + "." + process.pid, fichier);
console.log("station d'essai en " + version + " — versions sous " + process.env.${VARIABLE_DES_VERSIONS});
const veille = setInterval(() => {}, 60_000);
process.on("SIGTERM", () => { clearInterval(veille); process.exit(0); });
`;
// Une version qui refuse de démarrer (code 2), et une qui tombe aussitôt lancée.
const QUI_REFUSE = `console.error("brigade : refus de démarrer la station — essai"); process.exit(2);\n`;
const QUI_TOMBE = `throw new Error("une version cassée");\n`;

function poserRuntime(dossier: string, version: string, corps: string): void {
  mkdirSync(join(dossier, "src", "station"), { recursive: true });
  writeFileSync(join(dossier, "package.json"), `${JSON.stringify({ name: "brigade-runtime", version })}\n`);
  writeFileSync(join(dossier, PRINCIPAL), corps);
}

// Un ordinateur : le paquet de l'app, qui porte le runtime de départ, et les données de l'app —
// le répertoire de la station, et le dossier des versions téléchargées.
function unOrdinateur(t: TestContext, embarquee = "1.0.0") {
  const machine = repertoireTemporaire(t);
  const paquet = join(machine, "Brigade.app");
  const runtime = join(paquet, "Contents", "Resources", "runtime");
  poserRuntime(runtime, embarquee, SAINE);
  const donnees = join(machine, "donnees");
  const racine = join(donnees, "station");
  const versions = join(donnees, "versions-de-la-station");
  // Ce que la mise à jour de la station a téléchargé (#2189).
  const telecharger = (version: string, corps = SAINE) => poserRuntime(join(versions, version), version, corps);
  return { machine, paquet, embarque: join(runtime, PRINCIPAL), racine, versions, telecharger };
}

// Chaque fichier du paquet, son contenu et sa date : l'empreinte que rien ne doit changer.
function empreinte(dossier: string): Record<string, string> {
  const vus: Record<string, string> = {};
  for (const nom of readdirSync(dossier, { recursive: true, encoding: "utf8" })) {
    const chemin = join(dossier, nom);
    const etat = statSync(chemin);
    vus[relative(dossier, chemin)] = etat.isDirectory() ? `dossier ${etat.mtimeMs}` : `${etat.mtimeMs} ${createHash("sha256").update(readFileSync(chemin)).digest("hex")}`;
  }
  return vus;
}

const enService = (racine: string) => {
  try {
    return JSON.parse(readFileSync(join(racine, EN_SERVICE), "utf8")) as { version: string; pid: number };
  } catch {
    return null;
  }
};

// L'app qui tient la station, arrêtée en fin de test si le test ne l'a pas fait.
function tenir(t: TestContext, ordi: ReturnType<typeof unOrdinateur>, options: Partial<OptionsProcessDeStation> = {}) {
  const lignes: string[] = [];
  const issues: Issue[] = [];
  const station = tenirProcessDeStation({
    node: process.execPath,
    embarque: ordi.embarque,
    versions: ordi.versions,
    racine: ordi.racine,
    env: { PATH: process.env.PATH, ...CACHE_DE_COMPILATION },
    dire: (ligne) => void lignes.push(ligne),
    appairer: () => assert.fail("une station d'essai n'affiche aucun code"),
    pasMs: 20,
    veilleMs: 20,
    relanceMs: 50,
    surIssue: (issue) => void issues.push(issue),
    ...options,
  });
  t.after(() => station.arreter());
  return { station, issues, dit: () => lignes.join("\n") };
}

// Les onglets de l'app : un second et un shell, chacun un vrai process que l'app lance.
function desOnglets(t: TestContext, dossier: string) {
  mkdirSync(dossier, { recursive: true });
  // Un fil à reprendre : le faux `claude` reprend la session, puis lit son entrée.
  writeFileSync(join(dossier, ".fil"), "");
  const lances: { lancement: Lancement; pid: number }[] = [];
  const etats: Terminal[] = [];
  const terminaux = ouvrirTerminaux({
    claude: FAUX_CLAUDE,
    shell: "/bin/sh",
    argsDuShell: [],
    persistantIci: false,
    // Un pty d'essai : le process, sans terminal. Le pid est ce que le test suit.
    ouvrirPty(lancement) {
      const enfant = spawn(lancement.commande, lancement.args, { cwd: lancement.dossier, env: { PATH: process.env.PATH, ...lancement.env }, stdio: ["pipe", "pipe", "pipe"] });
      enfant.stdout.on("data", (donnees: Buffer) => lancement.surSortie(donnees.toString()));
      enfant.once("exit", (code) => lancement.surFin(code ?? 1));
      lances.push({ lancement, pid: enfant.pid ?? assert.fail("un onglet sans pid") });
      return { ecrire: (donnees) => void enfant.stdin.write(donnees), redimensionner: () => {}, tuer: () => void enfant.kill("SIGKILL") };
    },
    surSortie: () => {},
    surEtat: (terminal) => void etats.push(terminal),
  });
  t.after(() => terminaux.fermer());
  const projet = { nom: "essai", dossier };
  terminaux.espace(projet);
  terminaux.shell(projet);
  return { lances, etats, pids: () => lances.map(({ pid }) => pid) };
}

test("la station demande à redémarrer sur X : seul son process est remplacé, par celui de X — l'app, le second et le shell gardent leurs pids, et le paquet de l'app n'est pas écrit", { skip: SANS_POSIX }, async (t) => {
  const ordi = unOrdinateur(t);
  ordi.telecharger("1.0.1");
  const paquetAvant = empreinte(ordi.paquet);
  const app = process.pid;
  const { station, issues, dit } = tenir(t, ordi);
  await jusqua(() => enService(ordi.racine)?.version === "1.0.0");
  const avant = enService(ordi.racine)?.pid ?? assert.fail("aucune station en service");
  assert.equal(station.version(), "1.0.0");
  // La station sait où poser les versions qu'elle télécharge.
  await jusqua(() => dit().includes(`station d'essai en 1.0.0 — versions sous ${ordi.versions}`));

  const onglets = desOnglets(t, `${ordi.machine}/projet`);
  const ouverts = onglets.pids();
  assert.equal(ouverts.length, 2);
  assert.ok(ouverts.every((pid) => vivant(pid)));

  // Le geste de la mise à jour de la station, une fois ses cooks finis (#2189).
  demanderRedemarrage(ordi.racine, "1.0.1");
  await jusqua(() => issues.length > 0);

  assert.deepEqual({ ...issues[0], le: "" }, { quoi: "passee", version: "1.0.1", depuis: "1.0.0", le: "" });
  const apres = enService(ordi.racine);
  assert.equal(apres?.version, "1.0.1");
  assert.notEqual(apres?.pid, avant);
  assert.ok(vivant(apres?.pid));
  await mort(avant);
  assert.equal(station.version(), "1.0.1");
  assert.equal(station.tourne(), true);
  // La demande est lue, une fois.
  assert.equal(readdirSync(ordi.racine).includes(DEMANDE), false);

  // L'app est le même process ; le second et le shell aussi : rien ne les a relancés ni rattachés.
  assert.equal(process.pid, app);
  assert.deepEqual(onglets.pids(), ouverts);
  assert.ok(ouverts.every((pid) => vivant(pid)));
  assert.deepEqual(onglets.etats.filter((terminal) => terminal.arrete), []);

  // Rien n'a touché au paquet de l'app : tout ce qui a été écrit est dans ses données.
  assert.deepEqual(empreinte(ordi.paquet), paquetAvant);
  assert.deepEqual(readdirSync(ordi.machine).sort(), ["Brigade.app", "donnees", "projet"]);
  assert.equal(lireEtatDesVersions(ordi.versions).retenue, "1.0.1");
  assert.match(dit(), /restarts on 1\.0\.1 \(from 1\.0\.0\) — only its process/);
  assert.match(dit(), /now runs 1\.0\.1/);
});

for (const [cas, corps, motif] of [
  ["refuse de démarrer", QUI_REFUSE, /it refused to start in 1\.0\.1/],
  ["tombe aussitôt lancée", QUI_TOMBE, /it stopped in 1\.0\.1 right after its launch/],
] as const) {
  test(`la version X ${cas} : la version d'avant tourne de nouveau, l'échec est dit et retenu, et X n'est pas réessayée`, { skip: SANS_POSIX }, async (t) => {
    const ordi = unOrdinateur(t);
    ordi.telecharger("1.0.1", corps);
    const paquetAvant = empreinte(ordi.paquet);
    const { station, issues, dit } = tenir(t, ordi);
    await jusqua(() => enService(ordi.racine)?.version === "1.0.0");
    const avant = enService(ordi.racine)?.pid ?? assert.fail("aucune station en service");
    const onglets = desOnglets(t, `${ordi.machine}/projet`);
    const ouverts = onglets.pids();

    const issue = await station.redemarrer("1.0.1");

    assert.equal(issue?.quoi, "revenue");
    assert.ok(issue?.quoi === "revenue");
    assert.equal(issue.visee, "1.0.1");
    assert.equal(issue.restauree, "1.0.0");
    assert.match(issue.motif, motif);
    assert.equal(issue.retour, null);
    assert.deepEqual(issues, [issue]);
    // La version d'avant tourne, dans un process neuf.
    const revenue = enService(ordi.racine);
    assert.equal(revenue?.version, "1.0.0");
    assert.notEqual(revenue?.pid, avant);
    assert.ok(vivant(revenue?.pid));
    assert.equal(station.version(), "1.0.0");
    assert.equal(station.tourne(), true);
    assert.match(dit(), /did not start on 1\.0\.1 \(.*\) — back to 1\.0\.0/);
    assert.match(dit(), /runs 1\.0\.0 again/);
    // Ce que l'écran de la station lira : l'échec, et la version qui n'est pas retenue.
    assert.deepEqual(lireEtatDesVersions(ordi.versions), { retenue: null, ratees: ["1.0.1"], derniere: issue });
    assert.deepEqual(onglets.pids(), ouverts);
    assert.ok(ouverts.every((pid) => vivant(pid)));

    // Redemandée, X n'est pas réessayée : la station qui tourne n'est pas arrêtée.
    const pid = revenue?.pid;
    const refus = await station.redemarrer("1.0.1");
    assert.equal(refus?.quoi, "refusee");
    assert.equal(enService(ordi.racine)?.pid, pid);
    assert.deepEqual(empreinte(ordi.paquet), paquetAvant);
  });
}

test("une version qui ne se dit jamais en service dans le temps laissé : la version d'avant revient", { skip: SANS_POSIX }, async (t) => {
  const ordi = unOrdinateur(t);
  // Elle tourne, mais n'écrit rien : un process qui tourne ne suffit pas.
  ordi.telecharger("1.0.1", "setInterval(() => {}, 60_000);\nprocess.on(\"SIGTERM\", () => process.exit(0));\n");
  const { station } = tenir(t, ordi, { demarrageMs: 300 });
  await jusqua(() => enService(ordi.racine)?.version === "1.0.0");

  const issue = await station.redemarrer("1.0.1");

  assert.ok(issue?.quoi === "revenue");
  assert.match(issue.motif, /it did not say it was in service in 1\.0\.1 within 0\.3 s/);
  assert.equal(enService(ordi.racine)?.version, "1.0.0");
});

test("une version absente des données de l'app, ou un chemin à la place d'une version : rien n'est arrêté", { skip: SANS_POSIX }, async (t) => {
  const ordi = unOrdinateur(t);
  const { station, dit } = tenir(t, ordi);
  await jusqua(() => enService(ordi.racine)?.version === "1.0.0");
  const pid = enService(ordi.racine)?.pid;

  const issue = await station.redemarrer("1.0.1");
  assert.ok(issue?.quoi === "refusee");
  assert.match(issue.motif, /its runtime is not in .*versions-de-la-station\/1\.0\.1/);

  writeFileSync(join(ordi.racine, DEMANDE), `${JSON.stringify({ version: "../../Brigade.app" })}\n`);
  await jusqua(() => /asked for a restart the app cannot read — it names no valid version/.test(dit()));
  assert.equal(enService(ordi.racine)?.pid, pid);
  assert.equal(station.version(), "1.0.0");
});

test("l'app rouverte relance la station sur la version retenue — sauf si son paquet en porte une plus récente", { skip: SANS_POSIX }, async (t) => {
  const ordi = unOrdinateur(t);
  ordi.telecharger("1.0.1");
  const premiere = tenir(t, ordi);
  await jusqua(() => enService(ordi.racine)?.version === "1.0.0");
  assert.equal((await premiere.station.redemarrer("1.0.1"))?.quoi, "passee");
  await premiere.station.arreter();

  const rouverte = tenir(t, ordi);
  await jusqua(() => enService(ordi.racine)?.version === "1.0.1" && enService(ordi.racine)?.pid !== undefined && vivant(enService(ordi.racine)?.pid));
  assert.equal(rouverte.station.version(), "1.0.1");
  await rouverte.station.arreter();

  // Une app neuve, dont le paquet porte 1.0.2 : sa station part sur elle.
  poserRuntime(join(ordi.paquet, "Contents", "Resources", "runtime"), "1.0.2", SAINE);
  const neuve = tenir(t, ordi);
  await jusqua(() => enService(ordi.racine)?.version === "1.0.2");
  assert.equal(neuve.station.version(), "1.0.2");
});

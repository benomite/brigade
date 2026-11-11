// gates: base
// Ne tourne que sur la base, où les gates jouent tout (#1004), et pour un
// changement qui le modifie : une vraie station, son paquet construit, un
// ticket servi de bout en bout.
//
// Un premier ticket servi sous Linux, comme sous macOS et Windows (#3277) : le
// paquet Debian de la station (`paquet/construire.ts`) est construit puis
// ouvert par `dpkg-deb`, et son runtime est lancé tel que ses unités systemd le
// lancent — leur `ExecStart`, leur `WorkingDirectory`, leur environnement, la
// machine remplacée par un répertoire d'essai : la station, sa porte réseau, et
// la cloison `bwrap` de ses cooks. Le dépôt `acme/shop` est dans sa liste
// (`station-ordinateur/projets-servis.ts`) et porte un ticket `fire` : la
// station le clone, le prend, y lance un cook, et livre une PR.
//
// GitHub est une doublure à état (`faux-gh.ts`), `claude` celle de la suite
// (`FAUX_CLAUDE=livre` : le cook commite, puis conclut), derrière un témoin qui
// note ce que chaque lancement voit de l'état de la station (`claude-temoin.sh`). Ni root ni systemd :
// ce que l'installation joue sous dpkg est éprouvé par paquet/paquet.test.ts.
import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { ajouterProjetServi } from "../../src/station-ordinateur/projets-servis.ts";
import { depotGit, ENV_GIT, git, lancer, repertoireTemporaire, temporaireDuFichier, type Enfant } from "../outils.ts";
import { linuxOnly } from "../support/plateforme.ts";
import type { EtatFaux } from "./faux-gh.ts";

const rienNeReste = temporaireDuFichier();

const CONSTRUIRE = join(import.meta.dirname, "../../paquet/construire.ts");
const FAUX_GH = join(import.meta.dirname, "faux-gh.ts");
const CLAUDE_TEMOIN = join(import.meta.dirname, "claude-temoin.sh");
const BWRAP = "/usr/bin/bwrap";

// Ce qui manque à cette machine pour jouer le test, ou `false`.
const manque =
  linuxOnly("builds the station's Debian package, opens it and runs its runtime as its systemd units do") ||
  (spawnSync("dpkg-deb", ["--version"]).status !== 0 && "`dpkg-deb` is missing: the package does not build here");
// Sans `bwrap` utilisable, le ticket se sert quand même, sans la cloison des
// unités : le test le dit, et ne vérifie que le reste.
const sansCloison = !existsSync(BWRAP)
  ? `${BWRAP} is not installed`
  : spawnSync(BWRAP, ["--ro-bind", "/", "/", "--dev", "/dev", "--", "true"]).status !== 0
    ? `${BWRAP} cannot create its namespaces here`
    : null;

// Un `node` qui ne fait que dire sa version : le paquet le porte sans le
// lancer ; le runtime du paquet tourne sous le node du test.
function fauxNode(repertoire: string): string {
  const fichier = join(repertoire, "node");
  writeFileSync(fichier, `#!/bin/sh\necho ${process.version}\n`);
  chmodSync(fichier, 0o755);
  return fichier;
}

// Le paquet construit puis ouvert : l'arbre de fichiers que dpkg poserait.
async function paquetOuvert(t: TestContext): Promise<string> {
  const sortie = repertoireTemporaire(t);
  const rendu = await new Promise<{ code: number; texte: string }>((resoudre) =>
    execFile(process.execPath, [CONSTRUIRE, "--version", "1.0.0", "--sortie", sortie, "--node", fauxNode(sortie), "--repo", "acme/brigade", "--maintainer", "Test <test@example.org>"], { encoding: "utf8" }, (erreur, stdout, stderr) =>
      resoudre({ code: erreur ? Number(erreur.code ?? 1) : 0, texte: stdout + stderr }),
    ),
  );
  assert.equal(rendu.code, 0, rendu.texte);
  const [deb] = readdirSync(sortie).filter((nom) => nom.endsWith(".deb"));
  assert.ok(deb !== undefined, rendu.texte);
  const arbre = repertoireTemporaire(t);
  assert.equal(spawnSync("dpkg-deb", ["--extract", join(sortie, deb), arbre]).status, 0);
  return arbre;
}

// Attend un fait, tant que la station tourne : morte avant, le test le dit avec sa sortie.
async function tantQue(station: Enfant, condition: () => boolean): Promise<void> {
  while (!condition()) {
    assert.equal(station.process.exitCode, null, station.sortie());
    await new Promise((resoudre) => setTimeout(resoudre, 20));
  }
}

test("sous Linux, la station du paquet, lancée comme ses unités la lancent, sert un premier ticket : elle clone le projet, y lance un cook dans sa cloison et livre une PR", { skip: manque }, async (t) => {
  const arbre = await paquetOuvert(t);
  // La machine : / remplacé par un répertoire d'essai, et le compte `brigade` que postinst crée.
  const machine = repertoireTemporaire(t);
  const etat = join(machine, "var/lib/brigade");
  const HOME = join(machine, "home/brigade");
  mkdirSync(etat, { recursive: true });
  mkdirSync(HOME, { recursive: true });

  // GitHub : le dépôt du projet, et son premier ticket, calibré et mis au feu.
  const github = repertoireTemporaire(t);
  const origines = join(github, "origines");
  const { origine } = depotGit(t);
  mkdirSync(join(origines, "acme"), { recursive: true });
  git(github, "clone", "-q", "--bare", origine, join(origines, "acme/shop.git"));
  const lireGitHub = () => JSON.parse(readFileSync(join(github, "etat.json"), "utf8")) as EtatFaux;
  const avant: EtatFaux = {
    compte: "brigade-box",
    tickets: [{ number: 1, title: "Add the first page", body: "The first page of the shop.", labels: ["fire", "model:sonnet", "effort:medium"], state: "open", created_at: "2026-11-11T10:00:00Z" }],
    commentaires: {},
    prs: [],
    horloge: Date.parse("2026-11-11T10:00:00Z"),
    suivant: 100,
  };
  writeFileSync(join(github, "etat.json"), JSON.stringify(avant));
  writeFileSync(join(github, "appels"), "");

  const lancements = join(repertoireTemporaire(t), "lancements");
  writeFileSync(lancements, "");

  // Le projet choisi pour cette station, comme sa commande l'écrit.
  assert.deepEqual(ajouterProjetServi(etat, "acme/shop"), ["acme/shop"]);

  const lireUnite = (nom: string) => {
    const unite = readFileSync(join(arbre, "usr/lib/systemd/system", nom), "utf8");
    return (cle: string) => [...unite.matchAll(new RegExp(`^${cle}=(.*)$`, "gm"))].map((m) => m[1] ?? "");
  };
  const lancerUnite = (nom: string) => {
    const valeur = lireUnite(nom);
    const [dossierDeTravail = ""] = valeur("WorkingDirectory");
    const [binaire = "", script = ""] = (valeur("ExecStart")[0] ?? "").split(" ");
    assert.equal(binaire, "/usr/lib/brigade-station/node/bin/node", nom);
    assert.ok(existsSync(join(arbre, dossierDeTravail, script)), `${nom} : ExecStart lance ${script} depuis ${dossierDeTravail}, absent du paquet`);
    // Ce que tient la station vit aux lieux standard d'un service Linux : son état sous /var/lib, ses secrets sous /etc.
    const env: Record<string, string> = {};
    for (const affectation of valeur("Environment")) {
      const [cle = "", ...reste] = affectation.split("=");
      const brut = reste.join("=");
      for (const chemin of brut.split(":").filter((morceau) => morceau.startsWith("/") && morceau !== "/usr/bin/bwrap")) assert.match(chemin, /^\/(var\/lib|etc)\/brigade(\/|$)|^\/var\/lib\/brigade-station$/, `${nom} : ${cle}=${brut}`);
      env[cle] = brut.replaceAll("/var/lib/brigade", join(machine, "var/lib/brigade")).replaceAll("/etc/brigade", join(machine, "etc/brigade"));
    }
    if (sansCloison !== null) {
      delete env.BRIGADE_SANDBOX_BIN;
      delete env.BRIGADE_SANDBOX_HIDDEN;
    }
    return lancer(t, join(arbre, dossierDeTravail, script), [], {
      ...ENV_GIT,
      ...env,
      HOME,
      BRIGADE_GH_BIN: FAUX_GH,
      FAUX_GITHUB: github,
      FAUX_ORIGINES: origines,
      BRIGADE_CLAUDE_BIN: CLAUDE_TEMOIN,
      FAUX_CLAUDE: "livre",
      FAUX_ETAT: etat,
      FAUX_LANCEMENTS: lancements,
      BRIGADE_MAX_LOAD_PER_CORE: "1000000",
      BRIGADE_MIN_FREE_MEMORY_MB: "0",
      BRIGADE_MIN_FREE_DISK_MB: "0",
    });
  };

  if (sansCloison !== null) t.diagnostic(`${sansCloison}: the cooks run without the units' partition, which this run does not check`);
  const portes = lancerUnite("brigade-station-porte.service");
  await portes.attendre("portes de la station ouvertes");
  const station = lancerUnite("brigade-station.service");
  await station.attendre("station démarrée");
  await station.attendre("serves acme/shop from GitHub only");

  // Un cook est lancé sur le ticket, et sa PR est livrée.
  await station.attendre("GitHub-only turn on acme/shop: cooking #1");
  await tantQue(station, () => lireGitHub().prs.length > 0);
  const [pr, ...autres] = lireGitHub().prs;
  assert.deepEqual(autres, []);
  assert.equal(pr?.head, "cook/1-github");
  assert.equal(pr?.base, git(join(origines, "acme/shop.git"), "symbolic-ref", "--short", "HEAD"));
  assert.match(pr?.body ?? "", /^Closes #1\b/);
  // La branche poussée porte le commit du cook.
  assert.equal(git(join(origines, "acme/shop.git"), "log", "-1", "--format=%s", "cook/1-github"), "le travail du cook");
  // La prise est sur GitHub, sous le nom de la station.
  assert.match((lireGitHub().commentaires["1"] ?? []).map((c) => c.body).join("\n"), /Taken by station `[a-z0-9-]+\/claude`/);
  // Le cook a travaillé dans son worktree, sous la cloison des unités : l'état de la station lui est masqué.
  const cook = readFileSync(lancements, "utf8").split("\n").filter((ligne) => ligne.includes(join(etat, "etat/shop/worktrees")));
  assert.ok(cook.length > 0, readFileSync(lancements, "utf8"));
  if (sansCloison === null) for (const ligne of cook) assert.match(ligne, /^masque\t/);

  // Tout ce qu'elle a écrit l'est sous son état : le compte n'a rien reçu.
  assert.ok(existsSync(join(etat, "clones/shop/.git")));
  assert.deepEqual(readdirSync(HOME), []);

  station.process.kill("SIGTERM");
  assert.equal(await station.fin, 0);
  portes.process.kill("SIGTERM");
  assert.equal(await portes.fin, 0);
});

test("premier-ticket.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);

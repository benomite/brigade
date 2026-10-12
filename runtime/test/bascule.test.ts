// La bascule d'une box : `brigade-bascule <projet> [<commit>]` pose une version
// du runtime à côté de celle qui tourne, l'essaie par un démarrage réel, et
// revient seule à la précédente si elle ne démarre pas. Ni systemd ni root ici :
// une box entière sous un répertoire, et une doublure de `systemctl` qui joue
// le démarrage que la version posée dicte.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { aArreter, ENV_GIT, git, jusqua, repertoireTemporaire } from "./outils.ts";

const BASCULE = join(import.meta.dirname, "../deploy/brigade-bascule");
const FAUX_SYSTEMCTL = join(import.meta.dirname, "aides/fausse-box-systemctl.sh");
const USAGE = 64;
const PROJET_INCONNU = 65;
const SYSTEMD_MUET = 67;
const COMMIT_INCONNU = 71;
const UNITES_PERIMEES = 72;
const REVENUE = 73;
const PAS_REVENUE = 74;
const PAS_PRISE = 75;
const PROJET = "calculus";
const UNITE = `brigade@${PROJET}.service`;
const PORTE = `brigade-porte@${PROJET}.service`;
const SAUVEGARDE = `brigade-sauvegarde@${PROJET}.service`;

type Demarrage = "ok" | "refus" | "crash" | "muet";

type Box = {
  racine: string;
  clone: string;
  unites: string;
  etat: string;
  // Là où vivent les versions du projet, et son lien `en-service`.
  versions: string;
  // Un commit de plus dans le clone : un runtime qui démarrera ainsi.
  livrer: (demarrage: Demarrage, autres?: Record<string, string>) => string;
  bascule: (args?: string[], env?: Record<string, string>) => { code: number | null; sortie: string; erreur: string };
  // Les appels reçus par `systemctl`, dans l'ordre.
  appels: () => string[];
  // Le répertoire réel de chaque démarrage du runtime, dans l'ordre.
  demarres: () => string[];
  // Celui de chaque démarrage d'une porte, dans l'ordre.
  portes: () => string[];
  // La version en service et la précédente : leur commit, ou null.
  enService: () => string | null;
  precedente: () => string | null;
  // Le compte rendu de la dernière bascule, clé par clé.
  compteRendu: () => Record<string, string>;
};

// Une box installée : le clone de brigade et son gabarit posé, deux projets
// déclarés (`calculus`, `boutique`), aucun n'a encore basculé.
function box(t: TestContext): Box {
  const racine = realpathSync(repertoireTemporaire(t));
  const sous = (...noms: string[]) => join(racine, ...noms);
  const [clone, unites, etat, bin] = [sous("opt/brigade"), sous("unites"), sous("etat", PROJET), sous("bin")];
  const versions = sous("opt/brigade-versions", PROJET);
  for (const repertoire of [join(clone, "runtime/deploy"), join(clone, "runtime/src"), etat, bin, join(unites, `${UNITE}.d`), join(unites, "brigade@boutique.service.d")]) {
    mkdirSync(repertoire, { recursive: true });
  }
  writeFileSync(join(unites, `${UNITE}.d`, "projet.conf"), "[Service]\nEnvironment=BRIGADE_BASE_BRANCH=main\n");
  writeFileSync(join(unites, "brigade@boutique.service.d", "projet.conf"), "[Service]\nEnvironment=BRIGADE_BASE_BRANCH=main\n");
  writeFileSync(join(unites, "brigade@.service"), "le gabarit\n");
  symlinkSync(FAUX_SYSTEMCTL, join(bin, "systemctl"));
  writeFileSync(join(bin, "journalctl"), `#!/bin/sh\necho "journald : $*"\necho "brigade : refus de démarrer — une raison"\n`);
  chmodSync(join(bin, "journalctl"), 0o755);

  git(clone, "init", "-q", "--initial-branch=v2");
  writeFileSync(join(clone, ".gitignore"), "brigade-bascule\n");
  writeFileSync(join(clone, "runtime/deploy/brigade@.service"), "le gabarit\n");
  writeFileSync(join(clone, "runtime/src/main.ts"), "// le runtime\n");
  // La bascule se lance du clone : c'est de lui qu'elle tire les versions.
  copyFileSync(BASCULE, join(clone, "runtime/deploy/brigade-bascule"));
  chmodSync(join(clone, "runtime/deploy/brigade-bascule"), 0o755);
  let livraisons = 0;
  const livrer: Box["livrer"] = (demarrage, autres = {}) => {
    writeFileSync(join(clone, "runtime/demarrage"), `${demarrage}\n`);
    writeFileSync(join(clone, "runtime/src/version"), `${++livraisons}\n`);
    for (const [fichier, contenu] of Object.entries(autres)) writeFileSync(join(clone, fichier), contenu);
    git(clone, "add", ".");
    git(clone, "commit", "-q", "-m", `livraison ${livraisons}`);
    return git(clone, "rev-parse", "HEAD");
  };
  livrer("ok");

  const lignes = (fichier: string) => (existsSync(sous(fichier)) ? readFileSync(sous(fichier), "utf8").split("\n").slice(0, -1) : []);
  const lien = (nom: string) => {
    try {
      return readlinkSync(join(versions, nom));
    } catch {
      return null;
    }
  };
  return {
    racine,
    clone,
    unites,
    etat,
    versions,
    livrer,
    bascule: (args = [PROJET], env = {}) => {
      const fin = spawnSync(join(clone, "runtime/deploy/brigade-bascule"), args, {
        encoding: "utf8",
        env: { ...ENV_GIT, PATH: `${bin}:${process.env.PATH ?? ""}`, FAUSSE_BOX: racine, ...env },
      });
      return { code: fin.status, sortie: fin.stdout, erreur: fin.stderr };
    },
    appels: () => lignes("appels"),
    demarres: () => lignes("demarres"),
    portes: () => lignes("portes"),
    enService: () => lien("en-service"),
    precedente: () => lien("precedente"),
    compteRendu: () => Object.fromEntries(readFileSync(join(versions, "bascule"), "utf8").split("\n").slice(0, -1).map((ligne) => [ligne.split("=", 1)[0], ligne.slice(ligne.indexOf("=") + 1)])),
  };
}

const runtimeDe = (b: Box, commit: string) => join(b.versions, commit, "runtime");
// Ce que la bascule a fait faire à systemd, hors lectures.
const gestes = (b: Box) => b.appels().filter((appel) => !appel.startsWith("show "));

test("la première bascule pose la version à côté, y accroche l'instance, et la confirme au démarrage", (t) => {
  const b = box(t);
  const commit = git(b.clone, "rev-parse", "HEAD");

  const { code, sortie, erreur } = b.bascule();

  assert.equal(code, 0, erreur);
  assert.equal(b.enService(), commit);
  assert.equal(b.precedente(), null);
  // La version est une copie de `runtime/` à ce commit : le clone peut bouger sans elle.
  assert.equal(readFileSync(join(runtimeDe(b, commit), "src/main.ts"), "utf8"), "// le runtime\n");
  // L'instance, et elle seule, prend son répertoire de travail ; le gabarit ne bouge pas.
  assert.equal(readFileSync(join(b.unites, `${UNITE}.d`, "code.conf"), "utf8"), `[Service]\nWorkingDirectory=${join(b.versions, "en-service/runtime")}\n`);
  assert.equal(readFileSync(join(b.unites, "brigade@.service"), "utf8"), "le gabarit\n");
  assert.deepEqual(readdirSync(join(b.unites, "brigade@boutique.service.d")), ["projet.conf"]);
  // Le runtime a démarré sur la version posée, pas sur le clone.
  assert.deepEqual(b.demarres(), [runtimeDe(b, commit)]);
  assert.deepEqual(gestes(b), ["daemon-reload", `stop ${UNITE}`, `reset-failed ${UNITE}`, `start ${UNITE}`]);
  assert.match(sortie, new RegExp(`${UNITE} a démarré sur ${commit.slice(0, 12)}`));
  assert.deepEqual(b.compteRendu(), { clone: b.clone, "en-service": commit });
});

test("seule l'instance du projet est touchée : aucune autre unité n'est lue, arrêtée ni démarrée", (t) => {
  const b = box(t);

  b.bascule();

  for (const appel of b.appels()) {
    if (appel !== "daemon-reload") assert.match(appel, new RegExp(`${UNITE.replace(".", "\\.")}$`), appel);
  }
});

test("une bascule de plus garde la précédente, et ne garde que deux versions", (t) => {
  const b = box(t);
  const premiere = git(b.clone, "rev-parse", "HEAD");
  b.bascule();
  const deuxieme = b.livrer("ok");
  b.bascule();

  assert.equal(b.enService(), deuxieme);
  assert.equal(b.precedente(), premiere);

  const troisieme = b.livrer("ok");
  const { code, erreur } = b.bascule();

  assert.equal(code, 0, erreur);
  assert.equal(b.enService(), troisieme);
  assert.equal(b.precedente(), deuxieme);
  assert.deepEqual(readdirSync(b.versions).sort(), ["bascule", "en-service", "precedente", deuxieme, troisieme].sort());
  assert.deepEqual(b.demarres(), [premiere, deuxieme, troisieme].map((commit) => runtimeDe(b, commit)));
});

for (const [demarrage, motif] of [
  ["refus", /sorti en code 2/],
  ["crash", /relanc/],
] as const) {
  test(`une version qui ne démarre pas (${demarrage}) : la bascule revient seule à la précédente, le dit, et laisse de quoi comprendre`, (t) => {
    const b = box(t);
    const bonne = git(b.clone, "rev-parse", "HEAD");
    b.bascule();
    const cassee = b.livrer(demarrage);

    const { code, erreur } = b.bascule();

    assert.equal(code, REVENUE);
    assert.equal(b.enService(), bonne);
    // L'essai a bien été un démarrage réel de la version cassée, puis l'ancienne est revenue.
    assert.deepEqual(b.demarres().slice(1), [runtimeDe(b, cassee), runtimeDe(b, bonne)]);
    assert.match(erreur, new RegExp(`${cassee.slice(0, 12)} n'a pas démarré`));
    assert.match(erreur, motif);
    assert.match(erreur, new RegExp(`${bonne.slice(0, 12)} est revenue en service`));
    // De quoi comprendre, sans journald : le motif, et ce que l'essai a écrit.
    const rendu = b.compteRendu();
    assert.equal(rendu["en-service"], bonne);
    assert.equal(rendu.refusee, cassee);
    assert.match(rendu.motif ?? "", motif);
    assert.match(readFileSync(join(b.versions, "essai.journal"), "utf8"), /refus de démarrer — une raison/);
    // La version refusée ne reste pas posée.
    assert.equal(existsSync(join(b.versions, cassee)), false);
  });
}

test("une version qui ne dit rien — ni démarrée ni sortie — est refusée à la garde", (t) => {
  const b = box(t);
  const bonne = git(b.clone, "rev-parse", "HEAD");
  b.bascule();
  b.livrer("muet");

  // Une garde nulle : le premier regard, sans fait, vaut échec — aucune attente.
  const { code, erreur } = b.bascule([PROJET], { BRIGADE_BASCULE_GARDE: "0" });

  assert.equal(code, REVENUE);
  assert.equal(b.enService(), bonne);
  assert.match(erreur, /ni démarré ni sorti en 0 s/);
});

test("un témoin laissé par le runtime d'avant ne vaut pas démarrage", (t) => {
  const b = box(t);
  b.bascule();
  writeFileSync(join(b.etat, "code-en-service"), "celle d'avant\n");
  b.livrer("muet");

  const { code } = b.bascule([PROJET], { BRIGADE_BASCULE_GARDE: "0" });

  assert.equal(code, REVENUE);
});

test("une bascule réussie efface le compte rendu du retour précédent", (t) => {
  const b = box(t);
  b.bascule();
  b.livrer("refus");
  b.bascule();
  const reparee = b.livrer("ok");

  const { code, erreur } = b.bascule();

  assert.equal(code, 0, erreur);
  assert.deepEqual(Object.keys(b.compteRendu()).sort(), ["clone", "en-service", "precedente"]);
  assert.equal(b.enService(), reparee);
  assert.equal(existsSync(join(b.versions, "essai.journal")), false);
});

test("la première bascule ratée n'a pas de version à quoi revenir : l'instance retourne au clone", (t) => {
  const b = box(t);
  const cassee = b.livrer("refus");
  // Le clone, lui, démarre : c'est ce que le runtime servait avant.
  writeFileSync(join(b.clone, "runtime/demarrage"), "ok\n");

  const { code, erreur } = b.bascule();

  assert.equal(code, REVENUE);
  assert.equal(b.enService(), null);
  assert.equal(existsSync(join(b.unites, `${UNITE}.d`, "code.conf")), false);
  assert.deepEqual(b.demarres(), [runtimeDe(b, cassee), join(b.clone, "runtime")]);
  assert.match(erreur, /première bascule/);
  assert.match(erreur, new RegExp(`${join(b.clone, "runtime")}`));
  assert.equal(b.compteRendu().refusee, cassee);
});

test("un retour qui ne démarre pas non plus : la bascule le dit, rien ne tourne, et elle sort d'un autre code", (t) => {
  const b = box(t);
  const bonne = git(b.clone, "rev-parse", "HEAD");
  b.bascule();
  writeFileSync(join(runtimeDe(b, bonne), "demarrage"), "refus\n");
  b.livrer("refus");

  const { code, erreur } = b.bascule();

  assert.equal(code, PAS_REVENUE);
  assert.match(erreur, new RegExp(`${bonne.slice(0, 12)} n'a pas redémarré`));
  assert.match(erreur, /rien ne tourne/);
  assert.equal(b.enService(), bonne);
});

test("un commit nommé se bascule comme le dernier : c'est aussi le retour à la main", (t) => {
  const b = box(t);
  const premiere = git(b.clone, "rev-parse", "HEAD");
  const deuxieme = b.livrer("ok");

  assert.equal(b.bascule([PROJET, "HEAD~1"]).code, 0);
  assert.equal(b.enService(), premiere);
  assert.equal(b.bascule().code, 0);
  assert.equal(b.enService(), deuxieme);
  assert.equal(b.bascule([PROJET, premiere]).code, 0);
  assert.equal(b.enService(), premiere);
  assert.equal(b.precedente(), deuxieme);
});

test("la version déjà en service n'est pas rebasculée : rien n'est arrêté", (t) => {
  const b = box(t);
  b.bascule();
  const avant = b.appels().length;

  const { code, sortie } = b.bascule();

  assert.equal(code, 0);
  assert.match(sortie, /déjà en service/);
  assert.deepEqual(gestes(b).slice(4), []);
  assert.ok(b.appels().length > avant);
});

test("une version qui change une unité est refusée avant de rien arrêter, et nomme le pas à la main", (t) => {
  const b = box(t);
  b.bascule();
  const en = b.enService();
  const changee = b.livrer("ok", { "runtime/deploy/brigade@.service": "le gabarit, changé\n" });

  const { code, erreur } = b.bascule();

  assert.equal(code, UNITES_PERIMEES);
  assert.match(erreur, /brigade@\.service/);
  assert.match(erreur, /sudo cp .*\/runtime\/deploy\/\*\.service/);
  assert.match(erreur, /daemon-reload/);
  assert.equal(b.enService(), en);
  assert.deepEqual(gestes(b).slice(4), []);
  assert.equal(existsSync(join(b.versions, changee)), false);
});

test("une cloison posée qui ne diffère que par les réglages du chef n'est pas une unité changée", (t) => {
  const b = box(t);
  const cloison = "[Service]\n#Environment=BRIGADE_SANDBOX_HIDDEN=\nPrivateTmp=yes\n";
  b.livrer("ok", { "runtime/deploy/cloison.conf": cloison });
  writeFileSync(join(b.unites, `${UNITE}.d`, "cloison.conf"), cloison.replace("#Environment=BRIGADE_SANDBOX_HIDDEN=", "Environment=BRIGADE_SANDBOX_HIDDEN=/home"));

  assert.equal(b.bascule().code, 0);

  writeFileSync(join(b.unites, `${UNITE}.d`, "cloison.conf"), cloison.replace("PrivateTmp=yes", "PrivateTmp=no"));
  b.livrer("ok");
  const { code, erreur } = b.bascule();

  assert.equal(code, UNITES_PERIMEES);
  assert.match(erreur, /cloison\.conf/);
});

test("sans projet : l'usage ; un projet sans drop-in : inconnu ; un commit que le clone n'a pas : nommé", (t) => {
  const b = box(t);

  assert.equal(b.bascule([]).code, USAGE);
  const inconnu = b.bascule(["nulle-part"]);
  assert.equal(inconnu.code, PROJET_INCONNU);
  assert.match(inconnu.erreur, /projet inconnu/);
  const sansCommit = b.bascule([PROJET, "pas-un-commit"]);
  assert.equal(sansCommit.code, COMMIT_INCONNU);
  assert.match(sansCommit.erreur, /pas-un-commit/);
  assert.deepEqual(gestes(b), []);
});

test("systemd qui ne répond pas arrête la bascule avant de rien toucher", (t) => {
  const b = box(t);
  writeFileSync(join(b.racine, "en-panne"), "FragmentPath");

  const { code, erreur } = b.bascule();

  assert.equal(code, SYSTEMD_MUET);
  assert.match(erreur, /systemd n'a pas répondu/);
  assert.deepEqual(gestes(b), []);
});

test("lancée d'une version posée, et non du clone, la bascule refuse : c'est du clone qu'elle tire les versions", (t) => {
  const b = box(t);
  const commit = git(b.clone, "rev-parse", "HEAD");
  b.bascule();
  const posee = join(runtimeDe(b, commit), "deploy/brigade-bascule");
  copyFileSync(BASCULE, posee);
  chmodSync(posee, 0o755);

  const fin = spawnSync(posee, [PROJET], { encoding: "utf8", env: { ...ENV_GIT, PATH: `${join(b.racine, "bin")}:${process.env.PATH ?? ""}`, FAUSSE_BOX: b.racine } });

  assert.equal(fin.status, COMMIT_INCONNU);
  assert.match(fin.stderr, /n'est pas un clone de brigade/);
  assert.match(fin.stderr, new RegExp(join(b.clone, "runtime/deploy/brigade-bascule")));
});

test("un autre drop-in qui impose le répertoire de travail : la version n'est pas essayée sur le code d'avant, et rien n'est arrêté", (t) => {
  const b = box(t);
  b.bascule();
  const servie = b.enService();
  const neuve = b.livrer("ok");
  writeFileSync(join(b.racine, "travail-impose"), join(b.clone, "runtime"));
  const avant = gestes(b).length;

  const { code, erreur } = b.bascule();

  assert.equal(code, PAS_PRISE);
  assert.match(erreur, /ne prend pas son répertoire de travail/);
  assert.match(erreur, /rien n'a été arrêté/);
  assert.deepEqual(gestes(b).slice(avant), []);
  assert.equal(b.enService(), servie);
  assert.equal(existsSync(join(b.versions, neuve)), false);
});

test("une première bascule qu'un autre drop-in empêche de prendre : rien n'est arrêté, et le projet reste sur le clone tel qu'il était", (t) => {
  const b = box(t);
  writeFileSync(join(b.racine, "travail-impose"), join(b.clone, "runtime"));

  const { code } = b.bascule();

  assert.equal(code, PAS_PRISE);
  assert.equal(gestes(b).some((geste) => geste.startsWith("stop ")), false);
  assert.equal(existsSync(codeConf(b, UNITE)), false);
  assert.equal(b.enService(), null);
});

test("une garde qui n'est pas un nombre de secondes est refusée avant de rien toucher", (t) => {
  const b = box(t);

  const { code, erreur } = b.bascule([PROJET], { BRIGADE_BASCULE_GARDE: "bientôt" });

  assert.equal(code, USAGE);
  assert.match(erreur, /secondes entières/);
  assert.deepEqual(b.appels(), []);
});

// Ce que systemd tient de l'unité du projet, dicté par le test.
const tenir = (b: Box, propriete: string, valeur: string) => writeFileSync(join(b.racine, "systemd", UNITE, propriete), `${valeur}\n`);

for (const [cas, defaire] of [
  ["l'unité est à l'arrêt", (b: Box) => tenir(b, "ActiveState", "inactive")],
  ["l'unité tourne sans avoir laissé de témoin", (b: Box) => rmSync(join(b.etat, "code-en-service"))],
] as const) {
  test(`« déjà en service » se constate, il ne se lit pas au lien : ${cas}, la version est réessayée`, (t) => {
    const b = box(t);
    const commit = git(b.clone, "rev-parse", "HEAD");
    b.bascule();
    defaire(b);

    const { code, sortie, erreur } = b.bascule();

    assert.equal(code, 0, erreur);
    assert.doesNotMatch(sortie, /déjà en service/);
    assert.match(sortie, /a démarré sur/);
    assert.deepEqual(b.demarres(), [runtimeDe(b, commit), runtimeDe(b, commit)]);
    assert.equal(b.enService(), commit);
  });
}

test("après un retour qui n'a pas démarré, rejouer la bascule sur la version revenue la démarre", (t) => {
  const b = box(t);
  const bonne = git(b.clone, "rev-parse", "HEAD");
  b.bascule();
  writeFileSync(join(runtimeDe(b, bonne), "demarrage"), "refus\n");
  b.livrer("refus");
  assert.equal(b.bascule().code, PAS_REVENUE);
  writeFileSync(join(runtimeDe(b, bonne), "demarrage"), "ok\n");

  const { code, sortie, erreur } = b.bascule([PROJET, bonne]);

  assert.equal(code, 0, erreur);
  assert.match(sortie, /a démarré sur/);
  assert.equal(b.demarres().at(-1), runtimeDe(b, bonne));
});

test("la version en service, réessayée, qui ne démarre pas : la précédente revient, et n'est plus « la précédente »", (t) => {
  const b = box(t);
  const premiere = git(b.clone, "rev-parse", "HEAD");
  b.bascule();
  const deuxieme = b.livrer("ok");
  b.bascule();
  tenir(b, "ActiveState", "failed");
  writeFileSync(join(runtimeDe(b, deuxieme), "demarrage"), "refus\n");

  const { code, erreur } = b.bascule();

  assert.equal(code, REVENUE);
  assert.match(erreur, new RegExp(`${premiere.slice(0, 12)} est revenue en service`));
  assert.equal(b.enService(), premiere);
  assert.equal(b.precedente(), null);
  assert.equal(existsSync(join(b.versions, deuxieme)), false);
  assert.deepEqual(b.compteRendu(), { clone: b.clone, "en-service": premiere, refusee: deuxieme, motif: b.compteRendu().motif });
});

test("une bascule interrompue pendant l'essai ne laisse pas le lien sur une version non confirmée : la précédente revient", async (t) => {
  const b = box(t);
  const bonne = git(b.clone, "rev-parse", "HEAD");
  b.bascule();
  const muette = b.livrer("muet");

  // La garde par défaut : l'essai attend un fait qui ne viendra pas.
  const enCours = spawn(join(b.clone, "runtime/deploy/brigade-bascule"), [PROJET], {
    stdio: ["ignore", "ignore", "pipe"],
    env: { ...ENV_GIT, PATH: `${join(b.racine, "bin")}:${process.env.PATH ?? ""}`, FAUSSE_BOX: b.racine },
  });
  aArreter(t, () => enCours.kill("SIGKILL"));
  let erreur = "";
  enCours.stderr.on("data", (morceau) => (erreur += morceau));
  const fin = new Promise<number | null>((resolve) => enCours.on("close", resolve));
  await jusqua(() => b.demarres().at(-1) === runtimeDe(b, muette));

  enCours.kill("SIGTERM");

  assert.equal(await fin, REVENUE);
  assert.match(erreur, /interrompue/);
  assert.equal(b.enService(), bonne);
  assert.equal(b.demarres().at(-1), runtimeDe(b, bonne));
  assert.equal(b.compteRendu().refusee, muette);
});

// --- La porte et la sauvegarde du projet suivent la version en service -------

const accroche = (b: Box) => `[Service]\nWorkingDirectory=${join(b.versions, "en-service/runtime")}\n`;
const codeConf = (b: Box, unite: string) => join(b.unites, `${unite}.d`, "code.conf");
// Une unité d'instance que la box a déclarée : elle a son drop-in.
const declarer = (b: Box, unite: string, reglage: string) => {
  mkdirSync(join(b.unites, `${unite}.d`), { recursive: true });
  writeFileSync(join(b.unites, `${unite}.d`, "reglage.conf"), `[Service]\nEnvironment=${reglage}\n`);
};

// Un port de la boucle locale qui répond : celui d'une porte ouverte. Une
// connexion y est prise par le noyau sans que ce process ait à la servir.
async function portOuvert(t: TestContext): Promise<{ port: number }> {
  const serveur = createServer();
  await new Promise<void>((resolve) => serveur.listen(0, "127.0.0.1", resolve));
  const fermer = () => new Promise<void>((resolve) => serveur.close(() => resolve()));
  aArreter(t, fermer);
  const adresse = serveur.address();
  assert.ok(adresse !== null && typeof adresse === "object");
  return { port: adresse.port };
}

// Un port où rien ne répond jamais : le 0 ne s'écoute pas, aucun process ne
// peut le prendre.
const PORT_FERME = 0;

// Le projet sous cloison : son runtime requiert sa porte, qui a son port.
function cloisonner(b: Box, port: number): void {
  writeFileSync(join(b.unites, `${UNITE}.d`, "cloison.conf"), "[Unit]\nRequires=brigade-porte@%i.service\nAfter=brigade-porte@%i.service\n");
  declarer(b, PORTE, `BRIGADE_PROXY_PORT=${port}`);
}

test("la sauvegarde du projet suit la version en service : elle prend le même lien, sans être lancée", (t) => {
  const b = box(t);
  declarer(b, SAUVEGARDE, "BRIGADE_BACKUP_DIR=/mnt/sauvegardes");
  declarer(b, "brigade-sauvegarde@boutique.service", "BRIGADE_BACKUP_DIR=/mnt/sauvegardes");

  const { code, erreur } = b.bascule();

  assert.equal(code, 0, erreur);
  assert.equal(readFileSync(codeConf(b, SAUVEGARDE), "utf8"), accroche(b));
  assert.deepEqual(gestes(b), ["daemon-reload", `stop ${UNITE}`, `reset-failed ${UNITE}`, `start ${UNITE}`]);
  // Celle d'un autre projet ne bouge pas.
  assert.deepEqual(readdirSync(join(b.unites, "brigade-sauvegarde@boutique.service.d")), ["reglage.conf"]);
});

test("une unité que le projet n'a pas déclarée ne reçoit rien", (t) => {
  const b = box(t);
  const avant = readdirSync(b.unites).sort();

  b.bascule();

  assert.deepEqual(readdirSync(b.unites).sort(), avant);
});

test("la sauvegarde ne lit jamais une version refusée : elle revient avec le lien, et au clone s'il n'y a rien à quoi revenir", (t) => {
  const b = box(t);
  declarer(b, SAUVEGARDE, "BRIGADE_BACKUP_DIR=/mnt/sauvegardes");
  b.livrer("refus");
  writeFileSync(join(b.clone, "runtime/demarrage"), "ok\n");

  assert.equal(b.bascule().code, REVENUE);
  // Première bascule ratée : le projet retourne au clone, sa sauvegarde aussi.
  assert.equal(existsSync(codeConf(b, SAUVEGARDE)), false);

  const bonne = b.livrer("ok");
  b.bascule();
  b.livrer("refus");
  assert.equal(b.bascule().code, REVENUE);
  // Le lien qu'elle suit désigne la version revenue.
  assert.equal(readFileSync(codeConf(b, SAUVEGARDE), "utf8"), accroche(b));
  assert.equal(b.enService(), bonne);
});

test("un projet basculé avant que sa sauvegarde ne suive : « déjà en service » ne le tient pas pour fait, la bascule est rejouée", (t) => {
  const b = box(t);
  b.bascule();
  declarer(b, SAUVEGARDE, "BRIGADE_BACKUP_DIR=/mnt/sauvegardes");

  const { code, sortie, erreur } = b.bascule();

  assert.equal(code, 0, erreur);
  assert.doesNotMatch(sortie, /déjà en service/);
  assert.equal(readFileSync(codeConf(b, SAUVEGARDE), "utf8"), accroche(b));
  // Tout accroché, elle n'est plus rejouée.
  assert.match(b.bascule().sortie, /déjà en service/);
});

test("un autre drop-in qui impose son répertoire de travail à la sauvegarde : la version n'est pas confirmée", (t) => {
  const b = box(t);
  b.bascule();
  const servie = b.enService();
  declarer(b, SAUVEGARDE, "BRIGADE_BACKUP_DIR=/mnt/sauvegardes");
  b.livrer("ok");
  writeFileSync(join(b.racine, `travail-impose.${SAUVEGARDE}`), join(b.clone, "runtime"));

  const { code, erreur } = b.bascule();

  assert.equal(code, PAS_PRISE);
  assert.match(erreur, new RegExp(`${SAUVEGARDE.replace(".", "\\.")} ne prend pas son répertoire de travail`));
  assert.equal(b.enService(), servie);
});

// Un rejeu : la bascule relancée sur le commit qui sert, pour y accrocher une
// unité déclarée après coup. S'il échoue, la version saine n'est pas la refusée.
test("le rejeu sur la version qui sert, qu'un autre drop-in empêche d'accrocher : rien n'est arrêté, la version reste posée et servie", (t) => {
  const b = box(t);
  const premiere = git(b.clone, "rev-parse", "HEAD");
  b.bascule();
  const servie = b.livrer("ok");
  b.bascule();
  declarer(b, SAUVEGARDE, "BRIGADE_BACKUP_DIR=/mnt/sauvegardes");
  writeFileSync(join(b.racine, `travail-impose.${SAUVEGARDE}`), join(b.clone, "runtime"));
  const avant = gestes(b).length;

  const { code, erreur } = b.bascule();

  assert.equal(code, PAS_PRISE);
  assert.match(erreur, /rien n'a été arrêté/);
  // Accrochée, puis décrochée : la sauvegarde repart d'où elle partait.
  assert.deepEqual(gestes(b).slice(avant), ["daemon-reload", "daemon-reload"]);
  assert.equal(existsSync(codeConf(b, SAUVEGARDE)), false);
  assert.equal(b.enService(), servie);
  assert.equal(b.precedente(), premiere);
  assert.equal(existsSync(runtimeDe(b, servie)), true);
  // Le drop-in corrigé, le même geste aboutit.
  rmSync(join(b.racine, `travail-impose.${SAUVEGARDE}`));
  assert.equal(b.bascule().code, 0);
});

test("le rejeu sur la version qui sert, dont le démarrage échoue : c'est elle qui est relancée — ni retirée, ni remplacée par la précédente", (t) => {
  const b = box(t);
  const premiere = git(b.clone, "rev-parse", "HEAD");
  b.bascule();
  const servie = b.livrer("ok");
  b.bascule();
  declarer(b, SAUVEGARDE, "BRIGADE_BACKUP_DIR=/mnt/sauvegardes");
  writeFileSync(join(runtimeDe(b, servie), "demarrage"), "crash-une-fois\n");

  const { code, erreur } = b.bascule();

  assert.equal(code, REVENUE);
  assert.match(erreur, /elle a été relancée, rien n'est retiré/);
  assert.equal(b.enService(), servie);
  assert.equal(b.precedente(), premiere);
  assert.equal(existsSync(runtimeDe(b, premiere)), true);
  assert.deepEqual(b.demarres().slice(-2), [runtimeDe(b, servie), runtimeDe(b, servie)]);
  // Elle n'a pas été refusée : rien ne la dit telle.
  assert.deepEqual(b.compteRendu(), { clone: b.clone, "en-service": servie, precedente: premiere });
  // Ce que ce passage avait accroché ne l'est plus ; ce qui l'était le reste.
  assert.equal(existsSync(codeConf(b, SAUVEGARDE)), false);
  assert.equal(readFileSync(codeConf(b, UNITE), "utf8"), accroche(b));
});

// --- Ce qu'un passage écrit avant la confirmation, il le défait --------------

test("une première bascule dont l'arrêt échoue : les unités ne restent pas accrochées à un lien qui n'existe pas", (t) => {
  const b = box(t);
  declarer(b, SAUVEGARDE, "BRIGADE_BACKUP_DIR=/mnt/sauvegardes");
  declarer(b, PORTE, "BRIGADE_PROXY_PORT=1");
  writeFileSync(join(b.racine, "stop-refuse"), "");

  const { code, erreur } = b.bascule();

  assert.equal(code, 1);
  assert.match(erreur, /n'a pas pu être arrêtée .* rien n'a changé/);
  for (const unite of [UNITE, SAUVEGARDE, PORTE]) assert.equal(existsSync(codeConf(b, unite)), false, unite);
  assert.equal(b.enService(), null);
  assert.equal(b.appels().at(-1), "daemon-reload");
});

test("un arrêt qui échoue ne retire pas un code.conf qui était déjà là, et rend celui qu'il a remplacé", (t) => {
  const b = box(t);
  b.bascule();
  declarer(b, SAUVEGARDE, "BRIGADE_BACKUP_DIR=/mnt/sauvegardes");
  declarer(b, PORTE, "BRIGADE_PROXY_PORT=1");
  const ancien = "[Service]\nWorkingDirectory=/opt/ailleurs/runtime\n";
  writeFileSync(codeConf(b, PORTE), ancien);
  b.livrer("ok");
  writeFileSync(join(b.racine, "stop-refuse"), "");

  assert.equal(b.bascule().code, 1);

  assert.equal(readFileSync(codeConf(b, UNITE), "utf8"), accroche(b));
  assert.equal(existsSync(codeConf(b, SAUVEGARDE)), false);
  assert.equal(readFileSync(codeConf(b, PORTE), "utf8"), ancien);
  assert.deepEqual(readdirSync(join(b.unites, `${PORTE}.d`)).sort(), ["code.conf", "reglage.conf"]);
});

test("une bascule interrompue avant d'avoir rien arrêté défait ce qu'elle a accroché, et n'arrête rien", async (t) => {
  const b = box(t);
  declarer(b, SAUVEGARDE, "BRIGADE_BACKUP_DIR=/mnt/sauvegardes");
  const commit = git(b.clone, "rev-parse", "HEAD");
  const retient = join(b.racine, "retient-daemon-reload");
  writeFileSync(retient, "");

  const enCours = spawn(join(b.clone, "runtime/deploy/brigade-bascule"), [PROJET], {
    stdio: ["ignore", "ignore", "pipe"],
    env: { ...ENV_GIT, PATH: `${join(b.racine, "bin")}:${process.env.PATH ?? ""}`, FAUSSE_BOX: b.racine },
  });
  aArreter(t, () => {
    rmSync(retient, { force: true });
    enCours.kill("SIGKILL");
  });
  let erreur = "";
  enCours.stderr.on("data", (morceau) => (erreur += morceau));
  const fin = new Promise<number | null>((resolve) => enCours.on("close", resolve));
  // La bascule a écrit ses `code.conf`, et attend systemd.
  await jusqua(() => existsSync(join(b.racine, "daemon-reload-en-cours")));
  assert.equal(readFileSync(codeConf(b, SAUVEGARDE), "utf8"), accroche(b));

  enCours.kill("SIGTERM");
  rmSync(retient);

  assert.equal(await fin, 1);
  assert.match(erreur, /interrompue avant d'avoir rien arrêté/);
  for (const unite of [UNITE, SAUVEGARDE]) assert.equal(existsSync(codeConf(b, unite)), false, unite);
  assert.equal(gestes(b).some((geste) => geste.startsWith("stop ") || geste.startsWith("start ")), false);
  assert.equal(b.enService(), null);
  assert.equal(existsSync(join(b.versions, commit)), false);
});

test("une bascule interrompue pendant l'arrêt du runtime revient : la version d'avant est relancée, et jamais « rien n'a changé »", async (t) => {
  const b = box(t);
  const servie = git(b.clone, "rev-parse", "HEAD");
  b.bascule();
  b.livrer("ok");
  const retient = join(b.racine, "retient-stop");
  writeFileSync(retient, "");

  const enCours = spawn(join(b.clone, "runtime/deploy/brigade-bascule"), [PROJET], {
    stdio: ["ignore", "ignore", "pipe"],
    env: { ...ENV_GIT, PATH: `${join(b.racine, "bin")}:${process.env.PATH ?? ""}`, FAUSSE_BOX: b.racine },
  });
  aArreter(t, () => {
    rmSync(retient, { force: true });
    enCours.kill("SIGKILL");
  });
  let erreur = "";
  enCours.stderr.on("data", (morceau) => (erreur += morceau));
  const fin = new Promise<number | null>((resolve) => enCours.on("close", resolve));
  await jusqua(() => existsSync(join(b.racine, "stop-en-cours")));

  enCours.kill("SIGTERM");
  rmSync(retient);

  assert.notEqual(await fin, 0);
  assert.doesNotMatch(erreur, /rien n'a changé/);
  assert.match(erreur, /interrompue avant que le démarrage soit confirmé/);
  assert.equal(b.demarres().at(-1), runtimeDe(b, servie));
  assert.equal(b.enService(), servie);
});

test("sous cloison, un rejeu dont la porte fraîchement accrochée ne tient pas : elle repart d'où elle partait, et le projet est servi de nouveau", async (t) => {
  const b = box(t);
  const { port } = await portOuvert(t);
  // La porte de cette version ne démarre pas ; celle du clone, si.
  const servie = b.livrer("ok", { "runtime/demarrage-porte": "refus\n" });
  rmSync(join(b.clone, "runtime/demarrage-porte"));
  b.bascule();
  cloisonner(b, port);

  const { code, erreur } = b.bascule();

  assert.equal(code, REVENUE);
  assert.match(erreur, /la porte est sortie en code 2/);
  assert.match(erreur, /elle a été relancée, rien n'est retiré/);
  assert.equal(existsSync(codeConf(b, PORTE)), false);
  assert.deepEqual(b.portes(), [runtimeDe(b, servie), join(b.clone, "runtime")]);
  assert.equal(b.demarres().at(-1), runtimeDe(b, servie));
  assert.equal(b.enService(), servie);
  assert.equal(existsSync(runtimeDe(b, servie)), true);
});

test("sous cloison, le rejeu sur la version qui sert, dont la porte reste muette : rien ne tourne, mais la version n'est ni retirée ni remplacée", async (t) => {
  const b = box(t);
  const { port } = await portOuvert(t);
  cloisonner(b, port);
  const premiere = git(b.clone, "rev-parse", "HEAD");
  b.bascule();
  const servie = b.livrer("ok");
  b.bascule();
  declarer(b, PORTE, `BRIGADE_PROXY_PORT=${PORT_FERME}`);

  const { code, erreur } = b.bascule([PROJET], { BRIGADE_BASCULE_GARDE: "0" });

  assert.equal(code, PAS_REVENUE);
  assert.match(erreur, /la porte n'a pas ouvert son port/);
  assert.equal(b.enService(), servie);
  assert.equal(b.precedente(), premiere);
  assert.equal(existsSync(runtimeDe(b, servie)), true);
  assert.equal(b.demarres().at(-1), runtimeDe(b, servie));
});

test("sans cloison, une porte déclarée suit la version sans entrer dans l'essai : elle n'est ni arrêtée ni démarrée", (t) => {
  const b = box(t);
  declarer(b, PORTE, "BRIGADE_PROXY_PORT=1");

  const { code, erreur } = b.bascule();

  assert.equal(code, 0, erreur);
  assert.equal(readFileSync(codeConf(b, PORTE), "utf8"), accroche(b));
  assert.deepEqual(gestes(b), ["daemon-reload", `stop ${UNITE}`, `reset-failed ${UNITE}`, `start ${UNITE}`]);
  assert.deepEqual(b.portes(), []);
});

test("sous cloison, la porte entre dans l'essai : arrêtée avec le runtime, elle démarre avant lui sur la version posée", async (t) => {
  const b = box(t);
  const { port } = await portOuvert(t);
  cloisonner(b, port);
  declarer(b, "brigade-porte@boutique.service", "BRIGADE_PROXY_PORT=1");
  const commit = git(b.clone, "rev-parse", "HEAD");

  const { code, sortie, erreur } = b.bascule();

  assert.equal(code, 0, erreur);
  assert.equal(readFileSync(codeConf(b, PORTE), "utf8"), accroche(b));
  assert.deepEqual(b.portes(), [runtimeDe(b, commit)]);
  assert.deepEqual(b.demarres(), [runtimeDe(b, commit)]);
  assert.deepEqual(gestes(b), ["daemon-reload", `stop ${UNITE}`, `stop ${PORTE}`, `reset-failed ${PORTE}`, `reset-failed ${UNITE}`, `start ${PORTE}`, `start ${UNITE}`]);
  assert.match(sortie, new RegExp(`${UNITE} a démarré sur ${commit.slice(0, 12)}, sa porte avec lui`));
  // La porte d'un autre projet n'est ni lue ni touchée.
  assert.deepEqual(readdirSync(join(b.unites, "brigade-porte@boutique.service.d")), ["reglage.conf"]);
  assert.deepEqual(b.appels().filter((appel) => appel.includes("boutique")), []);
});

for (const [demarrage, motif] of [
  ["refus", /la porte est sortie en code 2/],
  ["crash", /la porte est tombée avant d'avoir démarré/],
] as const) {
  test(`sous cloison, une version dont la porte ne démarre pas (${demarrage}) revient seule, porte comprise — même si le runtime, lui, a démarré`, async (t) => {
    const b = box(t);
    const { port } = await portOuvert(t);
    cloisonner(b, port);
    const bonne = git(b.clone, "rev-parse", "HEAD");
    b.bascule();
    const cassee = b.livrer("ok", { "runtime/demarrage-porte": `${demarrage}\n` });

    const { code, erreur } = b.bascule();

    assert.equal(code, REVENUE);
    assert.match(erreur, new RegExp(`${cassee.slice(0, 12)} n'a pas démarré`));
    assert.match(erreur, motif);
    assert.match(erreur, new RegExp(`${bonne.slice(0, 12)} est revenue en service`));
    assert.equal(b.enService(), bonne);
    // La porte a été essayée sur la version cassée, puis relancée sur celle d'avant.
    assert.deepEqual(b.portes(), [bonne, cassee, bonne].map((commit) => runtimeDe(b, commit)));
    assert.equal(b.demarres().at(-1), runtimeDe(b, bonne));
    assert.match(b.compteRendu().motif ?? "", motif);
    assert.equal(existsSync(join(b.versions, cassee)), false);
  });
}

test("sous cloison, une porte lancée qui n'ouvre pas son port ne vaut pas démarrage : la version est refusée à la garde", async (t) => {
  const b = box(t);
  const { port } = await portOuvert(t);
  cloisonner(b, port);
  const bonne = git(b.clone, "rev-parse", "HEAD");
  b.bascule();
  b.livrer("ok");
  // La porte du projet change de port, et n'y répondra pas.
  declarer(b, PORTE, `BRIGADE_PROXY_PORT=${PORT_FERME}`);

  const { code, erreur } = b.bascule([PROJET], { BRIGADE_BASCULE_GARDE: "0" });

  assert.equal(code, PAS_REVENUE);
  assert.match(erreur, new RegExp(`la porte n'a pas ouvert son port \\(${PORT_FERME}\\) en 0 s`));
  assert.equal(b.enService(), bonne);
});

test("sous cloison, « déjà en service » se constate aussi à la porte : à l'arrêt, la version est réessayée", async (t) => {
  const b = box(t);
  const { port } = await portOuvert(t);
  cloisonner(b, port);
  const commit = git(b.clone, "rev-parse", "HEAD");
  b.bascule();
  assert.match(b.bascule().sortie, /déjà en service/);
  writeFileSync(join(b.racine, "systemd", PORTE, "ActiveState"), "failed\n");

  const { code, sortie, erreur } = b.bascule();

  assert.equal(code, 0, erreur);
  assert.match(sortie, /a démarré sur/);
  assert.deepEqual(b.portes(), [runtimeDe(b, commit), runtimeDe(b, commit)]);
});

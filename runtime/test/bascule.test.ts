// La bascule d'une box : `brigade-bascule <projet> [<commit>]` pose une version
// du runtime à côté de celle qui tourne, l'essaie par un démarrage réel, et
// revient seule à la précédente si elle ne démarre pas. Ni systemd ni root ici :
// une box entière sous un répertoire, et une doublure de `systemctl` qui joue
// le démarrage que la version posée dicte.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, readlinkSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { ENV_GIT, git, repertoireTemporaire } from "./outils.ts";

const BASCULE = join(import.meta.dirname, "../deploy/brigade-bascule");
const FAUX_SYSTEMCTL = join(import.meta.dirname, "aides/fausse-box-systemctl.sh");
const USAGE = 64;
const PROJET_INCONNU = 65;
const SYSTEMD_MUET = 67;
const COMMIT_INCONNU = 71;
const UNITES_PERIMEES = 72;
const REVENUE = 73;
const PAS_REVENUE = 74;
const PROJET = "calculus";
const UNITE = `brigade@${PROJET}.service`;

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
  // Le répertoire réel de chaque démarrage, dans l'ordre.
  demarres: () => string[];
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
  assert.deepEqual(gestes(b), [`stop ${UNITE}`, "daemon-reload", `reset-failed ${UNITE}`, `start ${UNITE}`]);
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

test("un autre drop-in qui impose le répertoire de travail : la version n'est pas dite démarrée sur le code d'avant", (t) => {
  const b = box(t);
  b.bascule();
  const servie = b.enService();
  b.livrer("ok");
  writeFileSync(join(b.racine, "travail-impose"), join(b.clone, "runtime"));

  const { code, erreur } = b.bascule();

  assert.equal(code, REVENUE);
  assert.match(erreur, /ne prend pas son répertoire de travail/);
  assert.equal(b.enService(), servie);
});

test("une garde qui n'est pas un nombre de secondes est refusée avant de rien toucher", (t) => {
  const b = box(t);

  const { code, erreur } = b.bascule([PROJET], { BRIGADE_BASCULE_GARDE: "bientôt" });

  assert.equal(code, USAGE);
  assert.match(erreur, /secondes entières/);
  assert.deepEqual(b.appels(), []);
});

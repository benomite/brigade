// L'étape « stations » de l'installation : le chef — ou l'app, pour lui — voit
// les stations que la machine fournit, choisit, valide ; la déclaration est
// posée au journal du projet, l'étape notée faite, sans `sudo` ni drop-in, et
// le runtime qui tourne la lit sans redémarrer.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { test, type TestContext } from "node:test";
import { decisionsPosees } from "../src/decisions.ts";
import { principal } from "../src/declarer-stations.ts";
import { installationDe, noterEtape } from "../src/etapes.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { lireRail } from "../src/projections/rail.ts";
import { appeler, BASE, DEPOT, depotGit, ENV_GIT, FAUX_CLAUDE, fauxGh, issueGitHub, jusqua, lancer, repertoireTemporaire } from "./outils.ts";

const INSTALLATION = join(import.meta.dirname, "../src/installation-cli.ts");
const MAIN = join(import.meta.dirname, "../src/main.ts");
const PROJET = "espace";

type Lue = {
  etape: { id: string; etat: string };
  proposees: Array<{ nom: string; moteur: string; fournit: string[]; cooks: number | null }>;
  absent: string | null;
  declarees: Array<{ nom: string; moteur: string; fournit: string[]; cooks: number; distante: boolean }>;
};

const env = (etat: string, autres: Record<string, string> = {}) => ({ BRIGADE_STATE_DIR: etat, BRIGADE_PROJECT: PROJET, BRIGADE_CLAUDE_BIN: FAUX_CLAUDE, ...autres });

async function lire(etat: string, autres: Record<string, string> = {}): Promise<Lue> {
  const appel = appeler(principal, ["--json"], env(etat, autres));
  assert.equal(await appel.fin, 0, appel.sortie());
  return JSON.parse(appel.sortie()) as Lue;
}

async function declarer(etat: string, declaration: string, autres: Record<string, string> = {}) {
  const appel = appeler(principal, [declaration], env(etat, autres));
  return { code: await appel.fin, sortie: appel.sortie() };
}

function evenements(etat: string) {
  const journal = ouvrirJournal(etat, { lectureSeule: true });
  try {
    return journal.tout();
  } finally {
    journal.fermer();
  }
}

test("la lecture propose la station que la machine fournit, sans plafond, et ne crée aucun journal", async (t) => {
  const etat = repertoireTemporaire(t);

  const lue = await lire(etat);

  assert.deepEqual(Object.keys(lue), ["etape", "proposees", "absent", "declarees"]);
  assert.deepEqual(lue.etape, { id: "stations", etat: "à faire" });
  // Le plafond de cooks n'est jamais proposé : c'est au chef.
  assert.deepEqual(lue.proposees, [{ nom: "box/claude", moteur: "claude", fournit: ["code", "raisonnement"], cooks: null }]);
  assert.equal(lue.absent, null);
  assert.deepEqual(lue.declarees, []);
  assert.equal(existsSync(join(etat, "log.db")), false);
});

test("sur une machine sans `claude`, rien n'est proposé, et la lecture dit pourquoi", async (t) => {
  const etat = repertoireTemporaire(t);

  const lue = await lire(etat, { BRIGADE_CLAUDE_BIN: join(etat, "pas-de-claude") });

  assert.deepEqual(lue.proposees, []);
  assert.match(lue.absent ?? "", /introuvable dans le `PATH` du service : cette machine ne fournit aucune station .* `brigade espace installation` dit le geste/);
});

test("la déclaration choisie est posée au journal comme décision du chef, et l'étape « stations » notée faite", async (t) => {
  const etat = repertoireTemporaire(t);

  const { code, sortie } = await declarer(etat, "box/claude:4:code+raisonnement");

  assert.equal(code, 0, sortie);
  assert.match(sortie, /^brigade : stations déclarées — box\/claude \(4 cooks at most; provides: code, raisonnement\) ; lues par le runtime à son réveil suivant, sans redémarrage/m);
  assert.match(sortie, /« Déclarer les stations » notée faite/);
  const journal = ouvrirJournal(etat, { lectureSeule: true });
  try {
    assert.deepEqual(decisionsPosees(journal.base), { BRIGADE_STATIONS: "box/claude:4:code+raisonnement" });
  } finally {
    journal.fermer();
  }
  const lue = await lire(etat);
  assert.deepEqual(lue.etape, { id: "stations", etat: "faite" });
  assert.deepEqual(lue.declarees, [{ nom: "box/claude", moteur: "claude", fournit: ["code", "raisonnement"], cooks: 4, distante: false }]);
  assert.deepEqual(evenements(etat).map((e) => [e.type, e.author, e.project]), [
    ["decision.set", "chef", PROJET],
    ["installation.step", "chef", PROJET],
  ]);
});

test("les étapes qui précèdent faites, l'étape courante passe des stations à la suivante", async (t) => {
  const etat = repertoireTemporaire(t);
  const journal = ouvrirJournal(etat);
  for (const etape of ["ajout", "init", "verification"]) noterEtape(journal, { projet: PROJET, etape, etat: "done", auteur: "chef" });
  journal.fermer();
  assert.equal(installationDe(etat).courante, "stations");

  assert.equal((await declarer(etat, "box/claude:2:code")).code, 0);

  assert.equal(installationDe(etat).courante, "protection");
});

test("déclarer à nouveau la même chose ne réécrit rien", async (t) => {
  const etat = repertoireTemporaire(t);
  await declarer(etat, "box/claude:2:code");

  const { code, sortie } = await declarer(etat, "box/claude:2:code");

  assert.equal(code, 0, sortie);
  assert.match(sortie, /ces stations sont déjà déclarées — box\/claude .* rien n'est réécrit/);
  assert.equal(evenements(etat).length, 2);
});

test("une déclaration que le runtime ne lirait pas est refusée avant d'écrire : ni décision, ni étape, ni journal", async (t) => {
  const etat = repertoireTemporaire(t);

  for (const [declaration, motif] of [
    ["box/claude:beaucoup:code", /BRIGADE_STATIONS invalid: station no\. 1 .* cap: “beaucoup” is not an integer greater than zero.* — rien n'est écrit/],
    ["box/claude:2", /provides: it is missing/],
    ["", /une déclaration vide ne déclare aucune station : aucun cook ne partirait — rien n'est écrit/],
    ["  ", /une déclaration vide/],
  ] as const) {
    const { code, sortie } = await declarer(etat, declaration);
    assert.equal(code, 2, sortie);
    assert.match(sortie, motif);
  }
  assert.equal(existsSync(join(etat, "log.db")), false);
});

test("sans journal ni projet nommé, rien n'est écrit : rien ne dit à quel projet déclarer", async (t) => {
  const etat = repertoireTemporaire(t);

  const appel = appeler(principal, ["box/claude:2:code"], { BRIGADE_STATE_DIR: etat, BRIGADE_CLAUDE_BIN: FAUX_CLAUDE });

  assert.equal(await appel.fin, 1);
  assert.match(appel.sortie(), /BRIGADE_PROJECT n'est pas défini/);
  assert.equal(existsSync(join(etat, "log.db")), false);
});

// Aucun geste de box ne peut manquer à l'action, ni y être trop vieux : elle
// n'en lance aucun. Sur une box qui n'a ni `sudo`, ni `systemctl`, ni geste de
// mise en service, elle déclare quand même — et un `sudo` ou un `systemctl`
// lancé se verrait au témoin.
test("l'action ne lance aucun geste de box : ni `sudo`, ni `systemctl` — rien ne peut y manquer", async (t) => {
  const etat = repertoireTemporaire(t);
  const outils = repertoireTemporaire(t);
  const temoin = join(outils, "temoin");
  for (const nom of ["sudo", "systemctl", "tee"]) {
    writeFileSync(join(outils, nom), `#!/bin/sh\necho "${nom} $*" >> "${temoin}"\nexit 1\n`, { mode: 0o755 });
  }

  const commande = lancer(t, INSTALLATION, ["stations", "box/claude:3:code"], {
    ...env(etat),
    PATH: `${outils}${delimiter}${process.env.PATH ?? ""}`,
    BRIGADE_SUDO_BIN: join(outils, "sudo"),
    BRIGADE_SYSTEMCTL_BIN: join(outils, "systemctl"),
    BRIGADE_MISE_EN_SERVICE_LIEN: join(outils, "absent"),
  });

  assert.equal(await commande.fin, 0, commande.sortie());
  assert.match(commande.sortie(), /stations déclarées — box\/claude/);
  assert.equal(existsSync(temoin), false, "un geste de box a été lancé");
  assert.equal(installationDe(etat).etapes.find((etape) => etape.id === "stations")?.etat, "done");
});

test("la commande du chef, en texte : l'étape, ce qu'elle sert, ce que la machine fournit et le geste qui déclare", async (t) => {
  const etat = repertoireTemporaire(t);

  const commande = lancer(t, INSTALLATION, ["stations"], env(etat));

  assert.equal(await commande.fin, 0, commande.sortie());
  const sortie = commande.sortie();
  assert.match(sortie, /^brigade : « Déclarer les stations » — à faire$/m);
  assert.match(sortie, /à quoi elle sert : .+/);
  assert.match(sortie, /si tu la sautes  : .*aucun cook ne part/);
  assert.match(sortie, /box\/claude\s+fournit : code, raisonnement — plafond de cooks à choisir/);
  assert.match(sortie, /Pour les déclarer : `brigade espace installation stations box\/claude:<plafond de cooks>:code\+raisonnement`/);
});

// Le critère de bout en bout : un runtime démarré sans station ne fait partir
// aucun cook ; l'action déclare, et sans redémarrage le ticket qui attendait
// part.
test("de bout en bout : sur un runtime qui tourne sans station, l'action déclare et un cook part sur le ticket, sans redémarrage", async (t) => {
  const etat = repertoireTemporaire(t);
  const { clone } = depotGit(t);
  const gh = fauxGh(t);
  gh.issues([issueGitHub(15, { labels: ["fire", "model:sonnet", "effort:low"] })]);
  const temoin = join(repertoireTemporaire(t), "temoin");
  mkdirSync(temoin);
  const runtime = lancer(t, MAIN, [], {
    ...ENV_GIT,
    BRIGADE_STATE_DIR: etat,
    BRIGADE_PROJECT: PROJET,
    BRIGADE_GITHUB_REPO: DEPOT,
    BRIGADE_GH_BIN: gh.bin,
    BRIGADE_REPO_DIR: clone,
    BRIGADE_BASE_BRANCH: BASE,
    BRIGADE_CLAUDE_BIN: FAUX_CLAUDE,
    BRIGADE_MANAGER_MODEL: "sonnet",
    BRIGADE_MANAGER_EFFORT: "medium",
    BRIGADE_REVIEWER_MODEL: "sonnet",
    BRIGADE_REVIEWER_EFFORT: "medium",
    BRIGADE_MAX_LOAD_PER_CORE: "1000000",
    BRIGADE_MIN_FREE_MEMORY_MB: "0",
    BRIGADE_MIN_FREE_DISK_MB: "0",
    FAUX_CLAUDE_TEMOIN: temoin,
  });
  await runtime.attendre("démarré");
  const rail = () => {
    const journal = ouvrirJournal(etat, { lectureSeule: true });
    try {
      return lireRail(journal.base);
    } finally {
      journal.fermer();
    }
  };
  await jusqua(() => rail().length === 1);
  assert.ok(evenements(etat).some((e) => e.type === "stations.undeclared"));
  assert.deepEqual(readdirSync(temoin), []);

  const commande = lancer(t, INSTALLATION, ["stations", "box/claude:1:code+raisonnement"], env(etat));
  assert.equal(await commande.fin, 0, commande.sortie());

  await jusqua(() => evenements(etat).some((e) => e.type === "cook.launched"));
  const lance = evenements(etat).find((e) => e.type === "cook.launched");
  assert.equal(lance?.ticket, 15);
  assert.ok(evenements(etat).some((e) => e.type === "station.announced" && e.payload.station === "box/claude"));
  runtime.process.kill("SIGTERM");
  assert.equal(await runtime.fin, 0);
});

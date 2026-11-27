// Ce qu'un projet installé perd — une station, un geste de box — se dit dans sa bande
// d'alertes et sur sa case de la barre, avec son geste, et jamais par l'écran
// d'installation (alerts.ts, « Ce qu'un projet installé a perdu » ; service.ts, `controler`).
//
// La box est simulée : ce qu'elle rend de l'installation et de ses stations (`installation etapes
// --json`, `installation stations --json`) et le verdict de sa vérification (`installation --json`)
// sont les sorties de l'ancien runtime, recopiées telles qu'il les écrivait sur un journal où
// l'installation est terminée (runtime/src/etapes-cli.ts, runtime/src/declarer-stations.ts,
// runtime/src/verdict.ts, supprimés avec lui, #4499). Le test règle laquelle la box rend.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { decrireEtat, faits as runtimeFacts, lireEtat } from "../../runtime/src/etat.ts";
import type { Fait } from "../../runtime/src/evenements.ts";
import { ouvrirJournal } from "../../runtime/src/journal.ts";
import { signalOf, holdBands, type Alert, type Band } from "../src/alerts.ts";
import { putAside } from "../src/awaiting.ts";
import type { Kitchen, Reading, Rendered } from "../src/box.ts";
import type { Project } from "../src/config.ts";
import { COMMANDS, JUDGMENT, holdServices, type Guide } from "../src/service.ts";
import { openTerminals } from "../src/terminals.ts";

const KITCHEN: Kitchen = { locale: { node: process.execPath, runtime: "/tmp/runtime", racine: "/tmp/station", env: {} } };
const PARADE: Project = { nom: "parade", dossier: "/projets/parade" };

// Ce que la box rend d'une commande : sa sortie standard, et son code.
type Answer = { code: number; sortie: string };

// Les sept étapes de l'installation, telles que l'ancien runtime les écrivait (runtime/src/etapes.ts, `ETAPES`).
const STEPS = [
  {
    id: "ajout",
    titre: "Ajouter le projet sur la box",
    sert: "La box clone le dépôt, pose l'instance du projet, sa cloison, sa sauvegarde et ses ports : c'est elle qui fait exister le projet sur la box.",
    sauter: "Le projet n'existe pas sur la box : aucune des étapes suivantes n'a où s'appliquer.",
    geste: null,
  },
  {
    id: "init",
    titre: "Amorcer le dépôt",
    sert: "`/brigade:init` pose dans le dépôt les bindings, les gates et le setup de worktree que les cooks, la station et la pass lisent.",
    sauter: "La pass n'a pas de gates à jouer ni la station de setup à lancer : aucun cook ne peut livrer.",
    geste: "Taper `/brigade:init` dans la session que l'app ouvre, puis merger sa PR sur la branche d'intégration : l'app ne converse pas et ne merge pas à ta place.",
  },
  {
    id: "verification",
    titre: "Vérifier la box",
    sert: "Dit d'un coup tout ce qui manque au projet pour être servi — sur la box, dans le dépôt, sur GitHub — avec le geste qui le pose.",
    sauter: "Ce qui manque se découvre en démarrant, une panne à la fois : un cook qui ne part pas, une commande introuvable.",
    geste: null,
  },
  {
    id: "stations",
    titre: "Déclarer les stations",
    sert: "Choisit, parmi les stations que la machine fournit, celles où les tickets se servent et combien de cooks chacune fait tourner à la fois — posées au journal du projet, sans `sudo` ni drop-in.",
    sauter: "La cuisine démarre, mais aucun cook ne part : sans station, aucun ticket n'est servi.",
    geste: null,
  },
  {
    id: "protection",
    titre: "Protéger la branche d'intégration",
    sert: "Sur GitHub, plus rien n'entre dans la branche d'intégration que par une PR, et la push protection refuse une livraison qui porterait des identifiants.",
    sauter: "Un push direct entre dans la branche d'intégration sans passer par la pass, et des identifiants peuvent partir sur GitHub.",
    geste: null,
  },
  {
    id: "decisions",
    titre: "Poser les décisions que le démarrage réclame",
    sert: "Pose, chacune avec sa question, ses options et leur effet, les décisions que la configuration du projet suffit à trancher — le calibrage du manager et du reviewer, que le démarrage réclame, puis les seuils de coût et le closer —, au journal du projet, sans `sudo` ni drop-in.",
    sauter: "Le runtime refuse de démarrer : sans le calibrage du manager et du reviewer, rien n'est jugé ni relu.",
    geste: null,
  },
  {
    id: "demarrage",
    titre: "Démarrer la cuisine",
    sert: "Lance le runtime du projet : il lit le rail et envoie un cook sur le premier ticket prêt.",
    sauter: "Tout est prêt et rien ne tourne : aucun ticket n'est servi.",
    geste: null,
  },
];
// `installation etapes --json` : toutes faites — ou, l'installation pas finie, seules les stations déclarées.
const stepsAnswer = (terminee: boolean): Answer => ({
  code: 0,
  sortie: `${JSON.stringify({ courante: terminee ? null : "ajout", etapes: STEPS.map(({ id, titre, sert, sauter, geste }) => ({ id, titre, etat: terminee || id === "stations" ? "faite" : "à faire", sert, sauter, geste })) })}\n`,
});
// `installation stations --json` : la station `box/claude` déclarée — et que la box fournit, ou plus, son `claude` introuvable.
const STATIONS: Answer = { code: 0, sortie: `${JSON.stringify({
  etape: { id: "stations", etat: "faite" },
  proposees: [{ nom: "box/claude", moteur: "claude", fournit: ["code", "raisonnement"], cooks: null }],
  absent: null,
  declarees: [{ nom: "box/claude", moteur: "claude", fournit: ["code", "raisonnement"], cooks: 2, distante: false }],
})}\n` };
const STATIONS_WITHOUT_CLAUDE: Answer = { code: 0, sortie: `${JSON.stringify({
  etape: { id: "stations", etat: "faite" },
  proposees: [],
  absent: "`/tmp/brigade-app-pertes/plus-de-claude` est introuvable dans le `PATH` du service : cette machine ne fournit aucune station où lancer un cook — `brigade parade installation` dit le geste qui le pose",
  declarees: [{ nom: "box/claude", moteur: "claude", fournit: ["code", "raisonnement"], cooks: 2, distante: false }],
})}\n` };

// Le moteur des stations introuvable par le service : la phrase de runtime/src/installation.ts
// (`verifier`, l'unité de service), et son geste, mot pour mot.
const WITHOUT_CLAUDE = {
  texte: "`claude` est introuvable dans le `PATH` que l'unité brigade@parade.service donnera au runtime (/usr/local/bin:/usr/bin:/bin, le défaut de systemd : aucun `Environment=PATH=` dans ses drop-ins) : aucun cook ne partirait — le `PATH` du shell qui lance cette commande ne compte pas",
  geste: "`sudo ln -sfn /home/brigade/.local/bin/claude /usr/local/bin/claude` — l'installeur natif pose `claude` sous `~/.local/bin` du compte, que systemd ne donne pas à l'unité ; docs/installer.md",
};

// Le verdict de la vérification (`installation --json`), tel que l'ancien runtime l'écrivait (`verdictDesConstats`,
// `verdictDeLaPanne`) sur ce qu'elle constatait sur la machine — les variables du service toujours lisibles, et ce que
// chacun nomme.

// Rien d'autre : prêt.
const VERDICT_READY: Answer = { code: 0, sortie: `${JSON.stringify({
  verdict: "pret",
  phrase: "prêt : rien ne manque pour lancer un cook",
  manques: [],
  aSavoir: [],
  brut: [
    "",
    "Sur la machine",
    "  ok        les 9 variables obligatoires sont posées, et tout ce que le runtime lit de son environnement est lisible",
    "",
    "brigade : project “parade” : ready — nothing is missing to launch a cook",
  ].join("\n"),
})}\n` };

// Le moteur des stations introuvable par le service (`WITHOUT_CLAUDE`).
const VERDICT_WITHOUT_CLAUDE: Answer = { code: 1, sortie: `${JSON.stringify({
  verdict: "pas-pret",
  phrase: "pas prêt : 1 chose à faire",
  manques: [
    {
      ou: "machine",
      texte: "`claude` est introuvable dans le `PATH` que l'unité brigade@parade.service donnera au runtime (/usr/local/bin:/usr/bin:/bin, le défaut de systemd : aucun `Environment=PATH=` dans ses drop-ins) : aucun cook ne partirait — le `PATH` du shell qui lance cette commande ne compte pas",
      constat: "`claude` est introuvable dans le `PATH` que l'unité brigade@parade.service donnera au runtime (/usr/local/bin:/usr/bin:/bin, le défaut de systemd : aucun `Environment=PATH=` dans ses drop-ins) : aucun cook ne partirait — le `PATH` du shell qui lance cette commande ne compte pas",
      geste: "`sudo ln -sfn /home/brigade/.local/bin/claude /usr/local/bin/claude` — l'installeur natif pose `claude` sous `~/.local/bin` du compte, que systemd ne donne pas à l'unité ; docs/installer.md",
      acteur: "chef",
      commande: "sudo ln -sfn /home/brigade/.local/bin/claude /usr/local/bin/claude",
    },
  ],
  aSavoir: [],
  etapes: [],
  brut: [
    "",
    "Sur la machine",
    "  ok        les 9 variables obligatoires sont posées, et tout ce que le runtime lit de son environnement est lisible",
    "  MISSING   `claude` est introuvable dans le `PATH` que l'unité brigade@parade.service donnera au runtime (/usr/local/bin:/usr/bin:/bin, le défaut de systemd : aucun `Environment=PATH=` dans ses drop-ins) : aucun cook ne partirait — le `PATH` du shell qui lance cette commande ne compte pas",
    "            → `sudo ln -sfn /home/brigade/.local/bin/claude /usr/local/bin/claude` — l'installeur natif pose `claude` sous `~/.local/bin` du compte, que systemd ne donne pas à l'unité ; docs/installer.md",
    "",
    "brigade : project “parade” : 1 missing : no cook must be launched while any is left",
  ].join("\n"),
})}\n` };

// Plantée sur /etc/sudoers.d : la panne connue #654.
const VERDICT_EACCES: Answer = { code: 1, sortie: `${JSON.stringify({
  verdict: "plantee",
  phrase: "la vérification n'a pas pu aller au bout : c'est un problème de brigade, pas de ton projet — une panne connue (#654), tu n'as rien à faire",
  panne: {
    erreur: "EACCES: permission denied, open '/etc/sudoers.d/brigade'",
    connue: {
      issue: 654,
      texte: "la vérification lisait un fichier de /etc/sudoers.d que le compte du service n'a pas le droit de lire — corrigé dans brigade, la box l'aura à sa prochaine mise à jour",
    },
    acteur: "brigade",
    rienAFaire: true,
  },
  manques: [],
  aSavoir: [],
  brut: "brigade : EACCES: permission denied, open '/etc/sudoers.d/brigade'\n",
})}\n` };

// Le réglage du geste d'installation faux : la racine des sauvegardes n'existe pas.
const VERDICT_BACKUPS: Answer = { code: 1, sortie: `${JSON.stringify({
  verdict: "pas-pret",
  phrase: "pas prêt : 1 chose à faire",
  manques: [
    {
      ou: "machine",
      texte: "la racine des sauvegardes (/srv/sauvegardes, déclarée dans /etc/brigade-installer.conf) n'existe pas : le geste refuserait chaque projet",
      constat: "la racine des sauvegardes (/srv/sauvegardes, déclarée dans /etc/brigade-installer.conf) n'existe pas : le geste refuserait chaque projet",
      geste: "`sudo install -d /srv/sauvegardes` — docs/installer.md, « Le geste d'installation »",
      acteur: "chef",
      commande: "sudo install -d /srv/sauvegardes",
    },
  ],
  aSavoir: [],
  etapes: [],
  brut: [
    "",
    "Sur la machine",
    "  ok        les 9 variables obligatoires sont posées, et tout ce que le runtime lit de son environnement est lisible",
    "  MISSING   la racine des sauvegardes (/srv/sauvegardes, déclarée dans /etc/brigade-installer.conf) n'existe pas : le geste refuserait chaque projet",
    "            → `sudo install -d /srv/sauvegardes` — docs/installer.md, « Le geste d'installation »",
    "",
    "brigade : project “parade” : 1 missing : no cook must be launched while any is left",
  ].join("\n"),
})}\n` };

// Le même manque, qui nomme l'étape « verification ».
const VERDICT_BACKUPS_STEP: Answer = { code: 1, sortie: `${JSON.stringify({
  verdict: "pas-pret",
  phrase: "pas prêt : 1 chose à faire",
  manques: [
    {
      ou: "machine",
      texte: "la racine des sauvegardes (/srv/sauvegardes, déclarée dans /etc/brigade-installer.conf) n'existe pas : le geste refuserait chaque projet",
      constat: "la racine des sauvegardes (/srv/sauvegardes, déclarée dans /etc/brigade-installer.conf) n'existe pas : le geste refuserait chaque projet",
      geste: "`sudo install -d /srv/sauvegardes` — docs/installer.md, « Le geste d'installation »",
      etape: "verification",
      acteur: "chef",
      commande: "sudo install -d /srv/sauvegardes",
    },
  ],
  aSavoir: [],
  etapes: ["verification"],
  brut: [
    "",
    "Sur la machine",
    "  ok        les 9 variables obligatoires sont posées, et tout ce que le runtime lit de son environnement est lisible",
    "  MISSING   la racine des sauvegardes (/srv/sauvegardes, déclarée dans /etc/brigade-installer.conf) n'existe pas : le geste refuserait chaque projet",
    "            → `sudo install -d /srv/sauvegardes` — docs/installer.md, « Le geste d'installation »",
    "            → step to resume: 3. Vérifier la box (verification)",
    "",
    "brigade : project “parade” : 1 missing : no cook must be launched while any is left",
  ].join("\n"),
})}\n` };

// Le geste d'installation reposé.
const VERDICT_BACKUPS_OK: Answer = { code: 0, sortie: `${JSON.stringify({
  verdict: "pret",
  phrase: "prêt : rien ne manque pour lancer un cook",
  manques: [],
  aSavoir: [],
  brut: [
    "",
    "Sur la machine",
    "  ok        les 9 variables obligatoires sont posées, et tout ce que le runtime lit de son environnement est lisible",
    "  ok        geste d'installation : la racine des sauvegardes /srv/sauvegardes, à root",
    "",
    "brigade : project “parade” : ready — nothing is missing to launch a cook",
  ].join("\n"),
})}\n` };

// Le renouvellement de la session Max a échoué une fois (`jugerRenouvellement`).
const VERDICT_RENEWAL_FAILED_ONCE: Answer = { code: 0, sortie: `${JSON.stringify({
  verdict: "pret",
  phrase: "prêt : rien ne manque pour lancer un cook",
  manques: [],
  aSavoir: [
    {
      ou: "machine",
      texte: "renewal: failed (last successful run at 03:10) — échec (réseau) : api injoignable",
      geste: "`journalctl -u brigade-renouvellement.service` says more",
    },
  ],
  brut: [
    "",
    "Sur la machine",
    "  ok        les 9 variables obligatoires sont posées, et tout ce que le runtime lit de son environnement est lisible",
    "  note      renewal: failed (last successful run at 03:10) — échec (réseau) : api injoignable",
    "            → `journalctl -u brigade-renouvellement.service` says more",
    "",
    "brigade : project “parade” : ready — nothing is missing to launch a cook",
  ].join("\n"),
})}\n` };

// Le renouvellement a échoué deux passages de suite : le seuil de l'alerte (`FAILURES_FOR_ALERT`).
const VERDICT_RENEWAL_FAILED_TWICE: Answer = { code: 0, sortie: `${JSON.stringify({
  verdict: "pret",
  phrase: "prêt : rien ne manque pour lancer un cook",
  manques: [],
  aSavoir: [
    {
      ou: "machine",
      texte: "renewal: failed, 2 failures in a row (last successful run at 03:10) — échec (réseau) : api injoignable",
      geste: "`journalctl -u brigade-renouvellement.service` says more",
    },
  ],
  brut: [
    "",
    "Sur la machine",
    "  ok        les 9 variables obligatoires sont posées, et tout ce que le runtime lit de son environnement est lisible",
    "  note      renewal: failed, 2 failures in a row (last successful run at 03:10) — échec (réseau) : api injoignable",
    "            → `journalctl -u brigade-renouvellement.service` says more",
    "",
    "brigade : project “parade” : ready — nothing is missing to launch a cook",
  ].join("\n"),
})}\n` };

// Le renouvellement a réussi au dernier passage.
const VERDICT_RENEWAL_OK: Answer = { code: 0, sortie: `${JSON.stringify({
  verdict: "pret",
  phrase: "prêt : rien ne manque pour lancer un cook",
  manques: [],
  aSavoir: [],
  brut: [
    "",
    "Sur la machine",
    "  ok        les 9 variables obligatoires sont posées, et tout ce que le runtime lit de son environnement est lisible",
    "  ok        renewal: last successful run at 04:10",
    "",
    "brigade : project “parade” : ready — nothing is missing to launch a cook",
  ].join("\n"),
})}\n` };


// Une box où le projet est installé — ou seulement ses stations déclarées, l'installation pas finie (`terminee` faux).
// Le test règle ce que la box fournit (`claude`, trouvé ou non) et le verdict de sa vérification.
function boxInstalled({ terminee = true } = {}) {
  const setting = { claude: true, verdict: VERDICT_READY };
  const calls: string[] = [];
  async function launch(_served: unknown, command: string): Promise<Rendered> {
    calls.push(command);
    const { code, sortie: output } =
      command === COMMANDS.etapes ? stepsAnswer(terminee) : command === COMMANDS.stations ? (setting.claude ? STATIONS : STATIONS_WITHOUT_CLAUDE) : command === JUDGMENT ? setting.verdict : { code: 2, sortie: "" };
    const error = code === 0 ? null : Object.assign(new Error(`Command failed: ${command}`), { code, killed: false, cmd: command });
    return { lance: `$ brigade parade ${command}`, erreur: error, sortie: output, erreurs: "" };
  }
  return { reglage: setting, appels: calls, lancer: launch };
}

// L'app branchée comme dans le process principal (main.ts) : chaque installation qui change va à
// la vue, et ce que son contrôle dit va à la bande d'alertes du projet.
function app(box: ReturnType<typeof boxInstalled>) {
  const terminals = openTerminals({ claude: "claude", shell: "/bin/zsh", ouvrirPty: () => assert.fail("aucun terminal ne s'ouvre"), surSortie: () => {}, surEtat: () => {} });
  const bands = holdBands({ etablir: 1, minimum: 0 });
  bands.ouvrir([PARADE.nom]);
  const guides: Guide[] = [];
  let band: Band | undefined;
  const services = holdServices({
    delaiMs: 60_000,
    cuisine: () => KITCHEN,
    lancer: box.lancer,
    session: terminals.session,
    shell: terminals.shell,
    surGuide: (guide) => {
      guides.push(guide);
      band = bands.controle(guide.projet, guide.controle);
    },
  });
  // Un contrôle, comme l'app le relance à son rythme : rend la bande et l'installation telles qu'il les laisse.
  const check = async () => {
    await services.controler(PARADE, true);
    return { bande: band ?? assert.fail("aucune bande n'a été poussée"), guide: guides.at(-1) ?? assert.fail("aucune installation n'a été poussée") };
  };
  return { services, bandes: bands, controler: check };
}

const losses = (band: Band) => band.alertes.filter(({ sujet: subject }) => subject === "station" || subject === "box");
// Une ligne de perte : vérifiée, en panne, et qui porte son geste — un bouton qui l'écrit au second.
function only(band: Band, subject: Alert["sujet"]): Alert {
  const lines = losses(band);
  assert.equal(lines.length, 1, JSON.stringify(band, null, 2));
  const [line] = lines as [Alert];
  assert.equal(line.sujet, subject);
  assert.equal(line.verifie, true);
  for (const said of [line.dit, line.geste, line.prix]) assert.notEqual(said.trim(), "");
  assert.deepEqual(line.appel, { demande: true });
  return line;
}

describe("un projet installé perd une station : une alerte en bande et sur sa case, avec son geste", () => {
  test("la box ne fournit plus la station déclarée : la bande la nomme, avec ce que la box en dit et le geste qui la remet — et l'espace reste le rail", async () => {
    const box = boxInstalled();
    const { controler: check } = app(box);
    box.reglage.claude = false;

    const { bande: band, guide } = await check();

    const line = only(band, "station");
    assert.equal(line.ton, "rouge");
    assert.match(line.dit, /^station “box\/claude” missing: its main station no longer provides it — no cook goes there$/);
    // Ce que la box en écrit, mot pour mot : son moteur, introuvable.
    assert.match(line.releve ?? "", /plus-de-claude` est introuvable dans le `PATH` du service/);
    assert.match(line.geste, /`claude`/);
    // La case du projet dans la barre le dit aussi, avec le nom de la station.
    assert.equal(band.signal?.etat, "alerte");
    assert.match(band.signal?.dit ?? "", /station “box\/claude” missing/);
    // Installé : jamais l'écran d'installation.
    assert.equal(guide.termine, true);
    assert.deepEqual(box.appels, [COMMANDS.etapes, COMMANDS.stations, JUDGMENT]);
  });

  test("la vérification dit le moteur introuvable par le service : la station est perdue, et le geste est celui que la station donne, mot pour mot", async () => {
    const box = boxInstalled();
    const { controler: check } = app(box);
    box.reglage.verdict = VERDICT_WITHOUT_CLAUDE;

    const { bande: band } = await check();

    const line = only(band, "station");
    assert.match(line.dit, /station “box\/claude” missing/);
    assert.equal(line.releve, WITHOUT_CLAUDE.texte);
    assert.equal(line.geste, WITHOUT_CLAUDE.geste);
  });

  test("la vérification plantée (EACCES sur /etc/sudoers.d) : une ligne « problème de brigade, pas de ton projet » avec #654, aucune action pour le chef, jamais « NOT READY »", async () => {
    const box = boxInstalled();
    const { controler: check } = app(box);
    box.reglage.verdict = VERDICT_EACCES;

    const { bande: band } = await check();

    const [line, ...others] = band.alertes.filter(({ sujet: subject }) => subject === "verification");
    assert.deepEqual(others, []);
    assert.match(line?.dit ?? "", /problème de brigade, pas de ton projet/);
    assert.match(line?.dit ?? "", /#654/);
    assert.match(line?.geste ?? "", /^nothing to do/);
    assert.equal(line?.appel, undefined);
    assert.equal(line?.verification?.etat, "plantee");
    assert.deepEqual(line?.verification?.etat === "plantee" ? line.verification.manques : null, []);
    assert.doesNotMatch(JSON.stringify(band), /NOT READY/);
    // Elle s'en va au premier contrôle qui va au bout.
    box.reglage.verdict = VERDICT_READY;
    assert.deepEqual((await check()).bande.alertes.filter(({ sujet: subject }) => subject === "verification"), []);
  });

  test("une alerte issue d'une vérification porte le verdict de l'écran Verify : la même phrase, les mêmes lignes de manque", async () => {
    const box = boxInstalled();
    const { controler: check } = app(box);
    box.reglage.verdict = VERDICT_WITHOUT_CLAUDE;

    const line = only((await check()).bande, "station");

    assert.equal(line.verification?.etat, "pas-pret");
    assert.equal(line.verification?.titre, "pas prêt : 1 chose à faire");
    assert.equal(line.verification?.etat === "pas-pret" ? line.verification.manques[0]?.acteur : null, "chef");
  });

  test("la station revient : l'alerte s'en va de la bande et de la case", async () => {
    const box = boxInstalled();
    const { controler: check } = app(box);
    box.reglage.claude = false;
    assert.equal(losses((await check()).bande).length, 1);

    box.reglage.claude = true;
    const { bande: band } = await check();

    assert.deepEqual(losses(band), []);
    assert.doesNotMatch(band.signal?.dit ?? "", /station/);
  });
});

describe("un projet installé perd un geste de box : une alerte en bande et sur sa case, avec son geste", () => {
  test("le réglage du geste d'installation est faux : la bande nomme ce geste-là", async () => {
    const box = boxInstalled();
    const { controler: check } = app(box);
    box.reglage.verdict = VERDICT_BACKUPS;

    const line = only((await check()).bande, "box");
    assert.match(line.dit, /^station action “install a project” missing: /);
    assert.equal(line.geste, "`sudo install -d /srv/sauvegardes` — docs/installer.md, « Le geste d'installation »");
  });

  test("le geste est reposé : l'alerte s'en va", async () => {
    const box = boxInstalled();
    const { controler: check } = app(box);
    box.reglage.verdict = VERDICT_BACKUPS_STEP;
    assert.equal(losses((await check()).bande).length, 1);

    box.reglage.verdict = VERDICT_BACKUPS_OK;
    assert.deepEqual(losses((await check()).bande), []);
  });
});

// Une cuisine qui tourne, et où tout va bien : ce que la box en rend — `faits` et `status` écrits par le runtime, et
// `manager` tel que l'ancien runtime l'écrivait (runtime/src/manager-cli.ts, supprimé avec lui, #4499).
function healthy(t: TestContext): Reading[] {
  const directory = mkdtempSync(join(tmpdir(), "brigade-app-pertes-saine-"));
  const now = new Date();
  const log = ouvrirJournal(directory, { maintenant: () => now });
  t.after(() => {
    log.fermer();
    rmSync(directory, { recursive: true, force: true });
  });
  const note = (done: Fait, author = "runtime") => void log.ajouter({ project: "parade", ticket: null, author, ...done });
  note({ type: "runtime.started", payload: { pid: 1, host: "box", node: "v26" } });
  note({ type: "manager.enabled", payload: {} }, "chef");
  const state = lireEtat(log, now);
  const saidOnes = [
    `manager               ON since ${now.toISOString()} (by chef) — it judges the open issues, sets \`fire\` and the calibration`,
    "latest decisions      none",
    "set aside             none",
    "epics                 none",
    "reactions             none",
    "held gestures         none",
  ];
  const reading = (command: string, text: string): Reading => ({ projet: "parade", demande: 1, a: now.toISOString(), sorties: [{ commande: command, texte: text }] });
  return [reading("facts", `${JSON.stringify(runtimeFacts(state, now))}\n`), reading("status", `${decrireEtat(state, now).join("\n")}\n`), reading("manager", `${saidOnes.join("\n")}\n`)];
}

describe("un projet installé sans manque", () => {
  test("rien n'est perdu : aucune alerte, ni dans la bande ni sur la case — et l'espace du projet reste le rail", async (t) => {
    const box = boxInstalled();
    const { bandes: bands, controler: check } = app(box);
    const [facts, status, readOne] = healthy(t) as [Reading, Reading, Reading];
    bands.veiller([PARADE.nom]);
    bands.faits(facts);
    bands.status(putAside(status));
    bands.manager(readOne);

    const { bande: band, guide } = await check();

    assert.deepEqual(band.alertes, []);
    assert.equal(band.signal, undefined);
    assert.equal(signalOf(band.alertes), undefined);
    assert.equal(guide.termine, true);
    assert.ok(guide.controle !== undefined, "le contrôle a été lu, et ne dit rien de perdu");
  });

  test("une installation pas finie n'est pas contrôlée : elle a son écran, et aucune alerte de perte", async () => {
    const box = boxInstalled({ terminee: false });
    const { services } = app(box);
    box.reglage.claude = false;

    assert.equal(await services.controler(PARADE, true), undefined);
    // Ses étapes seules sont lues : ni ses stations ni la vérification, rien n'est noté.
    assert.deepEqual(box.appels, [COMMANDS.etapes]);
  });
});

describe("le renouvellement de la session Max échoue plusieurs passages de suite : une alerte en bande, avant l'échéance", () => {
  const renewals = (band: Band) => band.alertes.filter(({ sujet: subject }) => subject === "renouvellement");

  test("un échec : pas d'alerte ; le seuil atteint : l'alerte dit la cause ; un passage réussi : elle s'en va", async () => {
    const box = boxInstalled();
    const { controler: check } = app(box);

    box.reglage.verdict = VERDICT_RENEWAL_FAILED_ONCE;
    assert.deepEqual(renewals((await check()).bande), []);

    box.reglage.verdict = VERDICT_RENEWAL_FAILED_TWICE;
    const { bande: band } = await check();
    const [line, ...others] = renewals(band);
    assert.deepEqual(others, []);
    assert.equal(line?.verifie, true);
    assert.equal(line?.ton, "rouge");
    assert.match(line?.dit ?? "", /Max renewal failing: 2 runs in a row/);
    assert.match(line?.releve ?? "", /api injoignable/);
    assert.match(band.signal?.dit ?? "", /Max renewal failing/);

    box.reglage.verdict = VERDICT_RENEWAL_OK;
    const after = (await check()).bande;
    assert.deepEqual(renewals(after), []);
    assert.doesNotMatch(after.signal?.dit ?? "", /renewal/);
  });
});

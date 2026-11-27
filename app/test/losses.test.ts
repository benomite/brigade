// Ce qu'un projet installé perd — une station, un geste de box — se dit dans sa bande
// d'alertes et sur sa case de la barre, avec son geste, et jamais par l'écran
// d'installation (alerts.ts, « Ce qu'un projet installé a perdu » ; service.ts, `controler`).
//
// La box est simulée, mais ce qu'elle rend de l'installation et de ses stations est écrit par
// les commandes du runtime lui-même (`installation etapes --json`, `installation stations
// --json`), sur un journal où l'installation est terminée. La vérification (`installation`)
// est réglée par le test, dans la forme de runtime/src/installation-cli.ts.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { Sortie } from "../../runtime/src/appel.ts";
import { declarerStations, principal as stations } from "../../runtime/src/declarer-stations.ts";
import { decrireEtat, faits as runtimeFacts, lireEtat } from "../../runtime/src/etat.ts";
import { nommerEtape, principal as steps } from "../../runtime/src/etapes-cli.ts";
import { terminer } from "../../runtime/src/etapes.ts";
import type { Fait } from "../../runtime/src/evenements.ts";
import { jugerRenouvellement } from "../../runtime/src/installation.ts";
import { ouvrirJournal } from "../../runtime/src/journal.ts";
import { principal as manager } from "../../runtime/src/manager-cli.ts";
import { FAILURES_FOR_ALERT, signalOf, holdBands, type Alert, type Band } from "../src/alerts.ts";
import { putAside } from "../src/awaiting.ts";
import type { Kitchen, Reading, Rendered } from "../src/box.ts";
import type { Project } from "../src/config.ts";
import { verdictDesConstats, verdictDeLaPanne } from "../../runtime/src/verdict.ts";
import { COMMANDS, JUDGMENT, holdServices, type Guide } from "../src/service.ts";
import { openTerminals } from "../src/terminals.ts";

const KITCHEN: Kitchen = { locale: { node: process.execPath, runtime: "/tmp/runtime", racine: "/tmp/station", env: {} } };
const PARADE: Project = { nom: "parade", dossier: "/projets/parade" };
const FAKE_CLAUDE = join(import.meta.dirname, "helpers/fake-claude.sh");
const STATION = "box/claude";

// Une sortie d'`installation`, telle que runtime/src/installation-cli.ts l'écrit : ses constats
// sur la machine, chacun avec la flèche de son geste et l'étape qu'il nomme, puis le verdict.
type Finding = { etat: "ok" | "manque" | "note"; texte: string; geste?: string; etape?: string };
const MARKS = { ok: "ok", manque: "MISSING", note: "note" } as const;
function verification(findings: Finding[]): { code: number; sortie: string } {
  const lines = ["", "Sur la machine"];
  for (const { etat: state, texte: text, geste: action, etape: step } of findings) {
    lines.push(`  ${MARKS[state].padEnd(10)}${text}`);
    if (action !== undefined) lines.push(`            → ${action}`);
    if (step !== undefined) lines.push(`            → step to resume: ${nommerEtape(step)} (${step})`);
  }
  const gaps = findings.filter(({ etat: state }) => state === "manque").length;
  lines.push("", gaps === 0 ? "brigade : project “parade” : ready — nothing is missing to launch a cook" : `brigade : project “parade” : ${gaps} missing : no cook must be launched while any is left`);
  return { code: gaps === 0 ? 0 : 1, sortie: lines.join("\n") };
}

const VARIABLES: Finding = { etat: "ok", texte: "les 9 variables obligatoires sont posées, et tout ce que le runtime lit de son environnement est lisible" };
// Le moteur des stations introuvable par le service : la phrase de runtime/src/installation.ts
// (`verifier`, l'unité de service), et son geste, mot pour mot.
const WITHOUT_CLAUDE: Finding = {
  etat: "manque",
  texte: "`claude` est introuvable dans le `PATH` que l'unité brigade@parade.service donnera au runtime (/usr/local/bin:/usr/bin:/bin, le défaut de systemd : aucun `Environment=PATH=` dans ses drop-ins) : aucun cook ne partirait — le `PATH` du shell qui lance cette commande ne compte pas",
  geste: "`sudo ln -sfn /home/brigade/.local/bin/claude /usr/local/bin/claude` — l'installeur natif pose `claude` sous `~/.local/bin` du compte, que systemd ne donne pas à l'unité ; docs/installer.md",
};

// Une box où le projet est installé : son journal, où le runtime a noté toutes les étapes faites
// et la station déclarée — ou seulement la station, l'installation pas finie (`terminee` faux). Le test règle ce que la box fournit (`claude`, trouvé ou non) et ce que
// la vérification dit manquer.
function boxInstalled(t: TestContext, { terminee = true } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "brigade-app-pertes-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const env: Record<string, string> = { BRIGADE_STATE_DIR: directory, BRIGADE_PROJECT: "parade", BRIGADE_CLAUDE_BIN: FAKE_CLAUDE, PATH: "" };
  const log = ouvrirJournal(directory);
  declarerStations(log, { projet: "parade", declaration: `${STATION}:2:code+raisonnement`, auteur: "chef" });
  if (terminee) assert.equal(terminer(log, { projet: "parade", aReprendre: [], auteur: "chef" }).terminee, true);
  log.fermer();

  const setting = { claude: true, constats: [VARIABLES] as Finding[], panne: undefined as string | undefined };
  const calls: string[] = [];
  async function launch(_served: unknown, command: string): Promise<Rendered> {
    calls.push(command);
    const output: string[] = [];
    const tell = (line: string) => void output.push(line);
    let code = 0;
    try {
      const withIt = { env: { ...env, BRIGADE_CLAUDE_BIN: setting.claude ? FAKE_CLAUDE : join(directory, "plus-de-claude") }, dire: tell, redire: () => {} };
      if (command === COMMANDS.etapes) steps({ ...withIt, args: ["--json"] });
      else if (command === COMMANDS.stations) stations({ ...withIt, args: ["--json"] });
      else if (command === JUDGMENT) {
        // `installation --json` : le verdict structuré, sur une ligne — ou la panne, plantée.
        if (setting.panne !== undefined) {
          tell(JSON.stringify(verdictDeLaPanne(new Error(setting.panne))));
          code = 1;
        } else {
          const verified = verification(setting.constats);
          const verdict = verdictDesConstats(setting.constats.map((finding) => ({ ou: "machine" as const, ...finding })), verified.sortie);
          tell(JSON.stringify(verdict));
          code = verified.code;
        }
      } else throw new Sortie(2);
    } catch (error) {
      if (!(error instanceof Sortie)) throw error;
      code = error.code;
    }
    const error = code === 0 ? null : Object.assign(new Error(`Command failed: ${command}`), { code, killed: false, cmd: command });
    return { lance: `$ brigade parade ${command}`, erreur: error, sortie: output.map((line) => `${line}\n`).join(""), erreurs: "" };
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
    setup: terminals.setup,
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
  test("la box ne fournit plus la station déclarée : la bande la nomme, avec ce que la box en dit et le geste qui la remet — et l'espace reste le rail", async (t) => {
    const box = boxInstalled(t);
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

  test("la vérification dit le moteur introuvable par le service : la station est perdue, et le geste est celui que la station donne, mot pour mot", async (t) => {
    const box = boxInstalled(t);
    const { controler: check } = app(box);
    box.reglage.constats = [VARIABLES, WITHOUT_CLAUDE];

    const { bande: band } = await check();

    const line = only(band, "station");
    assert.match(line.dit, /station “box\/claude” missing/);
    assert.equal(line.releve, WITHOUT_CLAUDE.texte);
    assert.equal(line.geste, WITHOUT_CLAUDE.geste);
  });

  test("la vérification plantée (EACCES sur /etc/sudoers.d) : une ligne « problème de brigade, pas de ton projet » avec #654, aucune action pour le chef, jamais « NOT READY »", async (t) => {
    const box = boxInstalled(t);
    const { controler: check } = app(box);
    box.reglage.panne = "EACCES: permission denied, open '/etc/sudoers.d/brigade'";

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
    box.reglage.panne = undefined;
    assert.deepEqual((await check()).bande.alertes.filter(({ sujet: subject }) => subject === "verification"), []);
  });

  test("une alerte issue d'une vérification porte le verdict de l'écran Verify : la même phrase, les mêmes lignes de manque", async (t) => {
    const box = boxInstalled(t);
    const { controler: check } = app(box);
    box.reglage.constats = [VARIABLES, WITHOUT_CLAUDE];

    const line = only((await check()).bande, "station");

    assert.equal(line.verification?.etat, "pas-pret");
    assert.equal(line.verification?.titre, "pas prêt : 1 chose à faire");
    assert.equal(line.verification?.etat === "pas-pret" ? line.verification.manques[0]?.acteur : null, "chef");
  });

  test("la station revient : l'alerte s'en va de la bande et de la case", async (t) => {
    const box = boxInstalled(t);
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
  test("le réglage du geste d'installation est faux : la bande nomme ce geste-là", async (t) => {
    const box = boxInstalled(t);
    const { controler: check } = app(box);
    box.reglage.constats = [
      VARIABLES,
      { etat: "manque", texte: "la racine des sauvegardes (/srv/sauvegardes, déclarée dans /etc/brigade-installer.conf) n'existe pas : le geste refuserait chaque projet", geste: "`sudo install -d /srv/sauvegardes` — docs/installer.md, « Le geste d'installation »" },
    ];

    const line = only((await check()).bande, "box");
    assert.match(line.dit, /^station action “install a project” missing: /);
    assert.equal(line.geste, "`sudo install -d /srv/sauvegardes` — docs/installer.md, « Le geste d'installation »");
  });

  test("le geste est reposé : l'alerte s'en va", async (t) => {
    const box = boxInstalled(t);
    const { controler: check } = app(box);
    box.reglage.constats = [VARIABLES, { etat: "manque", texte: "la racine des sauvegardes (/srv/sauvegardes, déclarée dans /etc/brigade-installer.conf) n'existe pas : le geste refuserait chaque projet", geste: "`sudo install -d /srv/sauvegardes` — docs/installer.md, « Le geste d'installation »", etape: "verification" }];
    assert.equal(losses((await check()).bande).length, 1);

    box.reglage.constats = [VARIABLES, { etat: "ok", texte: "geste d'installation : la racine des sauvegardes /srv/sauvegardes, à root" }];
    assert.deepEqual(losses((await check()).bande), []);
  });
});

// Une cuisine qui tourne, et où tout va bien : ce que la box en rend, écrit par le runtime.
function healthy(t: TestContext): Reading[] {
  const directory = mkdtempSync(join(tmpdir(), "brigade-app-pertes-saine-"));
  const log = ouvrirJournal(directory);
  t.after(() => {
    log.fermer();
    rmSync(directory, { recursive: true, force: true });
  });
  const note = (done: Fait, author = "runtime") => void log.ajouter({ project: "parade", ticket: null, author, ...done });
  note({ type: "runtime.started", payload: { pid: 1, host: "box", node: "v26" } });
  note({ type: "manager.enabled", payload: {} }, "chef");
  const now = new Date();
  const state = lireEtat(log, now);
  const saidOnes: string[] = [];
  void manager({ args: [], env: { BRIGADE_STATE_DIR: directory }, dire: (line) => void saidOnes.push(line), redire: (line) => assert.fail(line) });
  const reading = (command: string, text: string): Reading => ({ projet: "parade", demande: 1, a: now.toISOString(), sorties: [{ commande: command, texte: text }] });
  return [reading("facts", `${JSON.stringify(runtimeFacts(state, now))}\n`), reading("status", `${decrireEtat(state, now).join("\n")}\n`), reading("manager", `${saidOnes.join("\n")}\n`)];
}

describe("un projet installé sans manque", () => {
  test("rien n'est perdu : aucune alerte, ni dans la bande ni sur la case — et l'espace du projet reste le rail", async (t) => {
    const box = boxInstalled(t);
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

  test("une installation pas finie n'est pas contrôlée : elle a son écran, et aucune alerte de perte", async (t) => {
    const box = boxInstalled(t, { terminee: false });
    const { services } = app(box);
    box.reglage.claude = false;

    assert.equal(await services.controler(PARADE, true), undefined);
    // Ses étapes seules sont lues : ni ses stations ni la vérification, rien n'est noté.
    assert.deepEqual(box.appels, [COMMANDS.etapes]);
  });
});

describe("le renouvellement de la session Max échoue plusieurs passages de suite : une alerte en bande, avant l'échéance", () => {
  // La ligne que le runtime écrit lui-même (`jugerRenouvellement`) pour un échec de la sonde.
  const inFailure = (failuresConsecutifs: number): Finding => {
    const judge = jugerRenouvellement({ etat: "echec", raison: "échec (réseau) : api injoignable", dernierReussi: "03:10", echecsConsecutifs: failuresConsecutifs });
    return { etat: judge.etat, texte: judge.texte, ...(judge.geste === undefined ? {} : { geste: judge.geste }) };
  };
  const renewals = (band: Band) => band.alertes.filter(({ sujet: subject }) => subject === "renouvellement");

  test("un échec : pas d'alerte ; le seuil atteint : l'alerte dit la cause ; un passage réussi : elle s'en va", async (t) => {
    const box = boxInstalled(t);
    const { controler: check } = app(box);

    box.reglage.constats = [VARIABLES, inFailure(1)];
    assert.deepEqual(renewals((await check()).bande), []);

    box.reglage.constats = [VARIABLES, inFailure(FAILURES_FOR_ALERT)];
    const { bande: band } = await check();
    const [line, ...others] = renewals(band);
    assert.deepEqual(others, []);
    assert.equal(line?.verifie, true);
    assert.equal(line?.ton, "rouge");
    assert.match(line?.dit ?? "", /Max renewal failing: 2 runs in a row/);
    assert.match(line?.releve ?? "", /api injoignable/);
    assert.match(band.signal?.dit ?? "", /Max renewal failing/);

    box.reglage.constats = [VARIABLES, { etat: "ok", texte: jugerRenouvellement({ etat: "ok", dernierReussi: "04:10", echecsConsecutifs: 0 }).texte }];
    const after = (await check()).bande;
    assert.deepEqual(renewals(after), []);
    assert.doesNotMatch(after.signal?.dit ?? "", /renewal/);
  });
});

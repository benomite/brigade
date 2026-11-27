// L'installation guidée d'un projet : ses étapes lues sur sa box, chacune faite par la
// commande du runtime qui la fait, ce que le chef aura à faire lui-même annoncé d'emblée,
// et la reprise après fermeture. Les commandes `installation etapes`, `stations`,
// `protection` et `decisions` sont celles du runtime, jouées dans ce process sur un vrai
// journal : seuls `installation` — la vérification, qui interroge la machine — et GitHub
// sont simulés. La vérification seule se joue aussi contre un faux `node` écrit par chaque
// test, les terminaux contre de faux pty : ni réseau, ni `claude`. Aucun test
// n'attend une durée — une action rend la main quand elle a fini.
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { Sortie } from "../../runtime/src/appel.ts";
import { decisionsPosees, gesteDe, poserDecision } from "../../runtime/src/decisions.ts";
import { ETAPES, terminer } from "../../runtime/src/etapes.ts";
import { nommerEtape, principal as steps } from "../../runtime/src/etapes-cli.ts";
import { principal as stations } from "../../runtime/src/declarer-stations.ts";
import { etapesAReprendre, type Constat } from "../../runtime/src/installation.ts";
import { ouvrirJournal } from "../../runtime/src/journal.ts";
import { principal as decisions } from "../../runtime/src/poser-decisions.ts";
import { commande as protection, type ClientGitHub } from "../../runtime/src/proteger-branche.ts";
import { verdictDeLaPanne, verdictDesConstats } from "../../runtime/src/verdict.ts";
import { POWER_UP } from "../src/power-up.ts";
import { forTheBar } from "../src/bar.ts";
import { type Kitchen, ACTION, launchThe, type Read, words, type Settings, type Rendered } from "../src/box.ts";
import { EXAMPLE, readConfiguration, type Project } from "../src/config.ts";
import { PALETTE } from "../src/colors.ts";
import { KITCHEN_ACTIONS } from "../src/kitchen.ts";
import { BANNER, holdFacts } from "../src/facts.ts";
import { CONFIRMED, DIRECT } from "../src/actions.ts";
import { EFFORTS, MODELS } from "../src/projects/projects.ts";
import { TABS, HEADINGS } from "../src/tabs.ts";
import { commandOfStartup, COMMANDS, INIT, JUDGMENT, judgmentOf, readCurrent, readSteps, readJudgment, readProtection, readStations, gapsOf, holdServices, VERIFICATION, verdictOf, type Guide } from "../src/service.ts";
import { openTerminals, type Launch, type Terminal } from "../src/terminals.ts";
import { playTheVue, openTab, repos, type Fake } from "./helpers/false-vue.ts";
import { WITHOUT_POSIX } from "./helpers/posix.ts";
import { STOP, YES_STOP } from "../src/vue/stations-tab/stations-tab.js";

const ROOT = join(import.meta.dirname, "../..");
const CALCULUS: Project = { nom: "calculus", dossier: "/projets/calculus" };
const PARADE: Project = { nom: "parade", dossier: "/projets/parade" };

// Ce que `installation` écrit de ses constats, ligne à ligne, dans la forme de
// runtime/src/installation-cli.ts (`ecrire`) — le test « le runtime écrit ses manques dans la
// forme que l'app lit » la compare à son source. C'est aussi la sortie brute que son verdict
// structuré (`installation --json`, runtime/src/verdict.ts) porte, au caractère près.
const TITLES = { machine: "Sur la machine", depot: "Dans le dépôt", github: "Sur GitHub" } as const;
const MARKS = { ok: "ok", manque: "MISSING", note: "note" } as const;
function writtenOne(findings: Constat[], project = "calculus"): string {
  const lines: string[] = [];
  for (const or of ["machine", "depot", "github"] as const) {
    lines.push("", TITLES[or]);
    for (const { etat: state, texte: text, geste: action, etape: step } of findings.filter((finding) => finding.ou === or)) {
      lines.push(`  ${MARKS[state].padEnd(10)}${text}`);
      if (action !== undefined) lines.push(`            → ${action}`);
      if (step !== undefined) lines.push(`            → step to resume: ${nommerEtape(step)} (${step})`);
    }
  }
  const gaps = findings.filter(({ etat: state }) => state === "manque").length;
  lines.push(
    "",
    gaps === 0
      ? `brigade : project “${project}” : ready — nothing is missing to launch a cook`
      : `brigade : project “${project}” : ${gaps} missing : no cook must be launched while any is left — to resume: ${etapesAReprendre(findings).map(nommerEtape).join(", ")}`,
  );
  return `${lines.join("\n")}\n`;
}

// Un projet prêt, avec une ligne `à savoir` ; un projet à qui il manque deux choses — l'une au
// chef, par une commande exacte, l'autre que brigade lève seule.
const READY: Constat[] = [
  { ou: "machine", etat: "ok", texte: "les 9 variables obligatoires sont posées, et tout ce que le runtime lit de son environnement est lisible" },
  { ou: "depot", etat: "ok", texte: "bindings : bloc présent, branche d'intégration `main`" },
  { ou: "github", etat: "note", texte: "la push protection de GitHub n'est pas constatée sur chef/calculus (GitHub en dit : `disabled`)", geste: "docs/installer.md, « Déclarer le projet »" },
];
const INCOMPLETE: Constat[] = [
  {
    ou: "depot",
    etat: "manque",
    texte: "`.claude/brigade/gates.sh` n'est pas exécutable : la pass le lance tel quel",
    geste: "`git update-index --chmod=+x .claude/brigade/gates.sh`, commité sur `main`",
    simple: "les gates du dépôt (`.claude/brigade/gates.sh`) ne sont pas exécutables : brigade ne peut pas les lancer",
    remede: { qui: "chef", commande: "git update-index --chmod=+x .claude/brigade/gates.sh" },
  },
  { ou: "github", etat: "manque", texte: "le cache des labels du dépôt est périmé", geste: "rien à faire : le runtime le relit à son prochain passage", simple: "brigade n'a pas encore relu les étiquettes du dépôt : elle le fait seule à son prochain passage", remede: { qui: "brigade" } },
];
const READY_ONE = writtenOne(READY);
const INCOMPLETE_ONE = writtenOne(INCOMPLETE);
// La vérification qui plante sur /etc/sudoers.d : la panne connue #654.
const EACCES = Object.assign(new Error("EACCES: permission denied, lstat '/etc/sudoers.d/brigade-installer'"), { code: "EACCES" });

// Ce que la vérification rend, en texte (`installation`) et structurée (`installation --json`) —
// l'une et l'autre par les fonctions du runtime qui les écrivent. Une erreur : elle a planté.
function renderedOne(verification: Constat[] | Error, json: boolean): { code: number; sortie: string; erreurs: string } {
  if (verification instanceof Error) {
    return json ? { code: 1, sortie: JSON.stringify(verdictDeLaPanne(verification)), erreurs: "" } : { code: 1, sortie: "", erreurs: `brigade : ${verification.message}` };
  }
  const verdict = verdictDesConstats(verification, writtenOne(verification));
  const code = verdict.verdict === "pret" ? 0 : 1;
  return json ? { code, sortie: JSON.stringify(verdict), erreurs: "" } : { code, sortie: verdict.brut.slice(0, -1), erreurs: "" };
}

// Ce que le faux `node` écrit, tel quel, sur sa sortie standard.
const said = (text: string) => `cat <<'FIN'\n${text}\nFIN`;
const NOTE = `echo "$*" >>"$D/appels"`;

type FakePty = Launch & { ecrits: string[] };

// De faux pty : chaque terminal lancé, et ce qui y a été écrit.
function fakeTerminals() {
  const launched: FakePty[] = [];
  const terminals = openTerminals({
    claude: "claude",
    shell: "/bin/zsh",
    ouvrirPty(launch) {
      const fake: FakePty = { ...launch, ecrits: [] };
      launched.push(fake);
      return { ecrire: (data) => void fake.ecrits.push(data), redimensionner: () => {}, tuer: () => {} };
    },
    surSortie: () => {},
    surEtat: () => {},
  });
  // Ce que les terminaux ont reçu : chaque pty lancé, et ce qui y a été écrit.
  const terminal = () => launched.map(({ commande: command, args, dossier: folder, ecrits: writtenOnes }) => ({ lance: [command, ...args, folder].join(" "), ecrits: writtenOnes }));
  return { terminaux: terminals, terminal };
}

// Un essai de la vérification seule : un faux `node` — un script sh, où `$D` est le répertoire du test —
// que la station de cet ordinateur lance à la place du vrai. `appel` : la ligne qu'il doit recevoir.
function trial(t: TestContext, body: string) {
  const root = mkdtempSync(join(tmpdir(), "brigade-app-service-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const node = join(root, "node");
  writeFileSync(node, `#!/bin/sh\nD='${root}'\n${body}\n`);
  chmodSync(node, 0o755);
  const settings: Settings = { delaiMs: 60_000 };
  const kitchen: Kitchen = { locale: { node, runtime: root, racine: root, env: {} } };
  const readOne = (name: string) => (existsSync(join(root, name)) ? readFileSync(join(root, name), "utf8") : "");
  const call = (suite: string) => `${join(root, ACTION)} ${suite}\n`;
  return { racine: root, reglages: settings, cuisine: kitchen, node, lu: readOne, appel: call };
}

// La station de cet ordinateur, telle que les services la lisent : rien n'y est lancé par ces tests.
const KITCHEN: Kitchen = { locale: { node: "node", runtime: "/runtime", racine: "/station", env: {} } };
const refusal = (rendered: Terminal | { refus: string }): string => ("refus" in rendered ? rendered.refus : "");

// `installation`, lancée par la station de cet ordinateur, comme l'écran la lance — et ce que son rendu prouve.
const check = async (settings: Settings, readOne: Read) => verdictOf(await launchThe(settings, readOne, VERIFICATION), readOne.nom, settings.delaiMs);
// `installation --json`, lancée comme « Vérifier » la lance — et le verdict que l'écran en lit.
const judge = async (settings: Settings, readOne: Read) => judgmentOf(await launchThe(settings, readOne, JUDGMENT), settings.delaiMs);

describe("le contrôle d'un projet installé : `installation`, en texte, lancée une fois par la station de cet ordinateur", () => {
  test("ce qui part est le geste de la station, comme la veille le lance — `installation`, sans terminal ni rien de plus", { skip: WITHOUT_POSIX }, async (t) => {
    const { reglages: settings, cuisine: kitchen, lu: readOne, appel: call } = trial(t, `${NOTE}\n${said(READY_ONE)}`);

    await check(settings, { nom: "calculus", cuisine: kitchen });

    assert.equal(readOne("appels"), call("calculus installation"));
  });

  test("sortie en 0 avec sa ligne de verdict : prêt — et ce qu'elle a écrit est rendu en entier, `à savoir` compris", { skip: WITHOUT_POSIX }, async (t) => {
    const { reglages: settings, cuisine: kitchen, node, appel: call } = trial(t, said(READY_ONE));

    const rendered = await check(settings, { nom: "calculus", cuisine: kitchen });

    assert.equal(rendered.etat, "pret");
    assert.equal("obtenu" in rendered && rendered.obtenu, `$ ${node} ${call("calculus installation").trimEnd()}\n${READY_ONE}\n\n→ exit code 0`);
    assert.ok(!Number.isNaN(Date.parse(rendered.a)));
  });

  test("sortie en 1 : incomplète — chaque point qui manque est rendu avec la flèche de ce qui reste à faire, mot pour mot", { skip: WITHOUT_POSIX }, async (t) => {
    const { reglages: settings, cuisine: kitchen, node, appel: call } = trial(t, `${said(INCOMPLETE_ONE)}\nexit 1`);

    const rendered = await check(settings, { nom: "calculus", cuisine: kitchen });

    assert.equal(rendered.etat, "incomplete");
    const obtained = "obtenu" in rendered ? rendered.obtenu : "";
    assert.equal(obtained, `$ ${node} ${call("calculus installation").trimEnd()}\n${INCOMPLETE_ONE}\n\n→ exit code 1`);
    // Les deux manques, chacun suivi de son geste.
    const lines = obtained.split("\n");
    for (const lack of lines.filter((line) => line.includes("MISSING"))) assert.match(lines[lines.indexOf(lack) + 1] ?? "", /^ +→ /);
    assert.equal(lines.filter((line) => line.includes("MISSING")).length, 2);
  });

  test("sortie en 2 : la commande a été lancée et a refusé son environnement — pas prêt, et ce qu'elle a dit sur sa sortie d'erreur est rendu", { skip: WITHOUT_POSIX }, async (t) => {
    const { reglages: settings, cuisine: kitchen } = trial(t, `echo 'brigade : BRIGADE_MAX_TURNS : « beaucoup » n'"'"'est pas un entier' >&2\nexit 2`);

    const rendered = await check(settings, { nom: "calculus", cuisine: kitchen });

    assert.equal(rendered.etat, "incomplete");
    assert.match("obtenu" in rendered ? rendered.obtenu : "", /BRIGADE_MAX_TURNS : « beaucoup » n'est pas un entier\n\n→ exit code 2$/);
  });

  test("un 0 sans la ligne de verdict n'est pas un « prêt » : une commande forcée qui remplace celle de l'app, un autre projet", { skip: WITHOUT_POSIX }, async (t) => {
    for (const output of ["Bienvenue.", READY_ONE.replace("“calculus”", "“parade”"), INCOMPLETE_ONE, ""]) {
      const { reglages: settings, cuisine: kitchen } = trial(t, said(output));

      const rendered = await check(settings, { nom: "calculus", cuisine: kitchen });

      assert.equal(rendered.etat, "illisible", output);
      assert.ok("obtenu" in rendered && rendered.obtenu.includes(output));
    }
  });

  test("la ligne de verdict attendue est celle que le runtime écrit", () => {
    const cli = readFileSync(join(ROOT, "runtime/src/installation-cli.ts"), "utf8");

    assert.ok(cli.includes("brigade : project “${projet}” : ready"), "`installation` n'écrit plus son verdict sous cette forme");
    assert.ok(READY_ONE.includes("brigade : project “calculus” : ready"));
  });

  const FAILURES: [number, string | null, boolean][] = [
    [65, "projet-inconnu", true],
    [68, "sans-droit", true],
    [69, "commande-manque", true],
    [70, "node-inapte", true],
    [127, null, true],
  ];
  for (const [code, theCase, reached] of FAILURES) {
    test(`sortie en ${code} : aucun verdict — le cas que ce code prouve (${theCase}), et ce que la station a rendu`, { skip: WITHOUT_POSIX }, async (t) => {
      const { reglages: settings, cuisine: kitchen } = trial(t, `echo 'ce que la box en dit' >&2\nexit ${code}`);

      const rendered = await check(settings, { nom: "calculus", cuisine: kitchen });

      assert.equal(rendered.etat, "sans-verdict");
      assert.deepEqual("cas" in rendered && [rendered.cas, rendered.atteinte], [theCase, reached]);
      assert.match("erreur" in rendered ? rendered.erreur : "", new RegExp(`ce que la box en dit\\n\\n→ exit code ${code}$`));
    });
  }

  test("un code qui ne dit aucun cas, sur une station jointe : aucun verdict, et rien n'en est déduit", { skip: WITHOUT_POSIX }, async (t) => {
    const { reglages: settings, cuisine: kitchen } = trial(t, "echo 'brigade : « installation » n'\"'\"'est pas une commande du runtime' >&2\nexit 66");

    const rendered = await check(settings, { nom: "calculus", cuisine: kitchen });

    assert.equal(rendered.etat, "sans-verdict");
    assert.deepEqual("cas" in rendered && [rendered.cas, rendered.atteinte], [null, true]);
  });

  test("un `node` qui ne se lance pas : aucun verdict, et la station n'est pas dite jointe", async (t) => {
    const { reglages: settings, racine: root, cuisine: kitchen } = trial(t, "");

    const rendered = await check(settings, { nom: "calculus", cuisine: { locale: { ...kitchen.locale, node: join(root, "absent") } } });

    assert.equal(rendered.etat, "sans-verdict");
    assert.deepEqual("cas" in rendered && [rendered.cas, rendered.atteinte], [null, false]);
  });
});

// « Vérifier », sur l'écran : `installation --json`, que le faux `node` rend comme le runtime l'écrit.
const judgeOf = (verification: Constat[] | Error) => {
  const { code, sortie: output } = renderedOne(verification, true);
  return `${said(output)}\nexit ${code}`;
};

describe("« Vérifier » : `installation --json`, et le verdict que l'écran en lit", () => {
  test("ce qui part est le geste de la station — `installation --json`, sans terminal ni rien de plus", { skip: WITHOUT_POSIX }, async (t) => {
    const { reglages: settings, cuisine: kitchen, lu: readOne, appel: call } = trial(t, `${NOTE}\n${judgeOf(READY)}`);

    await judge(settings, { nom: "calculus", cuisine: kitchen });

    assert.equal(readOne("appels"), call("calculus installation --json"));
  });

  test("prêt : le verdict en une phrase, aucun manque, la ligne `à savoir` à part — et ce que l'app a obtenu porte la sortie brute, intacte, à la place de son objet", { skip: WITHOUT_POSIX }, async (t) => {
    const { reglages: settings, cuisine: kitchen, node, appel: call } = trial(t, judgeOf(READY));

    const rendered = await judge(settings, { nom: "calculus", cuisine: kitchen });

    assert.ok(rendered.etat === "jugee" && rendered.jugement.verdict === "pret");
    assert.match(rendered.jugement.phrase, /^prêt/);
    assert.deepEqual(rendered.jugement.aSavoir, [{ texte: READY[2]?.texte, geste: READY[2]?.geste }]);
    assert.equal(rendered.jugement.brut, READY_ONE);
    assert.equal(rendered.obtenu, `$ ${node} ${call("calculus installation --json").trimEnd()}\n${READY_ONE}\n→ exit code 0`);
  });

  test("pas prêt : autant de manques que la vérification en constate, chacun en mots simples avec qui le lève — les lignes `à savoir` n'en sont pas", { skip: WITHOUT_POSIX }, async (t) => {
    const { reglages: settings, cuisine: kitchen } = trial(t, judgeOf(FOUR));

    const rendered = await judge(settings, { nom: "calculus", cuisine: kitchen });

    assert.ok(rendered.etat === "jugee" && rendered.jugement.verdict === "pas-pret");
    assert.equal(rendered.jugement.phrase, "pas prêt : 4 choses à faire");
    assert.deepEqual(
      rendered.jugement.manques.map((lack) => [lack.texte, lack.acteur, lack.acteur === "chef" ? (lack.action ?? lack.commande) : null]),
      [
        [WITHOUT_ACTIONS[0]?.simple, "chef", "sudo git -C /opt/brigade pull --ff-only"],
        [WITHOUT_ACTIONS[1]?.simple, "chef", "stations"],
        ["la branche d'intégration `main` n'est pas protégée sur GitHub", "chef", "protection"],
        [INCOMPLETE[1]?.simple, "brigade", null],
      ],
    );
    assert.equal(rendered.jugement.aSavoir.length, 1);
    assert.equal(rendered.jugement.brut, writtenOne(FOUR));
  });

  test("plantée sur /etc/sudoers.d : la vérification n'est pas allée au bout — la panne connue #654, rien n'est constaté du projet, et sa ligne d'erreur est la sortie brute", { skip: WITHOUT_POSIX }, async (t) => {
    const { reglages: settings, cuisine: kitchen } = trial(t, judgeOf(EACCES));

    const rendered = await judge(settings, { nom: "calculus", cuisine: kitchen });

    assert.ok(rendered.etat === "jugee" && rendered.jugement.verdict === "plantee");
    assert.equal(rendered.jugement.panne.connue?.issue, 654);
    assert.match(rendered.jugement.phrase, /problème de brigade, pas de ton projet/);
    assert.equal(rendered.jugement.brut, `brigade : ${EACCES.message}\n`);
    assert.match(rendered.obtenu, /lstat '\/etc\/sudoers\.d\/brigade-installer'\n\n→ exit code 1$/);
  });

  test("un runtime d'avant le verdict, une commande forcée, un verdict que son code dément : rien n'est lu, et ce que la box a rendu est gardé", { skip: WITHOUT_POSIX }, async (t) => {
    const theCase = [
      "echo 'brigade : usage : … installation -- [labels | setup [<cooks>] | uninstall [--confirm]]' >&2\nexit 2",
      said("Bienvenue."),
      said(READY_ONE),
      `${said(renderedOne(FOUR, true).sortie)}\nexit 0`,
      `${said(renderedOne(READY, true).sortie)}\nexit 1`,
    ];
    for (const body of theCase) {
      const { reglages: settings, cuisine: kitchen } = trial(t, body);

      const rendered = await judge(settings, { nom: "calculus", cuisine: kitchen });

      assert.equal(rendered.etat, "illisible", body);
      assert.match("obtenu" in rendered ? rendered.obtenu : "", /\n→ exit code [012]$/);
    }
  });

  test("rien n'est venu d'elle : aucun verdict — la station dont le `node` ne se lance pas", async (t) => {
    const { reglages: settings, racine: root, cuisine: kitchen } = trial(t, "");

    const rendered = await judge(settings, { nom: "calculus", cuisine: { locale: { ...kitchen.locale, node: join(root, "absent") } } });

    assert.ok(rendered.etat === "sans-verdict");
    assert.deepEqual([rendered.cas, rendered.atteinte], [null, false]);
  });

  test("le verdict se lit dans la forme où le runtime l'écrit ; une forme qu'il ne connaît pas n'est pas lue", () => {
    for (const verification of [READY, FOUR, EACCES, new Error("ENOSPC: no space left on device")]) {
      const { sortie: output } = renderedOne(verification, true);
      assert.equal(readJudgment(output)?.verdict, JSON.parse(output).verdict);
    }
    for (const output of ["", "{}", '{"verdict":"pret","phrase":"prêt","brut":""}', '{"verdict":"pret","phrase":"prêt","brut":"","manques":[{"texte":"x"}],"aSavoir":[]}', '{"verdict":"ailleurs","phrase":"","brut":"","manques":[],"aSavoir":[]}']) {
      assert.equal(readJudgment(output), undefined, output);
    }
  });
});

describe("ce que « Démarrer » écrit", () => {
  test("rien : la station de cet ordinateur tourne avec l'app, aucun service n'est à démarrer", () => {
    const installer = readFileSync(join(ROOT, "runtime/src/installateur.ts"), "utf8");
    assert.ok(installer.includes("sudo systemctl enable --now ${unites.runtime}"), "le geste d'installation ne nomme plus ce geste");

    for (const name of ["calculus", "Calculus", "mon projet", "calculus; reboot", "-calculus", "calculus\r"]) {
      assert.match(refusal(commandOfStartup({ ...CALCULUS, nom: name }) as { refus: string }), /^nothing is written: .*there is no service to start/, name);
    }
  });
});

// --- L'installation guidée.

// Ce qu'`installation` écrit quand le code de brigade posé sur la box est trop vieux : un
// manque sur la machine, que l'étape « verification » règle — dans la forme de
// runtime/src/installation-cli.ts, son étape nommée par le runtime lui-même.
const ACTION_A_LEVEL = "`sudo git -C /opt/brigade pull --ff-only` — docs/installer.md, « Mettre brigade à jour »";
const ACTION_TOO_OLD = "le code de brigade posé sur la box (/opt/brigade) est en retard sur celui que le runtime exige — un projet lancé avec lui ferait autre chose que ce que le runtime attend";
const WITHOUT_ACTIONS: Constat[] = [
  {
    ou: "machine",
    etat: "manque",
    texte: ACTION_TOO_OLD,
    geste: ACTION_A_LEVEL,
    etape: "verification",
    simple: "le code de brigade posé sur la box est trop ancien : un projet lancé avec lui échouerait",
    remede: { qui: "chef", commande: "sudo git -C /opt/brigade pull --ff-only" },
  },
  {
    ou: "machine",
    etat: "manque",
    texte: "aucune station déclarée (BRIGADE_STATIONS n'est posée ni au journal du projet) : le runtime démarre, mais aucun cook ne partirait — les tickets resteraient en attente",
    geste: "`brigade calculus installation stations`",
    etape: "stations",
    simple: "aucune station n'est déclarée : aucun cook ne partirait",
    remede: { qui: "chef", action: "stations" },
  },
  { ou: "github", etat: "note", texte: "la push protection de GitHub n'est pas constatée sur chef/calculus", geste: "docs/installer.md, « Déclarer le projet »" },
];
const WITHOUT_ACTION = writtenOne(WITHOUT_ACTIONS);
// Trois manques du chef — une commande, une étape que l'app fait, une étape où se choisir — et un de brigade.
const FOUR: Constat[] = [
  ...WITHOUT_ACTIONS,
  { ou: "github", etat: "manque", texte: "`main` n'est pas protégée sur chef/calculus", geste: "la même commande, suivie de `protection poser`", etape: "protection", simple: "la branche d'intégration `main` n'est pas protégée sur GitHub", remede: { qui: "chef", action: "protection" } },
  ...INCOMPLETE.filter(({ remede: remedy }) => remedy?.qui === "brigade"),
];

// Une box simulée pour un projet : son journal, où le runtime note les étapes et les décisions ;
// GitHub, par un client simulé ; et `installation`, la vérification, que le test règle. Chaque
// commande que l'écran lance par le geste de la box est jouée par la commande du runtime.
function boxSimulated(t: TestContext, setting: { admin?: boolean; calibrage?: boolean; verification?: (box: { stations: boolean; protegee: boolean }) => Constat[] | Error } = {}) {
  const state = mkdtempSync(join(tmpdir(), "brigade-app-guide-"));
  t.after(() => rmSync(state, { recursive: true, force: true }));
  const env = {
    BRIGADE_STATE_DIR: state,
    BRIGADE_PROJECT: "calculus",
    BRIGADE_GITHUB_REPO: "chef/calculus",
    BRIGADE_BASE_BRANCH: "main",
    BRIGADE_CLAUDE_BIN: join(import.meta.dirname, "helpers/fake-claude.sh"),
    PATH: "",
  };
  // Le geste d'installation pose le calibrage du manager et du reviewer (runtime/src/installateur.ts).
  const log = ouvrirJournal(state);
  const calibration = [["BRIGADE_MANAGER_MODEL", "sonnet"], ["BRIGADE_MANAGER_EFFORT", "medium"], ["BRIGADE_REVIEWER_MODEL", "sonnet"], ["BRIGADE_REVIEWER_EFFORT", "medium"]] as const;
  for (const [name, value] of setting.calibrage === false ? calibration.slice(1) : calibration) {
    poserDecision(log, { projet: "calculus", nom: name, valeur: value, auteur: "installeur" });
  }
  log.fermer();

  let guarded = false;
  const github: ClientGitHub = async ({ methode, chemin: path }) => {
    if (path === "repos/chef/calculus" && methode === "GET") return { statut: 200, corps: { private: false, permissions: { admin: setting.admin ?? true }, security_and_analysis: { secret_scanning_push_protection: { status: "enabled" } } }, scopes: ["repo"] };
    if (path === "repos/chef/calculus/branches/main") return { statut: 200, corps: { protected: guarded }, scopes: null };
    if (path === "user") return { statut: 200, corps: { login: "chef" }, scopes: null };
    if (path.endsWith("/protection") && methode === "PUT") return (guarded = true), { statut: 200, corps: {}, scopes: null };
    if (path.endsWith("/protection")) return guarded ? { statut: 200, corps: { required_pull_request_reviews: { required_approving_review_count: 0 }, enforce_admins: { enabled: true } }, scopes: null } : { statut: 404, corps: { message: "Branch not protected" }, scopes: null };
    return { statut: 500, corps: null, scopes: null };
  };
  const stationsDeclared = () => {
    const readOne = ouvrirJournal(state, { lectureSeule: true });
    try {
      return decisionsPosees(readOne.base).BRIGADE_STATIONS !== undefined;
    } finally {
      readOne.fermer();
    }
  };
  // Par défaut, la box a tous ses gestes : ne manque que ce que les étapes posent.
  const verification = () =>
    setting.verification?.({ stations: stationsDeclared(), protegee: guarded }) ??
    (stationsDeclared() && guarded ? READY : INCOMPLETE);

  const calls: string[] = [];
  async function play(args: string[], tell: (line: string) => void, redire: (line: string) => void): Promise<void> {
    const [under, ...remains] = args;
    const call = { args: remains, env, dire: tell, redire };
    // `installation`, en texte ou structurée (`--json`) : ce que la vérification a constaté.
    if (under === undefined || (under === "--json" && remains.length === 0)) {
      const { code, sortie: output, erreurs: errors } = renderedOne(verification(), under === "--json");
      if (output !== "") tell(output);
      if (errors !== "") redire(errors);
      if (code !== 0) throw new Sortie(code);
      return;
    }
    // La dernière étape joue la vérification, puis termine — ou remet à faire (runtime/src/etapes-cli.ts).
    if (under === "etapes" && remains.join(" ") === "demarrage faite") {
      const { code } = renderedOne(verification(), false);
      const opened = ouvrirJournal(state);
      const end = terminer(opened, { projet: "calculus", aReprendre: code === 0 ? [] : ["verification"], auteur: "chef" });
      opened.fermer();
      if (end.terminee) return tell(`brigade : installation terminée : « Vérifier » est vert — les ${ETAPES.length} étapes sont faites, la cuisine est prête à servir`);
      tell("brigade : l'installation n'est pas terminée : « Vérifier » n'est pas vert");
      throw new Sortie(1);
    }
    if (under === "etapes") return steps(call);
    if (under === "stations") return stations(call);
    if (under === "decisions") return decisions(call);
    if (under === "protection") return protection(call, github);
    redire("brigade : usage");
    throw new Sortie(2);
  }
  // Ce que le geste de la box rend d'une commande : ses deux sorties, et son code.
  async function launch(served: { nom: string }, command: string): Promise<Rendered> {
    calls.push(command);
    // Les mots, tels que le shell de la box les donne au geste : un passage entre apostrophes reste entier.
    const [first, ...args] = words(command);
    const output: string[] = [];
    const errors: string[] = [];
    let code = 0;
    try {
      if (first !== "installation" || served.nom !== "calculus") throw new Sortie(65);
      await play(args, (line) => void output.push(line), (line) => void errors.push(line));
    } catch (error) {
      if (!(error instanceof Sortie)) throw error;
      code = error.code;
    }
    const failure = code === 0 ? null : Object.assign(new Error(`Command failed: ${command}`), { code, killed: false, cmd: command });
    return { lance: `$ brigade calculus ${command}`, erreur: failure, sortie: output.map((line) => `${line}\n`).join(""), erreurs: errors.map((line) => `${line}\n`).join("") };
  }
  // Ce que le journal porte, relu par la commande du runtime — pas par l'app.
  const loggedSteps = async () => {
    const said: string[] = [];
    await steps({ args: ["--json"], env, dire: (line) => void said.push(line), redire: () => {} });
    return readSteps(said.join("\n"));
  };
  return { env, appels: calls, lancer: launch, etapesAuJournal: loggedSteps, protegee: () => guarded };
}

// L'app, ouverte sur cette box : ses installations, branchées comme dans le process principal (main.ts).
function app(box: ReturnType<typeof boxSimulated>) {
  const { terminaux: terminals, terminal } = fakeTerminals();
  const pushed: Guide[] = [];
  const services = holdServices({ delaiMs: 60_000, cuisine: () => KITCHEN, lancer: box.lancer, session: terminals.session, shell: terminals.shell, surGuide: (guide) => void pushed.push(guide) });
  return { services, terminal, pousses: pushed };
}

async function guide(services: ReturnType<typeof holdServices>, project: Project = CALCULUS): Promise<Guide> {
  return (await services.guide(project)) ?? assert.fail("ce projet n'a pas d'installation");
}
const states = (readOne: Guide) => Object.fromEntries(readOne.etapes.map(({ id, etat: state }) => [id, state]));

describe("l'installation guidée : toutes les étapes, d'emblée", () => {
  test("ouvert sur un projet à installer, l'écran montre chaque étape avec son état, à quoi elle sert et ce qui se passe si on la saute — avant toute action, rien n'est écrit", async (t) => {
    const box = boxSimulated(t);
    const { services, terminal } = app(box);

    const readOne = await guide(services);

    assert.deepEqual(
      readOne.etapes.map(({ rang: rank, id, titre: title, etat: state, sert: serves, sauter, geste: action }) => ({ rang: rank, id, titre: title, etat: state, sert: serves, sauter, geste: action })),
      ETAPES.map(({ id, titre: title, sert: serves, sauter, geste: action }, rank) => ({ rang: rank + 1, id, titre: title, etat: "todo", sert: serves, sauter, geste: action })),
    );
    assert.equal(readOne.courante, "ajout");
    assert.match(readOne.titre, /^Installation — 0 of 7 steps done · now: 1\. Ajouter le projet sur la box$/);
    // Replié : un projet qui n'a rien entamé ne lance rien d'autre que la lecture de ses étapes.
    assert.equal(readOne.deplie, false);
    assert.deepEqual(box.appels, [COMMANDS.etapes]);
    assert.deepEqual(terminal(), []);
  });

  test("un projet ajouté par l'écran : l'ajout est noté fait — la box a répondu pour lui —, et la vérification part d'elle-même", async (t) => {
    const box = boxSimulated(t);
    const { services } = app(box);
    services.suivre(CALCULUS);

    const readOne = await guide(services);

    assert.equal(readOne.deplie, true);
    assert.deepEqual(box.appels.slice(0, 4), [COMMANDS.etapes, "installation etapes ajout faite", COMMANDS.etapes, JUDGMENT]);
    assert.deepEqual(states(readOne), { ajout: "done", init: "todo", verification: "done", stations: "todo", protection: "todo", decisions: "todo", demarrage: "todo" });
    assert.equal(readOne.courante, "init");
    assert.equal(readOne.etapes.find(({ courante: current }) => current)?.id, "init");
    assert.equal((await box.etapesAuJournal())?.courante, "init");
  });

  test("sur une box sans geste à jour, la commande unique et sa raison sont dites d'emblée, sans qu'aucun bouton ait été pressé — et la vérification attend le chef", async (t) => {
    const box = boxSimulated(t, { verification: () => WITHOUT_ACTIONS });
    const { services } = app(box);
    services.suivre(CALCULUS);

    const readOne = await guide(services);

    assert.equal(readOne.annonces.etat, "lues");
    const action = readOne.annonces.liste.find(({ texte: text }) => text === ACTION_TOO_OLD);
    assert.deepEqual(action, { titre: "On the station, by someone with `sudo` there", texte: ACTION_TOO_OLD, geste: ACTION_A_LEVEL });
    // Le manque des stations n'est pas un geste de box : il a son étape, et son bouton.
    assert.ok(!readOne.annonces.liste.some(({ texte: text }) => text.startsWith("aucune station déclarée")));
    assert.equal(states(readOne).verification, "waiting");
    assert.deepEqual(readOne.etapes.find(({ id }) => id === "verification")?.manques, [{ texte: ACTION_TOO_OLD, geste: ACTION_A_LEVEL, etape: "verification" }]);
    assert.equal(readOne.etapes.find(({ id }) => id === "stations")?.manques.length, 1);
    // Ce que le chef aura à faire lui-même est aussi dit d'avance : la session d'init, et le geste `sudo` que la station demande.
    assert.deepEqual(
      readOne.annonces.liste.map(({ titre: title, geste: command }) => [title, command]),
      [
        ["2. Amorcer le dépôt", null],
        ["On the station, by someone with `sudo` there", ACTION_A_LEVEL],
      ],
    );
  });

  test("la vérification d'ouverture ne part qu'une fois : rouvrir l'espace relit les étapes, sans la relancer", async (t) => {
    const box = boxSimulated(t);
    const { services } = app(box);
    services.suivre(CALCULUS);
    await guide(services);
    const before = box.appels.filter((command) => command === JUDGMENT).length;

    await guide(services);

    assert.equal(box.appels.filter((command) => command === JUDGMENT).length, before);
  });
});

describe("chaque geste est un bouton ou une réponse", () => {
  test("init : la session `/brigade:init` s'ouvre dans le second ; « mergé » est noté par la box, et l'étape suivante devient la courante", async (t) => {
    const box = boxSimulated(t);
    const { services, terminal } = app(box);
    services.suivre(CALCULUS);
    await guide(services);

    const second = services.amorcer(CALCULUS);
    assert.ok(!("refus" in second) && second.genre === "second");
    assert.deepEqual(terminal(), [{ lance: `claude ${INIT} /projets/calculus`, ecrits: [] }]);

    assert.equal(await services.direMerge(CALCULUS, true), undefined);
    const readOne = await guide(services);

    assert.ok(box.appels.includes("installation etapes init faite"));
    assert.equal(states(readOne).init, "done");
    assert.equal(readOne.courante, "stations");
    assert.match(readOne.fait?.titre ?? "", /merge of `\/brigade:init` is recorded/);
  });

  test("stations : celles que la box fournit sont proposées, sans plafond ; déclarées au plafond choisi, l'étape est faite", async (t) => {
    const box = boxSimulated(t);
    const { services } = app(box);
    services.suivre(CALCULUS);
    await guide(services);
    await services.direMerge(CALCULUS, true);

    const before = await guide(services);
    const detail = before.etapes.find(({ id }) => id === "stations")?.detail;
    assert.ok(detail?.etat === "lu" && detail.id === "stations");
    assert.deepEqual(detail.lu, { proposees: [{ nom: "box/claude", moteur: "claude", fournit: ["code", "raisonnement"] }], absent: null, declarees: [] });

    // Un plafond qui manque : rien ne part.
    const calls = box.appels.length;
    assert.match((await services.declarerStations(CALCULUS, [{ nom: "box/claude", cooks: 0 }]))?.refus ?? "", /has no default/);
    assert.match((await services.declarerStations(CALCULUS, []))?.refus ?? "", /at least one station/);
    assert.match((await services.declarerStations(CALCULUS, [{ nom: "box/claude; reboot", cooks: 2 }]))?.refus ?? "", /not a station its main station provides/);
    assert.equal(box.appels.length, calls);

    assert.equal(await services.declarerStations(CALCULUS, [{ nom: "box/claude", cooks: 2 }]), undefined);
    const after = await guide(services);

    assert.ok(box.appels.includes("installation stations box/claude:2:code+raisonnement"));
    assert.equal(states(after).stations, "done");
    assert.equal(after.courante, "protection");
  });

  test("protection : la branche est protégée par un bouton ; sans les droits, ce qui manque est dit avec l'action qui le donne, et l'étape attend le chef", async (t) => {
    const box = boxSimulated(t, { admin: false });
    const { services } = app(box);
    services.suivre(CALCULUS);
    await guide(services);
    await services.direMerge(CALCULUS, true);
    await services.declarerStations(CALCULUS, [{ nom: "box/claude", cooks: 1 }]);

    const before = await guide(services);
    const detail = before.etapes.find(({ id }) => id === "protection")?.detail;
    assert.ok(detail?.etat === "lu" && detail.id === "protection");
    assert.equal(detail.lu.protection, "absente");
    assert.match(detail.lu.droits[0]?.action ?? "", /donner le rôle Admin sur chef\/calculus à `chef`/);

    await services.proteger(CALCULUS);
    const blocked = await guide(services);

    assert.equal(states(blocked).protection, "waiting");
    assert.equal(blocked.fait?.ok, false);
    assert.equal(box.protegee(), false);
  });

  test("décisions : une à la fois, sa question et ses options ; celles que le démarrage ne réclame pas se posent ou se passent", async (t) => {
    const box = boxSimulated(t);
    const { services } = app(box);
    services.suivre(CALCULUS);
    await guide(services);
    await services.direMerge(CALCULUS, true);
    await services.declarerStations(CALCULUS, [{ nom: "box/claude", cooks: 1 }]);
    await services.proteger(CALCULUS);

    const before = await guide(services);
    assert.equal(before.courante, "decisions");
    const detail = before.etapes.find(({ id }) => id === "decisions")?.detail;
    assert.ok(detail?.etat === "lu" && detail.id === "decisions");
    // Le calibrage est posé par l'ajout : la première qui reste ne retient pas le démarrage.
    assert.equal(detail.lu.courante?.nom, gesteDe("BRIGADE_DRIFT_TICKET_TOKENS"));
    assert.equal(detail.passable, true);
    assert.match(detail.lu.courante?.question ?? "", /tokens/);

    assert.match((await services.repondre(CALCULUS, ["500000; reboot"]))?.refus ?? "", /not a value the station reads/);
    assert.equal(await services.repondre(CALCULUS, ["500000"]), undefined);
    // Le démarrage ne réclamait rien : la box note l'étape faite dès la première réponse. Celles
    // qui restent se présentent encore, une à une, jusqu'à la fin de l'installation.
    const answered = await guide(services);
    assert.equal(states(answered).decisions, "done");
    assert.equal(answered.courante, "demarrage");
    const next = answered.etapes.find(({ id }) => id === "decisions")?.detail;
    assert.ok(next?.etat === "lu" && next.id === "decisions");
    assert.equal(next.lu.courante?.nom, gesteDe("BRIGADE_DRIFT_LOST_TOKENS"));
    assert.equal(next.passable, false);
    assert.match((await services.passerDecisions(CALCULUS))?.refus ?? "", /not the current one/);
    assert.equal(await services.repondre(CALCULUS, ["2000000"]), undefined);
    assert.ok(box.appels.includes("installation decisions courante 2000000"));
  });

  test("les décisions qui ne retiennent pas le démarrage se passent : l'étape est notée faite, sans réponse", async (t) => {
    const box = boxSimulated(t);
    const { services } = app(box);
    services.suivre(CALCULUS);
    await guide(services);
    for (const step of ["init", "stations", "protection"]) await box.lancer({ nom: "calculus" }, `installation etapes ${step} faite`);
    assert.equal((await guide(services)).courante, "decisions");

    assert.equal(await services.passerDecisions(CALCULUS), undefined);

    assert.ok(box.appels.includes("installation etapes decisions faite"));
    assert.equal(states(await guide(services)).decisions, "done");
  });

  test("une décision que le démarrage réclame ne se passe pas : elle se répond", async (t) => {
    // Un projet ajouté avant que l'ajout pose le calibrage : le modèle du manager n'en a pas.
    const box = boxSimulated(t, { calibrage: false });
    const { services } = app(box);
    services.suivre(CALCULUS);
    await guide(services);
    for (const step of ["init", "stations", "protection"]) await box.lancer({ nom: "calculus" }, `installation etapes ${step} faite`);

    const readOne = await guide(services);
    const detail = readOne.etapes.find(({ id }) => id === "decisions")?.detail;
    assert.ok(detail?.etat === "lu" && detail.id === "decisions");
    assert.deepEqual([detail.lu.courante?.nom, detail.lu.courante?.reclamee, detail.passable], [gesteDe("BRIGADE_MANAGER_MODEL"), true, false]);
    assert.match((await services.passerDecisions(CALCULUS))?.refus ?? "", /start still requires a decision/);

    assert.equal(await services.repondre(CALCULUS, ["sonnet"]), undefined);
    assert.equal(states(await guide(services)).decisions, "done");
  });

  test("une seule action à la fois : la seconde est refusée, et rien ne part pour elle", async (t) => {
    const box = boxSimulated(t);
    const { services } = app(box);
    services.suivre(CALCULUS);
    await guide(services);

    const first = services.direMerge(CALCULUS, true);
    const second = await services.proteger(CALCULUS);
    await first;

    assert.match(second?.refus ?? "", /Another installation action is running/);
    assert.ok(!box.appels.includes("installation protection poser"));
  });
});

describe("de « Ajouter le projet » à « installation terminée »", () => {
  test("bout en bout par des boutons et des réponses : rien n'est à coller dans un terminal, et « Démarrer » n'écrit rien — la station de cet ordinateur tourne avec l'app", async (t) => {
    const box = boxSimulated(t);
    const { services, terminal } = app(box);
    // L'écran d'ajout vient d'installer le projet sur sa station.
    services.suivre(CALCULUS);
    const opened = await guide(services);
    assert.ok(!opened.annonces.liste.some(({ titre: title }) => title === "7. Démarrer la cuisine"));

    services.amorcer(CALCULUS);
    await services.direMerge(CALCULUS, true);
    await services.declarerStations(CALCULUS, [{ nom: "box/claude", cooks: 2 }]);
    await services.proteger(CALCULUS);
    while ((await guide(services)).courante === "decisions") {
      const detail = (await guide(services)).etapes.find(({ id }) => id === "decisions")?.detail;
      assert.ok(detail?.etat === "lu" && detail.id === "decisions");
      assert.equal(await services.passerDecisions(CALCULUS), undefined);
    }
    const readOne = await guide(services);
    assert.equal(readOne.courante, "demarrage");
    assert.match(refusal(readOne.demarrage as { refus: string }), /^nothing is written: .*there is no service to start/);

    assert.match(refusal(await services.demarrer(CALCULUS)), /^nothing is written: .*there is no service to start/);
    // Ce que l'app a mis dans un terminal : la session d'init, et rien d'autre.
    assert.deepEqual(terminal(), [{ lance: `claude ${INIT} /projets/calculus`, ecrits: [] }]);
    // Chaque commande partie vers la station est une commande du runtime, sous `installation`.
    assert.ok(box.appels.every((command) => command === "installation" || command.startsWith("installation ")), box.appels.join("\n"));
  });
});

describe("fermer l'app, la rouvrir : l'installation reprend où elle en était", () => {
  test("une app neuve sur un projet à mi-installation montre les mêmes étapes faites, met en avant la courante, et s'ouvre d'elle-même", async (t) => {
    const box = boxSimulated(t);
    const before = app(box);
    before.services.suivre(CALCULUS);
    await guide(before.services);
    await before.services.direMerge(CALCULUS, true);
    await before.services.declarerStations(CALCULUS, [{ nom: "box/claude", cooks: 2 }]);
    const left = await guide(before.services);

    // L'app est fermée : rien de ce qu'elle tenait ne reste. Une autre s'ouvre, sur la même box.
    const after = app(box);
    const resumption = await guide(after.services);

    assert.deepEqual(states(resumption), states(left));
    assert.deepEqual(states(resumption), { ajout: "done", init: "done", verification: "done", stations: "done", protection: "todo", decisions: "todo", demarrage: "todo" });
    assert.equal(resumption.courante, "protection");
    assert.deepEqual(resumption.etapes.filter(({ courante: current }) => current).map(({ id }) => id), ["protection"]);
    assert.equal(resumption.deplie, true);
    assert.match(resumption.titre, /4 of 7 steps done · now: 5\. Protéger la branche d'intégration$/);
    const detail = resumption.etapes.find(({ id }) => id === "protection")?.detail;
    assert.ok(detail?.etat === "lu" && detail.id === "protection");
  });
});

describe("ce que la box ne rend pas", () => {
  test("une box pas jointe : aucune étape n'est inventée, ce que l'app a obtenu est montré avec son cas", async (t) => {
    const { services } = (() => {
      const { terminaux: terminals } = fakeTerminals();
      const launch = async (): Promise<Rendered> => ({ lance: "$ node", erreur: Object.assign(new Error("spawn node ENOENT"), { code: "ENOENT", killed: false, cmd: "node" }), sortie: "", erreurs: "spawn node ENOENT\n" });
      return { services: holdServices({ delaiMs: 60_000, cuisine: () => KITCHEN, lancer: launch, session: terminals.session, shell: terminals.shell, surGuide: () => {} }) };
    })();

    const readOne = await guide(services);

    assert.deepEqual(readOne.etapes, []);
    assert.ok(readOne.lecture.etat === "echec");
    assert.equal(readOne.lecture.titre, "NOT REACHED");
    assert.equal(readOne.titre, "Installation — the station did not return its steps");
  });

  test("un runtime d'avant les étapes : ce qu'il a rendu est montré, et ce qui l'explique", async (t) => {
    const { terminaux: terminals } = fakeTerminals();
    const launch = async (): Promise<Rendered> => ({ lance: "$ node", erreur: Object.assign(new Error("usage"), { code: 2, killed: false, cmd: "node" }), sortie: "", erreurs: "brigade : usage : … installation -- [labels | setup [<cooks>] | desinstaller [--confirmer]]\n" });
    const services = holdServices({ delaiMs: 60_000, cuisine: () => KITCHEN, lancer: launch, session: terminals.session, shell: terminals.shell, surGuide: () => {} });

    const readOne = await guide(services);

    assert.ok(readOne.lecture.etat === "illisible");
    assert.match(readOne.lecture.obtenu, /desinstaller \[--confirmer\]\]\n\n→ exit code 2$/);
    assert.match(readOne.lecture.lignes.join("\n"), /predates this step/);
  });

  test("un projet dont la station de cet ordinateur ne se lit pas n'a pas d'installation : rien à lire, rien à faire", async (t) => {
    const box = boxSimulated(t);
    const { terminaux: terminals, terminal } = fakeTerminals();
    const services = holdServices({ delaiMs: 60_000, cuisine: () => undefined, lancer: box.lancer, session: terminals.session, shell: terminals.shell, surGuide: () => {} });

    assert.equal(await services.guide(CALCULUS), undefined);
    assert.match((await services.direMerge(CALCULUS, true))?.refus ?? "", /does not say where its station is/);
    assert.match((await services.verifier(CALCULUS))?.refus ?? "", /does not say where its station is/);
    assert.match(refusal(services.amorcer(CALCULUS)), /does not say where its station is/);
    assert.deepEqual(box.appels, []);
    assert.deepEqual(terminal(), []);
  });

  test("un projet dont le dossier n'est pas là n'a pas de terminal : ni session, ni shell — sa station, elle, s'installe", async (t) => {
    const box = boxSimulated(t);
    const { services, terminal } = app(box);
    const refuses: Project = { ...CALCULUS, refus: "dossier introuvable : /projets/calculus" };

    assert.equal(refusal(services.amorcer(refuses)), "“calculus” does not open: dossier introuvable : /projets/calculus");
    assert.equal(await services.direMerge(refuses, true), undefined);
    assert.equal(states(await guide(services, refuses)).init, "done");
    assert.deepEqual(terminal(), []);
  });

  test("chaque projet a son installation, et un projet oublié repart de ce que dit la station", async (t) => {
    const box = boxSimulated(t);
    const { services } = app(box);
    services.suivre(CALCULUS);
    await guide(services);

    assert.equal((await guide(services, PARADE)).lecture.etat, "echec");
    services.oublier("calculus");
    assert.equal((await guide(services)).deplie, true);
  });
});

describe("ce que l'app lit du runtime : ses formes, telles qu'il les écrit", () => {
  test("un manque se lit avec sa flèche et l'étape qu'il nomme ; une flèche sous `à savoir` ne retient rien", () => {
    assert.deepEqual(gapsOf(WITHOUT_ACTION), [
      { texte: ACTION_TOO_OLD, geste: ACTION_A_LEVEL, etape: "verification" },
      { texte: "aucune station déclarée (BRIGADE_STATIONS n'est posée ni au journal du projet) : le runtime démarre, mais aucun cook ne partirait — les tickets resteraient en attente", geste: "`brigade calculus installation stations`", etape: "stations" },
    ]);
    assert.deepEqual(gapsOf(READY_ONE), []);
    assert.equal(gapsOf(INCOMPLETE_ONE).length, 2);
  });

  test("le runtime écrit ses manques dans la forme que l'app lit", () => {
    const cli = readFileSync(join(ROOT, "runtime/src/installation-cli.ts"), "utf8");
    assert.ok(cli.includes("console.log(`  ${MARQUES[constat.etat].padEnd(10)}${constat.texte}`);"));
    assert.ok(cli.includes("console.log(`            → ${constat.geste}`);"));
    assert.ok(cli.includes("console.log(`            → step to resume: ${nommerEtape(constat.etape)} (${constat.etape})`);"));
  });

  test("une forme que l'app ne connaît pas n'est pas lue : rien n'en est déduit", () => {
    for (const read of [readSteps, readStations, readProtection, readCurrent]) {
      for (const output of ["", "Bienvenue.", "{}", '{"etapes":"non","courante":null}', "[1,2]"]) assert.equal(read(output), undefined, output);
    }
    assert.equal(readSteps('{"courante":"ailleurs","etapes":[]}'), undefined);
  });
});

describe("l'écran, tel que la vue le pose", () => {
  // L'espace de « calculus », ouvert par sa case de la barre, sur l'installation que l'app tient de sa box.
  async function openTheScreen(readOne: Guide) {
    const vue = await playTheVue({
      demarrage: () => ({
        configuration: forTheBar({ chemin: "/tmp/app.json", projets: [CALCULUS] }, () => true),
        palette: PALETTE,
        exemple: EXAMPLE,
        onglets: TABS,
        rubriques: HEADINGS,
        gestes: { allumage: POWER_UP, cuisine: KITCHEN_ACTIONS, directs: DIRECT, confirmes: CONFIRMED },
        banniere: BANNER,
        calibrage: { modeles: MODELS, efforts: EFFORTS },
        code: undefined,
      }),
      espace: () => [],
      service: () => readOne,
    });
    vue.element("projets").children[1]?.click();
    await repos();
    return vue;
  }
  // L'installation guidée et sa vérification ne sont plus posées dans la vue (#1700) : ni leurs éléments,
  // ni étapes numérotées, ni « Verify » — le guide n'y sert plus qu'à retenir les stations déclarées.
  const OF_THE_INSTALLATION = ["service", "service-titre", "service-tete", "service-etapes", "verification-etat", "gestes-projet"];
  function withoutScreenOfInstallation(vue: Awaited<ReturnType<typeof openTheScreen>>) {
    const poses = vue.poses();
    assert.deepEqual(poses.filter(({ id }) => OF_THE_INSTALLATION.includes(id)).map(({ id }) => id), []);
    assert.equal(poses.filter(({ className }) => className === "verification").length, 0);
    const buttons = poses.filter(({ balise }) => balise === "button").map(({ textContent }) => textContent);
    assert.ok(!buttons.some((text) => /^Verify|check the installation|Declare the stations|Initialize the project in the second/.test(text)), buttons.join(" | "));
    assert.ok(!poses.some(({ textContent }) => ETAPES.some(({ titre: title }, rank) => textContent.startsWith(`${rank + 1}. ${title}`))));
  }

  test("en cours : l'écran d'installation n'est pas posé — ni étapes numérotées, ni « Verify » : le clic sur le projet ouvre le rail", async (t) => {
    const box = boxSimulated(t, { verification: () => WITHOUT_ACTIONS });
    const { services } = app(box);
    services.suivre(CALCULUS);
    const readOne = await guide(services);
    assert.equal(readOne.termine, false);

    const vue = await openTheScreen(readOne);

    // #699 : même en cours, l'installation ne redirige pas — le clic sur un projet ouvre le rail, pas Paramètres.
    assert.equal(vue.element("etat").hidden, true);
    withoutScreenOfInstallation(vue);
  });

  test("terminée : l'écran d'installation n'est pas posé — ni étapes numérotées, ni « Verify » : l'espace est le rail", async (t) => {
    const box = boxSimulated(t, { verification: () => READY });
    const { services } = app(box);
    await guide(services);
    for (const step of ["init", "stations", "protection", "decisions"]) await box.lancer({ nom: "calculus" }, `installation etapes ${step} faite`);
    await box.lancer({ nom: "calculus" }, "installation etapes demarrage faite");
    const readOne = await guide(services);
    assert.equal(readOne.termine, true);

    const vue = await openTheScreen(readOne);

    withoutScreenOfInstallation(vue);
  });
});

describe("un projet installé n'affiche jamais l'écran d'installation", () => {
  const finished = JSON.stringify({ courante: null, etapes: ETAPES.map(({ id, titre: title, sert: serves, sauter, geste: action }) => ({ id, titre: title, etat: "done", sert: serves, sauter, geste: action })) });
  // Une box qui dit l'installation terminée, puis — si on le lui demande — ne répond plus.
  function boxInstalled() {
    const { terminaux: terminals } = fakeTerminals();
    const state = { muette: false };
    const launch = async (_served: unknown, command: string): Promise<Rendered> => {
      if (state.muette) return { lance: "$ node", erreur: Object.assign(new Error("spawn node ENOENT"), { code: "ENOENT", killed: false, cmd: "node" }), sortie: "", erreurs: "spawn node ENOENT\n" };
      return { lance: `$ node ${command}`, erreur: null, sortie: command === COMMANDS.etapes ? `${finished}\n` : "", erreurs: "" };
    };
    const services = holdServices({ delaiMs: 60_000, cuisine: () => KITCHEN, lancer: launch, session: terminals.session, shell: terminals.shell, surGuide: () => {} });
    return { services, etat: state };
  }

  test("installation terminée : le guide dit qu'il n'y a rien à montrer", async () => {
    const { services } = boxInstalled();
    assert.equal((await guide(services)).termine, true);
  });

  test("installée, puis la box ne répond plus : on ne retombe pas sur l'écran d'installation", async () => {
    const { services, etat: state } = boxInstalled();
    assert.equal((await guide(services)).termine, true);
    state.muette = true;
    const readOne = await guide(services);
    assert.ok(readOne.lecture.etat === "echec");
    assert.equal(readOne.termine, true);
  });

  test("installation pas terminée : l'écran s'affiche comme avant, même si la box cesse de répondre ensuite", async (t) => {
    const box = boxSimulated(t);
    const { services } = app(box);
    assert.equal((await guide(services)).termine, false);
  });
});

// L'onglet Stations (#1510, épique #1506 ; #2488) : une station déclarée se règle dans son bloc de réglages — son plafond, ses capacités
// — ou se retire (« serves this project »), après confirmation. Tout est vrai sauf la box : la vue telle qu'elle est, l'installation
// de l'app (service.ts), les commandes `installation stations` du runtime sur un vrai journal, et le fichier des
// projets écrit par l'opération du runtime (`une-station.ts`), relu par l'app comme main.ts le relit.
describe("l'onglet Stations : une station déclarée, changée seule", () => {
  const DEFAULTS = {
    cooks: 4,
    cooksDit: "from this computer's 10 cores",
    espaceDeTravail: "/tmp/worktrees",
    capacites: [
      { capacite: "docker", nom: "Docker", detectee: true },
      { capacite: "navigateur-headless", nom: "a browser", detectee: true },
    ],
  };
  const FACTS = {
    etat: "ouverte",
    lu: "2026-10-23T10:04:11.000Z",
    dernierTick: "2026-10-23T10:04:02.000Z",
    compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 },
    dernierEvenement: null,
    rail: [],
    cooks: [],
    attend: [],
  };

  // Le projet installé, ses stations déclarées sur la box ; le fichier des projets de ce poste ; l'app et sa vue.
  async function kitchen(t: TestContext, declaration: string) {
    const box = boxSimulated(t, { verification: () => READY });
    for (const step of ["init", "stations", "protection", "decisions", "demarrage"]) await box.lancer({ nom: "calculus" }, `installation etapes ${step} faite`);
    await box.lancer({ nom: "calculus" }, `installation stations ${declaration}`);
    const folder = mkdtempSync(join(tmpdir(), "brigade-app-station-editee-"));
    t.after(() => rmSync(folder, { recursive: true, force: true }));
    const file = join(folder, "app.json");
    writeFileSync(file, `${JSON.stringify({ projets: [{ nom: "calculus", dossier: folder }] }, null, 2)}\n`);
    const project = () => readConfiguration(file).projets[0] ?? assert.fail(`${file} ne se lit plus`);
    let vue: Awaited<ReturnType<typeof playTheVue>> | undefined;
    const services = holdServices({
      delaiMs: 60_000,
      cuisine: () => KITCHEN,
      lancer: box.lancer,
      session: fakeTerminals().terminaux.session,
      shell: fakeTerminals().terminaux.shell,
      surGuide: (guide) => vue?.dire("surGuide", guide),
    });
    await services.guide(project());
    await services.controler(project(), true);
    const configuration = () => forTheBar(readConfiguration(file), () => true, () => true);
    const sends: Promise<unknown>[] = [];
    vue = await playTheVue({
      demarrage: () => ({
        configuration: configuration(),
        palette: PALETTE,
        exemple: EXAMPLE,
        onglets: TABS,
        rubriques: HEADINGS,
        gestes: { allumage: POWER_UP, cuisine: KITCHEN_ACTIONS, directs: DIRECT, confirmes: CONFIRMED },
        banniere: BANNER,
        calibrage: { modeles: MODELS, efforts: EFFORTS },
        code: undefined,
      }),
      espace: () => [],
      service: () => services.guide(project()),
      defautsDeStation: () => DEFAULTS,
      changerUneStation: (_, station, wanted) => {
        const sending = services.changerUneStation(project(), station, wanted).then((rendered) => {
          // Le fichier des projets a changé : l'app le relit et le redit à la vue (main.ts, `suivreConfiguration`).
          vue?.dire("surConfiguration", configuration(), []);
          return rendered;
        });
        sends.push(sending);
        return sending;
      },
    });
    (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
    await repos();
    const receivedOne = holdFacts().recevoir({ projet: "calculus", demande: 0, a: "2026-10-23T10:04:12.000Z", sorties: [{ commande: "facts", texte: JSON.stringify(FACTS) }] });
    vue.dire("surFaits", { ...receivedOne, demande: vue.dernier("faits")[0] as number });
    await openTab(vue, "Stations");
    const played = vue;
    // Ce qui est parti vers la box a répondu, et la vue s'est reposée.
    const finished = async () => {
      while (sends.length > 0) await sends.shift();
      for (let tour = 0; tour < 20; tour++) await repos();
    };
    // La déclaration telle que la box l'a écrite à son journal, entrée par entrée.
    const declaredOne = async () => {
      const said: string[] = [];
      await stations({ args: ["--json"], env: box.env, dire: (line) => void said.push(line), redire: () => {} });
      return readStations(said.join("\n"))?.declarees ?? assert.fail("la box ne rend plus ses stations");
    };
    return { vue: played, fini: finished, declaree: declaredOne, projet: project, box };
  }

  // Les réglages de chaque station, dans « Details » de sa carte sur l'onglet Stations (#3195).
  const block = (vue: Fake) => vue.children.find(({ dataset }) => dataset.bloc === "stations-tab") ?? assert.fail("pas d'onglet des stations");
  const sections = (vue: Fake) => block(vue).dessous("section").filter(({ className }) => className === "station-reglee");
  const section = (vue: Fake, name: string) => sections(vue).find(({ dataset }) => dataset.station === name) ?? assert.fail(`pas de réglages pour ${name}`);
  const setting = (pose: Fake, key: string) => pose.children.find(({ className, dataset }) => className === "reglage" && dataset.cle === key) ?? assert.fail(`pas de ligne « ${key} »`);
  // Une station telle qu'elle se lit : son nom, son plafond, ses capacités.
  const readEntries = (vue: Fake) =>
    sections(vue).map((pose) => ({
      nom: pose.dataset.station,
      plafond: setting(pose, "cooks").children[1]?.textContent,
      capacites: setting(pose, "capacites").children[1]?.textContent,
    }));
  const form = (vue: Fake, name: string) => section(vue, name);
  const button = (inside: Fake, text: string) => inside.dessous("button").find((pose) => pose.textContent === text) ?? assert.fail(`pas de bouton « ${text} »`);
  const tick = (shape: Fake, what: string, tickedOne: boolean) => {
    const ticked = shape.dessous("input").find(({ type, ariaLabel }) => type === "checkbox" && (ariaLabel === what || ariaLabel.startsWith(`${what}:`))) ?? assert.fail(`pas de case « ${what} »`);
    ticked.checked = tickedOne;
    ticked.declencher("change");
  };
  // Le plafond tapé, puis le champ quitté : il s'applique à son `change` — il n'y a pas de « Save ».
  const cap = (shape: Fake, cooks: string) => {
    const field = shape.dessous("input").find(({ type }) => type === "number") ?? assert.fail("pas de plafond");
    field.value = cooks;
    field.declencher("input");
    field.declencher("change");
  };
  const without = <T extends { nom?: string }>(list: T[], name: string) => list.filter((station) => station.nom !== name);

  // Le même parcours, sur la station `editee` d'un projet qui en déclare trois : la régler, la retirer — chaque fois,
  // les deux autres restent identiques, sur l'écran comme au journal de la box.
  async function journey(t: TestContext, declaration: string, editee: string) {
    const { vue: played, fini: finished, declaree: declaredOne } = await kitchen(t, declaration);
    const vue = played.element("rail");
    const before = readEntries(vue);
    const atLog = await declaredOne();
    assert.equal(before.length, 3);

    // Ses réglages sont remplis de ce qu'elle déclare.
    const station = atLog.find(({ nom: name }) => name === editee) ?? assert.fail();
    let shape = form(vue, editee);
    assert.equal(shape.dessous("input").find(({ type }) => type === "number")?.value, String(station.cooks));
    const ticked = setting(shape, "capacites").dessous("label").filter(({ className }) => className === "capacite").filter((pose) => pose.dessous("input")[0]?.checked).map((pose) => pose.dessous("span")[0]?.textContent);
    assert.deepEqual(ticked, station.fournit);
    // Ce que les autres stations du projet fournissent est offert aussi, décoché.
    assert.ok(shape.dessous("input").some(({ ariaLabel, checked }) => (ariaLabel === "raisonnement" || ariaLabel.startsWith("raisonnement:")) && !checked));

    // Aucun « Save » : chaque contrôle s'applique dès qu'il change.
    assert.equal(shape.dessous("button").some(({ textContent }) => textContent === "Save"), false);
    // Régler : un autre plafond, puis une capacité de plus — chacun part aussitôt, la déclaration entière avec lui.
    cap(shape, "4");
    await finished();
    assert.match(setting(section(vue, editee), "cooks").textContent, /saved; the other stations are unchanged/);
    tick(form(vue, editee), "raisonnement", true);
    await finished();
    const set = readEntries(vue);
    assert.deepEqual(set.find(({ nom: name }) => name === editee), { ...before.find(({ nom: name }) => name === editee), plafond: "4 cooks at once", capacites: [...station.fournit, "raisonnement"].join(", ") });
    assert.deepEqual(without(set, editee), without(before, editee));
    assert.deepEqual(without(await declaredOne(), editee), without(atLog, editee));
    assert.match(setting(section(vue, editee), "capacites").textContent, /saved; the other stations are unchanged/);

    // La retirer : rien ne part avant la confirmation.
    // « Stop cooking here » est sur la carte de la station (#2914, #3195), sa confirmation s'ouvre dessous.
    const line = () => vue.dessous("section").find(({ className, dataset }) => className === "carte-de-station" && dataset.station === editee) ?? assert.fail(`pas de carte pour ${editee}`);
    button(line(), STOP).click();
    await finished();
    const confirmation = line().children.find(({ className }) => className === "confirmation") ?? assert.fail("pas de confirmation");
    assert.match(confirmation.dessous("p").map(({ textContent }) => textContent).join(" "), new RegExp(`Stop cooking calculus on ${editee}\\?`));
    assert.equal((await declaredOne()).length, 3);
    button(confirmation, YES_STOP).click();
    await finished();
    assert.deepEqual(readEntries(vue), without(before, editee));
    assert.deepEqual(await declaredOne(), without(atLog, editee));
  }

  test("trois stations : régler l'une, la retirer — les deux autres restent identiques", async (t) => {
    await journey(t, "box/claude:3:code+raisonnement,mac/claude:1:navigateur-headless+chrome-connecté:distante,atelier/claude:2:code", "atelier/claude");
  });

  test("un poste Windows : le même parcours sur pc/claude", async (t) => {
    await journey(t, "box/claude:3:code+raisonnement,pc/claude:1:chrome-connecté:distante,atelier/claude:2:code", "pc/claude");
  });

  test("la dernière station ne se retire pas, et ce qui ne se déclare pas est refusé en une ligne, sans rien écrire", async (t) => {
    const { vue: played, fini: finished, declaree: declaredOne } = await kitchen(t, "box/claude:3:code");
    const vue = played.element("rail");
    const shape = form(vue, "box/claude");
    // La seule station du projet ne se retire pas : confirmé, rien n'est écrit, et la ligne dit pourquoi.
    const cardOnly = () => vue.dessous("section").find(({ className, dataset }) => className === "carte-de-station" && dataset.station === "box/claude") ?? assert.fail("pas de carte pour box/claude");
    button(cardOnly(), STOP).click();
    await finished();
    button(cardOnly().children.find(({ className }) => className === "confirmation") ?? assert.fail("pas de confirmation"), YES_STOP).click();
    await finished();
    assert.match(block(vue).textContent, /nothing was changed: the project's only station/);
    assert.equal((await declaredOne()).length, 1);
    // Aucune capacité cochée : refusé avant de partir, rien n'est écrit ; le refus se lit sous sa rangée, et la case
    // revient à la valeur en vigueur.
    tick(shape, "code", false);
    await finished();
    const capacities = setting(form(vue, "box/claude"), "capacites");
    const refusal = capacities.children.find(({ className }) => className === "dit refus");
    assert.match(refusal?.textContent ?? "", /provides at least one capability/);
    assert.equal(capacities.dessous("input").find(({ ariaLabel }) => ariaLabel === "code" || ariaLabel.startsWith("code:"))?.checked, true);
    assert.deepEqual((await declaredOne()).map(({ fournit: provides }) => provides), [["code"]]);
  });
});

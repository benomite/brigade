// L'installation d'un projet, telle que l'app la lit sur sa box : la vérification (`installation`, en texte, et
// `installation --json`, son verdict) lancée par la station de cet ordinateur, ce que « Démarrer » écrit, et l'étape
// d'une installation terminée qui ne retombe jamais sur son écran. Ce que la box rend est la sortie de l'ancien runtime,
// recopiée telle qu'il l'écrivait (runtime/src/installation-cli.ts, runtime/src/verdict.ts, runtime/src/etapes.ts,
// supprimés avec lui, #4499) ; les tests qui jouaient l'installation guidée contre ses commandes (`installation etapes`,
// `stations`, `protection`, `decisions`) sont partis avec lui. La vérification se joue contre un faux `node` écrit par
// chaque test, les terminaux contre de faux pty : ni réseau, ni `claude`. Aucun test n'attend une durée — une action
// rend la main quand elle a fini.
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { type Kitchen, ACTION, launchThe, type Read, type Settings, type Rendered } from "../src/box.ts";
import type { Project } from "../src/config.ts";
import { commandOfStartup, COMMANDS, JUDGMENT, judgmentOf, readCurrent, readSteps, readJudgment, readProtection, readStations, gapsOf, holdServices, VERIFICATION, verdictOf, type Guide } from "../src/service.ts";
import { openTerminals, type Launch, type Terminal } from "../src/terminals.ts";
import { WITHOUT_POSIX } from "./helpers/posix.ts";

const ROOT = join(import.meta.dirname, "../..");
const CALCULUS: Project = { nom: "calculus", dossier: "/projets/calculus" };

// Un constat de la vérification, dans la forme de l'ancien runtime (`Constat`, runtime/src/installation.ts) : où, son
// état, ce qu'il dit, son geste, l'étape qu'il nomme, et — pour un manque — ce qu'il dit en mots simples et qui le lève.
type Constat = {
  ou: "machine" | "depot" | "github";
  etat: "ok" | "manque" | "note";
  texte: string;
  geste?: string;
  etape?: string;
  simple?: string;
  remede?: { qui: "chef"; commande?: string; action?: string } | { qui: "brigade" };
};

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
// Ce que `installation` écrivait de ces constats, ligne à ligne (`ecrire`, runtime/src/installation-cli.ts) : c'est
// aussi la sortie brute que son verdict structuré (`installation --json`) porte, au caractère près.
const READY_ONE = [
  "",
  "Sur la machine",
  "  ok        les 9 variables obligatoires sont posées, et tout ce que le runtime lit de son environnement est lisible",
  "",
  "Dans le dépôt",
  "  ok        bindings : bloc présent, branche d'intégration `main`",
  "",
  "Sur GitHub",
  "  note      la push protection de GitHub n'est pas constatée sur chef/calculus (GitHub en dit : `disabled`)",
  "            → docs/installer.md, « Déclarer le projet »",
  "",
  "brigade : project “calculus” : ready — nothing is missing to launch a cook",
].join("\n") + "\n";
const INCOMPLETE_ONE = [
  "",
  "Sur la machine",
  "",
  "Dans le dépôt",
  "  MISSING   `.claude/brigade/gates.sh` n'est pas exécutable : la pass le lance tel quel",
  "            → `git update-index --chmod=+x .claude/brigade/gates.sh`, commité sur `main`",
  "",
  "Sur GitHub",
  "  MISSING   le cache des labels du dépôt est périmé",
  "            → rien à faire : le runtime le relit à son prochain passage",
  "",
  "brigade : project “calculus” : 2 missing : no cook must be launched while any is left — to resume: ",
].join("\n") + "\n";
// La vérification qui plante sur /etc/sudoers.d : la panne connue #654.
const EACCES = "EACCES: permission denied, lstat '/etc/sudoers.d/brigade-installer'";

// Ce qu'`installation` constate quand le code de brigade posé sur la box est trop vieux : un manque sur la machine, que
// l'étape « verification » règle, et aucune station déclarée.
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

// Ce que `installation` écrivait de ces constats, chaque étape nommée par l'ancien runtime ; puis des mêmes, avec
// deux manques de plus sur GitHub — trois manques du chef (une commande, une étape que l'app fait, une étape où se
// choisir), la branche non protégée (une étape aussi), et un manque que brigade lève seule.
const WITHOUT_ACTION = [
  "",
  "Sur la machine",
  "  MISSING   le code de brigade posé sur la box (/opt/brigade) est en retard sur celui que le runtime exige — un projet lancé avec lui ferait autre chose que ce que le runtime attend",
  "            → `sudo git -C /opt/brigade pull --ff-only` — docs/installer.md, « Mettre brigade à jour »",
  "            → step to resume: 3. Vérifier la box (verification)",
  "  MISSING   aucune station déclarée (BRIGADE_STATIONS n'est posée ni au journal du projet) : le runtime démarre, mais aucun cook ne partirait — les tickets resteraient en attente",
  "            → `brigade calculus installation stations`",
  "            → step to resume: 4. Déclarer les stations (stations)",
  "",
  "Dans le dépôt",
  "",
  "Sur GitHub",
  "  note      la push protection de GitHub n'est pas constatée sur chef/calculus",
  "            → docs/installer.md, « Déclarer le projet »",
  "",
  "brigade : project “calculus” : 2 missing : no cook must be launched while any is left — to resume: 3. Vérifier la box, 4. Déclarer les stations",
].join("\n") + "\n";
const FOUR_ONE = [
  "",
  "Sur la machine",
  "  MISSING   le code de brigade posé sur la box (/opt/brigade) est en retard sur celui que le runtime exige — un projet lancé avec lui ferait autre chose que ce que le runtime attend",
  "            → `sudo git -C /opt/brigade pull --ff-only` — docs/installer.md, « Mettre brigade à jour »",
  "            → step to resume: 3. Vérifier la box (verification)",
  "  MISSING   aucune station déclarée (BRIGADE_STATIONS n'est posée ni au journal du projet) : le runtime démarre, mais aucun cook ne partirait — les tickets resteraient en attente",
  "            → `brigade calculus installation stations`",
  "            → step to resume: 4. Déclarer les stations (stations)",
  "",
  "Dans le dépôt",
  "",
  "Sur GitHub",
  "  note      la push protection de GitHub n'est pas constatée sur chef/calculus",
  "            → docs/installer.md, « Déclarer le projet »",
  "  MISSING   `main` n'est pas protégée sur chef/calculus",
  "            → la même commande, suivie de `protection poser`",
  "            → step to resume: 5. Protéger la branche d'intégration (protection)",
  "  MISSING   le cache des labels du dépôt est périmé",
  "            → rien à faire : le runtime le relit à son prochain passage",
  "",
  "brigade : project “calculus” : 4 missing : no cook must be launched while any is left — to resume: 3. Vérifier la box, 4. Déclarer les stations, 5. Protéger la branche d'intégration",
].join("\n") + "\n";

// Le verdict structuré de la vérification (`installation --json`), tel que l'ancien runtime l'écrivait sur une ligne
// (runtime/src/verdict.ts), et son code de sortie : prêt, pas prêt (les quatre manques de `FOUR_ONE`), plantée — sur la panne connue
// #654, ou sur une panne inconnue.
const VERDICT_READY = { code: 0, sortie: JSON.stringify({
    verdict: "pret",
    phrase: "prêt : rien ne manque pour lancer un cook",
    manques: [],
    aSavoir: [
      {
        ou: "github",
        texte: "la push protection de GitHub n'est pas constatée sur chef/calculus (GitHub en dit : `disabled`)",
        geste: "docs/installer.md, « Déclarer le projet »"
      }
    ],
    brut: READY_ONE
  }) };
const VERDICT_FOUR = { code: 1, sortie: JSON.stringify({
    verdict: "pas-pret",
    phrase: "pas prêt : 4 choses à faire",
    manques: [
      {
        ou: "machine",
        texte: "le code de brigade posé sur la box est trop ancien : un projet lancé avec lui échouerait",
        constat: "le code de brigade posé sur la box (/opt/brigade) est en retard sur celui que le runtime exige — un projet lancé avec lui ferait autre chose que ce que le runtime attend",
        geste: "`sudo git -C /opt/brigade pull --ff-only` — docs/installer.md, « Mettre brigade à jour »",
        etape: "verification",
        acteur: "chef",
        commande: "sudo git -C /opt/brigade pull --ff-only"
      },
      {
        ou: "machine",
        texte: "aucune station n'est déclarée : aucun cook ne partirait",
        constat: "aucune station déclarée (BRIGADE_STATIONS n'est posée ni au journal du projet) : le runtime démarre, mais aucun cook ne partirait — les tickets resteraient en attente",
        geste: "`brigade calculus installation stations`",
        etape: "stations",
        acteur: "chef",
        action: "stations"
      },
      {
        ou: "github",
        texte: "la branche d'intégration `main` n'est pas protégée sur GitHub",
        constat: "`main` n'est pas protégée sur chef/calculus",
        geste: "la même commande, suivie de `protection poser`",
        etape: "protection",
        acteur: "chef",
        action: "protection"
      },
      {
        ou: "github",
        texte: "brigade n'a pas encore relu les étiquettes du dépôt : elle le fait seule à son prochain passage",
        constat: "le cache des labels du dépôt est périmé",
        geste: "rien à faire : le runtime le relit à son prochain passage",
        acteur: "brigade"
      }
    ],
    aSavoir: [
      {
        ou: "github",
        texte: "la push protection de GitHub n'est pas constatée sur chef/calculus",
        geste: "docs/installer.md, « Déclarer le projet »"
      }
    ],
    etapes: [
      "verification",
      "stations",
      "protection"
    ],
    brut: FOUR_ONE
  }) };
const VERDICT_EACCES = { code: 1, sortie: JSON.stringify({
    verdict: "plantee",
    phrase: "la vérification n'a pas pu aller au bout : c'est un problème de brigade, pas de ton projet — une panne connue (#654), tu n'as rien à faire",
    panne: {
      erreur: "EACCES: permission denied, lstat '/etc/sudoers.d/brigade-installer'",
      connue: {
        issue: 654,
        texte: "la vérification lisait un fichier de /etc/sudoers.d que le compte du service n'a pas le droit de lire — corrigé dans brigade, la box l'aura à sa prochaine mise à jour"
      },
      acteur: "brigade",
      rienAFaire: true
    },
    manques: [],
    aSavoir: [],
    brut: "brigade : EACCES: permission denied, lstat '/etc/sudoers.d/brigade-installer'\n"
  }) };
const VERDICT_ENOSPC = { code: 1, sortie: JSON.stringify({
    verdict: "plantee",
    phrase: "la vérification n'a pas pu aller au bout : c'est un problème de brigade, pas de ton projet — une panne pas encore connue, tu n'as rien à faire",
    panne: {
      erreur: "ENOSPC: no space left on device",
      connue: null,
      acteur: "brigade",
      rienAFaire: true
    },
    manques: [],
    aSavoir: [],
    brut: "brigade : ENOSPC: no space left on device\n"
  }) };

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

// « Vérifier », sur l'écran : `installation --json`, que le faux `node` rend comme le runtime l'écrivait.
const judgeOf = ({ code, sortie: output }: { code: number; sortie: string }) => `${said(output)}\nexit ${code}`;

describe("« Vérifier » : `installation --json`, et le verdict que l'écran en lit", () => {
  test("ce qui part est le geste de la station — `installation --json`, sans terminal ni rien de plus", { skip: WITHOUT_POSIX }, async (t) => {
    const { reglages: settings, cuisine: kitchen, lu: readOne, appel: call } = trial(t, `${NOTE}\n${judgeOf(VERDICT_READY)}`);

    await judge(settings, { nom: "calculus", cuisine: kitchen });

    assert.equal(readOne("appels"), call("calculus installation --json"));
  });

  test("prêt : le verdict en une phrase, aucun manque, la ligne `à savoir` à part — et ce que l'app a obtenu porte la sortie brute, intacte, à la place de son objet", { skip: WITHOUT_POSIX }, async (t) => {
    const { reglages: settings, cuisine: kitchen, node, appel: call } = trial(t, judgeOf(VERDICT_READY));

    const rendered = await judge(settings, { nom: "calculus", cuisine: kitchen });

    assert.ok(rendered.etat === "jugee" && rendered.jugement.verdict === "pret");
    assert.match(rendered.jugement.phrase, /^prêt/);
    assert.deepEqual(rendered.jugement.aSavoir, [{ texte: READY[2]?.texte, geste: READY[2]?.geste }]);
    assert.equal(rendered.jugement.brut, READY_ONE);
    assert.equal(rendered.obtenu, `$ ${node} ${call("calculus installation --json").trimEnd()}\n${READY_ONE}\n→ exit code 0`);
  });

  test("pas prêt : autant de manques que la vérification en constate, chacun en mots simples avec qui le lève — les lignes `à savoir` n'en sont pas", { skip: WITHOUT_POSIX }, async (t) => {
    const { reglages: settings, cuisine: kitchen } = trial(t, judgeOf(VERDICT_FOUR));

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
    assert.equal(rendered.jugement.brut, FOUR_ONE);
  });

  test("plantée sur /etc/sudoers.d : la vérification n'est pas allée au bout — la panne connue #654, rien n'est constaté du projet, et sa ligne d'erreur est la sortie brute", { skip: WITHOUT_POSIX }, async (t) => {
    const { reglages: settings, cuisine: kitchen } = trial(t, judgeOf(VERDICT_EACCES));

    const rendered = await judge(settings, { nom: "calculus", cuisine: kitchen });

    assert.ok(rendered.etat === "jugee" && rendered.jugement.verdict === "plantee");
    assert.equal(rendered.jugement.panne.connue?.issue, 654);
    assert.match(rendered.jugement.phrase, /problème de brigade, pas de ton projet/);
    assert.equal(rendered.jugement.brut, `brigade : ${EACCES}\n`);
    assert.match(rendered.obtenu, /lstat '\/etc\/sudoers\.d\/brigade-installer'\n\n→ exit code 1$/);
  });

  test("un runtime d'avant le verdict, une commande forcée, un verdict que son code dément : rien n'est lu, et ce que la box a rendu est gardé", { skip: WITHOUT_POSIX }, async (t) => {
    const theCase = [
      "echo 'brigade : usage : … installation -- [labels | setup [<cooks>] | uninstall [--confirm]]' >&2\nexit 2",
      said("Bienvenue."),
      said(READY_ONE),
      `${said(VERDICT_FOUR.sortie)}\nexit 0`,
      `${said(VERDICT_READY.sortie)}\nexit 1`,
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
    for (const { sortie: output } of [VERDICT_READY, VERDICT_FOUR, VERDICT_EACCES, VERDICT_ENOSPC]) {
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

async function guide(services: ReturnType<typeof holdServices>, project: Project = CALCULUS): Promise<Guide> {
  return (await services.guide(project)) ?? assert.fail("ce projet n'a pas d'installation");
}

describe("ce que la box ne rend pas", () => {
  test("une box pas jointe : aucune étape n'est inventée, ce que l'app a obtenu est montré avec son cas", async () => {
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

  test("un runtime d'avant les étapes : ce qu'il a rendu est montré, et ce qui l'explique", async () => {
    const { terminaux: terminals } = fakeTerminals();
    const launch = async (): Promise<Rendered> => ({ lance: "$ node", erreur: Object.assign(new Error("usage"), { code: 2, killed: false, cmd: "node" }), sortie: "", erreurs: "brigade : usage : … installation -- [labels | setup [<cooks>] | desinstaller [--confirmer]]\n" });
    const services = holdServices({ delaiMs: 60_000, cuisine: () => KITCHEN, lancer: launch, session: terminals.session, shell: terminals.shell, surGuide: () => {} });

    const readOne = await guide(services);

    assert.ok(readOne.lecture.etat === "illisible");
    assert.match(readOne.lecture.obtenu, /desinstaller \[--confirmer\]\]\n\n→ exit code 2$/);
    assert.match(readOne.lecture.lignes.join("\n"), /predates this step/);
  });

  test("un projet dont la station de cet ordinateur ne se lit pas n'a pas d'installation : rien à lire, rien à faire", async () => {
    // Une box qui note ce qu'on lui lance : rien ne doit partir.
    const calls: string[] = [];
    const launch = async (_served: unknown, command: string): Promise<Rendered> => (calls.push(command), { lance: `$ node ${command}`, erreur: null, sortie: "", erreurs: "" });
    const { terminaux: terminals, terminal } = fakeTerminals();
    const services = holdServices({ delaiMs: 60_000, cuisine: () => undefined, lancer: launch, session: terminals.session, shell: terminals.shell, surGuide: () => {} });

    assert.equal(await services.guide(CALCULUS), undefined);
    assert.match((await services.direMerge(CALCULUS, true))?.refus ?? "", /does not say where its station is/);
    assert.match((await services.verifier(CALCULUS))?.refus ?? "", /does not say where its station is/);
    assert.match(refusal(services.amorcer(CALCULUS)), /does not say where its station is/);
    assert.deepEqual(calls, []);
    assert.deepEqual(terminal(), []);
  });
});

describe("ce que l'app lit du runtime : ses formes, telles qu'il les écrivait", () => {
  test("un manque se lit avec sa flèche et l'étape qu'il nomme ; une flèche sous `à savoir` ne retient rien", () => {
    assert.deepEqual(gapsOf(WITHOUT_ACTION), [
      { texte: ACTION_TOO_OLD, geste: ACTION_A_LEVEL, etape: "verification" },
      { texte: "aucune station déclarée (BRIGADE_STATIONS n'est posée ni au journal du projet) : le runtime démarre, mais aucun cook ne partirait — les tickets resteraient en attente", geste: "`brigade calculus installation stations`", etape: "stations" },
    ]);
    assert.deepEqual(gapsOf(READY_ONE), []);
    assert.equal(gapsOf(INCOMPLETE_ONE).length, 2);
  });

  test("une forme que l'app ne connaît pas n'est pas lue : rien n'en est déduit", () => {
    for (const read of [readSteps, readStations, readProtection, readCurrent]) {
      for (const output of ["", "Bienvenue.", "{}", '{"etapes":"non","courante":null}', "[1,2]"]) assert.equal(read(output), undefined, output);
    }
    assert.equal(readSteps('{"courante":"ailleurs","etapes":[]}'), undefined);
  });
});

describe("un projet installé n'affiche jamais l'écran d'installation", () => {
  // `installation etapes --json` d'une installation terminée : ses sept étapes faites, telles que l'ancien runtime les
  // écrivait (runtime/src/etapes.ts, `ETAPES`).
  const finished = JSON.stringify({
    courante: null,
    etapes: [
      {
        id: "ajout",
        titre: "Ajouter le projet sur la box",
        etat: "done",
        sert: "La box clone le dépôt, pose l'instance du projet, sa cloison, sa sauvegarde et ses ports : c'est elle qui fait exister le projet sur la box.",
        sauter: "Le projet n'existe pas sur la box : aucune des étapes suivantes n'a où s'appliquer.",
        geste: null
      },
      {
        id: "init",
        titre: "Amorcer le dépôt",
        etat: "done",
        sert: "`/brigade:init` pose dans le dépôt les bindings, les gates et le setup de worktree que les cooks, la station et la pass lisent.",
        sauter: "La pass n'a pas de gates à jouer ni la station de setup à lancer : aucun cook ne peut livrer.",
        geste: "Taper `/brigade:init` dans la session que l'app ouvre, puis merger sa PR sur la branche d'intégration : l'app ne converse pas et ne merge pas à ta place."
      },
      {
        id: "verification",
        titre: "Vérifier la box",
        etat: "done",
        sert: "Dit d'un coup tout ce qui manque au projet pour être servi — sur la box, dans le dépôt, sur GitHub — avec le geste qui le pose.",
        sauter: "Ce qui manque se découvre en démarrant, une panne à la fois : un cook qui ne part pas, une commande introuvable.",
        geste: null
      },
      {
        id: "stations",
        titre: "Déclarer les stations",
        etat: "done",
        sert: "Choisit, parmi les stations que la machine fournit, celles où les tickets se servent et combien de cooks chacune fait tourner à la fois — posées au journal du projet, sans `sudo` ni drop-in.",
        sauter: "La cuisine démarre, mais aucun cook ne part : sans station, aucun ticket n'est servi.",
        geste: null
      },
      {
        id: "protection",
        titre: "Protéger la branche d'intégration",
        etat: "done",
        sert: "Sur GitHub, plus rien n'entre dans la branche d'intégration que par une PR, et la push protection refuse une livraison qui porterait des identifiants.",
        sauter: "Un push direct entre dans la branche d'intégration sans passer par la pass, et des identifiants peuvent partir sur GitHub.",
        geste: null
      },
      {
        id: "decisions",
        titre: "Poser les décisions que le démarrage réclame",
        etat: "done",
        sert: "Pose, chacune avec sa question, ses options et leur effet, les décisions que la configuration du projet suffit à trancher — le calibrage du manager et du reviewer, que le démarrage réclame, puis les seuils de coût et le closer —, au journal du projet, sans `sudo` ni drop-in.",
        sauter: "Le runtime refuse de démarrer : sans le calibrage du manager et du reviewer, rien n'est jugé ni relu.",
        geste: null
      },
      {
        id: "demarrage",
        titre: "Démarrer la cuisine",
        etat: "done",
        sert: "Lance le runtime du projet : il lit le rail et envoie un cook sur le premier ticket prêt.",
        sauter: "Tout est prêt et rien ne tourne : aucun ticket n'est servi.",
        geste: null
      }
    ]
  });
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
});

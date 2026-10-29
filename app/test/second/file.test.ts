// La file du projet lue pour le second par un crochet SessionStart : déclaré dans les seuls réglages de l'onglet
// Second, joué à la main il rend le contexte que `claude` attend, et une file illisible est dite sans bloquer. La file
// vient du tableau de la cuisine que la box publie sur GitHub, lu par le `gh` du poste (#1845) : aucune commande lancée sur une autre machine.
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, test, type TestContext } from "node:test";
import { crochetsDeLaFile, MATCHER } from "../../src/second/crochet-de-la-file.ts";
import { contexteDeLaFile, lireLaFile } from "../../src/second/file.ts";
import { argumentsDuSecond, reglagesDuSecond, type ReglagesDuSecond } from "../../src/second/lancement.ts";
import { ouvrirTerminaux, type Lancement } from "../../src/terminaux.ts";
import { DEPOT, githubDuTableau, NUMERO, projetPublie } from "../tableau/projet-publie.ts";

const SCRIPT = join(import.meta.dirname, "..", "..", "src", "second", "file.ts");
// Le faux `gh` est un script `sh` : un Windows ne le lance pas.
const SANS_SH = process.platform === "win32" ? "le faux gh est un script sh, que Windows ne lance pas" : false;

function dossier(t: TestContext): string {
  const d = mkdtempSync(join(tmpdir(), "brigade-file-"));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  return d;
}

// Un faux `gh` : il écrit ce qu'il a reçu, rend `sortie` et `erreur`, et sort avec `code`. Seul dans le PATH du crochet :
// ni `git` — il lit ses fichiers par `/bin/cat`.
function fauxGh(t: TestContext, code: number, sortie: string, erreur = ""): string {
  const d = dossier(t);
  writeFileSync(join(d, "sortie"), sortie);
  writeFileSync(join(d, "erreur"), erreur);
  const gh = join(d, "gh");
  writeFileSync(gh, `#!/bin/sh\necho "$@" > '${join(d, "recu")}'\n/bin/cat '${join(d, "sortie")}'\n/bin/cat '${join(d, "erreur")}' >&2\nexit ${code}\n`);
  chmodSync(gh, 0o755);
  return gh;
}

// Le crochet tel que `claude` le joue : `node file.ts <nom> <depot> <gh>`, dans le dossier de la session.
function jouer(t: TestContext, gh: string, nom: string, depot: string) {
  const r = spawnSync(process.execPath, [SCRIPT, nom, depot, gh], { encoding: "utf8", cwd: dossier(t), env: { PATH: join(gh, ".."), HOME: dossier(t) } });
  return { ...r, json: r.stdout.trim() === "" ? undefined : (JSON.parse(r.stdout) as { hookSpecificOutput: { hookEventName: string; additionalContext: string } }) };
}

// Le bloc `awaiting` de `status`, bords compris : ce que le second relaie mot pour mot.
const awaiting = (status: string) => {
  const lignes = status.split("\n");
  const debut = lignes.findIndex((ligne) => ligne.startsWith("awaiting"));
  const fin = lignes.indexOf("end awaiting");
  assert.ok(debut >= 0 && fin > debut, "le status porte son bloc awaiting");
  return lignes.slice(debut, fin + 1).join("\n");
};

describe("le crochet de la file, dans les réglages du second", () => {
  test("SessionStart pour startup, resume et compact", () => {
    const reglages = reglagesDuSecond(crochetsDeLaFile({ node: "/usr/bin/node", gh: "gh", cible: { nom: "brigade", depot: "acme/brigade" } }));
    const crochets = reglages.hooks?.SessionStart ?? assert.fail("pas de SessionStart");
    assert.equal(crochets.length, 1);
    assert.deepEqual(MATCHER.split("|"), ["startup", "resume", "compact"]);
    assert.equal(crochets[0]?.matcher, MATCHER);
    assert.match(crochets[0]?.hooks[0]?.command ?? "", /^'\/usr\/bin\/node' '.*second\/file\.ts' 'brigade' 'acme\/brigade' 'gh'$/);
  });

  test("le lancement du second le porte, à la reprise comme en session neuve ; rien n'est écrit ailleurs", () => {
    const lances: Lancement[] = [];
    const terminaux = ouvrirTerminaux({
      claude: "claude",
      shell: "/bin/zsh",
      node: "/usr/bin/node",
      ouvrirPty(l) {
        lances.push(l);
        return { ecrire: () => {}, redimensionner: () => {}, tuer: () => {} };
      },
      surSortie: () => {},
      surEtat: () => {},
    });
    terminaux.espace({ nom: "brigade", dossier: "/projets/brigade", depot: "acme/brigade" });
    const args = lances.at(0)?.args ?? assert.fail("aucun lancement");
    const reglages = JSON.parse(args[args.indexOf("--settings") + 1] ?? "") as { hooks: { SessionStart: { matcher: string; hooks: { type: "command"; command: string }[] }[] } };
    assert.equal(reglages.hooks.SessionStart[0]?.matcher, "startup|resume|compact");
    assert.match(reglages.hooks.SessionStart[0]?.hooks[0]?.command ?? "", /'brigade' 'acme\/brigade' 'gh'$/);
    assert.equal(argumentsDuSecond({ reprise: true, reglages: reglages as ReglagesDuSecond }).includes("--continue"), true);
  });

  test("sans le crochet dans aucun fichier du projet : le module n'écrit rien", () => {
    const source = readFileSync(SCRIPT, "utf8");
    assert.doesNotMatch(source, /writeFile|appendFile|\.claude/);
  });
});

describe("la file lue sur le tableau de la cuisine, sans autre machine", () => {
  test("le bloc `awaiting` que la box publie, mot pour mot, puis l'état de la cuisine — et l'heure de l'état qu'elle a lu", async (t) => {
    const publie = projetPublie(t);
    const { appeler, chemins } = githubDuTableau(publie.corps);
    const lue = await lireLaFile(appeler, DEPOT);
    assert.ok(lue.lue, JSON.stringify(lue));
    assert.ok(lue.texte.startsWith(`${awaiting(publie.status)}\n`), lue.texte);
    assert.match(lue.texte, /^runtime {4}/m);
    assert.equal(chemins.length, 1);
    const contexte = contexteDeLaFile({ nom: "brigade", depot: DEPOT }, lue);
    assert.ok(contexte.includes(awaiting(publie.status)));
    assert.match(contexte, /from the Kitchen board the box of brigade publishes on GitHub/);
    assert.match(contexte, /do not run it again/);
  });

  test("un tableau d'une box qui ne publie pas encore la file : dit, jamais une file vide", async (t) => {
    const publie = projetPublie(t);
    const ancien = publie.corps.replace(/,\\?"fileDeStatus\\?":\[[^\]]*\]/, "");
    assert.notEqual(ancien, publie.corps, "la doublure retire bien la file publiée");
    const lue = await lireLaFile(githubDuTableau(ancien).appeler, DEPOT);
    assert.ok(!lue.lue);
    assert.match(contexteDeLaFile({ nom: "brigade" }, lue), /file non lue : tableau de la cuisine pas lu\n.*does not publish the project's queue yet: update the box/);
  });

  test("GitHub qui refuse, ou pas de tableau : dit en une phrase", async () => {
    const refus = await lireLaFile(async () => ({ status: 404, data: { message: "Not Found" } }), DEPOT);
    assert.ok(!refus.lue);
    assert.match(contexteDeLaFile({ nom: "brigade" }, refus), /file non lue : tableau de la cuisine pas lu\n.*HTTP 404/);
    const sans = await lireLaFile(async () => ({ status: 200, data: [] }), DEPOT);
    assert.match(contexteDeLaFile({ nom: "brigade" }, sans), /There is no open Kitchen board in acme\/brigade/);
  });

  test("GitHub pas joint : dit, sans bloquer", async () => {
    const lue = await lireLaFile(async () => assert.fail("getaddrinfo ENOTFOUND api.github.com"), DEPOT);
    assert.match(contexteDeLaFile({ nom: "brigade" }, lue), /file non lue : GitHub pas joint\n.*ENOTFOUND/);
  });
});

describe("le crochet joué à la main", () => {
  test("il lit le tableau par le `gh` du poste, et rend la file au format du contexte additionnel — rien d'autre que `gh` dans son PATH", { skip: SANS_SH }, (t) => {
    const publie = projetPublie(t);
    const gh = fauxGh(t, 0, JSON.stringify([publie.issue]));
    const r = jouer(t, gh, "brigade", DEPOT);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.json?.hookSpecificOutput.hookEventName, "SessionStart");
    assert.ok(r.json?.hookSpecificOutput.additionalContext.includes(awaiting(publie.status)), r.json?.hookSpecificOutput.additionalContext);
    assert.match(readFileSync(join(gh, "..", "recu"), "utf8"), new RegExp(`^api repos/${DEPOT}/issues\\?labels=kitchen-board&state=open`));
    assert.equal(NUMERO, publie.issue.number);
  });

  test("GitHub qui refuse : dit, et la session n'est pas bloquée", { skip: SANS_SH }, (t) => {
    const r = jouer(t, fauxGh(t, 1, JSON.stringify({ message: "Not Found" }), "gh: Not Found (HTTP 404)"), "brigade", DEPOT);
    assert.equal(r.status, 0);
    assert.match(r.json?.hookSpecificOutput.additionalContext ?? "", /file non lue : tableau de la cuisine pas lu\n.*HTTP 404/);
  });

  test("un projet sans dépôt, dans un dossier sans origine : dit qu'aucun dépôt n'est connu, et sort en 0", { skip: SANS_SH }, (t) => {
    const r = jouer(t, fauxGh(t, 0, "[]"), "brigade", "");
    assert.equal(r.status, 0);
    assert.match(r.json?.hookSpecificOutput.additionalContext ?? "", /file non lue : aucun dépôt GitHub pour ce projet/);
  });

  test("un gh introuvable : dit, et sort en 0", (t) => {
    const r = spawnSync(process.execPath, [SCRIPT, "brigade", DEPOT, join(dossier(t), "gh-absent")], { encoding: "utf8" });
    assert.equal(r.status, 0);
    assert.match((JSON.parse(r.stdout) as { hookSpecificOutput: { additionalContext: string } }).hookSpecificOutput.additionalContext, /file non lue : GitHub pas joint/);
  });
});

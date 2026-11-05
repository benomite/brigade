// La file du projet lue pour le second par un crochet SessionStart : déclaré dans les seuls réglages de l'onglet
// Second, joué à la main il rend le contexte que `claude` attend, et une file illisible est dite sans bloquer. La file
// vient des issues du projet sur GitHub — les cartes du chef (`chef-todo`) et le rail (`fire`) —, lues par le `gh` du
// poste comme la vue du rail les lit (#1845, #2061) : aucune commande lancée sur une autre machine.
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, test, type TestContext } from "node:test";
import { crochetsDeLaFile, MATCHER } from "../../src/second/crochet-de-la-file.ts";
import { contexteDeLaFile, lireLaFile } from "../../src/second/file.ts";
import { argumentsDuSecond, reglagesDuSecond, type ReglagesDuSecond } from "../../src/second/lancement.ts";
import type { AppelGitHub, ReponseGitHub } from "../../src/tableau/client.ts";
import { ouvrirTerminaux, type Lancement } from "../../src/terminaux.ts";

const DEPOT = "acme/brigade";

const SCRIPT = join(import.meta.dirname, "..", "..", "src", "second", "file.ts");
// Le faux `gh` est un script `sh` : un Windows ne le lance pas.
const SANS_SH = process.platform === "win32" ? "le faux gh est un script sh, que Windows ne lance pas" : false;

function dossier(t: TestContext): string {
  const d = mkdtempSync(join(tmpdir(), "brigade-file-"));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  return d;
}

// Un faux `gh` : il note chaque appel reçu, rend `sortie` et `erreur` à chacun, et sort avec `code`. Seul dans le PATH du crochet :
// ni `git` — il lit ses fichiers par `/bin/cat`.
function fauxGh(t: TestContext, code: number, sortie: string, erreur = ""): string {
  const d = dossier(t);
  writeFileSync(join(d, "sortie"), sortie);
  writeFileSync(join(d, "erreur"), erreur);
  const gh = join(d, "gh");
  writeFileSync(gh, `#!/bin/sh\necho "$@" >> '${join(d, "recu")}'\n/bin/cat '${join(d, "sortie")}'\n/bin/cat '${join(d, "erreur")}' >&2\nexit ${code}\n`);
  chmodSync(gh, 0o755);
  return gh;
}

// Le crochet tel que `claude` le joue : `node file.ts <nom> <depot> <gh>`, dans le dossier de la session.
function jouer(t: TestContext, gh: string, nom: string, depot: string) {
  const r = spawnSync(process.execPath, [SCRIPT, nom, depot, gh], { encoding: "utf8", cwd: dossier(t), env: { PATH: join(gh, ".."), HOME: dossier(t) } });
  return { ...r, json: r.stdout.trim() === "" ? undefined : (JSON.parse(r.stdout) as { hookSpecificOutput: { hookEventName: string; additionalContext: string } }) };
}

const ok = (data: unknown): ReponseGitHub => ({ status: 200, data });
const issue = (number: number, labels: string[]) => ({ number, title: `Ticket ${number}`, html_url: `https://github.com/${DEPOT}/issues/${number}`, created_at: "2026-10-12T08:00:00Z", labels: labels.map((name) => ({ name })) });

// Le projet sur GitHub : #30 en attente sur le rail, #24 une carte du chef. `todo` : la réponse à la liste des cartes.
function github(options: { todo?: ReponseGitHub; chemins?: string[] } = {}): AppelGitHub {
  return async (chemin) => {
    options.chemins?.push(chemin);
    if (chemin.includes("/issues?") && chemin.includes("labels=fire")) return ok([issue(30, ["fire", "prio:0"])]);
    if (chemin.includes("/issues?") && chemin.includes("labels=chef-todo")) return options.todo ?? ok([issue(24, ["chef-todo"])]);
    if (chemin.includes("/issues?")) return ok([issue(30, ["fire", "prio:0"]), issue(24, ["chef-todo"])]);
    if (chemin.includes("/pulls?")) return ok([]);
    if (chemin.includes("/issues/24/comments")) return ok([{ body: "<!-- brigade:todo kind=product-question -->\nOne list per project, or one for all?" }]);
    return { status: 404, data: {} };
  };
}

// La file que le second reçoit de ce projet : le bloc `awaiting`, bords compris, puis le rail.
const FILE = ["awaiting   1 decision awaits the chef", "  #24  Ticket 24", "end awaiting", "", "rail       1 queued", "  #30  queued  prio:0  since 2026-10-12 08:00 UTC  Ticket 30"].join("\n");

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

describe("la file lue sur GitHub, sans autre machine", () => {
  test("les cartes du chef dans le bloc `awaiting`, puis le rail — et l'heure de la lecture", async () => {
    const chemins: string[] = [];
    const lue = await lireLaFile(github({ chemins }), DEPOT);
    assert.ok(lue.lue, JSON.stringify(lue));
    assert.equal(lue.depot, DEPOT);
    assert.match(lue.lu, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(lue.texte, `${FILE}\n`);
    // Le rail, et les cartes du chef : rien d'autre que les issues du dépôt.
    assert.ok(chemins.some((chemin) => chemin.includes("labels=fire")) && chemins.some((chemin) => chemin.includes("labels=chef-todo")));
    assert.ok(chemins.every((chemin) => chemin.startsWith(`/repos/${DEPOT}`)), chemins.join(", "));
    const contexte = contexteDeLaFile({ nom: "brigade", depot: DEPOT }, lue);
    assert.ok(contexte.endsWith(`Read at ${lue.lu}, on ${DEPOT}.\n\n${FILE}`), contexte);
    assert.match(contexte, /^The project's queue, read by the app at the start of this session \(or after a compaction\) from the GitHub issues of brigade: /);
    assert.match(contexte, /`chef-todo`.*`awaiting` block of `brigade brigade status`.*the rail \(`fire`\)/);
    assert.match(contexte, /do not run it again/);
  });

  test("les cartes du chef qui ne se lisent pas, le rail si : dit, jamais une file vide", async () => {
    const lue = await lireLaFile(github({ todo: { status: 403, data: { message: "API rate limit exceeded" } } }), DEPOT);
    assert.ok(!lue.lue);
    assert.equal(lue.raison, "The cards awaiting the chef in acme/brigade (`chef-todo`) were not read from GitHub.");
    assert.equal(lue.horsLigne, undefined);
    assert.match(contexteDeLaFile({ nom: "brigade" }, lue), /\n\nfile non lue : GitHub pas lu\nThe cards awaiting the chef in acme\/brigade/);
  });

  test("GitHub qui refuse : dit en une phrase", async () => {
    const refus = await lireLaFile(async () => ({ status: 404, data: { message: "Not Found" } }), DEPOT);
    assert.ok(!refus.lue);
    assert.equal(refus.horsLigne, undefined);
    assert.match(contexteDeLaFile({ nom: "brigade" }, refus), /file non lue : GitHub pas lu\nGitHub does not show acme\/brigade \(HTTP 404\)/);
  });

  test("GitHub pas joint : dit, sans bloquer", async () => {
    const lue = await lireLaFile(async () => assert.fail("getaddrinfo ENOTFOUND api.github.com"), DEPOT);
    assert.ok(!lue.lue);
    assert.equal(lue.horsLigne, true);
    assert.match(contexteDeLaFile({ nom: "brigade" }, lue), /file non lue : GitHub pas joint\n.*ENOTFOUND/);
  });

  test("un projet sans dépôt : dit qu'aucun dépôt n'est connu", () => {
    assert.match(contexteDeLaFile({ nom: "brigade" }, { lue: false, raison: "", sansDepot: true }), /\n\nfile non lue : aucun dépôt GitHub pour ce projet — ni `depot`/);
  });
});

describe("le crochet joué à la main", () => {
  test("il lit les issues par le `gh` du poste, et rend la file au format du contexte additionnel — rien d'autre que `gh` dans son PATH", { skip: SANS_SH }, (t) => {
    // Le faux `gh` rend la même liste à chaque appel : #5 est au feu, et carte du chef sans commentaire marqué.
    const gh = fauxGh(t, 0, JSON.stringify([{ number: 5, title: "Ticket 5", created_at: "2026-10-12T08:00:00Z", labels: [{ name: "fire" }] }]));
    const r = jouer(t, gh, "brigade", DEPOT);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.json?.hookSpecificOutput.hookEventName, "SessionStart");
    const contexte = r.json?.hookSpecificOutput.additionalContext ?? "";
    assert.match(contexte, /\n\nawaiting {3}1 decision awaits the chef\n {2}#5 {2}Ticket 5\nend awaiting\n\nrail {7}1 queued\n {2}#5 {2}queued {2}- {2}since 2026-10-12 08:00 UTC {2}Ticket 5$/);
    const recus = readFileSync(join(gh, "..", "recu"), "utf8").trim().split("\n");
    assert.match(recus[0] ?? "", new RegExp(`^api repos/${DEPOT}/issues\\?state=open&labels=fire&`));
    assert.ok(recus.some((recu) => recu.startsWith(`api repos/${DEPOT}/issues?state=open&labels=chef-todo&`)), recus.join("\n"));
    assert.ok(recus.every((recu) => recu.startsWith(`api repos/${DEPOT}/`)), recus.join("\n"));
  });

  test("GitHub qui refuse : dit, et la session n'est pas bloquée", { skip: SANS_SH }, (t) => {
    const r = jouer(t, fauxGh(t, 1, JSON.stringify({ message: "Not Found" }), "gh: Not Found (HTTP 404)"), "brigade", DEPOT);
    assert.equal(r.status, 0);
    assert.match(r.json?.hookSpecificOutput.additionalContext ?? "", /file non lue : GitHub pas lu\n.*HTTP 404/);
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

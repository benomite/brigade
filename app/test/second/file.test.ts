// La file du projet lue pour le second par un crochet SessionStart : déclaré dans les seuls réglages de l'onglet
// Second, joué à la main il rend le contexte que `claude` attend, et une file illisible est dite sans bloquer. La file
// est ce qui attend le chef, lu sur GitHub seul par le `gh` du poste (#1845, #2460) : ses issues, leurs labels, leurs
// commentaires — ni tableau de la cuisine, ni box, ni station. Que l'app et le second disent la même chose :
// test/tableau/attente-du-chef.test.ts.
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, test, type TestContext } from "node:test";
import { crochetsDeLaFile, MATCHER } from "../../src/second/crochet-de-la-file.ts";
import { appelParGh, contexteDeLaFile, contexteDeLEcriture, lireLaFile } from "../../src/second/file.ts";
import { argumentsDuSecond, reglagesDuSecond, type ReglagesDuSecond } from "../../src/second/lancement.ts";
import { ouvrirTerminaux, type Lancement } from "../../src/terminaux.ts";
import type { AppelGitHub } from "../../src/tableau/client.ts";

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

// Un faux `gh` qui rend, chemin par chemin, ce que GitHub tient du projet (`reponseA`) : il écrit chaque appel reçu.
// `attente` : ce que chaque appel met à répondre, en secondes.
// `depot` : ce qu'il rend du dépôt lui-même (`repos/<depot>`, ses `permissions`, #3163) — `[]` sans lui.
function ghDuProjet(t: TestContext, attente = 0, depot?: unknown): string {
  const d = dossier(t);
  const chemins = ["repos/x/issues?labels=fire", "repos/x/issues?labels=chef-todo", "repos/x/issues/8/comments", "repos/x/issues/20/comments"];
  chemins.forEach((chemin, rang) => writeFileSync(join(d, `${rang}.json`), JSON.stringify(reponseA(chemin))));
  const gh = join(d, "gh");
  const cas = ["*labels=fire*", "*labels=chef-todo*", "*/issues/8/comments*", "*/issues/20/comments*"].map((motif, rang) => `  ${motif}) /bin/cat '${join(d, `${rang}.json`)}' ;;`).join("\n");
  writeFileSync(join(d, "depot.json"), JSON.stringify(depot ?? []));
  const duDepot = `  repos/${DEPOT}) /bin/cat '${join(d, "depot.json")}' ;;`;
  writeFileSync(gh, `#!/bin/sh\necho "$@" >> '${join(d, "recu")}'\n${attente === 0 ? "" : `sleep ${attente}\n`}case "$2" in\n${duDepot}\n${cas}\n  *) echo '[]' ;;\nesac\n`);
  chmodSync(gh, 0o755);
  return gh;
}

// Le crochet tel que `claude` le joue : `node file.ts <nom> <depot> <gh>`, dans le dossier de la session.
function jouer(t: TestContext, gh: string, nom: string, depot: string) {
  const r = spawnSync(process.execPath, [SCRIPT, nom, depot, gh], { encoding: "utf8", cwd: dossier(t), env: { PATH: join(gh, ".."), HOME: dossier(t) } });
  return { ...r, json: r.stdout.trim() === "" ? undefined : (JSON.parse(r.stdout) as { hookSpecificOutput: { hookEventName: string; additionalContext: string } }) };
}

const DEPOT = "acme/brigade";
const LU = "2026-11-05T12:00:00.000Z";

// Ce que GitHub tient du projet : #8, en pass, sa livraison touche à ce qui la juge — la PR #2326 attend le chef ; #20, une
// carte `chef-todo` ; #1, sur le rail, n'attend rien. Rendu par chemin de l'API, comme `gh api` le rend.
const FIRE = [
  { number: 1, title: "Ticket 1", html_url: `https://github.com/${DEPOT}/issues/1`, created_at: "2026-11-01T00:00:00Z", labels: [{ name: "fire" }] },
  { number: 8, title: "Ticket 8", html_url: `https://github.com/${DEPOT}/issues/8`, created_at: "2026-11-01T00:00:00Z", labels: [{ name: "fire" }, { name: "in-pass" }, { name: "blocked-on-human" }] },
];
const CHEF = [{ number: 20, title: "Ticket 20", html_url: `https://github.com/${DEPOT}/issues/20`, created_at: "2026-11-01T00:00:00Z", labels: [{ name: "chef-todo" }] }];
const COMMENTAIRES: Record<number, unknown[]> = {
  8: [{ body: "Station `box/claude`: this delivery changes what judges it (`.github/workflows/ci.yml`), so it is not merged on the review alone. Review it and merge it by hand: PR #2326.", author_association: "OWNER", created_at: "2026-11-05T09:00:00Z" }],
  20: [{ body: "<!-- brigade:todo kind=blocked -->\nWhich token does the box use for the registry?", author_association: "OWNER", created_at: "2026-11-05T10:00:00Z" }],
};
// La réponse de GitHub à un chemin : la liste au label demandé, les commentaires d'une issue, rien d'autre.
function reponseA(chemin: string): unknown {
  const label = /[?&]labels=([^&]+)/.exec(chemin)?.[1];
  if (label === "fire") return FIRE;
  if (label === "chef-todo") return CHEF;
  const commentees = /\/issues\/(\d+)\/comments/.exec(chemin)?.[1];
  return commentees === undefined ? [] : (COMMENTAIRES[Number(commentees)] ?? []);
}
const github: AppelGitHub = async (chemin) => ({ status: 200, data: reponseA(chemin) });

// Le bloc `awaiting` que l'app et le second en lisent, bords compris.
const BLOC = [
  "awaiting   2 decisions await the chef — the oldest for 3 h 00",
  "  #8  for 3 h 00  Merge PR #2326 by hand? It changes what judges it. — merge PR #2326 on GitHub  Ticket 8",
  "  #20  for 2 h 00  Which token does the box use for the registry? — answer on its Todo card, in your own words  Ticket 20",
  "end awaiting",
].join("\n");

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

describe("la file lue sur GitHub seul, sans tableau de la cuisine ni autre machine", () => {
  test("ce qui attend le chef, chaque entrée avec sa question et son geste, dans le bloc `awaiting` — et l'heure de la lecture", async () => {
    const chemins: string[] = [];
    const lue = await lireLaFile(async (chemin) => (chemins.push(chemin), github(chemin)), DEPOT, () => new Date(LU));
    assert.ok(lue.lue, JSON.stringify(lue));
    assert.equal(lue.texte, `${BLOC}\n`);
    assert.equal(lue.lu, LU);
    assert.ok(!chemins.some((chemin) => chemin.includes("kitchen-board")), "the Kitchen board is never asked for");
    const contexte = contexteDeLaFile({ nom: "brigade", depot: DEPOT }, lue);
    assert.ok(contexte.endsWith(`\n\n${BLOC}`), contexte);
    assert.match(contexte, /from GitHub only — the issues of the project, their labels and their comments, not the Kitchen board/);
    assert.match(contexte, /the same items as the app's Todo, each with its question and its gesture/);
    assert.match(contexte, /do not run it again\. Read at 2026-11-05T12:00:00\.000Z, on acme\/brigade\./);
  });

  test("rien n'attend le chef : le bloc le dit, bords compris", async () => {
    const lue = await lireLaFile(async (chemin) => ({ status: 200, data: chemin.includes("labels=fire") ? [FIRE[0]] : [] }), DEPOT, () => new Date(LU));
    assert.ok(lue.lue);
    assert.match(contexteDeLaFile({ nom: "brigade" }, lue), /\n\nawaiting {3}nothing awaits the chef\nend awaiting$/);
  });

  test("GitHub qui refuse : dit en une phrase, jamais une file vide", async () => {
    const refus = await lireLaFile(async () => ({ status: 404, data: { message: "Not Found" } }), DEPOT);
    assert.ok(!refus.lue);
    assert.match(contexteDeLaFile({ nom: "brigade" }, refus), /file non lue : GitHub n'a pas rendu ce qui attend le chef\n.*HTTP 404/);
  });

  test("GitHub pas joint : dit, sans bloquer", async () => {
    const lue = await lireLaFile(async () => assert.fail("getaddrinfo ENOTFOUND api.github.com"), DEPOT);
    assert.match(contexteDeLaFile({ nom: "brigade" }, lue), /file non lue : GitHub pas joint\n.*ENOTFOUND/);
  });
});

describe("le crochet joué à la main", () => {
  test("il lit GitHub par le `gh` du poste, et rend la file au format du contexte additionnel — rien d'autre que `gh` dans son PATH", { skip: SANS_SH }, (t) => {
    const gh = ghDuProjet(t);
    const r = jouer(t, gh, "brigade", DEPOT);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.json?.hookSpecificOutput.hookEventName, "SessionStart");
    const contexte = r.json?.hookSpecificOutput.additionalContext ?? "";
    // Les durées se comptent jusqu'à la lecture : la même file que BLOC, à l'heure près.
    assert.equal(contexte.slice(contexte.indexOf("\n\nawaiting") + 2).replace(/for \d+ (?:d|h \d\d|min|s)\b/g, "for …"), BLOC.replace(/for \d+ (?:d|h \d\d|min|s)\b/g, "for …"), contexte);
    const recus = readFileSync(join(gh, "..", "recu"), "utf8");
    assert.match(recus, new RegExp(`^api repos/${DEPOT}/issues\\?state=open&labels=fire&`, "m"));
    assert.doesNotMatch(recus, /kitchen-board/);
  });

  test("un dépôt où le compte du poste ne peut pas écrire : la file, puis la ligne `Read-only:` et ce que le second ne peut pas y faire (#3163)", { skip: SANS_SH }, (t) => {
    const r = jouer(t, ghDuProjet(t, 0, { full_name: DEPOT, permissions: { admin: false, push: false, pull: true } }), "brigade", DEPOT);
    assert.equal(r.status, 0, r.stderr);
    const contexte = r.json?.hookSpecificOutput.additionalContext ?? "";
    assert.match(contexte, /\nend awaiting\n\nRead-only: your GitHub account cannot write to acme\/brigade\. .*you cannot change anything there/);
  });

  test("un dépôt où le compte écrit, ou dont GitHub ne dit pas l'écriture : aucune ligne `Read-only:`", { skip: SANS_SH }, (t) => {
    for (const depot of [{ full_name: DEPOT, permissions: { push: true } }, { full_name: DEPOT }]) {
      const r = jouer(t, ghDuProjet(t, 0, depot), "brigade", DEPOT);
      assert.equal(r.status, 0, r.stderr);
      assert.doesNotMatch(r.json?.hookSpecificOutput.additionalContext ?? "", /Read-only/);
    }
    assert.equal(contexteDeLEcriture(DEPOT, true), "");
    assert.equal(contexteDeLEcriture(DEPOT, null), "");
  });

  test("GitHub qui refuse : dit, et la session n'est pas bloquée", { skip: SANS_SH }, (t) => {
    const r = jouer(t, fauxGh(t, 1, JSON.stringify({ message: "Not Found" }), "gh: Not Found (HTTP 404)"), "brigade", DEPOT);
    assert.equal(r.status, 0);
    assert.match(r.json?.hookSpecificOutput.additionalContext ?? "", /file non lue : GitHub n'a pas rendu ce qui attend le chef\n.*HTTP 404/);
  });

  test("un projet sans dépôt, dans un dossier sans origine : dit qu'aucun dépôt n'est connu, et sort en 0", { skip: SANS_SH }, (t) => {
    const r = jouer(t, fauxGh(t, 0, "[]"), "brigade", "");
    assert.equal(r.status, 0);
    assert.match(r.json?.hookSpecificOutput.additionalContext ?? "", /file non lue : aucun dépôt GitHub pour ce projet/);
  });

  test("la lecture entière tient dans son délai, toutes ses vagues d'appels comprises : passé, la file est dite non lue, avant que `claude` ne tue le crochet", { skip: SANS_SH }, async (t) => {
    // Chaque appel répond en 0,4 s, sous le délai de 0,6 s ; mais les commentaires de #8 ne se demandent qu'une fois les
    // listes rendues : deux vagues, 0,8 s au moins — la seconde passe l'échéance commune.
    const lue = await lireLaFile(appelParGh(ghDuProjet(t, 0.4), 600), DEPOT);
    assert.ok(!lue.lue, JSON.stringify(lue));
    assert.match(contexteDeLaFile({ nom: "brigade" }, lue), /file non lue : GitHub pas joint\n.*no answer in 1 s/);
  });

  test("un gh introuvable : dit, et sort en 0", (t) => {
    const r = spawnSync(process.execPath, [SCRIPT, "brigade", DEPOT, join(dossier(t), "gh-absent")], { encoding: "utf8" });
    assert.equal(r.status, 0);
    assert.match((JSON.parse(r.stdout) as { hookSpecificOutput: { additionalContext: string } }).hookSpecificOutput.additionalContext, /file non lue : GitHub pas joint/);
  });
});

// Les gates d'un projet neuf tant que son ticket de fondation n'est pas servi
// (#3188) : la règle seule, puis la station de ce runtime qui la tient sur le
// chemin du merge — celui de l'espace (#2456), sans CI sur les PR, où la
// station joue les gates de la tête approuvée.
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { priseDeLaStation, stationDuDepot, type Lancer } from "../../src/brigade-github.ts";
import { gatesProvisoires, gatesQuiNeJugentPas, LABEL_FONDATION } from "../../src/fondation/fondation.ts";
import { MARQUE_DEJA_SERVI } from "../../src/deja-servi.ts";
import type { GitHub } from "../../src/github.ts";
import { MARQUE_D_ECHEC } from "../../src/qualite-github.ts";
import { CALIBRE, FauxGitHub, fauxClient } from "../faux-github.ts";

const PROVISOIRES = `# Project\n\n## Équipe multi-agents (plugin brigade)\n\n- **Gates** : \`.claude/brigade/gates.sh <WT>\`\n- **Gates provisoires** : until #1 ("Lay the project's foundation with TypeScript on Node") is merged — \`npm test\` has no test to run yet\n`;
const REELLES = `# Project\n\n## Équipe multi-agents (plugin brigade)\n\n- **Gates** : \`.claude/brigade/gates.sh <WT>\`\n`;

const worktreeAvec = (t: TestContext, claudeMd: string | null) => {
  const worktree = mkdtempSync(join(tmpdir(), "brigade-fondation-"));
  t.after(() => rmSync(worktree, { recursive: true, force: true }));
  if (claudeMd !== null) writeFileSync(join(worktree, "CLAUDE.md"), claudeMd);
  return worktree;
};
const ouverte = async () => ({ state: "open" as const });
const fermee = async () => ({ state: "closed" as const });

test("the `Gates provisoires` binding names the foundation ticket that makes the gates real; without it the gates are the real ones", () => {
  assert.deepEqual(gatesProvisoires(PROVISOIRES), { fondation: 1 });
  assert.deepEqual(gatesProvisoires("- **Gates provisoires** : until the foundation ticket is filed and merged"), { fondation: null });
  assert.equal(gatesProvisoires(REELLES), null);
});

test("an ordinary delivery on provisional gates, the foundation ticket unserved, is judged by nothing: 'nothing checked', never green", async (t) => {
  const motif = await gatesQuiNeJugentPas(worktreeAvec(t, PROVISOIRES), { labels: ["fire"] }, ouverte);
  assert.match(motif ?? "", /^nothing checked — the gates run nothing until the foundation ticket #1 is merged/);
  // Sans numéro, ou le ticket de fondation disparu : rien ne les rend réelles.
  assert.match((await gatesQuiNeJugentPas(worktreeAvec(t, "- **Gates provisoires** : until the foundation ticket is filed and merged\n"), { labels: [] }, fermee)) ?? "", /^nothing checked — the gates run nothing until the foundation ticket is filed and merged/);
  assert.match((await gatesQuiNeJugentPas(worktreeAvec(t, PROVISOIRES), { labels: [] }, async () => null)) ?? "", /^nothing checked — .*#1, which no longer exists/);
});

test("the foundation ticket's own delivery, and every delivery once it is served, play the gates; so does a project with no provisional binding or no CLAUDE.md", async (t) => {
  assert.equal(await gatesQuiNeJugentPas(worktreeAvec(t, PROVISOIRES), { labels: ["fire", LABEL_FONDATION] }, () => assert.fail("the foundation's delivery reads nothing")), null);
  assert.equal(await gatesQuiNeJugentPas(worktreeAvec(t, PROVISOIRES), { labels: ["fire"] }, fermee), null);
  assert.equal(await gatesQuiNeJugentPas(worktreeAvec(t, REELLES), { labels: ["fire"] }, () => assert.fail("nothing to read")), null);
  assert.equal(await gatesQuiNeJugentPas(worktreeAvec(t, null), { labels: ["fire"] }, () => assert.fail("nothing to read")), null);
});

test("an unreadable CLAUDE.md, or a foundation ticket GitHub does not return, decides nothing: it is said, and the gates do not judge", async (t) => {
  const illisible = worktreeAvec(t, null);
  mkdirSync(join(illisible, "CLAUDE.md"));
  assert.match((await gatesQuiNeJugentPas(illisible, { labels: [] }, () => assert.fail("not read"))) ?? "", /^the `CLAUDE\.md` of the delivery could not be read/);
  const motif = await gatesQuiNeJugentPas(worktreeAvec(t, PROVISOIRES), { labels: [] }, async () => {
    throw new Error("HTTP 502");
  });
  assert.equal(motif, "the foundation ticket #1 could not be read on GitHub to know whether it is served: HTTP 502");
});

const fluxQuiConclut = (texte: string) => `${JSON.stringify({ type: "result", is_error: false, result: texte })}\n`;

// La station de ce runtime sur un projet sans CI sur ses PR : ses worktrees
// portent `claudeMd` et des gates qui notent où elles tournent, vertes ou
// rouges. Elle cuit, relit et merge `ticket` ; rend ce qu'elle a dit et fait.
async function servir(t: TestContext, { faux, ticket, claudeMd, rouges = false }: { faux: FauxGitHub; ticket: number; claudeMd: string; rouges?: boolean }) {
  const repertoire = mkdtempSync(join(tmpdir(), "brigade-fondation-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const lancer: Lancer = ({ args, flux }) => {
    writeFileSync(flux, fluxQuiConclut(args.includes("--tools") ? JSON.stringify({ verdict: "vert", resume: "Looks right.", constats: [] }) : "done"));
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 1, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const journal = join(repertoire, "gates.log");
  const worktreeDe = (run: string) => {
    const worktree = join(repertoire, run);
    mkdirSync(join(worktree, ".claude/brigade"), { recursive: true });
    writeFileSync(join(worktree, "CLAUDE.md"), claudeMd);
    const script = join(worktree, ".claude/brigade/gates.sh");
    writeFileSync(script, `#!/bin/sh\necho "npm test in $1" >> "${journal}"\n${rouges ? 'echo "FAIL  adds two numbers"\nexit 1' : 'echo "PASS  adds two numbers"'}\n`);
    chmodSync(script, 0o755);
    return worktree;
  };
  const avertis: string[] = [];
  const bas = faux.pour("box");
  const station = stationDuDepot({
    nom: "box",
    places: 1,
    base: "main",
    depotGitHub: "faux/neuf",
    github: { ...fauxClient(faux), ci: async (sha) => (await bas.ci(sha)).map((check) => ({ ...check, conclusion: "", url: null })), statuts: bas.statuts, poserStatut: bas.poserStatut } as GitHub,
    depot: {
      connait: () => false,
      preparer: async (run) => ({ worktree: worktreeDe(run), branche: `cook/${run}` }),
      reprendre: async (run) => worktreeDe(run),
      retirer: () => {},
      ranger: async () => null,
      pousser: () => {},
      commits: () => 1,
      changes: () => ["src/app.ts"],
      diff: () => "diff --git a/src/app.ts b/src/app.ts\n+x\n",
      tete: (branche) => faux.prs.findLast((p) => p.branche === branche)?.sha ?? "",
      vue: () => "e5ba5e",
      fichiers: () => ["src/app.ts"],
      lire: () => null,
    },
    prise: priseDeLaStation,
    claude: "claude",
    env: {},
    cloison: null,
    plafonds: { durationMs: 60_000, tokens: 1_000, idleMs: 60_000 },
    graceMs: 1,
    reviewer: { model: "sonnet", effort: "medium" },
    flux: repertoire,
    lancer,
    gates: { delaiMs: 2_000 },
    avertir: (texte) => void avertis.push(texte),
  });
  assert.ok(!("refus" in station));
  if ("refus" in station) throw new Error("inaccessible");
  await station.tour();
  await station.calme();
  const pr = faux.prs.find((p) => p.issue === ticket);
  assert.ok(pr, "the cook's delivery is in the pass");
  faux.sansCI.add(pr.number);
  const statuts = () => (faux.statutsDeCommit.get(pr.sha) ?? []).map(({ state, description }) => [state, description]);
  for (let tour = 0; tour < 4 && faux.mergee(ticket) === undefined && !statuts().some(([state]) => state === "failure"); tour += 1) {
    await station.tour();
    await station.calme();
  }
  return { avertis, statuts: statuts(), gatesJouees: existsSync(journal) ? readFileSync(journal, "utf8") : "" };
}

test("before the foundation ticket is served, an ordinary delivery is not merged on gates that run nothing, and the station says why — 'nothing checked', never a green status", async (t) => {
  const faux = new FauxGitHub();
  faux.feu(1, [LABEL_FONDATION]);
  faux.feu(757, CALIBRE);
  const { avertis, statuts, gatesJouees } = await servir(t, { faux, ticket: 757, claudeMd: PROVISOIRES });
  assert.equal(faux.mergee(757), undefined);
  assert.deepEqual(statuts, [], "no status, green least of all, is posted on gates that run nothing");
  assert.equal(gatesJouees, "");
  assert.ok(
    avertis.some((texte) => /the gates of PR #\d+ \(#757\) are not run on box — nothing checked — the gates run nothing until the foundation ticket #1 is merged/.test(texte)),
    avertis.join("\n"),
  );
});

test("the foundation ticket's own delivery is not blocked by the provisional gates: the gates it brings run on its branch, the review approves, and it is merged", async (t) => {
  const faux = new FauxGitHub();
  faux.feu(1, [...CALIBRE, LABEL_FONDATION]);
  const { statuts, gatesJouees } = await servir(t, { faux, ticket: 1, claudeMd: PROVISOIRES });
  assert.equal(faux.mergee(1)?.mergeePar, "box");
  assert.match(gatesJouees, /^npm test in .*\n$/);
  assert.deepEqual(statuts, [
    ["pending", "Gates running on station box"],
    ["success", "Gates green on station box"],
  ]);
});

test("once the foundation delivery is merged, the gates run the real test command and judge an ordinary delivery: red, it is not merged", async (t) => {
  const faux = new FauxGitHub();
  faux.feu(1, [LABEL_FONDATION]);
  faux.ticket(1).state = "closed";
  faux.feu(757, CALIBRE);
  const { statuts, gatesJouees } = await servir(t, { faux, ticket: 757, claudeMd: PROVISOIRES, rouges: true });
  assert.equal(faux.mergee(757), undefined);
  assert.match(gatesJouees, /^npm test in /);
  assert.deepEqual(statuts, [
    ["pending", "Gates running on station box"],
    ["failure", "Gates red on station box: FAIL  adds two numbers"],
  ]);
});

test("once the foundation delivery is merged, an ordinary delivery whose real gates are green is merged", async (t) => {
  const faux = new FauxGitHub();
  faux.feu(1, [LABEL_FONDATION]);
  faux.ticket(1).state = "closed";
  faux.feu(757, CALIBRE);
  const { gatesJouees } = await servir(t, { faux, ticket: 757, claudeMd: REELLES });
  assert.equal(faux.mergee(757)?.mergeePar, "box");
  assert.match(gatesJouees, /^npm test in /);
});

// Un cook qui affirme son ticket déjà servi sur la base (#3146) : la station
// ne le confirme pas sur des gates qui ne jouent rien.
test("before the foundation ticket is served, a cook's 'already served' claim is not confirmed on gates that run nothing: an ordinary failed attempt, 'nothing checked'", async (t) => {
  const repertoire = mkdtempSync(join(tmpdir(), "brigade-fondation-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const faux = new FauxGitHub();
  faux.feu(1, [LABEL_FONDATION]);
  faux.feu(757, CALIBRE);
  const sha = "0123456789abcdef0123456789abcdef01234567";
  const lancer: Lancer = ({ flux }) => {
    writeFileSync(flux, fluxQuiConclut(`<livrable>\n<deja-servi>Commit ${sha.slice(0, 9)} on main does it.</deja-servi>\n</livrable>`));
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 12, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const station = stationDuDepot({
    nom: "box",
    places: 1,
    base: "main",
    depotGitHub: "faux/neuf",
    github: fauxClient(faux),
    depot: {
      connait: () => false,
      preparer: async (run) => {
        const worktree = join(repertoire, run);
        mkdirSync(join(worktree, ".claude", "brigade"), { recursive: true });
        writeFileSync(join(worktree, "CLAUDE.md"), PROVISOIRES);
        writeFileSync(join(worktree, ".claude", "brigade", "gates.sh"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
        return { worktree, branche: "cook/757-github" };
      },
      reprendre: async (run) => join(repertoire, run),
      retirer: () => {},
      ranger: async () => null,
      pousser: () => {},
      commits: () => 0,
      changes: () => [],
      diff: () => "",
      tete: () => "a".repeat(40),
      lancerGit: async (args) => ({ code: 0, stdout: args[0] === "rev-parse" ? `${sha}\n` : "", stderr: "" }),
    },
    prise: priseDeLaStation,
    claude: "claude",
    env: {},
    cloison: null,
    plafonds: { durationMs: 60_000, tokens: 1_000, idleMs: 60_000 },
    graceMs: 1,
    reviewer: { model: "sonnet", effort: "medium" },
    gates: { delaiMs: 1_500 },
    flux: repertoire,
    lancer,
    avertir: () => {},
  });
  assert.ok(!("refus" in station));
  if ("refus" in station) return;
  await station.tour();
  await station.calme();
  const corps = (faux.commentaires.get(757) ?? []).map((c) => c.body);
  assert.equal(corps.filter((c) => c.startsWith(MARQUE_DEJA_SERVI)).length, 0);
  assert.match(corps.find((c) => c.startsWith(MARQUE_D_ECHEC)) ?? "", /nothing checked — the gates run nothing until the foundation ticket #1 is merged/);
  assert.equal(faux.ticket(757).state, "open");
});

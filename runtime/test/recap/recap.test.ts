// Le récapitulatif d'un projet (#3581), par la commande `recap` que l'app joue
// là où la cuisine du projet tourne : les tickets servis et leur PR, ceux que la
// pass a renvoyés ou refusés et pourquoi, ce qu'un garde-fou a arrêté — depuis
// le marqueur « vu jusqu'à », qui n'avance que quand l'app dit l'avoir montré.
// GitHub est un faux derrière le vrai client (`github.ts`, son transport) ; le
// journal est un vrai journal ; chaque appel de la commande est un process neuf
// du runtime, qui ne garde rien en mémoire d'un appel à l'autre.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { Sortie } from "../../src/appel.ts";
import { ouvrirGitHub, type Transport } from "../../src/github.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { principal } from "../../src/recap/commande.ts";
import { repertoireTemporaire } from "../outils.ts";

// Le marqueur, dans le répertoire d'état du projet (recap/marqueur.ts).
const FICHIER_DU_RECAP = "recap.json";

const DEPOT = "acme/kitchen";
const API = "https://api.github.com/";

// Le faux GitHub : une réponse par chemin, sans le préfixe de l'API.
type Monde = (chemin: string) => { status: number; data: unknown; link?: string };
const transport = (monde: Monde, appels: string[] = []): Transport => async (args) => {
  const chemin = (args.at(-1) ?? "").replace(API, "");
  appels.push(chemin);
  const { status, data, link } = monde(chemin);
  const entetes = ["Content-Type: application/json", ...(link === undefined ? [] : [`Link: <${API}${link}>; rel="next"`])];
  return { erreur: status >= 400 ? new Error(`HTTP ${status}`) : null, stdout: `HTTP/2.0 ${status} X\r\n${entetes.join("\r\n")}\r\n\r\n${JSON.stringify(data)}`, stderr: "" };
};

const pr = (number: number, ticket: number | null, mergedAt: string | null, extra: object = {}) => ({
  number,
  html_url: `https://github.com/${DEPOT}/pull/${number}`,
  title: ticket === null ? "Bump a dependency" : `#${ticket} — Ticket ${ticket}`,
  body: ticket === null ? "" : `Closes #${ticket}\n\nCooked by station \`box/claude\`.`,
  head: { ref: ticket === null ? "deps" : `cook/${ticket}-github`, sha: "a".repeat(40) },
  base: { ref: "main" },
  state: "closed",
  merged_at: mergedAt,
  updated_at: mergedAt ?? "2026-11-10T08:00:00Z",
  ...extra,
});
const renvoi = (issue: number, n: number, raison: string, le: string, association = "OWNER") => ({
  body:
    n > 2
      ? `<!-- brigade:renvoi n=${n} sha=7579211 -->\nStation \`box/claude\`: still not mergeable after ${n - 1} sends back — ${raison}\n\nSet aside by its failure count (\`set-aside:failures\`): its calibration is at the cap. A human decides.`
      : `<!-- brigade:renvoi n=${n} sha=7579211 -->\nStation \`box/claude\`: sent back to a cook (${n}/2) — ${raison}\n- \`app tests\`\n\nThe next cook takes up the branch of PR #9, fixes what is said above, and delivers again.`,
  user: { login: "brigade-station" },
  author_association: association,
  created_at: le,
  issue_url: `${API}repos/${DEPOT}/issues/${issue}`,
});

type Faits = { prs?: unknown[]; commentaires?: unknown[]; refuse?: boolean };
const monde = (faits: () => Faits): Monde => (chemin) => {
  const { prs = [], commentaires = [], refuse = false } = faits();
  if (refuse) return { status: 502, data: { message: "Bad Gateway" } };
  if (chemin.startsWith(`repos/${DEPOT}/pulls?state=closed`)) return { status: 200, data: prs };
  if (chemin.startsWith(`repos/${DEPOT}/issues/comments?`)) {
    const depuis = Date.parse(/since=([^&]+)/.exec(chemin)?.[1] ?? "");
    return { status: 200, data: (commentaires as { created_at: string }[]).filter(({ created_at }) => Date.parse(created_at) >= depuis) };
  }
  return { status: 404, data: { message: "Not Found" } };
};

// Un journal de projet où le runtime a écrit ses faits de garde-fous, chacun à son instant.
function journalAvec(etat: string, faits: { at: string; ticket: number | null; type: string; payload: object }[]): void {
  let instant = new Date("2026-11-01T00:00:00Z");
  const journal = ouvrirJournal(etat, { maintenant: () => instant });
  for (const { at, ticket, type, payload } of faits) {
    instant = new Date(at);
    journal.ajouter({ project: "kitchen", ticket, type, author: "runtime", payload } as Parameters<typeof journal.ajouter>[0]);
  }
  journal.fermer();
}

async function recap(etat: string, faits: () => Faits, maintenant: string, ...reste: string[]) {
  const sortie: string[] = [];
  const erreur: string[] = [];
  let code = 0;
  try {
    await principal(
      { args: [DEPOT, ...reste], env: { BRIGADE_STATE_DIR: etat }, dire: (ligne) => sortie.push(ligne), redire: (ligne) => erreur.push(ligne) },
      () => new Date(maintenant),
      (depot) => ouvrirGitHub({ depot, bin: "gh", transport: transport(monde(faits)) }),
    );
  } catch (e) {
    if (!(e instanceof Sortie)) throw e;
    code = e.code;
  }
  return { code, json: sortie.length === 1 ? JSON.parse(sortie[0] ?? "") : undefined, erreur: erreur.join("\n") };
}

const etatAvecJournal = (t: TestContext, faits: Parameters<typeof journalAvec>[1] = []) => {
  const etat = repertoireTemporaire(t);
  journalAvec(etat, faits);
  return etat;
};

describe("the recap command", () => {
  test("served tickets since the marker, each with the pull request that served it; nothing older, unmerged or ticketless", async (t: TestContext) => {
    const etat = etatAvecJournal(t);
    writeFileSync(join(etat, FICHIER_DU_RECAP), JSON.stringify({ seenUntil: "2026-11-10T00:00:00.000Z" }));
    const faits = () => ({
      prs: [
        pr(41, 12, "2026-11-10T09:00:00Z"),
        pr(40, 11, "2026-11-10T08:00:00Z"),
        pr(39, null, "2026-11-10T07:00:00Z"),
        pr(38, 10, null),
        pr(37, 12, "2026-11-10T06:00:00Z"),
        pr(36, 9, "2026-11-09T23:00:00Z"),
      ],
    });
    const lu = await recap(etat, faits, "2026-11-10T10:00:00Z");
    assert.equal(lu.code, 0, lu.erreur);
    assert.equal(lu.json.since, "2026-11-10T00:00:00.000Z");
    assert.equal(lu.json.until, "2026-11-10T10:00:00.000Z");
    assert.deepEqual(lu.json.served, [
      { ticket: 12, title: "Ticket 12", url: `https://github.com/${DEPOT}/issues/12`, pr: 41, prUrl: `https://github.com/${DEPOT}/pull/41`, servedAt: "2026-11-10T09:00:00Z" },
      { ticket: 11, title: "Ticket 11", url: `https://github.com/${DEPOT}/issues/11`, pr: 40, prUrl: `https://github.com/${DEPOT}/pull/40`, servedAt: "2026-11-10T08:00:00Z" },
    ]);
  });

  test("each ticket the pass sent back or refused, with its reason on one line — its latest, from a trusted author only", async (t: TestContext) => {
    const etat = etatAvecJournal(t);
    writeFileSync(join(etat, FICHIER_DU_RECAP), JSON.stringify({ seenUntil: "2026-11-10T00:00:00.000Z" }));
    const faits = () => ({
      commentaires: [
        renvoi(20, 1, "the CI is red on `7579211` (PR #9):", "2026-11-10T01:00:00Z"),
        renvoi(20, 2, "the review requested changes on `8888888` (PR #9):", "2026-11-10T03:00:00Z"),
        renvoi(21, 3, "the PR conflicts with the base", "2026-11-10T02:00:00Z"),
        renvoi(22, 1, "anyone can write this", "2026-11-10T02:30:00Z", "NONE"),
        { body: "A plain comment", user: { login: "x" }, author_association: "OWNER", created_at: "2026-11-10T04:00:00Z", issue_url: `${API}repos/${DEPOT}/issues/23` },
      ],
    });
    const lu = await recap(etat, faits, "2026-11-10T10:00:00Z");
    assert.equal(lu.code, 0, lu.erreur);
    assert.deepEqual(lu.json.sentBack, [
      { ticket: 20, url: `https://github.com/${DEPOT}/issues/20`, kind: "sent-back", reason: "the review requested changes on `8888888` (PR #9)", at: "2026-11-10T03:00:00Z" },
      { ticket: 21, url: `https://github.com/${DEPOT}/issues/21`, kind: "refused", reason: "the PR conflicts with the base", at: "2026-11-10T02:00:00Z" },
    ]);
  });

  test("one line per guardrail stop since the marker: what was stopped, and by which guardrail", async (t: TestContext) => {
    const etat = etatAvecJournal(t, [
      { at: "2026-11-09T20:00:00Z", ticket: 30, type: "guard.tripped", payload: { run: "30-a", reason: "duration", limit: 1, observed: 2 } },
      { at: "2026-11-10T01:00:00Z", ticket: 31, type: "guard.tripped", payload: { run: "31-a", reason: "duration", limit: 1, observed: 2 } },
      { at: "2026-11-10T02:00:00Z", ticket: 32, type: "guard.tripped", payload: { run: "32-a", reason: "tokens", limit: 1, observed: 2 } },
      { at: "2026-11-10T03:00:00Z", ticket: 33, type: "guard.tripped", payload: { run: "33-a", reason: "idle", limit: 1, observed: 2 } },
      { at: "2026-11-10T04:00:00Z", ticket: null, type: "breaker.opened", payload: { failures: 3, threshold: 3 } },
      { at: "2026-11-10T05:00:00Z", ticket: null, type: "kitchen.stopped", payload: {} },
      { at: "2026-11-10T05:00:00Z", ticket: 34, type: "guard.tripped", payload: { run: "34-a", reason: "stop", limit: null, observed: null } },
    ]);
    writeFileSync(join(etat, FICHIER_DU_RECAP), JSON.stringify({ seenUntil: "2026-11-10T00:00:00.000Z" }));
    const lu = await recap(etat, () => ({}), "2026-11-10T10:00:00Z");
    assert.equal(lu.code, 0, lu.erreur);
    assert.deepEqual(
      lu.json.stops.map(({ guardrail, ticket, line }: { guardrail: string; ticket: number | null; line: string }) => [guardrail, ticket, line]),
      [
        ["duration", 31, "The cook of #31 was stopped by the duration cap."],
        ["tokens", 32, "The cook of #32 was stopped by the tokens cap."],
        ["breaker", null, "The kitchen was stopped by the breaker, after 3 failures in a row."],
        ["stop", null, "The kitchen was stopped by the chef's stop."],
        ["stop", 34, "The cook of #34 was stopped by the chef's stop."],
      ],
    );
  });

  test("nothing since the marker: every list is empty — the app says nothing happened", async (t: TestContext) => {
    const etat = etatAvecJournal(t);
    const lu = await recap(etat, () => ({ prs: [pr(1, 1, "2026-10-01T00:00:00Z")] }), "2026-11-10T10:00:00Z");
    assert.equal(lu.code, 0, lu.erreur);
    assert.deepEqual([lu.json.served, lu.json.sentBack, lu.json.stops], [[], [], []]);
    // Sans marqueur, le récapitulatif couvre la semaine d'avant.
    assert.equal(lu.json.since, "2026-11-03T10:00:00.000Z");
  });

  test("marked seen, the recap is not shown again after a runtime restart: only what is newer than the marker comes back", async (t: TestContext) => {
    const etat = etatAvecJournal(t, [{ at: "2026-11-10T09:00:00Z", ticket: 31, type: "guard.tripped", payload: { run: "31-a", reason: "tokens", limit: 1, observed: 2 } }]);
    let prs = [pr(41, 12, "2026-11-10T09:00:00Z")];
    let commentaires = [renvoi(20, 1, "the CI is red", "2026-11-10T09:30:00Z")];
    const faits = () => ({ prs, commentaires });
    const premier = await recap(etat, faits, "2026-11-10T10:00:00Z");
    assert.deepEqual([premier.json.served.length, premier.json.sentBack.length, premier.json.stops.length], [1, 1, 1]);
    // Lu, mais pas montré : rien n'avance, la relecture redit la même chose.
    assert.deepEqual((await recap(etat, faits, "2026-11-10T10:05:00Z")).json.served.map(({ ticket }: { ticket: number }) => ticket), [12]);
    // L'app l'a montré : le marqueur avance jusqu'à l'instant que ce récapitulatif couvrait.
    assert.deepEqual((await recap(etat, faits, "2026-11-10T10:06:00Z", "seen", premier.json.until)).json, { ok: true, seenUntil: "2026-11-10T10:00:00.000Z" });
    assert.deepEqual(JSON.parse(readFileSync(join(etat, FICHIER_DU_RECAP), "utf8")), { seenUntil: "2026-11-10T10:00:00.000Z" });
    // Rouvert plus tard — un autre process du runtime : ce qui a été vu ne revient pas, ce qui est plus neuf vient.
    journalAvec(etat, [{ at: "2026-11-10T11:00:00Z", ticket: 35, type: "guard.tripped", payload: { run: "35-a", reason: "duration", limit: 1, observed: 2 } }]);
    prs = [pr(42, 13, "2026-11-10T10:30:00Z"), ...prs];
    commentaires = [...commentaires, renvoi(21, 1, "the review requested changes", "2026-11-10T10:40:00Z")];
    const suivant = await recap(etat, faits, "2026-11-10T12:00:00Z");
    assert.equal(suivant.json.since, "2026-11-10T10:00:00.000Z");
    assert.deepEqual(suivant.json.served.map(({ ticket }: { ticket: number }) => ticket), [13]);
    assert.deepEqual(suivant.json.sentBack.map(({ ticket }: { ticket: number }) => ticket), [21]);
    assert.deepEqual(suivant.json.stops.map(({ ticket }: { ticket: number }) => ticket), [35]);
  });

  test("the marker never goes back, never beyond now, and only to an instant", async (t: TestContext) => {
    const etat = etatAvecJournal(t);
    assert.deepEqual((await recap(etat, () => ({}), "2026-11-10T10:00:00Z", "seen", "2026-11-10T09:00:00Z")).json, { ok: true, seenUntil: "2026-11-10T09:00:00.000Z" });
    assert.deepEqual((await recap(etat, () => ({}), "2026-11-10T10:00:00Z", "seen", "2026-11-10T08:00:00Z")).json, { ok: true, seenUntil: "2026-11-10T09:00:00.000Z" });
    const futur = await recap(etat, () => ({}), "2026-11-10T10:00:00Z", "seen", "2026-11-11T00:00:00Z");
    assert.equal(futur.code, 1);
    assert.match(futur.json.message, /still to come/);
    const pasUnInstant = await recap(etat, () => ({}), "2026-11-10T10:00:00Z", "seen", "yesterday");
    assert.equal(pasUnInstant.code, 1);
    assert.match(pasUnInstant.json.message, /is not an instant/);
    assert.deepEqual(JSON.parse(readFileSync(join(etat, FICHIER_DU_RECAP), "utf8")), { seenUntil: "2026-11-10T09:00:00.000Z" });
  });

  test("an unreadable marker is said, never read as none nor rewritten", async (t: TestContext) => {
    const etat = etatAvecJournal(t);
    writeFileSync(join(etat, FICHIER_DU_RECAP), "{not json");
    const lu = await recap(etat, () => ({}), "2026-11-10T10:00:00Z");
    assert.equal(lu.code, 1);
    assert.match(lu.erreur, /the recap is not read — recap\.json is not JSON/);
    const vu = await recap(etat, () => ({}), "2026-11-10T10:00:00Z", "seen", "2026-11-10T09:00:00Z");
    assert.equal(vu.code, 1);
    assert.match(vu.json.message, /recap\.json is not JSON/);
    assert.equal(readFileSync(join(etat, FICHIER_DU_RECAP), "utf8"), "{not json");
  });

  test("GitHub or the log unreadable: the recap is not read, says why, and the marker stays", async (t: TestContext) => {
    const etat = etatAvecJournal(t);
    const github = await recap(etat, () => ({ refuse: true }), "2026-11-10T10:00:00Z");
    assert.equal(github.code, 1);
    assert.equal(github.json, undefined);
    assert.match(github.erreur, /^brigade: the recap is not read — gh api repos\/acme\/kitchen\/pulls\?state=closed.* : HTTP 502/);
    const sansJournal = await recap(repertoireTemporaire(t), () => ({}), "2026-11-10T10:00:00Z");
    assert.equal(sansJournal.code, 1);
    assert.match(sansJournal.erreur, /the recap is not read — the guardrail stops: no log in/);
  });

  test("a usage that does not read exits 2", async (t: TestContext) => {
    const etat = etatAvecJournal(t);
    for (const args of [[], ["seen"], ["seen", "2026-11-10T09:00:00Z"], ["oops", "2026-11-10T09:00:00Z"]]) {
      const sortie: string[] = [];
      let code = 0;
      try {
        await principal({ args: args.length === 0 ? [] : args[0] === "seen" ? args : [DEPOT, ...args], env: { BRIGADE_STATE_DIR: etat }, dire: (l) => sortie.push(l), redire: () => {} });
      } catch (e) {
        if (!(e instanceof Sortie)) throw e;
        code = e.code;
      }
      assert.equal(code, 2, args.join(" "));
    }
  });
});

describe("the merged pull requests read for the recap", () => {
  test("page after page until a pull request updated before the instant — never further", async () => {
    const appels: string[] = [];
    const page = (n: number, depuis: number) => Array.from({ length: 100 }, (_, i) => pr(n * 1000 + i, n * 1000 + i, new Date(depuis - i * 60_000).toISOString()));
    const premiere = page(1, Date.parse("2026-11-10T09:00:00Z"));
    const seconde = page(2, Date.parse("2026-11-09T12:00:00Z"));
    const github = ouvrirGitHub({
      depot: DEPOT,
      bin: "gh",
      transport: transport((chemin) => (chemin.includes("page=2") ? { status: 200, data: seconde, link: `repos/${DEPOT}/pulls?state=closed&page=3` } : chemin.includes("page=3") ? { status: 200, data: [] } : { status: 200, data: premiere, link: `repos/${DEPOT}/pulls?state=closed&page=2` }), appels),
    });
    const lues = await github.prsMergeesDepuis("2026-11-09T11:00:00Z");
    assert.equal(lues.length, 100 + 61);
    assert.equal(appels.filter((chemin) => chemin.includes("/pulls?")).length, 2);
  });

  test("more than 10 pages since the instant: it fails rather than cut the list", async () => {
    const pleine = Array.from({ length: 100 }, (_, i) => pr(i + 1, i + 1, "2026-11-10T09:00:00Z"));
    const github = ouvrirGitHub({ depot: DEPOT, bin: "gh", transport: transport(() => ({ status: 200, data: pleine, link: `repos/${DEPOT}/pulls?state=closed&page=next` })) });
    await assert.rejects(github.prsMergeesDepuis("2026-11-01T00:00:00Z"), /more than 1000 closed pull requests since 2026-11-01T00:00:00Z/);
  });
});

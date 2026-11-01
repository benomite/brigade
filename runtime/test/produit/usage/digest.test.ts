// Le digest d'usage que lit le rôle produit : des journaux écrits comme le
// runtime les écrit, relus sur une période, pour un projet nommé.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { ouvrirJournal, type Journal } from "../../../src/journal.ts";
import { digestDUsage, lireDigestDUsage, SEUIL_DE_RECURRENCE, type DigestDUsage, type Preuve } from "../../../src/produit/usage/digest.ts";
import { repertoireTemporaire } from "../../outils.ts";

const PROJET = "brigade";
const DEPOT = "acme/brigade";
const DEBUT = "2026-10-08T10:00:00.000Z";
// Une journée qui commence après le premier fait écrit.
const PERIODE = { from: "2026-10-08T10:00:00.000Z", to: "2026-10-09T00:00:00.000Z" };

const FAIL_RUNTIME = "FAIL  tests du runtime en échec — rejoue : npm --prefix runtime test";
const FAIL_MIROIR = "FAIL  miroir périmé : commands/chef.md";
// Une ligne FAIL dans une signature : ses blancs ramenés à un seul.
const signee = (ligne: string) => ligne.replace(/\s+/g, " ");

type Cuisine = { repertoire: string; journal: Journal; aller: (iso: string) => void; ecrire: (ticket: number | null, fait: object, projet?: string) => void };

// Un journal dont l'horloge avance d'une seconde par fait, et qu'on déplace.
function cuisine(t: TestContext, projet = PROJET): Cuisine {
  const repertoire = repertoireTemporaire(t);
  let instant = Date.parse(DEBUT);
  const journal = ouvrirJournal(repertoire, {
    maintenant: () => {
      const date = new Date(instant);
      instant += 1000;
      return date;
    },
  });
  t.after(() => journal.fermer());
  return {
    repertoire,
    journal,
    aller: (iso) => void (instant = Date.parse(iso)),
    ecrire: (ticket, fait, auNom = projet) => void journal.ajouter({ project: auNom, ticket, author: "runtime", ...fait } as never),
  };
}

let runs = 0;
const LIMITES = { durationMs: 3_600_000, tokens: 2_000_000, idleMs: 600_000 };

// Ce que les stations, la pass et le nettoyage écrivent.
function gestes({ ecrire }: Cuisine, projet = PROJET) {
  const noter = (ticket: number | null, fait: object) => ecrire(ticket, fait, projet);
  return {
    prendre: (ticket: number) => noter(ticket, { type: "ticket.taken", payload: { station: "box/claude", leaseUntil: "2026-10-09T00:00:00.000Z" } }),
    // Un cook qui livre : rend son run.
    cuire: (ticket: number, outcome = "ok") => {
      const run = `run-${++runs}`;
      noter(ticket, { type: "cook.launched", payload: { run, limits: LIMITES, stream: `runs/${run}.jsonl`, station: "box/claude", model: "opus", effort: "high" } });
      noter(ticket, { type: "cook.exited", payload: { run, outcome, code: outcome === "ok" ? 0 : 1, signal: null, turns: 3, tokens: 100, durationMs: 1000 } });
      return run;
    },
    juger: (ticket: number, run: string, verdict: "green" | "red", { failures = [] as string[], blocking = [] as string[] } = {}) =>
      noter(ticket, {
        type: "pass.judged",
        payload: {
          run,
          pr: `https://github.com/${DEPOT}/pull/${ticket + 1000}`,
          number: ticket + 1000,
          sha: "s",
          base: "b",
          merged: "m",
          verdict,
          gates: { outcome: failures.length > 0 ? "red" : "green", code: failures.length > 0 ? 1 : 0, failures, tail: "" },
          ci: { outcome: "none", checks: [] },
          review: { outcome: blocking.length > 0 ? "red" : "green", run: null, summary: null, findings: blocking.map((text) => ({ severity: "blocking", file: "src/rail.ts", text })) },
          findings: blocking,
          judgeModified: false,
          noDiff: false,
        },
      }),
    merger: (ticket: number) => noter(ticket, { type: "merge.done", payload: { pr: `https://github.com/${DEPOT}/pull/${ticket + 1000}`, sha: "s", by: "pass", reconciled: false } }),
    arreter: (ticket: number, reason: string) => {
      const run = `run-${++runs}`;
      noter(ticket, { type: "cook.launched", payload: { run, limits: LIMITES, stream: `runs/${run}.jsonl`, station: "box/claude" } });
      noter(ticket, { type: "guard.tripped", payload: { run, reason, limit: 2_000_000, observed: 2_000_001 } });
      noter(ticket, { type: "cook.exited", payload: { run, outcome: "guard", code: null, signal: "SIGTERM", turns: 9, tokens: 2_000_001, durationMs: 1000 } });
      return run;
    },
    mettreDeCote: (ticket: number, reason: string, why?: string) => noter(ticket, { type: "ticket.86", payload: { reason, until: null, ...(why === undefined ? {} : { why }) } }),
    garder: (ticket: number) => noter(ticket, { type: "worktree.kept", payload: { worktree: `worktrees/${ticket}-x`, branch: `cook/${ticket}-x`, reason: "failed", detail: "fatal: cannot remove: Device or resource busy" } }),
    franchir: () => noter(null, { type: "drift.crossed", payload: { measure: "gates_s", observed: 130, limit: 100 } }),
  };
}

// Un ticket pris, livré une fois, jugé rouge sur ces lignes FAIL : il reste ouvert.
function raterAuxGates(c: Cuisine, ticket: number, ...failures: string[]): void {
  const g = gestes(c);
  g.prendre(ticket);
  g.juger(ticket, g.cuire(ticket), "red", { failures });
}

const lire = (c: Cuisine, periode = PERIODE, projet = PROJET, depot = DEPOT) => digestDUsage(c.journal.base, { project: projet, repository: depot, period: periode });

const vide = (digest: DigestDUsage) => ({
  merged: digest.drift.merged,
  share: digest.drift.share,
  below: digest.drift.below,
  tickets: digest.drift.tickets,
  crossings: digest.drift.crossings,
  passRejections: digest.passRejections,
  guardrailStops: digest.guardrailStops,
  setAside: digest.setAside,
  repeatedFailures: digest.repeatedFailures,
});
const RIEN = { merged: 0, share: null, below: false, tickets: [], crossings: [], passRejections: [], guardrailStops: [], setAside: [], repeatedFailures: [] };

// Chaque élément d'une rubrique, quelle qu'elle soit, porte au moins une preuve.
function preuves(digest: DigestDUsage): Preuve[][] {
  return [...digest.drift.tickets, ...digest.drift.crossings, ...digest.passRejections, ...digest.guardrailStops, ...digest.setAside, ...digest.repeatedFailures].map(({ evidence }) => evidence);
}

// Un journal qui porte un fait de chaque rubrique.
function journalComplet(c: Cuisine): void {
  const g = gestes(c);
  // #21 : rouge une fois aux gates et à la relecture, puis mergé.
  g.prendre(21);
  const premier = g.cuire(21);
  g.juger(21, premier, "red", { failures: [FAIL_RUNTIME], blocking: ["The rail loses the ticket when the lease lapses."] });
  g.juger(21, g.cuire(21), "green");
  g.merger(21);
  // #22 : mergé du premier coup.
  g.prendre(22);
  g.juger(22, g.cuire(22), "green");
  g.merger(22);
  // #23 : son cook arrêté par le plafond de tokens.
  g.prendre(23);
  g.arreter(23, "tokens");
  // #24 : mis de côté deux fois faute de quota.
  g.mettreDeCote(24, "quota");
  g.mettreDeCote(24, "quota");
  // Les mêmes gates rouges sur #25 et #26 : trois tickets avec #21.
  raterAuxGates(c, 25, FAIL_RUNTIME);
  raterAuxGates(c, 26, FAIL_RUNTIME);
  // Un nettoyage qui échoue sur trois tickets.
  for (const ticket of [21, 22, 23]) g.garder(ticket);
  g.franchir();
}

test("une période sans fait : chaque rubrique est vide, et la dérive ne dit rien", (t) => {
  const c = cuisine(t);
  assert.deepEqual(vide(lire(c)), RIEN);
  // Ce qui s'est passé avant la période n'y entre pas.
  journalComplet(c);
  const digest = lire(c, { from: "2026-10-09T00:00:00.000Z", to: "2026-10-10T00:00:00.000Z" });
  assert.deepEqual(vide(digest), RIEN);
  assert.deepEqual({ project: digest.project, repository: digest.repository, period: digest.period, firstTry: digest.drift.firstTry, thresholdPercent: digest.drift.thresholdPercent }, {
    project: PROJET,
    repository: DEPOT,
    period: { from: "2026-10-09T00:00:00.000Z", to: "2026-10-10T00:00:00.000Z" },
    firstTry: 0,
    thresholdPercent: 50,
  });
});

test("une période qui porte chaque rubrique : la dérive, les refus de la pass, les garde-fous, les mises de côté et ce qui revient", (t) => {
  const c = cuisine(t);
  journalComplet(c);
  const digest = lire(c);
  const issue = (ticket: number) => ({ kind: "issue", ticket, url: `https://github.com/${DEPOT}/issues/${ticket}` });
  const pr = (ticket: number) => ({ kind: "pr", url: `https://github.com/${DEPOT}/pull/${ticket + 1000}` });

  // La dérive : deux mergés, un du premier coup — au seuil de 50 %, pas en dessous.
  assert.deepEqual(
    { merged: digest.drift.merged, firstTry: digest.drift.firstTry, share: digest.drift.share, below: digest.drift.below },
    { merged: 2, firstTry: 1, share: 0.5, below: false },
  );
  assert.deepEqual(
    digest.drift.tickets.map(({ ticket, attempts, firstTry, evidence }) => ({ ticket, attempts, firstTry, cites: evidence.map((p) => (p.kind === "log" ? p.type : p.url)) })),
    [
      { ticket: 21, attempts: 2, firstTry: false, cites: [issue(21).url, pr(21).url, "merge.done"] },
      { ticket: 22, attempts: 1, firstTry: true, cites: [issue(22).url, pr(22).url, "merge.done"] },
    ],
  );
  assert.deepEqual(digest.drift.crossings.map(({ measure, observed, limit, evidence }) => ({ measure, observed, limit, type: evidence[0]?.kind === "log" ? evidence[0].type : null })), [
    { measure: "gates_s", observed: 130, limit: 100, type: "drift.crossed" },
  ]);

  // Les refus : #21 une fois, #25 et #26 chacun une fois, rangés par leur cause.
  assert.deepEqual(
    digest.passRejections.map(({ ticket, cause, title, gates, blocking, evidence }) => ({ ticket, cause, title, failures: gates.failures, blocking: blocking.map(({ text }) => text), evidence: evidence.slice(0, 2) })),
    [
      { ticket: 21, cause: "gates-runtime", title: "red gates: runtime tests", failures: [FAIL_RUNTIME], blocking: ["The rail loses the ticket when the lease lapses."], evidence: [issue(21), pr(21)] },
      { ticket: 25, cause: "gates-runtime", title: "red gates: runtime tests", failures: [FAIL_RUNTIME], blocking: [], evidence: [issue(25), pr(25)] },
      { ticket: 26, cause: "gates-runtime", title: "red gates: runtime tests", failures: [FAIL_RUNTIME], blocking: [], evidence: [issue(26), pr(26)] },
    ],
  );
  assert.deepEqual(
    digest.passRejections.map(({ evidence }) => evidence.flatMap((preuve) => (preuve.kind === "log" ? [preuve.type] : []))),
    [["pass.judged"], ["pass.judged"], ["pass.judged"]],
  );

  // Le garde-fou, dans son unité.
  assert.deepEqual(digest.guardrailStops.map(({ ticket, reason, limit, observed, evidence }) => ({ ticket, reason, limit, observed, cites: evidence.map((p) => p.kind) })), [
    { ticket: 23, reason: "tokens", limit: 2_000_000, observed: 2_000_001, cites: ["issue", "log"] },
  ]);

  // La mise de côté répétée reste une ligne, avec qui la pose et ce qui l'en sort.
  assert.deepEqual(
    digest.setAside.map(({ ticket, reason, by, occurrences, evidence }) => ({ ticket, reason, by, occurrences, cites: evidence.map((p) => (p.kind === "log" ? p.type : p.kind)) })),
    [{ ticket: 24, reason: "quota", by: "the station, when the account's quota is used up", occurrences: 2, cites: ["issue", "ticket.86", "ticket.86"] }],
  );
  assert.match(digest.setAside[0]?.return ?? "", /quota comes back/);

  // Ce qui revient : les mêmes gates rouges, et le nettoyage, chacun sur trois tickets.
  assert.deepEqual(
    digest.repeatedFailures.map(({ signature, source, title, tickets, occurrences, example }) => ({ signature, source, title, tickets, occurrences, example })),
    [
      { signature: "cleanup: worktree kept", source: "cleanup", title: "the cleanup could not tidy the cook's worktree", tickets: [21, 22, 23], occurrences: 3, example: "fatal: cannot remove: Device or resource busy" },
      { signature: `gates: ${signee(FAIL_RUNTIME)}`, source: "attempt", title: "red gates — tests du runtime en échec — rejoue : npm --prefix runtime test", tickets: [21, 25, 26], occurrences: 3, example: null },
    ],
  );
  const gates = digest.repeatedFailures[1]?.evidence ?? [];
  assert.deepEqual(gates.filter((p) => p.kind === "issue"), [issue(21), issue(25), issue(26)]);
  assert.deepEqual(gates.filter((p) => p.kind === "pr"), [pr(21), pr(25), pr(26)]);
  assert.equal(gates.filter((p) => p.kind === "log" && p.type === "pass.judged").length, 3);

  // Chaque élément cite au moins une preuve, et chaque ligne citée est au journal.
  const seqs = new Set(c.journal.tout().map(({ seq }) => seq));
  for (const citees of preuves(digest)) {
    assert.ok(citees.length > 0);
    for (const preuve of citees) if (preuve.kind === "log") assert.ok(seqs.has(preuve.seq), String(preuve.seq));
  }
});

test(`un échec vu sur ${SEUIL_DE_RECURRENCE} tickets est un seul élément qui les nomme ; sur un de moins, il n'y est pas`, (t) => {
  const c = cuisine(t);
  const tickets = Array.from({ length: SEUIL_DE_RECURRENCE }, (_, i) => 30 + i);
  // Le miroir sur tous ; les tests du runtime sur tous sauf un.
  for (const ticket of tickets) raterAuxGates(c, ticket, FAIL_MIROIR, ...(ticket === tickets.at(-1) ? [] : [FAIL_RUNTIME]));
  // Le même ticket raté deux fois de plus n'en fait pas un ticket de plus.
  raterAuxGates(c, tickets[0] as number, FAIL_RUNTIME);
  raterAuxGates(c, tickets[0] as number, FAIL_RUNTIME);

  assert.deepEqual(
    lire(c).repeatedFailures.map(({ signature, tickets: siens, occurrences }) => ({ signature, tickets: siens, occurrences })),
    [{ signature: `gates: ${signee(FAIL_MIROIR)}`, tickets, occurrences: SEUIL_DE_RECURRENCE }],
  );

  // Les garde-fous et les mises de côté du projet se comptent de même.
  const g = gestes(c);
  for (const ticket of tickets) {
    g.prendre(ticket + 100);
    g.arreter(ticket + 100, "duration");
    g.mettreDeCote(ticket + 200, "worktree-failed", "fatal: not a git repository");
    if (ticket !== tickets[0]) g.mettreDeCote(ticket + 300, "setup-failed");
  }
  const revenus = lire(c).repeatedFailures.map(({ signature, source, tickets: siens, example }) => ({ signature, source, tickets: siens, example }));
  assert.deepEqual(revenus, [
    { signature: `gates: ${signee(FAIL_MIROIR)}`, source: "attempt", tickets, example: null },
    { signature: "guardrail: duration", source: "attempt", tickets: tickets.map((ticket) => ticket + 100), example: null },
    { signature: "set-aside: worktree-failed", source: "set-aside", tickets: tickets.map((ticket) => ticket + 200), example: "fatal: not a git repository" },
  ]);
});

test("un second projet, à d'autres chemins : ses issues pointent sur son dépôt, et les faits d'un autre projet n'y entrent pas", (t) => {
  const c = cuisine(t, "boutique");
  const g = gestes(c, "boutique");
  const intrus = gestes(c, PROJET);
  g.prendre(7);
  g.juger(7, g.cuire(7), "red", { blocking: ["Le panier se vide au rechargement."] });
  g.juger(7, g.cuire(7), "green");
  g.merger(7);
  g.mettreDeCote(8, "no-station: macos");
  // Un autre projet, dans le même journal : rien de lui ne passe.
  intrus.prendre(90);
  intrus.arreter(90, "idle");
  intrus.mettreDeCote(91, "quota");
  for (const ticket of [92, 93, 94]) intrus.garder(ticket);

  const options = { project: "boutique", repository: "atelier-du-sud/boutique-en-ligne", period: PERIODE };
  const digest = lireDigestDUsage(c.repertoire, options);
  assert.deepEqual(digest, digestDUsage(c.journal.base, options));
  assert.deepEqual(
    {
      drift: digest.drift.tickets.map(({ ticket, attempts }) => [ticket, attempts]),
      passRejections: digest.passRejections.map(({ ticket, cause, evidence }) => ({ ticket, cause, issue: evidence[0] })),
      guardrailStops: digest.guardrailStops,
      setAside: digest.setAside.map(({ ticket, reason, by }) => ({ ticket, reason, by })),
      repeatedFailures: digest.repeatedFailures,
    },
    {
      drift: [[7, 2]],
      passRejections: [{ ticket: 7, cause: "relecture", issue: { kind: "issue", ticket: 7, url: "https://github.com/atelier-du-sud/boutique-en-ligne/issues/7" } }],
      guardrailStops: [],
      setAside: [{ ticket: 8, reason: "no-station: macos", by: "the station, when no declared station provides what the card requires" }],
      repeatedFailures: [],
    },
  );
  assert.ok(preuves(digest).flat().every((preuve) => preuve.kind !== "issue" || preuve.url.startsWith("https://github.com/atelier-du-sud/boutique-en-ligne/issues/")));
  // Et lu sous l'autre nom, le même journal ne dit que l'autre projet.
  const autre = lire(c, PERIODE, PROJET, "acme/autre");
  assert.deepEqual(
    [autre.guardrailStops.map(({ ticket }) => ticket), autre.setAside.map(({ ticket }) => ticket), autre.repeatedFailures.map(({ tickets }) => tickets), autre.drift.merged],
    [[90], [91], [[92, 93, 94]], 0],
  );
});

test("la période va de `from` compris à `to` exclu, et des options illisibles sont refusées", (t) => {
  const c = cuisine(t);
  const g = gestes(c);
  c.aller("2026-10-08T12:00:00.000Z");
  g.mettreDeCote(40, "quota");
  c.aller("2026-10-08T13:00:00.000Z");
  g.mettreDeCote(41, "quota");
  const tickets = (from: string, to: string) => lire(c, { from, to }).setAside.map(({ ticket }) => ticket);
  assert.deepEqual(tickets("2026-10-08T12:00:00.000Z", "2026-10-08T13:00:00.000Z"), [40]);
  assert.deepEqual(tickets("2026-10-08T12:00:00.001Z", "2026-10-08T13:00:00.001Z"), [41]);
  // Une date sans heure se lit à minuit UTC.
  assert.deepEqual(tickets("2026-10-08", "2026-10-09"), [40, 41]);

  assert.throws(() => lire(c, { from: "hier", to: "2026-10-09" }), /from is not a date/);
  assert.throws(() => lire(c, { from: "2026-10-09", to: "2026-10-08" }), /is after/);
  assert.throws(() => lire(c, PERIODE, PROJET, "https://github.com/acme/brigade"), /repository/);
  assert.throws(() => lire(c, PERIODE, ""), /project/);
});

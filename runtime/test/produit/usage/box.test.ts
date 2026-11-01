// Le digest d'usage du projet qui est brigade, élargi aux autres projets de la
// même box : une station écrite comme la station l'écrit — sa configuration,
// l'état de chaque projet sous `etat/`, son clone sous `clones/` —, et des
// journaux écrits comme le runtime les écrit.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import { ouvrirJournal } from "../../../src/journal.ts";
import { depotEstBrigade, lireDigestDeLaBox, NOM_DU_RUNTIME, type OptionsDeLaBox } from "../../../src/produit/usage/box.ts";
import { SEUIL_DE_RECURRENCE } from "../../../src/produit/usage/digest.ts";
import { BASE, git, repertoireTemporaire } from "../../outils.ts";

const DEBUT = "2026-10-08T10:00:00.000Z";
const PERIODE = { from: "2026-10-08T10:00:00.000Z", to: "2026-10-09T00:00:00.000Z" };
const DEPOTS: Record<string, string> = { brigade: "acme/brigade", espace: "acme/espace", lab: "acme/lab", neuf: "acme/neuf" };

const FAIL_ESPACE = "FAIL  tests du runtime en échec — rejoue : npm --prefix runtime test";
const CONSTAT = "The cart empties itself on reload (src/panier.ts).";
const SORTIE = "fatal: cannot remove /srv/espace/secret-plan.md";

type Station = { racine: string; projet: (nom: string) => ReturnType<typeof gestes> };

// Une station qui sert ces projets ; chacun a son journal dès qu'on y écrit.
function station(t: TestContext, noms = ["brigade", "espace", "lab"]): Station {
  const racine = repertoireTemporaire(t);
  writeFileSync(join(racine, "projets"), `${noms.map((nom) => `${nom} ${DEPOTS[nom]} ${BASE}`).join("\n")}\n`);
  const ouverts = new Map<string, ReturnType<typeof gestes>>();
  return {
    racine,
    projet: (nom) => {
      const connu = ouverts.get(nom);
      if (connu !== undefined) return connu;
      let instant = Date.parse(DEBUT);
      mkdirSync(join(racine, "etat", nom), { recursive: true });
      const journal = ouvrirJournal(join(racine, "etat", nom), { maintenant: () => new Date((instant += 1000)) });
      t.after(() => journal.fermer());
      const g = gestes(nom, (ticket, fait) => void journal.ajouter({ project: nom, ticket, author: "runtime", ...fait } as never));
      ouverts.set(nom, g);
      return g;
    },
  };
}

let runs = 0;
const LIMITES = { durationMs: 3_600_000, tokens: 2_000_000, idleMs: 600_000 };

function gestes(projet: string, noter: (ticket: number | null, fait: object) => void) {
  const pr = (ticket: number) => `https://github.com/${DEPOTS[projet]}/pull/${ticket + 1000}`;
  const pris = new Set<number>();
  const prendre = (ticket: number) => {
    if (pris.has(ticket)) return;
    pris.add(ticket);
    noter(ticket, { type: "ticket.taken", payload: { station: "box/claude", leaseUntil: "2026-10-09T00:00:00.000Z" } });
  };
  const cuire = (ticket: number) => {
    const run = `run-${++runs}`;
    prendre(ticket);
    noter(ticket, { type: "cook.launched", payload: { run, limits: LIMITES, stream: `runs/${run}.jsonl`, station: "box/claude", model: "opus", effort: "high" } });
    noter(ticket, { type: "cook.exited", payload: { run, outcome: "ok", code: 0, signal: null, turns: 3, tokens: 100, durationMs: 1000 } });
    return run;
  };
  const juger = (ticket: number, run: string, verdict: "green" | "red", { failures = [] as string[], blocking = [] as string[], conflit = false } = {}) =>
    noter(ticket, {
      type: "pass.judged",
      payload: {
        run,
        pr: pr(ticket),
        number: ticket + 1000,
        sha: "s",
        base: "b",
        merged: conflit ? null : "m",
        verdict,
        gates: { outcome: failures.length > 0 ? "red" : conflit ? "skipped" : "green", code: failures.length > 0 ? 1 : 0, failures, tail: "" },
        ci: { outcome: "none", checks: [] },
        review: { outcome: blocking.length > 0 ? "red" : "green", run: null, summary: null, findings: blocking.map((text) => ({ severity: "blocking", file: "src/panier.ts", text })) },
        findings: blocking,
        judgeModified: false,
        noDiff: false,
      },
    });
  return {
    // Rouge une fois à la relecture et aux gates, puis mergé.
    livrerApresUnRefus: (ticket: number) => {
      juger(ticket, cuire(ticket), "red", { failures: [FAIL_ESPACE], blocking: [CONSTAT] });
      juger(ticket, cuire(ticket), "green");
      noter(ticket, { type: "merge.done", payload: { pr: pr(ticket), sha: "s", by: "pass", reconciled: false } });
    },
    raterAuxGates: (ticket: number) => juger(ticket, cuire(ticket), "red", { failures: [FAIL_ESPACE] }),
    entrerEnConflit: (ticket: number) => juger(ticket, cuire(ticket), "red", { conflit: true }),
    arreter: (ticket: number, reason: string) => {
      const run = `run-${++runs}`;
      prendre(ticket);
      noter(ticket, { type: "cook.launched", payload: { run, limits: LIMITES, stream: `runs/${run}.jsonl`, station: "box/claude" } });
      noter(ticket, { type: "guard.tripped", payload: { run, reason, limit: 2_000_000, observed: 2_000_001 } });
      noter(ticket, { type: "cook.exited", payload: { run, outcome: "guard", code: null, signal: "SIGTERM", turns: 9, tokens: 2_000_001, durationMs: 1000 } });
    },
    mettreDeCote: (ticket: number, reason: string, why?: string) => noter(ticket, { type: "ticket.86", payload: { reason, until: null, ...(why === undefined ? {} : { why }) } }),
    garder: (ticket: number) => noter(ticket, { type: "worktree.kept", payload: { worktree: `worktrees/${ticket}-x`, branch: `cook/${ticket}-x`, reason: "failed", detail: SORTIE } }),
  };
}

// Le projet nommé, réveillé sur la station : brigade est celui dont le clone s'appelle ainsi.
const lire = ({ racine }: Station, project = "brigade", options: Partial<OptionsDeLaBox> = {}) =>
  lireDigestDeLaBox(join(racine, "etat", project), {
    project,
    repository: DEPOTS[project] ?? "acme/x",
    period: PERIODE,
    station: racine,
    env: {},
    estBrigade: ({ clone }) => clone.endsWith(join("clones", "brigade")),
    ...options,
  });

test("réveillé sur brigade, le digest couvre les autres projets de la box, chaque élément nommant son projet, sans rien de leur produit", (t) => {
  const s = station(t);
  s.projet("brigade").arreter(1, "idle");
  const espace = s.projet("espace");
  espace.livrerApresUnRefus(5);
  espace.raterAuxGates(6);
  espace.entrerEnConflit(7);
  espace.arreter(8, "tokens");
  espace.mettreDeCote(9, "worktree-failed", SORTIE);
  espace.mettreDeCote(10, "third-party");
  espace.garder(11);
  s.projet("lab").mettreDeCote(3, "quota");

  const digest = lire(s);
  // Le digest de brigade reste le sien.
  assert.deepEqual(digest.guardrailStops.map(({ ticket, reason }) => [ticket, reason]), [[1, "idle"]]);
  assert.ok(digest.box !== null);
  assert.deepEqual(digest.box.unreadable, []);
  assert.deepEqual(digest.box.siblings.map(({ project }) => project), ["espace", "lab"]);

  const [e, l] = digest.box.siblings;
  assert.deepEqual({ merged: e?.drift.merged, firstTry: e?.drift.firstTry, tickets: e?.drift.tickets.map(({ project, ticket, attempts }) => ({ project, ticket, attempts })) }, {
    merged: 1,
    firstTry: 0,
    tickets: [{ project: "espace", ticket: 5, attempts: 2 }],
  });
  // Des refus de la pass, seul le conflit tient à brigade : les gates rouges et la relecture sont le code d'espace.
  assert.deepEqual(e?.passRejections.map(({ project, ticket, cause }) => ({ project, ticket, cause })), [{ project: "espace", ticket: 7, cause: "conflit" }]);
  assert.deepEqual(e?.guardrailStops.map(({ project, ticket, reason }) => ({ project, ticket, reason })), [{ project: "espace", ticket: 8, reason: "tokens" }]);
  // Le WAITING n'est pas un échec ; le worktree, si, mais sans la sortie de l'outil.
  assert.deepEqual(e?.setAside.map(({ project, ticket, reason }) => ({ project, ticket, reason })), [{ project: "espace", ticket: 9, reason: "worktree-failed" }]);
  assert.deepEqual(l?.setAside.map(({ project, ticket, reason }) => ({ project, ticket, reason })), [{ project: "lab", ticket: 3, reason: "quota" }]);

  // Chaque élément venu d'ailleurs dit son projet, et ne cite que ses lignes de journal.
  for (const voisin of digest.box.siblings) {
    const elements = [voisin.drift, ...voisin.drift.tickets, ...voisin.drift.crossings, ...voisin.passRejections, ...voisin.guardrailStops, ...voisin.setAside];
    for (const element of elements) assert.equal(element.project, voisin.project);
    for (const element of elements.slice(1) as Array<{ evidence: Array<{ kind: string; project: string }> }>) {
      assert.ok(element.evidence.length > 0);
      for (const preuve of element.evidence) assert.deepEqual([preuve.kind, preuve.project], ["log", voisin.project]);
    }
  }
  // Rien de leur contenu : ni sortie d'outil, ni constat, ni ligne FAIL, ni lien vers leur dépôt.
  const texte = JSON.stringify(digest.box);
  for (const interdit of [SORTIE, CONSTAT, "FAIL", "panier", "github.com/acme/espace", "github.com/acme/lab"]) assert.ok(!texte.includes(interdit), interdit);
});

test("un échec vu sur plusieurs projets est un seul élément, ses tickets comptés d'un projet à l'autre", (t) => {
  const s = station(t);
  const [brigade, espace, lab] = [s.projet("brigade"), s.projet("espace"), s.projet("lab")];
  // Le même nettoyage raté sur 3 tickets de 2 projets.
  brigade.garder(1);
  espace.garder(5);
  espace.garder(6);
  // Les mêmes gates rouges sur 3 tickets : les tests de chacun, pas un échec commun.
  brigade.raterAuxGates(2);
  espace.raterAuxGates(7);
  lab.raterAuxGates(8);
  // Un garde-fou sur 2 tickets seulement, sur 2 projets : en deçà du seuil.
  brigade.arreter(3, "duration");
  lab.arreter(9, "duration");
  // Un worktree qui ne se prépare pas, sur 3 tickets du seul projet lab.
  for (const ticket of [10, 11, 12]) lab.mettreDeCote(ticket, "worktree-failed");

  const digest = lire(s);
  assert.ok(digest.box !== null);
  assert.deepEqual(
    digest.box.repeatedAcrossProjects.map(({ signature, projects, tickets, occurrences }) => ({ signature, projects, tickets, occurrences })),
    [
      {
        signature: "cleanup: worktree kept",
        projects: ["brigade", "espace"],
        tickets: [
          { project: "brigade", ticket: 1 },
          { project: "espace", ticket: 5 },
          { project: "espace", ticket: 6 },
        ],
        occurrences: 3,
      },
      { signature: "set-aside: worktree-failed", projects: ["lab"], tickets: [10, 11, 12].map((ticket) => ({ project: "lab", ticket })), occurrences: 3 },
    ],
  );
  // Brigade y cite son issue ; les autres, leurs seules lignes de journal.
  const [nettoyage] = digest.box.repeatedAcrossProjects;
  assert.deepEqual(nettoyage?.evidence.filter((preuve) => preuve.kind !== "log"), [{ kind: "issue", ticket: 1, url: "https://github.com/acme/brigade/issues/1" }]);
  assert.deepEqual(nettoyage?.evidence.flatMap((preuve) => (preuve.kind === "log" && "project" in preuve ? [[preuve.project, preuve.ticket]] : [])), [["brigade", 1], ["espace", 5], ["espace", 6]]);
  assert.ok(!JSON.stringify(digest.box).includes(SORTIE));
});

test(`un échec commun quitte les échecs du seul projet brigade ; vu sur ${SEUIL_DE_RECURRENCE} tickets de brigade seul, il y reste`, (t) => {
  const s = station(t);
  const brigade = s.projet("brigade");
  for (const ticket of [1, 2, 3]) brigade.garder(ticket);
  for (const ticket of [4, 5, 6]) brigade.arreter(ticket, "duration");
  s.projet("espace").arreter(7, "duration");

  const digest = lire(s);
  assert.deepEqual(digest.repeatedFailures.map(({ signature, tickets }) => ({ signature, tickets })), [{ signature: "cleanup: worktree kept", tickets: [1, 2, 3] }]);
  assert.deepEqual(digest.box?.repeatedAcrossProjects.map(({ signature, projects, tickets }) => ({ signature, projects, n: tickets.length })), [
    { signature: "guardrail: duration", projects: ["brigade", "espace"], n: 4 },
  ]);
});

test("un autre projet de la box ne lit ni l'usage de brigade ni celui d'un voisin", (t) => {
  const s = station(t);
  s.projet("brigade").arreter(1, "idle");
  s.projet("lab").arreter(2, "idle");
  const espace = s.projet("espace");
  espace.arreter(3, "tokens");

  const lu = lire(s, "espace");
  assert.equal(lu.box, null);
  assert.deepEqual(lu.guardrailStops.map(({ ticket }) => ticket), [3]);
  // Hors d'une station, ou absent de sa configuration, brigade lui-même n'en lit pas d'autre.
  assert.equal(lire(s, "brigade", { station: undefined }).box, null);
  const ailleurs = station(t, ["espace", "lab"]);
  ailleurs.projet("brigade");
  assert.equal(lire(ailleurs, "brigade").box, null);
  // Et un dépôt que rien ne dit brigade n'en est pas un.
  assert.equal(lire(s, "brigade", { estBrigade: () => false }).box, null);
});

test("un projet de la box dont le journal ne se lit pas est dit, et les autres sont lus", (t) => {
  const s = station(t, ["brigade", "neuf", "espace"]);
  s.projet("brigade");
  s.projet("espace").arreter(4, "tokens");
  const digest = lire(s);
  assert.deepEqual(digest.box?.siblings.map(({ project }) => project), ["espace"]);
  assert.deepEqual(digest.box?.unreadable.map(({ project, reason }) => ({ project, nolog: /no log/.test(reason) })), [{ project: "neuf", nolog: true }]);
});

// Un clone dont la branche d'intégration porte ces fichiers.
function clone(racine: string, nom: string, fichiers: Record<string, string>): string {
  const chemin = join(racine, "clones", nom);
  mkdirSync(chemin, { recursive: true });
  git(chemin, "init", "-q", `--initial-branch=${BASE}`);
  writeFileSync(join(chemin, "LISEZMOI"), `${nom}\n`);
  for (const [fichier, contenu] of Object.entries(fichiers)) {
    mkdirSync(dirname(join(chemin, fichier)), { recursive: true });
    writeFileSync(join(chemin, fichier), contenu);
  }
  git(chemin, "add", ".");
  git(chemin, "commit", "-q", "-m", "amorce");
  git(chemin, "update-ref", `refs/remotes/origin/${BASE}`, "HEAD");
  return chemin;
}

test("un dépôt est brigade quand sa branche d'intégration porte le runtime de brigade", (t) => {
  const s = station(t);
  const brigade = clone(s.racine, "brigade", { "runtime/package.json": JSON.stringify({ name: NOM_DU_RUNTIME, private: true }) });
  const espace = clone(s.racine, "espace", { "runtime/package.json": JSON.stringify({ name: "espace-runtime" }) });
  const lab = clone(s.racine, "lab", { "runtime/package.json": "{ pas du json" });
  assert.equal(depotEstBrigade({ clone: brigade, base: BASE }), true);
  assert.equal(depotEstBrigade({ clone: espace, base: BASE }), false);
  assert.equal(depotEstBrigade({ clone: lab, base: BASE }), false);
  assert.equal(depotEstBrigade({ clone: join(s.racine, "clones", "absent"), base: BASE }), false);
  assert.equal(depotEstBrigade({ clone: brigade, base: "autre" }), false);

  // Sans rien injecter : brigade lit ses voisins, espace non.
  s.projet("brigade");
  s.projet("espace").arreter(3, "tokens");
  s.projet("lab");
  const sansInjection = { estBrigade: undefined };
  assert.deepEqual(lire(s, "brigade", sansInjection).box?.siblings.map(({ project }) => project), ["espace", "lab"]);
  assert.equal(lire(s, "espace", sansInjection).box, null);
});

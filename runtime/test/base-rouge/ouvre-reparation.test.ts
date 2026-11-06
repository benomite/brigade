import assert from "node:assert/strict";
import { test } from "node:test";
import type { Check } from "../../src/events/pass.ts";
import { LimiteGitHubAtteinte } from "../../src/limite-github.ts";
import { marqueDeReparation } from "../../src/reparation.ts";
import { estUneReparation, LIGNES_MAX, marqueDeBaseRouge, ouvreReparation, shaDeBaseRouge, sortieDErreur, type CheckDeLaBase, type GitHubDeLaReparation } from "../../src/base-rouge/ouvre-reparation.ts";

type Issue = { number: number; titre: string; corps: string; labels: string[]; state: "open" | "closed"; association: string };

// Le GitHub d'un projet, réduit à ce que l'ouverture lit et écrit.
class FauxDepot {
  issues: Issue[] = [];
  journaux = new Map<string, string>();
  journauxLus: Check[] = [];
  tete: string;
  constructor(tete = "a".repeat(40)) {
    this.tete = tete;
  }

  github(): GitHubDeLaReparation {
    return {
      teteDeLaBase: async () => this.tete,
      issuesDepuis: async () => this.issues.map(({ number, corps, association }) => ({ number, body: corps, association })),
      creerIssue: async ({ titre, corps, labels }) => {
        const number = 100 + this.issues.length;
        this.issues.push({ number, titre, corps, labels, state: "open", association: "OWNER" });
        return number;
      },
      fermerIssue: async (numero) => {
        const issue = this.issues.find((i) => i.number === numero);
        if (issue) issue.state = "closed";
      },
      journalDuCheck: async (check) => {
        this.journauxLus.push(check);
        return this.journaux.get(check.name) ?? null;
      },
    };
  }

  ouvertes(): Issue[] {
    return this.issues.filter((i) => i.state === "open");
  }
}

const job = (run: number, job: number) => `https://github.com/o/r/actions/runs/${run}/job/${job}`;
const ROUGE: CheckDeLaBase[] = [
  { name: "tests", outcome: "red", url: job(11, 1) },
  { name: "windows tests (2/4)", outcome: "red", url: job(12, 2) },
  { name: "lint", outcome: "green" },
];
const journal = (erreur: string) =>
  ["2026-11-04T16:40:00.0000000Z ##[group]Run npm test", "2026-11-04T16:40:01.0000000Z \x1b[31mnot ok 1 - the clock\x1b[0m", `2026-11-04T16:40:02.0000000Z ${erreur}`, "2026-11-04T16:40:03.0000000Z ##[error]Process completed with exit code 1.", "2026-11-04T16:40:04.0000000Z Post job cleanup."].join("\n");

test("a base still red after its re-run opens exactly one repair ticket, prio:0 on the rail, naming every failing check and its error, with the red commit's marker", async () => {
  const depot = new FauxDepot();
  depot.journaux.set("tests", journal("AssertionError: expected 2 to equal 3"));
  depot.journaux.set("windows tests (2/4)", journal("Error: EPERM, operation not permitted"));
  const ouvrir = ouvreReparation({ github: depot.github(), base: "main" });

  const ouverte = await ouvrir(ROUGE);

  assert.equal(depot.issues.length, 1);
  const [ticket] = depot.issues;
  assert.ok(ticket);
  assert.deepEqual(ouverte, { sha: depot.tete, reparation: ticket.number });
  assert.ok(ticket.labels.includes("prio:0"));
  assert.ok(ticket.labels.includes("fire"));
  // `opus` / `medium`, comme la table du manager (#2575) : la base attend la réparation, et l'effort `high` l'allonge.
  assert.ok(ticket.labels.includes("model:opus") && ticket.labels.includes("effort:medium"));
  assert.match(ticket.titre, /`main`/);
  assert.match(ticket.titre, /aaaaaaa/);
  assert.ok(ticket.corps.includes(`<!-- brigade:base-rouge sha=${"a".repeat(40)} -->`));
  for (const [nom, erreur] of [
    ["tests", "AssertionError: expected 2 to equal 3"],
    ["windows tests (2/4)", "Error: EPERM, operation not permitted"],
  ] as const) {
    assert.ok(ticket.corps.includes(`\`${nom}\``), nom);
    assert.ok(ticket.corps.includes(erreur), erreur);
  }
  // Le check vert n'y est pas, ni le bruit du journal.
  assert.ok(!ticket.corps.includes("`lint`"));
  assert.ok(!ticket.corps.includes("2026-11-04T16:40"));
  assert.ok(!ticket.corps.includes("\x1b["));
  assert.ok(!ticket.corps.includes("Post job cleanup"));
  assert.deepEqual(
    depot.journauxLus.map(({ name, url }) => ({ name, url })),
    [
      { name: "tests", url: job(11, 1) },
      { name: "windows tests (2/4)", url: job(12, 2) },
    ],
  );
  // Le ticket est une réparation : la base rouge ne retient pas son merge.
  assert.ok(estUneReparation(ticket.corps, ticket.labels));
});

test("called twice for the same red commit, the handler opens one ticket: the second call finds the marker", async () => {
  const depot = new FauxDepot();
  await ouvreReparation({ github: depot.github(), base: "main" })(ROUGE);
  // Une autre station, ou la même après un redémarrage : rien en cache.
  const second = await ouvreReparation({ github: depot.github(), base: "main" })(ROUGE);
  assert.equal(depot.issues.length, 1);
  assert.equal(second.reparation, depot.issues[0]?.number);
  // Et deux appels du même tour ne lisent GitHub qu'une fois.
  const autre = new FauxDepot();
  const ouvrir = ouvreReparation({ github: autre.github(), base: "main" });
  await Promise.all([ouvrir(ROUGE), ouvrir(ROUGE)]);
  assert.equal(autre.issues.length, 1);
});

test("a new red commit while the old repair ticket is still open gets its own ticket", async () => {
  const depot = new FauxDepot();
  const ouvrir = ouvreReparation({ github: depot.github(), base: "main" });
  await ouvrir(ROUGE);
  depot.tete = "b".repeat(40);
  await ouvrir(ROUGE);
  assert.equal(depot.ouvertes().length, 2);
  assert.deepEqual(
    depot.ouvertes().map(({ corps }) => shaDeBaseRouge(corps)),
    ["a".repeat(40), "b".repeat(40)],
  );
});

test("a base green after its re-run, or whose re-run still runs, opens no ticket", async () => {
  const depot = new FauxDepot();
  const ouvrir = ouvreReparation({ github: depot.github(), base: "main" });
  assert.deepEqual(await ouvrir([{ name: "tests", outcome: "green", url: job(11, 1) }]), { sha: null, reparation: null });
  // La relance tourne : ses checks sont rendus en cours par `relance-main-rouge.ts`.
  assert.deepEqual(await ouvrir([{ name: "tests", outcome: "pending", url: job(11, 1) }]), { sha: null, reparation: null });
  assert.deepEqual(await ouvrir([]), { sha: null, reparation: null });
  assert.equal(depot.issues.length, 0);
});

test("two projects with different bases and checks each get their ticket, with no project setting", async () => {
  const projets = [
    { base: "main", depot: new FauxDepot("c".repeat(40)), checks: [{ name: "tests", outcome: "red" as const, url: job(1, 1) }] },
    { base: "develop", depot: new FauxDepot("d".repeat(40)), checks: [{ name: "build (ubuntu)", outcome: "red" as const }] },
  ];
  for (const { base, depot, checks } of projets) {
    const { reparation } = await ouvreReparation({ github: depot.github(), base })(checks);
    const [ticket, ...autres] = depot.issues;
    assert.deepEqual(autres, []);
    assert.equal(reparation, ticket?.number);
    assert.ok(ticket?.labels.includes("prio:0") && ticket.labels.includes("fire"));
    assert.match(ticket?.titre ?? "", new RegExp(`\`${base}\`, red on ${depot.tete.slice(0, 7)}`));
    assert.ok(ticket?.corps.includes(marqueDeBaseRouge(depot.tete)));
    assert.ok(ticket?.corps.includes(`\`${checks[0]?.name}\``));
  }
});

test("a marker posted by an untrusted author silences nothing, and an open repair with the old marker counts", async () => {
  const depot = new FauxDepot();
  depot.issues.push({ number: 1, titre: "spam", corps: marqueDeBaseRouge(depot.tete), labels: [], state: "open", association: "NONE" });
  await ouvreReparation({ github: depot.github(), base: "main" })(ROUGE);
  assert.equal(depot.issues.length, 2);

  const ancien = new FauxDepot();
  ancien.issues.push({ number: 1, titre: "repair", corps: marqueDeReparation(ancien.tete), labels: ["fire", "prio:0"], state: "open", association: "OWNER" });
  assert.equal((await ouvreReparation({ github: ancien.github(), base: "main" })(ROUGE)).reparation, 1);
  assert.equal(ancien.issues.length, 1);
});

test("two stations that opened one each at once keep the older and close the other", async () => {
  const depot = new FauxDepot();
  const github = depot.github();
  // L'autre station crée la sienne entre la lecture et la création de celle-ci.
  const creer = github.creerIssue;
  github.creerIssue = async (issue) => {
    await creer(issue);
    return creer(issue);
  };
  const { reparation } = await ouvreReparation({ github, base: "main" })(ROUGE);
  assert.equal(reparation, 100);
  assert.deepEqual(depot.ouvertes().map(({ number }) => number), [100]);
});

test("a refused creation is said and retried by the next call; an unreadable log does not stop the ticket", async () => {
  const depot = new FauxDepot();
  const github = depot.github();
  const creer = github.creerIssue;
  let refus = true;
  github.creerIssue = async (issue) => {
    if (refus) throw new Error("HTTP 502");
    return creer(issue);
  };
  github.journalDuCheck = async () => {
    throw new Error("HTTP 410");
  };
  const ouvrir = ouvreReparation({ github, base: "main" });
  assert.deepEqual(await ouvrir(ROUGE), { sha: depot.tete, reparation: null, erreur: "HTTP 502" });
  refus = false;
  assert.equal((await ouvrir(ROUGE)).reparation, 100);
  assert.match(depot.issues[0]?.corps ?? "", /GitHub gives no output for this check: https:\/\/github\.com\/o\/r\/actions\/runs\/11\/job\/1/);

  // GitHub qui limite ses appels : rien n'est créé, le tour suivant réessaie.
  const limite = new FauxDepot();
  const lent = limite.github();
  lent.journalDuCheck = async () => {
    throw new LimiteGitHubAtteinte(0, 0);
  };
  assert.equal((await ouvreReparation({ github: lent, base: "main" })(ROUGE)).reparation, null);
  assert.equal(limite.issues.length, 0);
});

test("the error output keeps the end of the log up to its last error, truncated on a whole line", () => {
  const lignes = Array.from({ length: 500 }, (_, i) => `2026-11-04T16:40:00Z line ${i}`);
  const sortie = sortieDErreur([...lignes, "2026-11-04T16:41:00Z ##[error]boom", "2026-11-04T16:41:01Z Cleaning up"].join("\n"));
  const gardees = sortie.split("\n");
  assert.equal(gardees.length, LIGNES_MAX);
  assert.equal(gardees.at(-1), "##[error]boom");
  assert.ok(!sortie.includes("Cleaning up"));

  const tronquee = sortieDErreur(lignes.join("\n"), 100);
  assert.ok(tronquee.length <= 102);
  assert.ok(tronquee.startsWith("…\nline "));
  assert.ok(tronquee.endsWith("line 499"));
});

test("an error output carrying backticks stays inside its code block", async () => {
  const depot = new FauxDepot();
  depot.journaux.set("tests", "```\nnot ok\n##[error]exit 1");
  await ouvreReparation({ github: depot.github(), base: "main" })([{ name: "tests", outcome: "red", url: job(1, 1) }]);
  assert.match(depot.issues[0]?.corps ?? "", /````\n```\nnot ok\n##\[error\]exit 1\n````/);
});

// Le ticket de correction du temps des tickets (#2515) : un ticket `prio:0`
// sur le rail quand la médiane des tickets récents dépasse le max du projet,
// et jamais un second tant qu'il est ouvert.
import assert from "node:assert/strict";
import { test } from "node:test";
import { correctionDuTemps, LABELS_CORRECTION, MARQUE_CORRECTION, ticketDeCorrection, type GitHubDeLaCorrection } from "../../src/temps-max/correction.ts";
import { medianeDesRecents, phaseLaPlusLenteDesTickets, ticketsRecents } from "../../src/temps-max/mesure.ts";
import type { TempsTicket } from "../../src/temps-ticket/ligne-status.ts";

type Issue = { number: number; titre: string; corps: string; labels: string[]; state: "open" | "closed"; association: string };

// Le GitHub d'un projet, réduit à ce que la règle lit et écrit.
class FauxDepot {
  issues: Issue[] = [];
  lectures = 0;
  github(): GitHubDeLaCorrection {
    return {
      issuesDepuis: async () => {
        this.lectures += 1;
        return this.issues.map(({ number, corps, association, state }) => ({ number, body: corps, association, state }));
      },
      creerIssue: async ({ titre, corps, labels }) => {
        const number = 2600 + this.issues.length;
        this.issues.push({ number, titre, corps, labels, state: "open", association: "OWNER" });
        return number;
      },
      fermerIssue: async (numero) => {
        const issue = this.issues.find((i) => i.number === numero);
        if (issue) issue.state = "closed";
      },
    };
  }
  ouvertes(): Issue[] {
    return this.issues.filter((i) => i.state === "open");
  }
}

const m = (n: number) => n * 60;
// Les 13 tickets de brigade du 2026-11-05, dans l'ordre de leur merge : [ticket,
// cuisson, attente de la pass, relecture, CI, merge], en minutes.
const LE_5_NOVEMBRE: [number, number, number, number, number, number][] = [
  [2486, 4, 1, 1, 1, 0], // 7
  [2487, 62, 4, 8, 6, 1], // 81
  [2488, 3, 0, 1, 1, 0], // 5
  [2489, 17, 2, 3, 3, 0], // 25
  [2490, 50, 3, 6, 4, 1], // 64
  [2491, 2, 0, 1, 1, 0], // 4
  [2492, 12, 1, 2, 3, 0], // 18
  [2493, 58, 4, 6, 5, 1], // 74
  [2494, 3, 1, 1, 1, 0], // 6
  [2495, 37, 3, 5, 4, 0], // 49
  [2496, 8, 1, 2, 2, 0], // 13
  [2497, 42, 3, 5, 4, 1], // 55
  [2498, 6, 1, 1, 2, 0], // 10
];
// Mergés de 8 h à 18 h (UTC), pris le temps de leurs phases plus tôt — comme la station les écrit.
const journee = (): TempsTicket[] =>
  LE_5_NOVEMBRE.map(([ticket, cuisson, attentePasse, revue, ci, merge], rang) => {
    const fin = Date.UTC(2026, 10, 5, 8) + rang * 50 * 60_000;
    const duree = cuisson + attentePasse + revue + ci + merge;
    return { ticket, claimedAt: new Date(fin - m(duree) * 1000).toISOString(), mergedAt: new Date(fin).toISOString(), cuisson: m(cuisson), cuissonTests: m(1), attentePasse: m(attentePasse), revue: m(revue), ci: m(ci), merge: m(merge) };
  });
// Des tickets d'une seule phase de cuisson, en minutes.
const tickets = (...minutes: number[]): TempsTicket[] => minutes.map((cuisson, rang) => ({ ticket: rang + 1, cuisson: m(cuisson), cuissonTests: 0, attentePasse: 0, revue: 0, ci: 0, merge: 0 }));

const MAINTENANT = () => new Date("2026-11-05T18:05:00Z");

test("brigade's 13 tickets of 2026-11-05: median 18 min against a max of 10, and exactly one correction ticket naming cooking as the slowest phase", async () => {
  const enregistrements = journee();
  assert.equal(ticketsRecents(enregistrements).length, 13);
  assert.equal(medianeDesRecents(enregistrements), m(18));
  assert.equal(phaseLaPlusLenteDesTickets(enregistrements).nom, "cooking");

  const depot = new FauxDepot();
  // Pas de `tempsMaxTicketMin` dans projet.json : le max lu est 10.
  const corriger = correctionDuTemps({ github: depot.github(), lire: () => ({ enregistrements, tempsMaxTicketMin: 10 }), maintenant: MAINTENANT });
  const decision = await corriger();
  assert.deepEqual(decision, { issue: "ouverte", numero: 2600, mediane: m(18), maxMin: 10 });
  assert.equal(depot.issues.length, 1);
  const [ouverte] = depot.issues;
  assert.ok(ouverte);
  assert.deepEqual(ouverte.labels, LABELS_CORRECTION);
  assert.ok(ouverte.labels.includes("prio:0") && ouverte.labels.includes("fire"));
  assert.equal(ouverte.titre, "Tickets take too long: median 18 min over the max of 10 min — cooking is the slowest phase");
  assert.ok(ouverte.corps.startsWith(MARQUE_CORRECTION));
  assert.match(ouverte.corps, /recent tickets, from claim to merge, is \*\*18 min\*\*: over the project's max of 10 min/);
  // La phase la plus lente et ses chiffres.
  assert.match(ouverte.corps, /\*\*cooking\*\*: 304 min of these tickets' time \(74%\), a median of 12 min per ticket\./);
  assert.match(ouverte.corps, /^- pass wait: 24 min \(6%\), median 1 min per ticket$/m);
  // Les tickets les plus lents, du plus long au plus court.
  const lents = ouverte.corps.split("## Slowest tickets")[1]?.split("##")[0]?.trim().split("\n");
  assert.deepEqual(lents, [
    "- #2487: 81 min — slowest phase: cooking 62 min",
    "- #2493: 74 min — slowest phase: cooking 58 min",
    "- #2490: 64 min — slowest phase: cooking 50 min",
    "- #2497: 55 min — slowest phase: cooking 42 min",
    "- #2495: 49 min — slowest phase: cooking 37 min",
  ]);

  // Rejouée — par cette station ou une autre, qui ne sait rien d'elle — tant
  // qu'il est ouvert : pas de second ticket.
  assert.deepEqual(await corriger(), { issue: "deja-ouverte", numero: 2600, mediane: m(18), maxMin: 10 });
  const autre = correctionDuTemps({ github: depot.github(), lire: () => ({ enregistrements, tempsMaxTicketMin: 10 }), maintenant: MAINTENANT });
  assert.deepEqual(await autre(), { issue: "deja-ouverte", numero: 2600, mediane: m(18), maxMin: 10 });
  assert.equal(depot.issues.length, 1);
});

test("the open correction ticket known and listed by the turn costs no GitHub read", async () => {
  const depot = new FauxDepot();
  const corriger = correctionDuTemps({ github: depot.github(), lire: () => ({ enregistrements: journee(), tempsMaxTicketMin: 10 }), maintenant: MAINTENANT });
  await corriger([]);
  const lues = depot.lectures;
  assert.equal((await corriger([2600])).issue, "deja-ouverte");
  assert.equal(depot.lectures, lues);
  // Absent des issues ouvertes que le tour a lues : GitHub est relu, et le dit encore ouvert.
  assert.equal((await corriger([])).issue, "deja-ouverte");
  assert.equal(depot.lectures, lues + 1);
  assert.equal(depot.issues.length, 1);
});

test("at or under the max, nothing is opened and GitHub is not read", async () => {
  const depot = new FauxDepot();
  for (const [enregistrements, max] of [
    [tickets(9, 10, 11), 10],
    [tickets(5, 6), 10],
    [journee(), 20],
    [journee(), 18],
    [[], 10],
  ] as [TempsTicket[], number][]) {
    const decision = await correctionDuTemps({ github: depot.github(), lire: () => ({ enregistrements, tempsMaxTicketMin: max }) })();
    assert.equal(decision.issue, "sous-le-max");
    assert.equal(ticketDeCorrection(enregistrements, max), null);
  }
  assert.equal(depot.issues.length, 0);
  assert.equal(depot.lectures, 0);
});

test("once the correction ticket is closed, a median still over the max opens a new one", async () => {
  const depot = new FauxDepot();
  const corriger = correctionDuTemps({ github: depot.github(), lire: () => ({ enregistrements: tickets(20, 20, 20), tempsMaxTicketMin: 10 }), maintenant: MAINTENANT });
  await corriger();
  await depot.github().fermerIssue(2600);
  assert.deepEqual(await corriger([]), { issue: "ouverte", numero: 2601, mediane: m(20), maxMin: 10 });
  assert.equal(depot.ouvertes().length, 1);
});

test("a marker posted by someone the repository does not trust silences nothing", async () => {
  const depot = new FauxDepot();
  depot.issues.push({ number: 2599, titre: "spoof", corps: MARQUE_CORRECTION, labels: [], state: "open", association: "NONE" });
  const decision = await correctionDuTemps({ github: depot.github(), lire: () => ({ enregistrements: tickets(20), tempsMaxTicketMin: 10 }), maintenant: MAINTENANT })();
  assert.equal(decision.issue, "ouverte");
});

test("two stations that open it at the same time keep the oldest and close the other", async () => {
  const depot = new FauxDepot();
  const github = depot.github();
  // L'autre station crée le sien entre la lecture de celle-ci et sa création.
  const course: GitHubDeLaCorrection = {
    ...github,
    creerIssue: async (issue) => {
      await github.creerIssue({ ...issue, titre: "the other station's" });
      return github.creerIssue(issue);
    },
  };
  const decision = await correctionDuTemps({ github: course, lire: () => ({ enregistrements: tickets(20), tempsMaxTicketMin: 10 }), maintenant: MAINTENANT })();
  assert.deepEqual(decision, { issue: "deja-ouverte", numero: 2600, mediane: m(20), maxMin: 10 });
  assert.deepEqual(depot.ouvertes().map((i) => i.number), [2600]);
});

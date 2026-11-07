// Le ticket de correction du temps perdu (#2670 ; d'abord du temps des
// tickets, #2515) : un ticket `prio:0` sur le rail quand le temps perdu médian
// des tickets récents dépasse le seuil du projet, et jamais un second tant
// qu'il est ouvert, ni avant que la dernière correction servie ait des tickets
// récents à elle (#2577).
import assert from "node:assert/strict";
import { test } from "node:test";
import { correctionDuTemps, LABELS_CORRECTION, MARQUE_CORRECTION, ticketDeCorrection, type GitHubDeLaCorrection } from "../../src/temps-max/correction.ts";
import { medianePerdueDesRecents, perteLaPlusLourde, ticketsRecents } from "../../src/temps-max/mesure.ts";
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
// Une journée de 7 tickets, dans l'ordre de leur merge : [ticket, attente avant
// la prise, cooks ratés, renvois], en minutes ; chacun cuit 10 min de plus.
const PERTES_DU_JOUR: [number, number, number, number][] = [
  [2601, 1, 0, 0], // 1
  [2602, 3, 12, 0], // 15
  [2603, 0, 0, 0], // 0
  [2604, 2, 0, 6], // 8
  [2605, 1, 9, 0], // 10
  [2606, 0, 0, 0], // 0
  [2607, 4, 0, 0], // 4
];
// Mergés d'heure en heure (UTC), déposés le temps de leurs pertes et de leur cuisson plus tôt — comme la station les écrit.
const journee = (): TempsTicket[] =>
  PERTES_DU_JOUR.map(([ticket, attente, ratees, renvois], rang) => {
    const fin = Date.UTC(2026, 10, 5, 8) + rang * 60 * 60_000;
    return { ticket, depuis: new Date(fin - m(10 + attente + ratees + renvois) * 1000).toISOString(), claimedAt: new Date(fin - m(10) * 1000).toISOString(), mergedAt: new Date(fin).toISOString(), cuisson: m(10), cuissonTests: 0, attentePasse: 0, revue: 0, ci: 0, merge: 0, perdu: { attente: m(attente), ratees: m(ratees), renvois: m(renvois) } };
  });
// Des tickets qui n'ont perdu que l'attente d'une prise, en minutes.
const tickets = (...minutes: number[]): TempsTicket[] => minutes.map((attente, rang) => ({ ticket: rang + 1, attentePrise: m(attente), cuisson: m(5), cuissonTests: 0, attentePasse: 0, revue: 0, ci: 0, merge: 0 }));

const MAINTENANT = () => new Date("2026-11-05T18:05:00Z");

test("7 tickets that lost a median 4 min against the threshold of 2: exactly one correction ticket, naming failed cooks as the heaviest loss with the tickets concerned", async () => {
  const enregistrements = journee();
  assert.equal(ticketsRecents(enregistrements).length, 7);
  assert.equal(medianePerdueDesRecents(enregistrements), m(4));
  assert.equal(perteLaPlusLourde(enregistrements)?.nom, "failed cooks");

  const depot = new FauxDepot();
  // Pas de `lostTimeMaxMin` dans projet.json : le seuil lu est 2.
  const corriger = correctionDuTemps({ github: depot.github(), lire: () => ({ enregistrements, lostTimeMaxMin: 2 }), maintenant: MAINTENANT });
  const decision = await corriger();
  assert.deepEqual(decision, { issue: "ouverte", numero: 2600, mediane: m(4), seuilMin: 2 });
  assert.equal(depot.issues.length, 1);
  const [ouverte] = depot.issues;
  assert.ok(ouverte);
  assert.deepEqual(ouverte.labels, LABELS_CORRECTION);
  // `opus` / `medium`, comme la table du manager (#2575) : en `high`, chaque correction ajoutait un ticket lent.
  assert.ok(ouverte.labels.includes("model:opus") && ouverte.labels.includes("effort:medium"));
  assert.ok(ouverte.labels.includes("prio:0") && ouverte.labels.includes("fire"));
  assert.equal(ouverte.titre, "Tickets lose too much time: median 4 min lost over the threshold of 2 min — failed cooks weighs most");
  assert.ok(ouverte.corps.startsWith(MARQUE_CORRECTION));
  assert.match(ouverte.corps, /lost time of the project's 7 recent tickets is \*\*4 min\*\*: over the project's threshold of 2 min \(`lostTimeMaxMin`/);
  assert.match(ouverte.corps, /except the cook that delivered and the pass, CI and merge of the merged delivery\. These tickets lost 38 min of their 108 min\./);
  // La perte la plus lourde et ses chiffres, puis les trois.
  assert.match(ouverte.corps, /\*\*failed cooks\*\*: 21 min of these tickets' lost time \(55%\), a median of 0 min per ticket, in 2 of the 7 tickets\./);
  assert.match(ouverte.corps, /^- waiting for a claim: 11 min \(29%\), median 1 min per ticket, in 5 tickets$/m);
  assert.match(ouverte.corps, /^- send-backs: 6 min \(16%\), median 0 min per ticket, in 1 tickets$/m);
  // Les tickets concernés, de celui qui a le plus perdu à celui qui a le moins perdu.
  const concernes = ouverte.corps.split("## Tickets concerned")[1]?.split("##")[0]?.trim().split("\n");
  assert.deepEqual(concernes, ["- #2602: 12 min of failed cooks — 15 min lost of 25 min", "- #2605: 9 min of failed cooks — 10 min lost of 20 min"]);

  // Rejouée — par cette station ou une autre, qui ne sait rien d'elle — tant
  // qu'il est ouvert : pas de second ticket.
  assert.deepEqual(await corriger(), { issue: "deja-ouverte", numero: 2600, mediane: m(4), seuilMin: 2 });
  const autre = correctionDuTemps({ github: depot.github(), lire: () => ({ enregistrements, lostTimeMaxMin: 2 }), maintenant: MAINTENANT });
  assert.deepEqual(await autre(), { issue: "deja-ouverte", numero: 2600, mediane: m(4), seuilMin: 2 });
  assert.equal(depot.issues.length, 1);
});

test("the open correction ticket known and listed by the turn costs no GitHub read", async () => {
  const depot = new FauxDepot();
  const corriger = correctionDuTemps({ github: depot.github(), lire: () => ({ enregistrements: journee(), lostTimeMaxMin: 2 }), maintenant: MAINTENANT });
  await corriger([]);
  const lues = depot.lectures;
  assert.equal((await corriger([2600])).issue, "deja-ouverte");
  assert.equal(depot.lectures, lues);
  // Absent des issues ouvertes que le tour a lues : GitHub est relu, et le dit encore ouvert.
  assert.equal((await corriger([])).issue, "deja-ouverte");
  assert.equal(depot.lectures, lues + 1);
  assert.equal(depot.issues.length, 1);
});

test("at or under the threshold, nothing is opened and GitHub is not read — however long the tickets took", async () => {
  const depot = new FauxDepot();
  // Des tickets d'une heure qui n'ont rien perdu : aucun max de durée ne tient plus.
  const longs: TempsTicket[] = [60, 90, 120].map((minutes, rang) => ({ ticket: rang + 1, cuisson: m(minutes), cuissonTests: 0, attentePasse: 0, revue: 0, ci: 0, merge: 0 }));
  for (const [enregistrements, seuil] of [
    [tickets(1, 2, 3), 2],
    [tickets(1, 1.5), 2],
    [journee(), 4],
    [journee(), 20],
    [longs, 2],
    [[], 2],
  ] as [TempsTicket[], number][]) {
    const decision = await correctionDuTemps({ github: depot.github(), lire: () => ({ enregistrements, lostTimeMaxMin: seuil }) })();
    assert.equal(decision.issue, "sous-le-seuil");
    assert.equal(ticketDeCorrection(enregistrements, seuil), null);
  }
  assert.equal(depot.issues.length, 0);
  assert.equal(depot.lectures, 0);
});

test("once the correction ticket is closed, a median lost time still over the threshold opens a new one", async () => {
  const depot = new FauxDepot();
  const corriger = correctionDuTemps({ github: depot.github(), lire: () => ({ enregistrements: tickets(20, 20, 20), lostTimeMaxMin: 10 }), maintenant: MAINTENANT });
  await corriger();
  await depot.github().fermerIssue(2600);
  assert.deepEqual(await corriger([]), { issue: "ouverte", numero: 2601, mediane: m(20), seuilMin: 10 });
  assert.equal(depot.ouvertes().length, 1);
});

test("a marker posted by someone the repository does not trust silences nothing", async () => {
  const depot = new FauxDepot();
  depot.issues.push({ number: 2599, titre: "spoof", corps: MARQUE_CORRECTION, labels: [], state: "open", association: "NONE" });
  const decision = await correctionDuTemps({ github: depot.github(), lire: () => ({ enregistrements: tickets(20), lostTimeMaxMin: 10 }), maintenant: MAINTENANT })();
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
  const decision = await correctionDuTemps({ github: course, lire: () => ({ enregistrements: tickets(20), lostTimeMaxMin: 10 }), maintenant: MAINTENANT })();
  assert.deepEqual(decision, { issue: "deja-ouverte", numero: 2600, mediane: m(20), seuilMin: 10 });
  assert.deepEqual(depot.ouvertes().map((i) => i.number), [2600]);
});

// Des tickets de 20 min, pris à `debut` puis toutes les heures, mergés 20 min après leur prise, qui ont perdu 20 min avant elle.
const lents = (premier: number, combien: number, debut: number): TempsTicket[] =>
  Array.from({ length: combien }, (_, rang) => {
    const prise = debut + rang * 60 * 60_000;
    return { ticket: premier + rang, claimedAt: new Date(prise).toISOString(), mergedAt: new Date(prise + 20 * 60_000).toISOString(), attentePrise: m(20), cuisson: m(20), cuissonTests: 0, attentePasse: 0, revue: 0, ci: 0, merge: 0 };
  });

test("#2577: a served correction is tried on the tickets claimed after its merge — no new one while a recent ticket was claimed before it, one once they all were", async () => {
  const depot = new FauxDepot();
  const avant = lents(1, 12, Date.UTC(2026, 10, 5, 0));
  let enregistrements = avant;
  const corriger = correctionDuTemps({ github: depot.github(), lire: () => ({ enregistrements, lostTimeMaxMin: 10 }), maintenant: MAINTENANT });
  assert.equal((await corriger()).issue, "ouverte");
  // Servie : mergée à 12 h 30, fermée.
  const servie = "2026-11-05T12:30:00.000Z";
  enregistrements = [...avant, { ticket: 2600, claimedAt: "2026-11-05T12:20:00.000Z", mergedAt: servie, cuisson: m(10), cuissonTests: 0, attentePasse: 0, revue: 0, ci: 0, merge: 0 }];
  await depot.github().fermerIssue(2600);

  // Deux minutes après, la médiane est toujours celle des tickets d'avant elle : rien ne s'ouvre.
  assert.deepEqual(await corriger([]), { issue: "a-l-essai", numero: 2600, servie, mediane: m(20), seuilMin: 10 });
  // Tant qu'elle est à l'essai, un tour ne relit pas GitHub, et une autre station ne rouvre rien non plus.
  const lues = depot.lectures;
  assert.equal((await corriger([])).issue, "a-l-essai");
  assert.equal(depot.lectures, lues);
  assert.equal((await correctionDuTemps({ github: depot.github(), lire: () => ({ enregistrements, lostTimeMaxMin: 10 }), maintenant: MAINTENANT })()).issue, "a-l-essai");
  // Des tickets pris après son merge, mais la fenêtre de 24 h en garde d'avant : encore à l'essai.
  enregistrements = [...enregistrements, ...lents(30, 10, Date.parse(servie) + 60_000)];
  assert.equal((await corriger([])).issue, "a-l-essai");
  assert.equal(depot.ouvertes().length, 0);

  // Les tickets récents sont tous pris après elle, et toujours au-dessus du seuil : la suivante s'ouvre.
  enregistrements = [...enregistrements, ...lents(50, 10, Date.UTC(2026, 10, 7, 0))];
  assert.ok(Math.min(...ticketsRecents(enregistrements).map((t) => Date.parse(t.claimedAt ?? ""))) > Date.parse(servie));
  assert.deepEqual(await corriger([]), { issue: "ouverte", numero: 2601, mediane: m(20), seuilMin: 10 });
  assert.equal(depot.ouvertes().length, 1);
});

test("#2577: a correction closed without a merge is no correction on trial — a median lost time still over the threshold opens the next one", async () => {
  const depot = new FauxDepot();
  const enregistrements = lents(1, 12, Date.UTC(2026, 10, 5, 0));
  const corriger = correctionDuTemps({ github: depot.github(), lire: () => ({ enregistrements, lostTimeMaxMin: 10 }), maintenant: MAINTENANT });
  await corriger();
  await depot.github().fermerIssue(2600);
  assert.deepEqual(await corriger([]), { issue: "ouverte", numero: 2601, mediane: m(20), seuilMin: 10 });
});

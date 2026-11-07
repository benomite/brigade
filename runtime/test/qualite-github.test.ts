// La qualité d'un ticket mergé lue sur GitHub (#2707) : ses marques
// `brigade:renvoi` et `brigade:echec`, et la marque d'une réparation de la
// base. Le journal ne la sait plus depuis #2061 ; ces tests n'en ouvrent aucun.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { corpsDeLaReparation } from "../src/base-rouge/ouvre-reparation.ts";
import { direLaQualite, mesurerQualite } from "../src/mesure-qualite.ts";
import { causesDesTemps, checksDeLaReparation, parcoursDesTemps, qualiteDeLIssue, qualitesDesTemps } from "../src/qualite-github.ts";
import { PRIO_REPARATION } from "../src/reparation.ts";
import { derivePremierCoup } from "../src/renvois.ts";
import { direLesReparations } from "../src/status-reparations.ts";

const station = (body: string) => ({ body, association: "MEMBER" });
const renvoi = (n: number, raison: string) => station(`<!-- brigade:renvoi n=${n} sha=${"a".repeat(40)} -->\nStation \`box/claude\`: sent back to a cook (${n}/2) — ${raison}`);
const echec = (n: number, motif: string) => station(`<!-- brigade:echec n=${n} -->\nStation \`box/claude\`: the cook stopped without a delivery — ${motif}`);

test("a ticket's quality is read from its station comments: each send-back with its cause, each cook without a delivery", () => {
  const qualite = qualiteDeLIssue({
    corps: "## Context\n\nA ticket.",
    labels: ["fire"],
    commentaires: [
      echec(1, "duration cap reached"),
      renvoi(1, "the review requested changes: tests missing"),
      renvoi(2, "the CI is red on `abc1234`: types (runtime)"),
      station(`<!-- brigade:renvoi n=3 sha=${"b".repeat(40)} -->\nStation \`box/claude\`: still not mergeable after 2 sends back — the PR conflicts with the base: merge the base`),
      // Un commentaire qui imite la marque, d'un inconnu, et un commentaire ordinaire de la station : aucun ne compte.
      { body: renvoi(4, "the CI is red").body, association: "NONE" },
      station("Station `box/claude`: the cook added nothing, and the delivery still has work left — rebase."),
    ],
  });
  assert.deepEqual(qualite, { renvois: ["blocking review", "red gates: type check", "conflict with the base"], cooksRates: 1, ratees: ["cap on duration"] });
});

test("a repair of main is known by its priority and its red-commit mark, and names the checks its body lists", () => {
  const corps = corpsDeLaReparation("main", "4ddaa96", [
    { nom: "tests runtime (6/16)", url: null, sortie: "FAIL" },
    { nom: "types (app)", url: null, sortie: null },
  ]);
  assert.deepEqual(checksDeLaReparation(corps), ["tests runtime (6/16)", "types (app)"]);
  assert.deepEqual(qualiteDeLIssue({ corps, labels: ["fire", PRIO_REPARATION], commentaires: [] }), { renvois: [], cooksRates: 0, ratees: [], reparation: ["tests runtime (6/16)", "types (app)"] });
  // Sans sa priorité, le même corps n'est pas une réparation.
  assert.equal(qualiteDeLIssue({ corps, labels: ["fire"], commentaires: [] }).reparation, undefined);
});

test("only the records that carry a well-formed quality are known; the parcours and the causes are rebuilt from them", () => {
  const temps = [
    { ticket: 1, claimedAt: "2026-11-07T10:00:00Z", mergedAt: "2026-11-07T10:30:00Z" },
    { ticket: 2, claimedAt: "2026-11-07T10:00:00Z", mergedAt: "2026-11-07T10:40:00Z", qualite: { renvois: ["blocking review"], cooksRates: 1 } },
    { ticket: 3, claimedAt: "2026-11-07T10:00:00Z", mergedAt: "2026-11-07T10:50:00Z", qualite: { renvois: "no", cooksRates: 0 } },
    { ticket: 4, claimedAt: "2026-11-07T10:00:00Z", mergedAt: "2026-11-07T11:00:00Z", qualite: { renvois: [], cooksRates: 0, reparation: ["tests (app)"] } },
  ];
  assert.deepEqual([...qualitesDesTemps(temps).keys()], [2, 4]);
  const parcours = parcoursDesTemps(temps);
  assert.deepEqual(parcours.map(({ ticket, attempts }) => [ticket, attempts.map(({ outcome, verdict }) => `${outcome}/${verdict}`)]), [
    [2, ["failed/null", "ok/red", "ok/green"]],
    [4, ["ok/green"]],
  ]);
  const { rates, lignes } = causesDesTemps(temps);
  assert.equal(rates, 2);
  assert.deepEqual(lignes.filter(({ essais }) => essais > 0).map(({ cause, essais, pourcent, tickets }) => ({ cause, essais, pourcent, tickets })), [
    { cause: "relecture", essais: 1, pourcent: 50, tickets: [2] },
    { cause: "autre", essais: 1, pourcent: 50, tickets: [2] },
  ]);
});

test("the first-try drift of `status` reads the same records: four of ten on the first try is under 50%", () => {
  const temps = Array.from({ length: 10 }, (_, i) => ({ ticket: i + 1, mergedAt: "2026-11-07T10:00:00Z", qualite: { renvois: i < 6 ? ["red CI"] : [], cooksRates: 0 } }));
  assert.deepEqual(derivePremierCoup(parcoursDesTemps(temps), {}), { premiers: 4, retenus: 10, fenetre: 10, seuil: 50 });
});

// Le rejeu (#2707) : les 74 PR mergées sur brigade dans les 24 heures avant
// 2026-11-06T17:03:46Z — la fenêtre des mesures de temps, au dernier merge —,
// dont 7 réparations de `main`, telles que l'historique de `main` les donne
// (`fixtures/merges-2026-11-05-07.json` : le ticket, la PR, l'heure du merge,
// le titre). Chaque réparation porte son corps tel que la station l'ouvre,
// avec le check que son titre nomme ; le fixture ne garde pas les commentaires
// des issues, ni donc leurs marques de renvoi et d'échec.
type Merge = { ticket: number; pr: number; mergedAt: string; title: string };
const MERGES = JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", "merges-2026-11-05-07.json"), "utf8")) as Merge[];

test("replayed on brigade's merges of 2026-11-05 to 07, the quality figures are not empty: 74 merged PRs, 7 repairs of main", () => {
  const temps = MERGES.map(({ ticket, mergedAt, title }) => {
    const reparation = /^Repair `main`, red on ([0-9a-f]+): (.+?)(?: \(and \d+ more\))?$/.exec(title);
    const issue = reparation === null ? { corps: `## Context\n\n${title}`, labels: ["fire"], commentaires: [] } : { corps: corpsDeLaReparation("main", reparation[1] as string, [{ nom: reparation[2] as string, url: null, sortie: null }]), labels: ["fire", PRIO_REPARATION], commentaires: [] };
    return { ticket, mergedAt, cuisson: 0, cuissonTests: 0, attentePasse: 0, revue: 0, ci: 0, merge: 0, qualite: qualiteDeLIssue(issue) };
  });
  assert.equal(temps.length, 74);
  const qualite = mesurerQualite(temps, qualitesDesTemps(temps));
  assert.equal(qualite.tickets.length, 74);
  assert.equal(qualite.mesures, 74);
  assert.equal(qualite.inconnus, 0);
  assert.equal(qualite.reparations, 7);
  assert.equal(qualite.premierCoup, 1);
  assert.deepEqual(qualite.checksCasses, [
    { nom: "windows tests (7/8)", fois: 4 },
    { nom: "tests runtime (1/16)", fois: 1 },
    { nom: "windows tests (5/8)", fois: 1 },
    { nom: "windows app tests", fois: 1 },
  ]);
  assert.deepEqual(direLaQualite(qualite).slice(0, 2), [
    "- First try: 100% of the 74 recent tickets with their GitHub markers recorded — at or over the project's threshold of 70%.",
    "- Repairs of main: 7 over 74 merged PRs, 0.095 per merge — within one per ten merges.",
  ]);
  assert.equal(direLesReparations(temps, qualitesDesTemps(temps)), "repairs     7 repairs of main / 74 merged PRs = 0.095 (recent tickets)");
});

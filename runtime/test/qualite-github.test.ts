// La qualité d'un ticket mergé lue sur GitHub (#2707) : ses marques
// `brigade:renvoi` et `brigade:echec`, et la marque d'une réparation de la
// base. Le journal ne la sait plus depuis #2061 ; ces tests n'en ouvrent aucun.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { corpsDeLaReparation } from "../src/base-rouge/ouvre-reparation.ts";
import { lireEtat } from "../src/etat.ts";
import { SANS_SEUIL } from "../src/mesures.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { direLaQualite, mesurerQualite } from "../src/mesure-qualite.ts";
import { causeDuRenvoi, causesDesTemps, checksDeLaReparation, parcoursDesTemps, qualiteDeLIssue, qualitesDesTemps, RAISONS_DE_RENVOI } from "../src/qualite-github.ts";
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
  assert.deepEqual(qualite, { renvois: ["blocking review", "red gates: type check", "conflict with the base"], cooksRates: 1 });
});

test("each send-back reason the station writes is classed by the same words: a reason changed in `RAISONS_DE_RENVOI` changes both", () => {
  const causes = Object.fromEntries(Object.entries(RAISONS_DE_RENVOI).map(([cle, debut]) => [cle, causeDuRenvoi(renvoi(1, `${debut} \`abc1234\`: tests runtime (2/16)`).body)]));
  assert.deepEqual(causes, { conflit: "conflit", second: "relecture", ci: "gates-runtime", relecture: "relecture" });
  // Une raison que la station n'écrit pas est « autre », jamais une cause devinée.
  assert.equal(causeDuRenvoi(renvoi(1, "something else").body), "autre");
});

test("a repair of main is known by its priority and its red-commit mark, and names the checks its body lists", () => {
  const corps = corpsDeLaReparation("main", "4ddaa96", [
    { nom: "tests runtime (6/16)", url: null, sortie: "FAIL" },
    { nom: "types (app)", url: null, sortie: null },
  ]);
  assert.deepEqual(checksDeLaReparation(corps), ["tests runtime (6/16)", "types (app)"]);
  assert.deepEqual(qualiteDeLIssue({ corps, labels: ["fire", PRIO_REPARATION], commentaires: [] }), { renvois: [], cooksRates: 0, reparation: ["tests runtime (6/16)", "types (app)"] });
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
// avec le check que son titre nomme. Les commentaires des issues ne sont pas
// dans le fixture : un cook ne lit pas GitHub. Les marques de renvoi et
// d'échec ci-dessous sont écrites au format exact de la station, sur des
// tickets du rejeu, pour que le premier coup se lise des marques et non d'un
// défaut à 100 % ; ce ne sont pas celles que GitHub porte.
type Merge = { ticket: number; pr: number; mergedAt: string; title: string };
const MERGES = JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", "merges-2026-11-05-07.json"), "utf8")) as Merge[];
const MARQUES: Record<number, ReturnType<typeof station>[]> = {
  2458: [renvoi(1, `${RAISONS_DE_RENVOI.relecture}: tests missing`)],
  2461: [echec(1, "the cook committed nothing (12 turns, exit code 0); the cook produced no last message"), renvoi(1, `${RAISONS_DE_RENVOI.ci} \`1234567\`: types (runtime)`)],
  2470: [renvoi(1, `${RAISONS_DE_RENVOI.conflit}: merge the base into the branch`), renvoi(2, `${RAISONS_DE_RENVOI.relecture}: still red`)],
  2466: [echec(1, "claude ended in error (exit code 1)")],
};

const rejouer = () =>
  MERGES.map(({ ticket, mergedAt, title }) => {
    const reparation = /^Repair `main`, red on ([0-9a-f]+): (.+?)(?: \(and \d+ more\))?$/.exec(title);
    const commentaires = MARQUES[ticket] ?? [];
    const issue = reparation === null ? { corps: `## Context\n\n${title}`, labels: ["fire"], commentaires } : { corps: corpsDeLaReparation("main", reparation[1] as string, [{ nom: reparation[2] as string, url: null, sortie: null }]), labels: ["fire", PRIO_REPARATION], commentaires };
    return { ticket, claimedAt: mergedAt, mergedAt, cuisson: 0, cuissonTests: 0, attentePasse: 0, revue: 0, ci: 0, merge: 0, qualite: qualiteDeLIssue(issue) };
  });

test("replayed on brigade's merges of 2026-11-05 to 07, the quality figures are not empty: 74 merged PRs, 7 repairs of main, and the first try read from the markers", () => {
  const temps = rejouer();
  assert.equal(temps.length, 74);
  const qualite = mesurerQualite(temps, qualitesDesTemps(temps));
  assert.equal(qualite.tickets.length, 74);
  assert.equal(qualite.mesures, 74);
  assert.equal(qualite.inconnus, 0);
  assert.equal(qualite.reparations, 7);
  // Quatre tickets marqués : 70 sur 74 du premier coup.
  assert.equal(qualite.premierCoup, 70 / 74);
  assert.deepEqual(qualite.checksCasses, [
    { nom: "windows tests (7/8)", fois: 4 },
    { nom: "tests runtime (1/16)", fois: 1 },
    { nom: "windows tests (5/8)", fois: 1 },
    { nom: "windows app tests", fois: 1 },
  ]);
  assert.deepEqual(direLaQualite(qualite).slice(0, 2), [
    "- First try: 95% of the 74 recent tickets with their GitHub markers recorded — at or over the project's threshold of 70%.",
    "- Repairs of main: 7 over 74 merged PRs, 0.095 per merge — within one per ten merges.",
  ]);
  assert.equal(direLesReparations(temps, qualitesDesTemps(temps)), "repairs     7 repairs of main / 74 merged PRs = 0.095 (recent tickets)");
  const { rates, lignes } = causesDesTemps(temps);
  assert.equal(rates, 6);
  assert.deepEqual(Object.fromEntries(lignes.filter(({ essais }) => essais > 0).map(({ cause, essais }) => [cause, essais])), { relecture: 2, "gates-types": 1, conflit: 1, autre: 2 });
});

test("replayed, `status`'s state reads the first-try drift from the clone's times it is given, never from the log", (t) => {
  const repertoire = mkdtempSync(join(tmpdir(), "qualite-github-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const journal = ouvrirJournal(repertoire);
  t.after(() => journal.fermer());
  // Les dix premiers tickets du rejeu, dont quatre marqués, sous un seuil du premier coup à 70 %.
  const temps = rejouer().slice(0, 10);
  journal.ajouter({ project: "brigade", ticket: null, author: "runtime", type: "drift.configured", payload: { limits: { ...SANS_SEUIL, firstTryPercent: 70 } } });
  const maintenant = new Date("2026-11-07T00:00:00Z");
  assert.equal(lireEtat(journal, maintenant).derivePremierCoup, null);
  assert.deepEqual(lireEtat(journal, maintenant, { temps }).derivePremierCoup, { premiers: 6, retenus: 10, fenetre: 10, seuil: 70 });
});

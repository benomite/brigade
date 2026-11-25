// #4308 : ce que les délais lisent du clone — les temps que la station écrit au merge, et la fiche de chaque ticket
// (titre, labels) — et ce que `status` en dit, sans GitHub.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { calculerLesDelais, type Delais } from "../../src/delais/delais.ts";
import { direLesDelais } from "../../src/delais/affichage.ts";
import { delaisDuClone, retenirLaFiche } from "../../src/delais/lecture.ts";
import { demarrer } from "../../src/runtime.ts";
import { principal as status } from "../../src/status.ts";
import { appeler, repertoireTemporaire } from "../outils.ts";

const MAINTENANT = new Date("2026-11-25T12:00:00.000Z");
const a = (minutes: number, maintenant = MAINTENANT) => new Date(maintenant.getTime() - minutes * 60_000).toISOString();
const phases = { cuisson: 0, cuissonTests: 0, attentePasse: 0, revue: 0, ci: 0, merge: 0 };
const FICHES = ".claude/brigade/delais-tickets.json";

// Pris il y a 100 min, PR à 70 (premier passage), renvoyé, dernier passage à 40 : gates 2 min, CI 3, relecture 5 ; mergé il y a 10 min.
const avecPasses = (m = MAINTENANT) => ({
  ticket: 9,
  claimedAt: a(95, m),
  priseAt: a(100, m),
  mergedAt: a(10, m),
  ...phases,
  passes: [
    { debut: a(70, m), fin: a(60, m), attente: 60, gates: 60, revue: 300, ci: 0, merge: 0, renvoyee: true },
    { debut: a(40, m), fin: a(10, m), attente: 120, gates: 120, revue: 300, ci: 180, merge: 60, renvoyee: false },
  ],
});
const fiche = { ticket: 9, titre: "A slow ticket", etiquettes: ["fire", "attendu:20", "model:opus", "effort:high"] };

function clone(t: TestContext, temps: readonly object[]): string {
  const d = repertoireTemporaire(t);
  mkdirSync(join(d, ".claude", "brigade"), { recursive: true });
  writeFileSync(join(d, ".claude", "brigade", "temps-tickets.json"), JSON.stringify(temps));
  return d;
}
const lus = (d: string, m = MAINTENANT) => delaisDuClone(d, m) as Delais;

test("a record with its passes: PR at the first, send-backs to the last, gates with CI and review of the last", (t) => {
  const d = clone(t, [avecPasses()]);
  retenirLaFiche(d, fiche);
  assert.deepEqual(lus(d).pires_depassements, [{ ticket: 9, titre: "A slow ticket", attendu_min: 20, reel_min: 90, modele: "opus", effort: "high", repartition_min: { cook: 30, gates: 5, review: 5, renvois: 30, attentes: 20 } }]);
});

test("a record without passes: the PR opens after its cooks, its phases are the parts; no claim on the issue, the station's first mark", (t) => {
  const sans = { ticket: 3, claimedAt: a(60), mergedAt: a(0), ...phases, cuisson: 600, cuissonsRatees: 300, gates: 60, ci: 120, revue: 240, renvois: 420 };
  const d = clone(t, [sans, { ...sans, ticket: 4, priseAt: null }, { ...sans, ticket: 5, mergedAt: undefined }, { ...sans, ticket: 6, claimedAt: undefined }]);
  for (const ticket of [3, 4]) retenirLaFiche(d, { ticket, titre: `T${ticket}`, etiquettes: ["attendu:10"] });
  const delais = lus(d);
  assert.equal(delais.fusionnes, 2, "no merge or no claim dated: not counted");
  assert.deepEqual(delais.pires_depassements.map(({ ticket, reel_min, modele, effort, repartition_min }) => ({ ticket, reel_min, modele, effort, repartition_min })), [3, 4].map((ticket) => ({ ticket, reel_min: 60, modele: "?", effort: "?", repartition_min: { cook: 15, gates: 3, review: 4, renvois: 7, attentes: 31 } })));
});

test("the expected time is one positive `attendu:` label, else none; a ticket exactly on its expected time is on time", () => {
  const pile = { ticket: 1, titre: "", etiquettes: ["attendu:30"], modele: "?", effort: "?", priseAt: a(31), prOuverteAt: a(20), fusionneAt: a(1), gatesMin: 0, revueMin: 0, renvoisMin: 0 };
  assert.equal(calculerLesDelais([pile], MAINTENANT).dans_les_temps, 1);
  assert.equal(calculerLesDelais([{ ...pile, etiquettes: ["attendu:10", "attendu:10"] }], MAINTENANT).pires_depassements[0]?.attendu_min, 10);
  for (const etiquettes of [["attendu:0"], ["attendu:abc"], ["attendu:10", "attendu:20"]]) assert.equal(calculerLesDelais([{ ...pile, etiquettes }], MAINTENANT).sans_temps_attendu, 1, etiquettes.join());
  assert.equal(calculerLesDelais([{ ...pile, fusionneAt: a(24 * 60), priseAt: a(24 * 60 + 30) }], MAINTENANT).fusionnes, 1, "merged exactly 24 h ago: inside the window");
});

test("the worst overrun is the one furthest past its own expected time, not the longest", () => {
  const ticket = (n: number, attendu: number, reel: number) => ({ ticket: n, titre: `T${n}`, etiquettes: [`attendu:${attendu}`], modele: "?", effort: "?", priseAt: a(reel), prOuverteAt: a(0), fusionneAt: a(0), gatesMin: 0, revueMin: 0, renvoisMin: 0 });
  // #1 : 20 min past 10 ; #2 : 10 min past 100, longer but nearer its expected time.
  assert.deepEqual(calculerLesDelais([ticket(2, 100, 110), ticket(1, 10, 30)], MAINTENANT).pires_depassements.map((p) => p.ticket), [1, 2]);
});

test("the share line counts the tickets without an expected time apart, and says when none has one", () => {
  const base = { fenetre_heures: 24, fusionnes: 3, dans_les_temps: 2, part_dans_les_temps: 1, sans_temps_attendu: 1, pires_depassements: [] };
  assert.match(direLesDelais(base).join("\n"), /100 % \(2\/2\).* · 1 without an expected time/);
  assert.doesNotMatch(direLesDelais({ ...base, fusionnes: 2, sans_temps_attendu: 0 }).join("\n"), /without an expected time/);
  assert.match(direLesDelais({ ...base, fusionnes: 1, dans_les_temps: 0, part_dans_les_temps: null }).join("\n"), /no merged ticket with an expected time in the last 24 h · 1 without/);
});

test("the clone's tickets join their cards; without a clone none; a ticket without a card has no expected time", (t) => {
  assert.equal((delaisDuClone(undefined, MAINTENANT) as Delais).fusionnes, 0);
  const d = clone(t, [avecPasses(), { ...avecPasses(), ticket: 8, passes: undefined }]);
  assert.equal(lus(d).sans_temps_attendu, 2, "no card file: no expected time");
  retenirLaFiche(d, fiche);
  const delais = lus(d);
  assert.equal(delais.fusionnes, 2);
  assert.equal(delais.sans_temps_attendu, 1);
  assert.equal(delais.pires_depassements[0]?.titre, "A slow ticket");
});

test("a card file that does not read is said, never overwritten, and its malformed entries are dropped", (t) => {
  const d = clone(t, [avecPasses()]);
  const fichier = join(d, FICHES);
  writeFileSync(fichier, "{ not json");
  const illisible = delaisDuClone(d, MAINTENANT);
  assert.ok("illisible" in illisible);
  assert.match(direLesDelais(illisible).join("\n"), /merged tickets unreadable/);
  assert.throws(() => retenirLaFiche(d, fiche));
  assert.equal(readFileSync(fichier, "utf8"), "{ not json");
  writeFileSync(fichier, JSON.stringify({ ticket: 9 }));
  assert.match((delaisDuClone(d, MAINTENANT) as { illisible: string }).illisible, /not a JSON array/);
  writeFileSync(fichier, JSON.stringify([7, fiche, { ticket: 9, titre: "no labels" }, { ticket: 8.5, titre: "x", etiquettes: [] }, { ticket: 9, titre: 9, etiquettes: [] }]));
  assert.equal(lus(d).pires_depassements[0]?.titre, "A slow ticket");
});

test("a ticket's card replaces its older one, and only the last 200 are kept", (t) => {
  const d = repertoireTemporaire(t);
  for (let n = 1; n <= 202; n++) retenirLaFiche(d, { ticket: n, titre: `T${n}`, etiquettes: [] });
  retenirLaFiche(d, { ticket: 5, titre: "again", etiquettes: [] });
  const lues = JSON.parse(readFileSync(join(d, FICHES), "utf8")) as { ticket: number; titre: string }[];
  assert.equal(lues.length, 200);
  assert.deepEqual(lues.at(-1), { ticket: 5, titre: "again", etiquettes: [] });
  assert.equal(lues.filter((l) => l.ticket === 5).length, 1);
  assert.equal(lues[0]?.ticket, 3);
});

test("`status` and `status --json` read the clone: the share, the overrun and its parts; `--json` takes no other argument", async (t) => {
  const temps = avecPasses(new Date());
  const d = clone(t, [temps, { ...temps, ticket: 8, passes: undefined }]);
  retenirLaFiche(d, fiche);
  const repertoire = repertoireTemporaire(t);
  demarrer({ repertoireEtat: repertoire, projet: "brigade" }).arreter("SIGTERM");
  const env = { BRIGADE_STATE_DIR: repertoire, BRIGADE_REPO_DIR: d };
  const texte = appeler(status, [], env);
  assert.equal(await texte.fin, 0);
  assert.match(texte.sortie(), /0 % \(0\/1\).* · 1 without an expected time/);
  assert.match(texte.sortie(), /#9 A slow ticket — expected 20 min, actual 90 min \(opus \/ high\): cook 30 · gates 5 · review 5 · send-backs 30 · waits 20 min/);
  const json = appeler(status, ["--json"], env);
  assert.equal(await json.fin, 0);
  const { delais } = JSON.parse(json.sortie());
  assert.equal(delais.fusionnes, 2);
  assert.equal(delais.pires_depassements[0].titre, "A slow ticket");
  assert.equal(await appeler(status, ["--json", "--follow"], env).fin, 2);
  assert.equal(await appeler(status, ["--bogus"], env).fin, 2);
  writeFileSync(join(d, FICHES), "{ not json");
  const texteIllisible = appeler(status, [], env);
  assert.equal(await texteIllisible.fin, 0);
  assert.match(texteIllisible.sortie(), /on time {5}merged tickets unreadable/);
  const illisible = appeler(status, ["--json"], env);
  assert.equal(await illisible.fin, 0);
  const [raison, ...reste] = illisible.sortie().split("\n");
  assert.match(raison ?? "", /merged tickets unreadable/);
  assert.deepEqual(JSON.parse(reste.join("\n")), { delais: null });
});

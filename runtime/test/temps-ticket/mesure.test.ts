import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { corpsDeLaReparation } from "../../src/base-rouge/ouvre-reparation.ts";
import { brancheDuTicket, stationGitHub, type GitHubDuTour } from "../../src/brigade-github.ts";
import { LABEL_IN_PASS, LABEL_TAKEN } from "../../src/github-etat/etats.ts";
import { chronometre, enregistrerTemps, FICHIER_DES_TEMPS, mesurer, type Etape, type Marque } from "../../src/temps-ticket/mesure.ts";
import { enregistrementsDuTexte, type EnregistrementTemps } from "../../src/temps-ticket/synthese.ts";

const T0 = Date.UTC(2026, 10, 5, 8);
const a = (secondes: number) => new Date(T0 + secondes * 1000).toISOString();
const marques = (...liste: Array<[Etape, number]>): Marque[] => liste.map(([etape, s]) => ({ etape, at: a(s) }));

// Un parcours complet : prise à 0, livrée à 100, relue de 150 à 180, CI jusqu'au merge demandé à 200, mergée à 205.
const complet = marques(["cuisson", 0], ["attentePasse", 100], ["revue", 150], ["ci", 180], ["merge", 200]);

const total = (e: EnregistrementTemps) => (e.attenteQualification ?? 0) + (e.attentePrise ?? 0) + (e.cuissonsRatees ?? 0) + e.cuisson + (e.renvois ?? 0) + e.attentePasse + e.revue + e.ci + e.merge;
// Les phases d'avant la prise, des cooks ratés et des renvois, quand la station n'en a vu aucune (#2662) ; le temps perdu (#2670) se vérifie dans `temps-tickets.test.ts`.
const sansAvant = { attenteQualification: 0, attentePrise: 0, cuissonsRatees: 0, renvois: 0 };
const sansPhases = ({ phases: _phases, depuis: _depuis, perdu: _perdu, ...reste }: EnregistrementTemps) => reste;
const tenu = (e: EnregistrementTemps) => {
  assert.ok(Math.abs(total(e) - (Date.parse(e.mergedAt) - Date.parse(e.claimedAt)) / 1000) <= 1, `sum ${total(e)} off the claim-to-merge time`);
  assert.ok(e.cuissonTests <= e.cuisson);
};

function dossier(t: TestContext): string {
  const d = mkdtempSync(join(tmpdir(), "brigade-temps-"));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  return d;
}

describe("the time of a served ticket, split into its phases", () => {
  const e = mesurer({ ticket: 7, marques: complet, testsMs: 40_000 }, a(205));

  test("the claim opens the record and the cook's end closes the cooking", () => {
    assert.equal(e.claimedAt, a(0));
    assert.equal(e.cuisson, 100);
  });
  test("the cook's tests and gates are a part of the cooking", () => {
    assert.equal(e.cuissonTests, 40);
  });
  test("the delivery waits for the pass until its review starts", () => {
    assert.equal(e.attentePasse, 50);
  });
  test("the review lasts from its start to its verdict", () => {
    assert.equal(e.revue, 30);
  });
  test("the CI lasts from the verdict to the merge asked of GitHub", () => {
    assert.equal(e.ci, 20);
  });
  test("the merge lasts from its request to the merge", () => {
    assert.equal(e.merge, 5);
    assert.equal(e.mergedAt, a(205));
  });
  test("the phases add up to the claim-to-merge time", () => {
    assert.equal(total(e), 205);
    tenu(e);
  });

  test("a phase the station did not see is 0, and the others still add up", () => {
    const sansRevue = mesurer({ ticket: 7, marques: marques(["cuisson", 0], ["attentePasse", 100], ["ci", 180], ["merge", 200]), testsMs: 0 }, a(205));
    assert.deepEqual(sansPhases(sansRevue), { ticket: 7, claimedAt: a(0), mergedAt: a(205), ...sansAvant, cuisson: 100, cuissonTests: 0, attentePasse: 80, revue: 0, ci: 20, merge: 5 });
    tenu(sansRevue);
  });

  test("an unseen claim starts the record at the first phase seen, nothing before it is made up", () => {
    const vuEnPass = mesurer({ ticket: 7, marques: marques(["ci", 180], ["merge", 200]), testsMs: 0 }, a(205));
    assert.deepEqual(sansPhases(vuEnPass), { ticket: 7, claimedAt: a(180), mergedAt: a(205), ...sansAvant, cuisson: 0, cuissonTests: 0, attentePasse: 0, revue: 0, ci: 20, merge: 5 });
  });

  test("a ticket sent back adds its second cooking to the first, and its wait for it is the send-back", () => {
    const renvoye = mesurer({ ticket: 7, marques: marques(["cuisson", 0], ["attentePasse", 100], ["revue", 150], ["renvoi", 170], ["cuisson", 180], ["attentePasse", 300], ["revue", 310], ["ci", 320], ["merge", 330]), testsMs: 0 }, a(331));
    assert.equal(renvoye.cuisson, 220);
    assert.equal(renvoye.renvois, 10);
    assert.equal(renvoye.attentePasse, 60);
    assert.equal(renvoye.revue, 30);
    tenu(renvoye);
  });

  test("seconds are rounded on the instants, so fractions never break the sum", () => {
    const fines = [0.4, 1.4, 2.4, 3.4, 4.4].map((s, i) => ({ etape: (["cuisson", "attentePasse", "revue", "ci", "merge"] as const)[i] as Etape, at: new Date(T0 + s * 1000).toISOString() }));
    const r = mesurer({ ticket: 1, marques: fines, testsMs: 0 }, new Date(T0 + 5_400).toISOString());
    assert.equal(total(r), 5);
    tenu(r);
  });

  test("the cook's tests never weigh more than the cooking", () => {
    const r = mesurer({ ticket: 7, marques: complet, testsMs: 999_000 }, a(205));
    assert.equal(r.cuissonTests, 100);
  });
});

describe("the file of ticket times", () => {
  const e = (ticket: number, cuisson: number): EnregistrementTemps => ({ ticket, claimedAt: a(0), mergedAt: a(cuisson), cuisson, cuissonTests: 0, attentePasse: 0, revue: 0, ci: 0, merge: 0 });

  test("each record is appended to the project's file, in the contract's shape", (t) => {
    const d = dossier(t);
    enregistrerTemps(d, e(1, 10));
    enregistrerTemps(d, e(2, 20));
    const lus = (JSON.parse(readFileSync(join(d, FICHIER_DES_TEMPS), "utf8")) as { tickets: EnregistrementTemps[] }).tickets;
    assert.deepEqual(lus, [e(1, 10), e(2, 20)]);
    assert.deepEqual(Object.keys(lus[0] ?? {}), ["ticket", "claimedAt", "mergedAt", "cuisson", "cuissonTests", "attentePasse", "revue", "ci", "merge"]);
    assert.deepEqual(enregistrementsDuTexte(readFileSync(join(d, FICHIER_DES_TEMPS), "utf8")), lus);
  });

  test("recording the same ticket twice leaves a single record for it", (t) => {
    const d = dossier(t);
    enregistrerTemps(d, e(1, 10));
    enregistrerTemps(d, e(2, 20));
    enregistrerTemps(d, e(1, 15));
    const lus = (JSON.parse(readFileSync(join(d, FICHIER_DES_TEMPS), "utf8")) as { tickets: EnregistrementTemps[] }).tickets;
    assert.deepEqual(lus, [e(2, 20), e(1, 15)]);
  });

  test("a file that is not a JSON array is left as is", (t) => {
    const d = dossier(t);
    mkdirSync(join(d, ".claude/brigade"), { recursive: true });
    writeFileSync(join(d, FICHIER_DES_TEMPS), "{pas du json");
    assert.throws(() => enregistrerTemps(d, e(1, 10)));
    assert.equal(readFileSync(join(d, FICHIER_DES_TEMPS), "utf8"), "{pas du json");
  });
});

describe("the station's stopwatch", () => {
  test("a ticket taken again keeps its first claim; a merge closes its journey", () => {
    let t = T0;
    const chrono = chronometre(() => new Date(t));
    chrono.prendre(3);
    t += 60_000;
    chrono.prendre(3);
    t += 40_000;
    chrono.marquer(3, "attentePasse");
    t += 10_000;
    const r = chrono.servir(3);
    assert.equal(r?.claimedAt, a(0));
    assert.equal(r?.cuisson, 100);
    assert.equal(r?.attentePasse, 10);
    assert.equal(chrono.servir(3), null);
  });
});

// La station GitHub seul de bout en bout, sur un faux GitHub et une fausse horloge.
test("after the station merges a ticket, the project's file holds its record, phase by phase", async (t) => {
  const clone = dossier(t);
  let horloge = T0;
  const avancer = (secondes: number) => (horloge += secondes * 1000);
  const labels = new Set(["fire", "model:sonnet", "effort:medium"]);
  // Ce que l'issue porte déjà d'un passage d'avant : un cook sans livraison, une livraison renvoyée,
  // et le renvoi qu'un inconnu imite, qui ne compte pas.
  const commentaires: Array<{ id: number; body: string; association: string; createdAt: string }> = [
    { id: 1, body: "<!-- brigade:echec n=1 -->\nStation `B`: the cook stopped without a delivery — claude ended in error (exit code 1)", association: "OWNER", createdAt: a(-600) },
    { id: 2, body: `<!-- brigade:renvoi n=1 sha=${"b".repeat(40)} -->\nStation \`B\`: sent back to a cook (1/2) — the review requested changes: tests missing`, association: "OWNER", createdAt: a(-300) },
    { id: 3, body: `<!-- brigade:renvoi n=2 sha=${"c".repeat(40)} -->\nStation \`X\`: sent back to a cook (2/2) — the CI is red`, association: "NONE", createdAt: a(-200) },
  ];
  // Deux tickets mergés avant #2707, sans leur qualité : le merge du 7 la leur donne, à leur place (le 5, une
  // réparation de la base ; le 6, renvoyé une fois pour une CI rouge).
  const anciens = [{ id: 9, body: `<!-- brigade:renvoi n=1 sha=${"d".repeat(40)} -->\nStation \`B\`: sent back to a cook (1/2) — the CI is red on \`ddddddd\`: tests runtime (3/16)`, association: "OWNER", createdAt: a(-2000) }];
  for (const [ticket, mergedAt] of [[5, a(-1000)], [6, a(-900)]] as const) enregistrerTemps(clone, { ticket, claimedAt: a(-1500), mergedAt, cuisson: 1, cuissonTests: 0, attentePasse: 0, revue: 0, ci: 0, merge: 0 });
  // Tenue dans un objet : mutée par les fermetures du faux, une variable serait réduite à `null` par le contrôle de types.
  const faux: { pr: { number: number; sha: string; state: "open" | "closed"; merged: boolean; enRetard: boolean } | null } = { pr: null };
  let ciEnCours = true;
  const github = {
    checksDeLaBase: async () => [{ name: "tests", outcome: "green" as const }],
    fires: async () => [{ number: 7, title: "ticket 7", labels: [...labels], state: "open" as const }],
    dependancesOuvertes: async () => [],
    prDuTicket: async () => (faux.pr === null ? null : { ...faux.pr }),
    prsOuvertes: async () => (faux.pr?.state === "open" ? [{ branche: brancheDuTicket(7), fichiers: ["src/a.ts"] }] : []),
    corpsDuTicket: async (numero: number) => (numero === 5 ? corpsDeLaReparation("main", "4ddaa96", [{ nom: "types (app)", url: null, sortie: null }]) : ""),
    ci: async () => [{ name: "tests", outcome: ciEnCours ? ("pending" as const) : ("green" as const) }],
    commentaires: async (numero: number) => (numero === 5 ? [] : numero === 6 ? [...anciens] : [...commentaires]),
    commenter: async (_numero: number, body: string) => {
      commentaires.push({ id: commentaires.length + 1, body, association: "OWNER", createdAt: new Date(horloge).toISOString() });
    },
    labelliser: async (_numero: number, ajout: string[]) => ajout.forEach((label) => labels.add(label)),
    delabelliser: async (_numero: number, label: string) => {
      labels.delete(label);
    },
    ouvrirPR: async () => {
      faux.pr = { number: 70, sha: "a".repeat(40), state: "open", merged: false, enRetard: false };
      return "https://github.com/faux/depot/pull/70";
    },
    depotDuTicket: async () => null,
    mettreAJour: async () => assert.fail("the branch is up to date"),
    fermerIssue: async () => {
      labels.delete(LABEL_IN_PASS);
    },
    merger: async () => {
      avancer(5);
      if (faux.pr !== null) Object.assign(faux.pr, { merged: true, state: "closed" });
      return { fait: true as const };
    },
  } as unknown as GitHubDuTour;
  const station = stationGitHub({
    nom: "A",
    places: 1,
    base: "main",
    github,
    prise: {
      prendre: async () => {
        labels.add(LABEL_TAKEN);
        return { prise: true };
      },
      lacher: async () => true,
    },
    cuisiner: async () => {
      avancer(100);
      return { branche: brancheDuTicket(7), testsMs: 40_000 };
    },
    juger: async () => {
      avancer(30);
      return { verdict: "approve", motif: "" };
    },
    avertir: (texte) => assert.fail(texte),
    clone,
    maintenant: () => new Date(horloge),
  });

  await station.tour();
  await station.calme();
  assert.ok(labels.has(LABEL_IN_PASS));
  avancer(50);
  // Relue, puis sa CI tourne encore : rien n'est mergé.
  await station.tour();
  await station.relu();
  assert.equal(faux.pr?.merged, false);
  avancer(20);
  ciEnCours = false;
  await station.tour();
  await station.relu();
  assert.equal(faux.pr?.merged, true);

  const lus = enregistrementsDuTexte(readFileSync(join(clone, FICHIER_DES_TEMPS), "utf8"));
  // Sa qualité, lue sur l'issue au merge (#2707) : une livraison renvoyée par la relecture, un cook sans livraison.
  assert.deepEqual(lus.slice(2).map(sansPhases), [{ ticket: 7, claimedAt: a(0), mergedAt: a(205), ...sansAvant, cuisson: 100, cuissonTests: 40, attentePasse: 50, revue: 30, ci: 20, merge: 5, qualite: { renvois: ["blocking review"], cooksRates: 1 } }]);
  // Les deux d'avant ont reçu la leur, sans changer de place : l'ordre des merges tient.
  assert.deepEqual(lus.slice(0, 2).map(({ ticket, qualite }) => ({ ticket, qualite })), [
    { ticket: 5, qualite: { renvois: [], cooksRates: 0, reparation: ["types (app)"] } },
    { ticket: 6, qualite: { renvois: ["red gates: runtime tests"], cooksRates: 0 } },
  ]);
});

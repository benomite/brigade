// The gate every gesture of an agent goes through (#4039, spec 2026-11-23-autonomy-trust-control, C4): on `act` it
// does the gesture and logs it, on `propose` it holds it until the chef's approval, on `observe` it only logs it.
// The gestures are fakes that count their calls; the clock is given.
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { enregistrementDe, OUTCOME } from "../../../src/autonomie/agents/gestes.ts";
import { magasinDeNiveaux } from "../../../src/autonomie/agents/niveaux.ts";
import { approuverGeste, gestesEnAttente, porteDesGestes, porteDuRuntime } from "../../../src/autonomie/agents/porte.ts";
import { principal as manager } from "../../../src/manager-cli.ts";
import type { Ajout } from "../../../src/evenements.ts";
import { ouvrirJournal } from "../../../src/journal.ts";
import type { CauseReveil } from "../../../src/runtime.ts";
import { appeler, repertoireTemporaire } from "../../outils.ts";

const PROJET = "shop";
const A = (h: number) => () => new Date(`2026-11-23T${String(h).padStart(2, "0")}:00:00.000Z`);
const FICHIER_DES_ATTENTES = "autonomy-pending.json";

// A gesture of the test: it counts its calls, and gives what it is told.
function fauxGeste<T>(valeur: T) {
  const appels = { n: 0 };
  return { appels, faire: () => (appels.n++, valeur) };
}

const SUPERVISEUR = { agent: "supervisor", reglable: "supervisor" } as const;
const DIT = { line: "reran `tests` on 0de1ff5", reason: "red for 10 min", outcome: OUTCOME.FIXED_BY_SELF };

test("on act, the gesture is done once and logged with its outcome", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const { appels, faire } = fauxGeste(42);
  const passage = await porteDesGestes({ repertoire, projet: PROJET, horloge: A(9) }).passer(SUPERVISEUR, DIT, faire);
  assert.deepEqual(passage, { etat: "done", valeur: 42 });
  assert.equal(appels.n, 1);
  assert.deepEqual(enregistrementDe(repertoire, "supervisor").gestures, [{ at: A(9)().toISOString(), ...DIT }]);
  assert.deepEqual(gestesEnAttente(repertoire), []);
});

test("on act, what the gesture gave decides what is logged: null logs nothing", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const porte = porteDesGestes({ repertoire, projet: PROJET, horloge: A(9) });
  await porte.passer(SUPERVISEUR, DIT, () => null, () => null);
  await porte.passer(SUPERVISEUR, DIT, () => 7, (n) => ({ ...DIT, line: `did ${n}` }));
  assert.deepEqual(enregistrementDe(repertoire, "supervisor").gestures.map(({ line }) => line), ["did 7"]);
});

test("on propose, the gesture is held and not done; one approval does it once and logs it, a second does nothing", async (t) => {
  const repertoire = repertoireTemporaire(t);
  magasinDeNiveaux(repertoire).poser(PROJET, "supervisor", "propose");
  const porte = porteDesGestes({ repertoire, projet: PROJET, horloge: A(9) });
  const { appels, faire } = fauxGeste("done");

  const passage = await porte.passer(SUPERVISEUR, DIT, faire);
  assert.deepEqual(passage, { etat: "held", id: 1 });
  assert.equal(appels.n, 0);
  assert.deepEqual(enregistrementDe(repertoire, "supervisor").gestures, []);
  assert.deepEqual(gestesEnAttente(repertoire), [{ id: 1, agent: "supervisor", line: DIT.line, reason: DIT.reason, at: A(9)().toISOString(), approved: false }]);

  assert.deepEqual(await porte.approuver(1), { etat: "done", valeur: "done" });
  assert.equal(appels.n, 1);
  assert.deepEqual(enregistrementDe(repertoire, "supervisor").gestures, [{ at: A(9)().toISOString(), ...DIT }]);
  assert.deepEqual(gestesEnAttente(repertoire), []);

  assert.equal(await porte.approuver(1), null);
  assert.equal(appels.n, 1);
  assert.equal(enregistrementDe(repertoire, "supervisor").gestures.length, 1);
});

test("on propose, the same gesture proposed again keeps its id; another one gets the next", async (t) => {
  const repertoire = repertoireTemporaire(t);
  magasinDeNiveaux(repertoire).poser(PROJET, "supervisor", "propose");
  const porte = porteDesGestes({ repertoire, projet: PROJET, horloge: A(9) });
  const premier = fauxGeste(1);
  const second = fauxGeste(2);
  assert.deepEqual(await porte.passer(SUPERVISEUR, DIT, premier.faire), { etat: "held", id: 1 });
  assert.deepEqual(await porte.passer(SUPERVISEUR, DIT, second.faire), { etat: "held", id: 1 });
  assert.deepEqual(await porte.passer(SUPERVISEUR, { ...DIT, line: "parked #12" }, premier.faire), { etat: "held", id: 2 });
  assert.equal(gestesEnAttente(repertoire).length, 2);
  // The latest proposal is the one done.
  await porte.approuver(1);
  assert.deepEqual([premier.appels.n, second.appels.n], [0, 1]);
});

test("on observe, the gesture is never done, and logged once as not done", async (t) => {
  const repertoire = repertoireTemporaire(t);
  magasinDeNiveaux(repertoire).poser(PROJET, "supervisor", "observe");
  const porte = porteDesGestes({ repertoire, projet: PROJET, horloge: A(9) });
  const { appels, faire } = fauxGeste(1);
  assert.deepEqual(await porte.passer(SUPERVISEUR, DIT, faire), { etat: "observed" });
  assert.deepEqual(await porte.passer(SUPERVISEUR, DIT, faire), { etat: "observed" });
  assert.equal(appels.n, 0);
  const { gestures, counters } = enregistrementDe(repertoire, "supervisor");
  assert.deepEqual(gestures, [{ at: A(9)().toISOString(), line: DIT.line, reason: DIT.reason, outcome: OUTCOME.NOT_DONE }]);
  assert.deepEqual(counters, { fixedBySelf: 0, handedToChef: 0 });
  assert.deepEqual(gestesEnAttente(repertoire), []);
  // Another gesture seen, then the first again: each is logged.
  await porte.passer(SUPERVISEUR, { ...DIT, line: "parked #12" }, faire);
  await porte.passer(SUPERVISEUR, DIT, faire);
  assert.equal(enregistrementDe(repertoire, "supervisor").gestures.length, 3);
  // A gesture done with the same line is not one observed: the next observation is logged.
  magasinDeNiveaux(repertoire).poser(PROJET, "supervisor", "act");
  await porte.passer(SUPERVISEUR, DIT, faire);
  magasinDeNiveaux(repertoire).poser(PROJET, "supervisor", "observe");
  await porte.passer(SUPERVISEUR, DIT, faire);
  assert.deepEqual(enregistrementDe(repertoire, "supervisor").gestures.map(({ outcome }) => outcome), [OUTCOME.NOT_DONE, OUTCOME.NOT_DONE, OUTCOME.NOT_DONE, OUTCOME.FIXED_BY_SELF, OUTCOME.NOT_DONE]);
  assert.equal(appels.n, 1);
});

test("the manager's split of an epic is done by default, like its other gestures and a cook's (#4247); set to propose, it is held", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const porte = porteDesGestes({ repertoire, projet: PROJET, horloge: A(9) });
  const decoupe = fauxGeste(true);
  const autre = fauxGeste(true);
  const cuit = fauxGeste(true);
  const DECOUPE = { agent: "manager", reglable: "manager split-epic" } as const;
  assert.equal((await porte.passer(DECOUPE, { ...DIT, line: "split the epic #7 into 3 tickets" }, decoupe.faire)).etat, "done");
  assert.equal((await porte.passer({ agent: "manager", reglable: "manager" }, { ...DIT, line: "set `fire` on #8" }, autre.faire)).etat, "done");
  assert.equal((await porte.passer({ agent: "cook #9", reglable: "cook" }, { ...DIT, line: "take #9 and cook it" }, cuit.faire)).etat, "done");
  assert.deepEqual([decoupe.appels.n, autre.appels.n, cuit.appels.n], [1, 1, 1]);
  assert.deepEqual(enregistrementDe(repertoire, "manager").gestures.map(({ line }) => line), ["split the epic #7 into 3 tickets", "set `fire` on #8"]);
  assert.deepEqual(enregistrementDe(repertoire, "cook #9").gestures.map(({ line }) => line), ["take #9 and cook it"]);

  magasinDeNiveaux(repertoire).poser(PROJET, "manager split-epic", "propose");
  assert.equal((await porte.passer(DECOUPE, { ...DIT, line: "split the epic #10 into 2 tickets" }, decoupe.faire)).etat, "held");
  assert.equal((await porte.passer({ agent: "manager", reglable: "manager" }, { ...DIT, line: "set `fire` on #11" }, autre.faire)).etat, "done");
  assert.deepEqual([decoupe.appels.n, autre.appels.n], [1, 2]);
});

test("on act, the same gesture held before — while its level was propose — is done and no longer pending; the others stay", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const porte = porteDesGestes({ repertoire, projet: PROJET, horloge: A(9) });
  magasinDeNiveaux(repertoire).poser(PROJET, "supervisor", "propose");
  await porte.passer(SUPERVISEUR, DIT, fauxGeste(1).faire);
  await porte.passer(SUPERVISEUR, { ...DIT, line: "put #4 back on the rail" }, fauxGeste(1).faire);
  await porte.passer({ agent: "closer", reglable: "closer" }, DIT, fauxGeste(1).faire);
  assert.equal(gestesEnAttente(repertoire).length, 3);

  magasinDeNiveaux(repertoire).poser(PROJET, "supervisor", "act");
  const { appels, faire } = fauxGeste(2);
  assert.deepEqual(await porte.passer(SUPERVISEUR, DIT, faire), { etat: "done", valeur: 2 });
  assert.equal(appels.n, 1);
  assert.deepEqual(gestesEnAttente(repertoire).map(({ agent, line }) => [agent, line]), [["supervisor", "put #4 back on the rail"], ["closer", DIT.line]]);
  // Its approval, held in this runtime, finds nothing: it is not done twice.
  assert.equal(await porte.approuver(1), null);
  assert.equal(enregistrementDe(repertoire, "supervisor").gestures.length, 1);
});

test("on act, a pending file that cannot be read: the gesture is done and logged, the file is said and left as it is", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const fichier = join(repertoire, FICHIER_DES_ATTENTES);
  writeFileSync(fichier, "{not json");
  const avertissements: string[] = [];
  const { appels, faire } = fauxGeste(3);
  const passage = await porteDesGestes({ repertoire, projet: PROJET, horloge: A(9), avertir: (texte) => void avertissements.push(texte) }).passer(SUPERVISEUR, DIT, faire);
  assert.deepEqual(passage, { etat: "done", valeur: 3 });
  assert.equal(appels.n, 1);
  assert.equal(enregistrementDe(repertoire, "supervisor").gestures.length, 1);
  assert.equal(readFileSync(fichier, "utf8"), "{not json");
  assert.equal(avertissements.length, 1);
  assert.match(avertissements[0] ?? "", /pending gestures not read, the supervisor's gesture done stays listed/);
});

test("a gesture that fails on approval is not logged, and is not pending any more", async (t) => {
  const repertoire = repertoireTemporaire(t);
  magasinDeNiveaux(repertoire).poser(PROJET, "supervisor", "propose");
  const porte = porteDesGestes({ repertoire, projet: PROJET, horloge: A(9) });
  await porte.passer(SUPERVISEUR, DIT, () => {
    throw new Error("GitHub said no");
  });
  await assert.rejects(porte.approuver(1), /GitHub said no/);
  assert.deepEqual(enregistrementDe(repertoire, "supervisor").gestures, []);
  assert.deepEqual(gestesEnAttente(repertoire), []);
  assert.equal(await porte.approuver(1), null);
});

test("an unreadable levels file: the gesture is not done, nothing is logged or held", async (t) => {
  const repertoire = repertoireTemporaire(t);
  writeFileSync(join(repertoire, "autonomy-levels.json"), "{not json");
  const { appels, faire } = fauxGeste(1);
  await assert.rejects(porteDesGestes({ repertoire, projet: PROJET, horloge: A(9) }).passer(SUPERVISEUR, DIT, faire), /cannot be read/);
  assert.equal(appels.n, 0);
  assert.equal(existsSync(join(repertoire, "autonomy-gestures.json")), false);
  assert.equal(existsSync(join(repertoire, FICHIER_DES_ATTENTES)), false);
});

test("an unreadable pending file: a proposed gesture is not held nor done, an approval is refused, and the file is left as it is", async (t) => {
  for (const contenu of ["{not json", "{}", '[{"id": 1}]']) {
    const repertoire = repertoireTemporaire(t);
    magasinDeNiveaux(repertoire).poser(PROJET, "supervisor", "propose");
    writeFileSync(join(repertoire, FICHIER_DES_ATTENTES), contenu);
    const { appels, faire } = fauxGeste(1);
    const avertissements: string[] = [];
    const porte = porteDesGestes({ repertoire, projet: PROJET, horloge: A(9), avertir: (m) => void avertissements.push(m) });
    await assert.rejects(porte.passer(SUPERVISEUR, DIT, faire), /autonomy-pending\.json (cannot be read|is not a list)/, contenu);
    assert.throws(() => approuverGeste(repertoire, 1), /autonomy-pending\.json (cannot be read|is not a list)/, contenu);
    await porte.relever();
    assert.match(avertissements[0] ?? "", /pending gestures not read/);
    assert.equal(appels.n, 0);
    assert.equal(readFileSync(join(repertoire, FICHIER_DES_ATTENTES), "utf8"), contenu);
  }
});

test("a held gesture whose pending file turns unreadable is not done on approval, and stays held until the file reads again", async (t) => {
  const repertoire = repertoireTemporaire(t);
  magasinDeNiveaux(repertoire).poser(PROJET, "supervisor", "propose");
  const porte = porteDesGestes({ repertoire, projet: PROJET, horloge: A(9) });
  const { appels, faire } = fauxGeste(1);
  assert.deepEqual(await porte.passer(SUPERVISEUR, DIT, faire), { etat: "held", id: 1 });
  const lisible = readFileSync(join(repertoire, FICHIER_DES_ATTENTES), "utf8");
  writeFileSync(join(repertoire, FICHIER_DES_ATTENTES), "{not json");
  await assert.rejects(porte.approuver(1), /autonomy-pending\.json cannot be read/);
  assert.equal(appels.n, 0);
  writeFileSync(join(repertoire, FICHIER_DES_ATTENTES), lisible);
  assert.deepEqual(await porte.approuver(1), { etat: "done", valeur: 1 });
  assert.equal(appels.n, 1);
});

test("an act gesture done on an unreadable gesture log is done, and its failure to log is said", async (t) => {
  const repertoire = repertoireTemporaire(t);
  writeFileSync(join(repertoire, "autonomy-gestures.json"), "{not json");
  const { appels, faire } = fauxGeste(1);
  await assert.rejects(porteDesGestes({ repertoire, projet: PROJET, horloge: A(9) }).passer(SUPERVISEUR, DIT, faire), /its gesture was done but not logged \(reran/);
  assert.equal(appels.n, 1);
  assert.equal(readFileSync(join(repertoire, "autonomy-gestures.json"), "utf8"), "{not json");
});

test("the chef approves from its own process: `manager -- approve <id>` marks it, and the runtime does it at its next tick, once", async (t) => {
  const repertoire = repertoireTemporaire(t);
  magasinDeNiveaux(repertoire).poser(PROJET, "supervisor", "propose");
  const ecouteurs: ((cause: CauseReveil) => void)[] = [];
  const porte = porteDuRuntime({ projet: PROJET, repertoireEtat: repertoire, surReveil: (ecouter) => (ecouteurs.push(ecouter), () => {}) }, A(9));
  assert.ok(porte !== null);
  const { appels, faire } = fauxGeste(1);
  await porte.passer(SUPERVISEUR, DIT, faire);
  const tick = async () => {
    for (const ecouter of ecouteurs) ecouter("tick");
    await new Promise((fin) => setImmediate(fin));
  };
  await tick();
  assert.equal(appels.n, 0);

  // The log a runtime keeps, that `manager` reads.
  const journal = ouvrirJournal(repertoire);
  journal.ajouter({ project: PROJET, ticket: null, author: "runtime", type: "runtime.started", payload: { pid: 1, host: "box", node: "v26.0.0" } } as Ajout);
  journal.fermer();
  const montre = appeler(manager, [], { BRIGADE_STATE_DIR: repertoire });
  await montre.fin;
  assert.match(montre.sortie(), /held gestures\s*\n\s+2026-11-23T09:00:00.000Z {2}1 {2}supervisor: reran `tests` on 0de1ff5 — red for 10 min — `brigade <projet> manager approve 1`/);

  const approuve = appeler(manager, ["approve", "1"], { BRIGADE_STATE_DIR: repertoire });
  assert.equal(await approuve.fin, 0);
  assert.match(approuve.sortie(), /gesture 1 of the supervisor approved \(reran `tests` on 0de1ff5\)/);
  assert.equal(appels.n, 0);
  await tick();
  assert.equal(appels.n, 1);
  assert.equal(enregistrementDe(repertoire, "supervisor").gestures.length, 1);
  await tick();
  assert.equal(appels.n, 1);

  const encore = appeler(manager, ["approve", "1"], { BRIGADE_STATE_DIR: repertoire });
  assert.equal(await encore.fin, 1);
  assert.match(encore.sortie(), /no gesture is pending under 1 — nothing is approved/);
  assert.equal(appels.n, 1);
});

test("`manager -- approve` without one number is refused with its usage; an unreadable pending file is said by `manager`, never read empty", async (t) => {
  const repertoire = repertoireTemporaire(t);
  for (const args of [["approve"], ["approve", "x"], ["approve", "1", "2"]]) {
    const refus = appeler(manager, args, { BRIGADE_STATE_DIR: repertoire });
    assert.equal(await refus.fin, 2, args.join(" "));
    assert.match(refus.sortie(), /the pending gesture's number is needed\n[^]*approve <pending gesture>/);
  }
  const journal = ouvrirJournal(repertoire);
  journal.ajouter({ project: PROJET, ticket: null, author: "runtime", type: "runtime.started", payload: { pid: 1, host: "box", node: "v26.0.0" } } as Ajout);
  journal.fermer();
  writeFileSync(join(repertoire, FICHIER_DES_ATTENTES), "{not json");
  const montre = appeler(manager, [], { BRIGADE_STATE_DIR: repertoire });
  assert.equal(await montre.fin, 0);
  assert.match(montre.sortie(), /held gestures\s+not read — .*autonomy-pending\.json cannot be read/);
  const vide = repertoireTemporaire(t);
  const sansAttente = ouvrirJournal(vide);
  sansAttente.ajouter({ project: PROJET, ticket: null, author: "runtime", type: "runtime.started", payload: { pid: 1, host: "box", node: "v26.0.0" } } as Ajout);
  sansAttente.fermer();
  const aucune = appeler(manager, [], { BRIGADE_STATE_DIR: vide });
  await aucune.fin;
  assert.match(aucune.sortie(), /held gestures\s+none/);
});

test("a runtime without a state directory has no gate", () => {
  assert.equal(porteDuRuntime({ projet: PROJET, surReveil: () => () => {} }), null);
});

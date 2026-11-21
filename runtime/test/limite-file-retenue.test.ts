// La file des appels (#3833) : ce que le journal dit de la retenue d'un appel ralenti par le quota
// réel, et l'ordre entre une écriture que le rythme retient et une lecture du même compte.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ECRITURES_PAR_MINUTE, etiquetteDe, journaliserLaRetenue, ouvrirLimite, prendreUnAppel } from "../src/limite-github.ts";

const LIMITE_HORAIRE = 5000;

// Un réveil que le test déclenche lui-même.
function reveils() {
  const attentes: Array<() => void> = [];
  const duree: number[] = [];
  const attendre = (ms: number) => {
    duree.push(ms);
    return new Promise<void>((suite) => attentes.push(suite));
  };
  const declencher = async () => {
    for (const suite of attentes.splice(0)) suite();
    await new Promise((suite) => setImmediate(suite));
  };
  return { attendre, declencher, nombre: () => attentes.length, attentes: () => duree };
}

test("a call slowed by the real quota opens the retention in the journal once, however many wait, and closes it once when the last goes", async (t) => {
  const dites: string[] = [];
  journaliserLaRetenue((ligne) => dites.push(ligne));
  const h = { instant: Date.UTC(2026, 10, 18, 10, 0, 0) };
  const maintenant = () => h.instant;
  const limite = ouvrirLimite({ maintenant, alerter: () => {} });
  t.after(() => limite.fermer());
  const lecture = etiquetteDe(["repos/o/a/issues"], { projet: "a" });
  for (let i = 0; i < 5; i += 1) {
    h.instant += 1000;
    limite.prendre("cuisine", undefined, lecture);
  }
  limite.noter("gh", { restant: 500, plafond: LIMITE_HORAIRE, reset: h.instant + 40 * 60_000 });

  const r = reveils();
  let parties = 0;
  for (let i = 0; i < 2; i += 1) void prendreUnAppel(limite, { gh: "gh", etiquette: lecture, maintenant, attendre: r.attendre }).then(() => (parties += 1));
  await new Promise((suite) => setImmediate(suite));
  assert.equal(parties, 0);
  assert.equal(dites.length, 1, dites.join("\n"));
  assert.match(dites[0]!, /ralentis par le quota/);
  assert.match(dites[0]!, /projet a/);

  await r.declencher();
  assert.equal(parties, 2);
  assert.equal(dites.length, 2, dites.join("\n"));
  assert.match(dites[1]!, /reprises/);
});

test("a read goes ahead of a write the pace holds on the same account, while a second write stays behind the first", async (t) => {
  journaliserLaRetenue(() => {});
  const h = { instant: Date.UTC(2026, 10, 18, 12, 0, 0) };
  const maintenant = () => h.instant;
  const limite = ouvrirLimite({ maintenant, alerter: () => {} });
  t.after(() => limite.fermer());
  const r = reveils();
  const ecriture = etiquetteDe(["repos/o/a/issues/1/comments", "-f", "body=x"], { projet: "a" });
  const lecture = etiquetteDe(["repos/o/a/issues"], { projet: "a" });
  assert.equal(ecriture.ecriture, true);
  assert.notEqual(lecture.ecriture, true);
  for (let i = 0; i < ECRITURES_PAR_MINUTE; i += 1) await prendreUnAppel(limite, { gh: "gh", etiquette: ecriture, maintenant, attendre: r.attendre });
  assert.equal(r.nombre(), 0);

  const parties: string[] = [];
  void prendreUnAppel(limite, { gh: "gh", etiquette: ecriture, maintenant, attendre: r.attendre }).then(() => parties.push("ecriture 1"));
  await new Promise((suite) => setImmediate(suite));
  // Le quota réel tombe à 500 : la lecture de ce projet, seul donc de la moitié haute, attend son délai linéaire.
  const reste = 40 * 60_000;
  limite.noter("gh", { restant: 500, plafond: LIMITE_HORAIRE, reset: h.instant + reste });
  void prendreUnAppel(limite, { gh: "gh", etiquette: lecture, maintenant, attendre: r.attendre }).then(() => parties.push("lecture"));
  void prendreUnAppel(limite, { gh: "gh", etiquette: ecriture, maintenant, attendre: r.attendre }).then(() => parties.push("ecriture 2"));
  await new Promise((suite) => setImmediate(suite));
  assert.deepEqual(parties, []);
  assert.ok(r.attentes().some((ms) => Math.abs(ms - reste / 2) <= 2000), `waits: ${r.attentes().join(", ")}`);

  // Le délai de la lecture écoulé, elle part, l'écriture retenue par le rythme reste en place.
  await r.declencher();
  assert.deepEqual(parties, ["lecture"]);

  h.instant += 60_001;
  await r.declencher();
  await r.declencher();
  assert.deepEqual(parties.slice(0, 2), ["lecture", "ecriture 1"]);
});

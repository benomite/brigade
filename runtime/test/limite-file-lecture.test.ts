// La file des appels (#2226, #3833) : une écriture que le rythme retient ne retient
// pas une lecture du même compte, et la retenue ne se dit au journal que pour elle.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ECRITURES_PAR_MINUTE, etiquetteDe, journaliserLaRetenue, ouvrirLimite, prendreUnAppel } from "../src/limite-github.ts";
import { jusqua } from "./outils.ts";

test("a read goes ahead of a write the pace holds, and only the held write opens the retention in the journal", async (t) => {
  const horloge = 3_000_000;
  const maintenant = () => horloge;
  const limite = ouvrirLimite({ maintenant });
  const lignes: string[] = [];
  journaliserLaRetenue((ligne) => lignes.push(ligne));
  t.after(() => {
    journaliserLaRetenue(() => {});
    limite.fermer();
  });
  const ecriture = { projet: "a", lecture: "issues" as const, ecriture: true };
  const jamais = () => new Promise<void>(() => {});

  // Une lecture seule ne retient rien et ne dit rien au journal.
  await prendreUnAppel(limite, { gh: "gh", etiquette: etiquetteDe(["repos/o/a/issues"], { projet: "a" }), maintenant, attendre: jamais });
  assert.deepEqual(lignes, []);

  // Le budget de la minute épuisé, une écriture de plus attend : le journal le dit, une fois.
  for (let i = 0; i < ECRITURES_PAR_MINUTE; i += 1) limite.prendre("cuisine", "gh", ecriture);
  let partie = false;
  void prendreUnAppel(limite, { gh: "gh", etiquette: ecriture, maintenant, attendre: jamais }).then(() => (partie = true));
  assert.equal(lignes.length, 1);
  assert.match(lignes[0]!, /écritures GitHub retenues par le budget/);

  // Une lecture du même compte, arrivée après elle, ne l'attend pas.
  let lue = false;
  void prendreUnAppel(limite, { gh: "gh", etiquette: etiquetteDe(["repos/o/a/pulls"], { projet: "a" }), maintenant, attendre: jamais }).then(() => (lue = true));
  await jusqua(() => lue, 1000);
  assert.equal(partie, false);
  assert.equal(lignes.length, 1);
});

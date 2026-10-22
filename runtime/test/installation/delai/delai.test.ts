// Le temps de l'ajout d'un projet à son premier ticket servi (#1401) : l'écart exact entre les deux instants,
// figé au premier ticket servi — un second n'y change rien —, et le ticket de préparation du dépôt n'est pas le
// premier. Tenu dans un vrai journal, à l'horloge réglée par le test.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { delaiDuJournal, lireDelai, noterLAjout } from "../../../src/installation/delai/delai.ts";
import { ouvrirJournal } from "../../../src/journal.ts";
import { aArreter, repertoireTemporaire, temporaireDuFichier } from "../../outils.ts";

const rienNeReste = temporaireDuFichier();
const A = "2026-03-01T10:00:00.000Z";

function unProjet(t: TestContext, instant: { v: string }) {
  const repertoireEtat = repertoireTemporaire(t);
  const maintenant = () => new Date(instant.v);
  const journal = ouvrirJournal(repertoireEtat, { maintenant });
  aArreter(t, () => journal.fermer());
  const servir = (ticket: number) => journal.ajouter({ project: "parade", ticket, author: "runtime", type: "ticket.served", payload: {} });
  return { repertoireEtat, journal, maintenant, servir };
}

test("sans ajout noté, un projet n'a pas de délai", (t) => {
  const { repertoireEtat } = unProjet(t, { v: A });
  assert.equal(lireDelai(repertoireEtat), null);
  assert.equal(lireDelai(`${repertoireEtat}/absent`), null);
});

test("ajouté puis servi plus tard : la durée est l'écart exact entre les deux instants", (t) => {
  const instant = { v: A };
  const { repertoireEtat, journal, maintenant, servir } = unProjet(t, instant);
  assert.equal(noterLAjout(repertoireEtat, "parade", "station:box", maintenant), true);
  assert.deepEqual(lireDelai(repertoireEtat), { ajouteLe: A, serviLe: null, duree: null });
  instant.v = "2026-03-01T12:34:56.789Z";
  servir(7);
  assert.deepEqual(lireDelai(repertoireEtat), { ajouteLe: A, serviLe: "2026-03-01T12:34:56.789Z", duree: 2 * 3600_000 + 34 * 60_000 + 56_789 });
  assert.equal(delaiDuJournal(journal.base, null)?.duree, 9_296_789);
});

test("la durée n'est tenue que pour le premier ticket servi : un second ne la change pas", (t) => {
  const instant = { v: A };
  const { repertoireEtat, maintenant, servir } = unProjet(t, instant);
  noterLAjout(repertoireEtat, "parade", "station:box", maintenant);
  instant.v = "2026-03-01T11:00:00.000Z";
  servir(7);
  const fige = lireDelai(repertoireEtat);
  assert.equal(fige?.duree, 3600_000);
  instant.v = "2026-03-02T11:00:00.000Z";
  servir(8);
  assert.deepEqual(lireDelai(repertoireEtat), fige);
});

test("l'ajout ne s'écrit qu'une fois, et un projet déjà servi n'en a pas", (t) => {
  const instant = { v: A };
  const { repertoireEtat, maintenant } = unProjet(t, instant);
  assert.equal(noterLAjout(repertoireEtat, "parade", "station:box", maintenant), true);
  instant.v = "2026-03-05T00:00:00.000Z";
  assert.equal(noterLAjout(repertoireEtat, "parade", "station:box", maintenant), false);
  assert.equal(lireDelai(repertoireEtat)?.ajouteLe, A);

  const autre = unProjet(t, instant);
  autre.servir(3);
  assert.equal(noterLAjout(autre.repertoireEtat, "vieux", "station:box", autre.maintenant), false);
  assert.equal(lireDelai(autre.repertoireEtat), null);
});

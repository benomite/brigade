// Le bilan d'une épique : ses tickets servis, y compris par ses sous-épiques, à toute profondeur.
import assert from "node:assert/strict";
import { test } from "node:test";
import { bilanDEpique } from "../src/bilan-epique.ts";
import type { Fait } from "../src/evenements.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { decoupages } from "../src/projections/decoupages.ts";
import { rail } from "../src/projections/rail.ts";
import { horloge, repertoireTemporaire } from "./outils.ts";

const prevu = (title: string) => ({ title, context: "", criteria: ["Un critère."], waitsFor: [], zone: ["docs/"], model: "haiku", effort: "low", calibration: "Doc." });

function histoire(t: Parameters<typeof repertoireTemporaire>[0]) {
  const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: horloge(), projections: [decoupages, rail] });
  t.after(() => journal.fermer());
  const noter = (fait: Fait, ticket: number) => journal.ajouter({ project: "brigade", ticket, author: "manager", ...fait });
  // Une épique découpée en ces tickets, déjà créés.
  const decouper = (epic: number, tickets: number[]) => {
    noter({ type: "manager.split", payload: { run: `decoupe-${epic}`, fingerprint: `e${epic}`, reason: "Deux livrables.", order: "Dans l'ordre.", tickets: tickets.map((n) => prevu(`T${n}`)) } }, epic);
    tickets.forEach((n, i) => noter({ type: "manager.split-created", payload: { epic, index: i + 1, reconciled: false } }, n));
  };
  const servir = (ticket: number) => noter({ type: "ticket.served", payload: {} }, ticket);
  return { base: journal.base, noter, decouper, servir };
}

test("une sous-épique dont tous les tickets sont servis compte comme servie, à n'importe quelle profondeur", (t) => {
  const { base, decouper, servir } = histoire(t);
  decouper(10, [11, 12]);
  decouper(12, [13, 14]);
  decouper(14, [15]);
  servir(11);
  servir(13);
  assert.equal(bilanDEpique(base, 10).toutServi, false);

  servir(15);
  const bilan = bilanDEpique(base, 10);
  assert.deepEqual(bilan.servis, [11, 12]);
  assert.deepEqual(bilan.manquants, []);
  assert.equal(bilan.toutServi, true);
});

test("une sous-épique fermée dont un ticket n'est pas livré : c'est ce ticket qui manque, pas elle", (t) => {
  const { base, noter, decouper, servir } = histoire(t);
  decouper(10, [11, 12]);
  decouper(12, [13, 14]);
  servir(11);
  servir(13);
  noter({ type: "manager.split-seen", payload: { epic: 12, open: false } }, 14);
  noter({ type: "manager.split-seen", payload: { epic: 10, open: false } }, 12);

  const bilan = bilanDEpique(base, 10);
  assert.equal(bilan.toutServi, false);
  assert.deepEqual(bilan.manquants, [{ ticket: 14, dit: "#14 closed without a delivery" }]);
});

test("une sous-épique fermée dont rien n'est servi ni découpé reste fermée sans livraison", (t) => {
  const { base, noter, decouper } = histoire(t);
  decouper(10, [11]);
  noter({ type: "manager.split-seen", payload: { epic: 10, open: false } }, 11);
  assert.deepEqual(bilanDEpique(base, 10).manquants, [{ ticket: 11, dit: "#11 closed without a delivery" }]);
});

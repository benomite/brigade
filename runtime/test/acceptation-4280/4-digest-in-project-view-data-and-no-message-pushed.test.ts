// #4280, critère 4 : le digest est dans les données de la vue du projet (`faits`), où l'app le montre en carte ; aucun
// message n'est poussé pour lui.
import assert from "node:assert/strict";
import { test } from "node:test";
import { faits, lireEtat } from "../../src/etat.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { publierLeDigest } from "../../src/journal-du-jour/publication.ts";
import { aArreter, horloge, repertoireTemporaire } from "../outils.ts";

test("the digest read back from the journal is in the project view data, and publishing it pushes nothing", (t) => {
  const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: horloge() });
  aArreter(t, () => journal.fermer());
  const poussees: unknown[] = [];
  const texte = "2 outages seen first by the chef\nmerged #4001";

  publierLeDigest(journal, "brigade", texte, { pousser: (message: unknown) => poussees.push(message) });

  const lu = new Date("2026-11-25T07:05:00.000Z");
  const vue = faits(lireEtat(journal, lu), lu) as unknown as { digest?: { text: string } | null };
  assert.equal(vue.digest?.text, texte);
  assert.deepEqual(poussees, [], "no message is pushed for the digest");
});

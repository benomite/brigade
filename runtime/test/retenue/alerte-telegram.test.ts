// L'alerte de la retenue sur Telegram (#2282) : une par retenue, une à la
// reprise, et un envoi qui échoue ne retient pas la boucle.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { ouvrirJournal } from "../../src/journal.ts";
import { alerteTelegram, MESSAGE_DE_REPRISE } from "../../src/retenue/alerte-telegram.ts";
import { annoncerRetenue, type Transition } from "../../src/retenue/brancher.ts";
import { direRetenueEn, GESTE_DU_DISJONCTEUR, type Observation, type Retenue } from "../../src/retenue/retenue.ts";
import { aArreter, repertoireTemporaire } from "../outils.ts";

const retenue: Retenue = { since: "2026-11-04T01:00:00.000Z", tickets: [10, 11], cause: { kind: "breaker", since: "2026-11-04T01:05:00.000Z" }, gesture: GESTE_DU_DISJONCTEUR };
const attend: Observation = { eteinte: false, enAttente: [10, 11], attenteDepuis: "2026-11-04T00:00:00.000Z", dernierService: null, ouverture: null };
const sert: Observation = { ...attend, enAttente: [] };

function atelier(t: TestContext, echec?: Error) {
  const envoyes: string[] = [];
  const lignes: string[] = [];
  const surTransition = alerteTelegram({
    envoyer: async (texte) => {
      envoyes.push(texte);
      if (echec) throw echec;
    },
    dire: (ligne) => lignes.push(ligne),
  });
  const journal = ouvrirJournal(repertoireTemporaire(t));
  aArreter(t, () => journal.fermer());
  // Une passe de la boucle : le journal dit la transition, l'alerte la suit.
  const passer = (courante: Retenue | null, observation: Observation) => {
    const transition = annoncerRetenue(journal, "brigade", courante, observation);
    if (transition !== null) surTransition(transition);
  };
  return { envoyes, lignes, passer, surTransition };
}

test("une retenue qui commence envoie un message, avec la cause et le geste", (t) => {
  const { envoyes, passer } = atelier(t);
  passer(retenue, attend);
  assert.deepEqual(envoyes, [direRetenueEn(retenue)]);
  assert.match(String(envoyes[0]), /the breaker is open/);
  assert.match(String(envoyes[0]), /press the `Resume` button/);
});

test("la même retenue vue à de nombreuses passes n'envoie pas de second message", (t) => {
  const { envoyes, passer, surTransition } = atelier(t);
  for (let i = 0; i < 20; i++) passer(retenue, attend);
  // Même une transition `started` rejouée pour la même retenue ne renvoie rien.
  surTransition({ type: "started", retenue });
  assert.equal(envoyes.length, 1);
});

test("la levée envoie un seul message de reprise, et une nouvelle retenue une nouvelle alerte", (t) => {
  const { envoyes, passer } = atelier(t);
  passer(retenue, attend);
  for (let i = 0; i < 5; i++) passer(null, sert);
  assert.deepEqual(envoyes, [direRetenueEn(retenue), MESSAGE_DE_REPRISE]);
  const suivante: Retenue = { ...retenue, since: "2026-11-04T05:00:00.000Z", cause: { kind: "unknown" }, gesture: null };
  passer(suivante, attend);
  assert.deepEqual(envoyes, [direRetenueEn(retenue), MESSAGE_DE_REPRISE, direRetenueEn(suivante)]);
});

test("une cause qui change dans la même retenue n'envoie rien de plus", (t) => {
  const { envoyes, passer } = atelier(t);
  passer(retenue, attend);
  passer({ ...retenue, cause: { kind: "unknown" }, gesture: null }, attend);
  assert.equal(envoyes.length, 1);
});

test("un envoi qui échoue ne retient pas la boucle et est dit au journal de service", async (t) => {
  const { envoyes, lignes, passer } = atelier(t, new Error("chat not found"));
  passer(retenue, attend);
  assert.equal(envoyes.length, 1);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(lignes.length, 1);
  assert.match(String(lignes[0]), /not sent — chat not found/);
});

test("un envoi qui lève sans promesse est dit au journal de service, sans lever", () => {
  const lignes: string[] = [];
  const suivre = alerteTelegram({ envoyer: () => { throw new Error("boom"); }, dire: (ligne) => lignes.push(ligne) });
  const transition: Transition = { type: "started", retenue };
  assert.doesNotThrow(() => suivre(transition));
  assert.match(String(lignes[0]), /boom/);
});

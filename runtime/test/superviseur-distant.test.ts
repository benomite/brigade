// Le cook d'une station distante, surveillé sans process ni flux : les mêmes
// plafonds que celui de la box, sur ce que sa station rapporte et sur l'horloge.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Plafonds } from "../src/events/guardrails.ts";
import { depassement, type Arret } from "../src/superviseur.ts";
import { superviserADistance } from "../src/superviseur-distant.ts";

// Des plafonds qu'aucun test n'atteint par l'horloge, sauf celui qu'il règle.
const LARGES: Plafonds = { tokens: 1000, durationMs: 600_000, idleMs: 600_000 };

describe("superviser à distance", { concurrency: true }, () => {
  test("le jugement des jetons est celui du superviseur de la box : au plafond rien, au-delà l'arrêt — et les tours ne comptent pas", () => {
    assert.equal(depassement(LARGES, { tokens: 1000 }), null);
    assert.deepEqual(depassement(LARGES, { tokens: 1001 }), { reason: "tokens", limit: 1000, observed: 1001 });
  });

  test("une mesure sous les plafonds ne l'arrête pas, et sa fin rendue porte ce qu'il a consommé", async () => {
    const arrets: Arret[] = [];
    const cook = superviserADistance({ plafonds: LARGES, surArret: (arret) => void arrets.push(arret) });
    cook.mesurer({ turns: 3, tokens: 300 });
    assert.deepEqual(cook.mesure(), { turns: 3, tokens: 300 });
    cook.rendre(0);
    const fin = await cook.fin;
    assert.deepEqual([fin.code, fin.turns, fin.tokens, fin.arret, fin.erreur], [0, 3, 300, null, null]);
    assert.deepEqual(arrets, []);
    // Fini, plus rien ne l'arrête ni ne le mesure.
    cook.mesurer({ turns: 99, tokens: 9999 });
    cook.arreter();
    assert.deepEqual([cook.mesure(), arrets], [{ turns: 3, tokens: 300 }, []]);
  });

  test("une mesure au-delà d'un plafond l'arrête sur-le-champ : le motif est dit avant sa fin, et il n'y a personne à attendre", async () => {
    const arrets: Arret[] = [];
    const cook = superviserADistance({ plafonds: LARGES, surArret: (arret) => void arrets.push(arret) });
    // Mille tours ne l'arrêtent pas : seuls les jetons et la durée bornent un cook.
    cook.mesurer({ turns: 1000, tokens: 50 });
    assert.deepEqual(arrets, []);
    cook.mesurer({ turns: 1001, tokens: 1001 });
    assert.deepEqual(arrets, [{ reason: "tokens", limit: 1000, observed: 1001 }]);
    const fin = await cook.fin;
    assert.deepEqual([fin.code, fin.turns, fin.arret?.reason], [null, 1001, "tokens"]);
    // Ce que sa station rendrait ensuite n'y change rien.
    cook.rendre(0);
    assert.equal((await cook.fin).code, null);
  });

  test("sans motif, l'arrêter est le « stop » du chef ; avec, un arrêt de garde-fou", async () => {
    const stoppe = superviserADistance({ plafonds: LARGES });
    stoppe.arreter();
    assert.deepEqual((await stoppe.fin).arret, { reason: "stop", limit: null, observed: null });
    const bail = superviserADistance({ plafonds: LARGES });
    bail.arreter({ reason: "lease", limit: 5, observed: 6 });
    assert.deepEqual((await bail.fin).arret, { reason: "lease", limit: 5, observed: 6 });
  });

  test("une station qui ne rapporte plus rien perd son cook au plafond d'inactivité, et un cook trop long au plafond de durée", async () => {
    const muet = superviserADistance({ plafonds: { ...LARGES, idleMs: 20 } });
    assert.deepEqual([(await muet.fin).arret?.reason, (await muet.fin).arret?.limit], ["idle", 20]);
    const long = superviserADistance({ plafonds: { ...LARGES, durationMs: 20 } });
    assert.deepEqual([(await long.fin).arret?.reason, (await long.fin).arret?.limit], ["duration", 20]);
  });

  test("abandonné avec le runtime, il finit sans motif : rien n'en est jugé", async () => {
    const cook = superviserADistance({ plafonds: LARGES });
    cook.abandonner();
    const fin = await cook.fin;
    assert.deepEqual([fin.code, fin.arret], [null, null]);
  });
});

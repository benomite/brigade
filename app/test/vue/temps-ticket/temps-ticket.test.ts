// Le bloc des temps des derniers tickets, sur la page du projet (#2346, épique #2336) : médiane, plus lent, cinq phases,
// le temps perdu contre son seuil (#2670), et l'état vide. Le module est joué avec le faux élément de l'app (aides/fausse-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { dureeEnClair, poserTempsTicket, synthese } from "../../../src/vue/temps-ticket/temps-ticket.js";
import { lireSuivi } from "../../../src/projets/demande.ts";
import { Faux } from "../../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const MIN = 60;

const ticket = (n: number, total: number, mergedAt = `2026-10-${String(10 + n).padStart(2, "0")}T10:00:00.000Z`, perdu?: { attente: number; ratees: number; renvois: number }) => ({
  ticket: n,
  claimedAt: "2026-10-01T00:00:00.000Z",
  mergedAt,
  cuisson: total * 0.4,
  cuissonTests: total * 0.1,
  attentePasse: total * 0.1,
  revue: total * 0.2,
  ci: total * 0.1,
  merge: total * 0.1,
  ...(perdu === undefined ? {} : { perdu }),
});
const date = (n: number) => `2026-10-${String(10 + n).padStart(2, "0")}T10:00:00.000Z`;

describe("la synthèse", () => {
  test("la médiane et le plus lent des 10 derniers par date de merge, le seuil du temps perdu par défaut à 2 min", () => {
    const lu = synthese({ enregistrements: [ticket(1, 100 * MIN), ...Array.from({ length: 10 }, (_, i) => ticket(20 + i, (5 + i) * MIN, `2026-11-${String(i + 1).padStart(2, "0")}T10:00:00.000Z`))] }) ?? assert.fail("pas de synthèse");
    assert.equal(lu.nombre, 10, "le plus ancien (100 min) sort de la fenêtre");
    assert.equal(lu.max, 2);
    assert.equal(lu.mediane, 9.5 * MIN);
    assert.deepEqual(lu.plusLent, { ticket: 29, total: 14 * MIN, phase: "Cooking" });
    assert.equal(lu.perdu, 0, "sans `perdu`, un enregistrement ne perd rien");
    assert.equal(lu.depasse, false, "un temps total de 14 min n'est plus au-dessus de rien");
  });

  test("la cuisson compte ses tests ; cinq phases", () => {
    const lu = synthese({ enregistrements: [ticket(1, 10 * MIN)] }) ?? assert.fail();
    assert.deepEqual(lu.phases.map((p) => p.libelle), ["Cooking", "Waiting for the pass", "Review", "CI", "Merge"]);
    assert.equal(lu.phases[0]?.duree, 5 * MIN);
  });

  test("le seuil du projet remplace le défaut ; un seuil absurde retombe sur 2", () => {
    assert.equal(synthese({ enregistrements: [ticket(1, MIN)], lostTimeMaxMin: 5 })?.max, 5);
    assert.equal(synthese({ enregistrements: [ticket(1, MIN)], lostTimeMaxMin: -3 })?.max, 2);
  });

  test("le temps perdu : l'attente avant la prise, les cuissons ratées et les renvois, en médiane", () => {
    const lu = synthese({ enregistrements: [ticket(1, 10 * MIN, date(1), { attente: 60, ratees: 120, renvois: 60 }), ticket(2, 10 * MIN, date(2), { attente: 30, ratees: 0, renvois: 0 }), ticket(3, 10 * MIN, date(3), { attente: 600, ratees: 0, renvois: 0 })] }) ?? assert.fail();
    assert.equal(lu.perdu, 4 * MIN);
    assert.equal(lu.depasse, true);
  });

  test("les entrées illisibles sont écartées ; rien de lisible, pas de synthèse", () => {
    assert.equal(synthese({ enregistrements: [{ ticket: 1 } as never] }), null);
    assert.equal(synthese({ enregistrements: undefined }), null);
  });

  test("une durée se dit en clair", () => {
    assert.equal(dureeEnClair(45), "45 s");
    assert.equal(dureeEnClair(12 * MIN), "12 min");
    assert.equal(dureeEnClair(65 * MIN), "1 h 5 min");
  });
});

describe("le bloc", () => {
  test("normal : la médiane, le plus lent, le temps perdu contre son seuil, cinq phases, pas d'alerte", () => {
    const bloc = poserTempsTicket(doc, { enregistrements: [ticket(7, 10 * MIN), ticket(8, 12 * MIN), ticket(9, 20 * MIN)], lostTimeMaxMin: 2 });
    assert.equal(bloc.dataset.temps, "normal");
    const texte = bloc.dessous("span").map((s: { textContent?: string }) => s.textContent ?? "").join("|");
    assert.match(texte, /12 min/);
    assert.match(texte, /lost 0 s vs 2 min max/);
    assert.doesNotMatch(texte, /over the max/);
    assert.match(bloc.dessous("p").map((p: { textContent?: string }) => p.textContent ?? "").join("|"), /Slowest: #9 — 20 min/);
    assert.equal(bloc.dessous("li").length, 5);
  });

  test("le temps perdu au-dessus du seuil : le dit en toutes lettres, avec le seuil", () => {
    const perdu = { attente: 60, ratees: 240, renvois: 0 };
    const bloc = poserTempsTicket(doc, { enregistrements: [ticket(7, 8 * MIN, date(7), perdu), ticket(8, 9 * MIN, date(8), perdu)], lostTimeMaxMin: 2 });
    assert.equal(bloc.dataset.temps, "depasse");
    const texte = bloc.dessous("span").map((s: { textContent?: string }) => s.textContent ?? "").join("|");
    assert.match(texte, /lost 5 min vs 2 min max/);
    assert.match(texte, /Lost time over the max of 2 min/);
  });

  test("un long ticket sans temps perdu n'est au-dessus de rien : sa taille varie", () => {
    const bloc = poserTempsTicket(doc, { enregistrements: [ticket(7, 60 * MIN), ticket(8, 90 * MIN)], lostTimeMaxMin: 2 });
    assert.equal(bloc.dataset.temps, "normal");
  });

  test("sans ticket mesuré : un état vide explicite, ni blanc ni zéro", () => {
    for (const enregistrements of [[], undefined]) {
      const bloc = poserTempsTicket(doc, { enregistrements });
      assert.equal(bloc.dataset.temps, "vide");
      const texte = bloc.dessous("p").map((p: { textContent?: string }) => p.textContent ?? "").join("|");
      assert.match(texte, /No ticket measured yet/);
      assert.doesNotMatch(texte, /\b0 (s|min)\b/);
    }
  });

  test("un temps perdu égal au seuil n'est pas au-dessus", () => {
    const bloc = poserTempsTicket(doc, { enregistrements: [ticket(7, 15 * MIN, date(7), { attente: 120, ratees: 0, renvois: 0 })], lostTimeMaxMin: 2 });
    assert.equal(bloc.dataset.temps, "normal");
  });

  test("temps non publiés par la station : le dit, sans prétendre qu'aucun ticket n'est mesuré", () => {
    const bloc = poserTempsTicket(doc, undefined);
    assert.equal(bloc.dataset.temps, "vide");
    assert.equal(bloc.dataset.publie, "non");
    const texte = bloc.dessous("p").map((p: { textContent?: string }) => p.textContent ?? "").join("|");
    assert.match(texte, /not available yet/);
    assert.doesNotMatch(texte, /No ticket measured/);
  });
});

describe("ce que l'app relit du suivi de la station", () => {
  const relu = (temps: unknown) => lireSuivi(JSON.stringify({ brigade: "projets-suivi", projets: [{ nom: "parade", etat: "servi", ...(temps === undefined ? {} : { temps }) }] }))[0]?.temps;

  test("les temps publiés arrivent tels quels, avec le seuil du temps perdu (2 min sans lui ou absurde)", () => {
    const lignes = [ticket(7, 20 * MIN)];
    assert.deepEqual(relu({ enregistrements: lignes, lostTimeMaxMin: 3 }), { enregistrements: lignes, lostTimeMaxMin: 3 });
    assert.equal(relu({ enregistrements: [], lostTimeMaxMin: -1 })?.lostTimeMaxMin, 2);
    assert.equal(relu({ enregistrements: [] })?.lostTimeMaxMin, 2);
  });

  test("absents ou illisibles : rien", () => {
    assert.equal(relu(undefined), undefined);
    assert.equal(relu({ enregistrements: "non" }), undefined);
  });
});

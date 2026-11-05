// Le bloc des temps des derniers tickets, sur la page du projet (#2346, épique #2336) : médiane, plus lent, cinq phases,
// plafond, et l'état vide. Le module est joué avec le faux élément de l'app (aides/fausse-vue.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { dureeEnClair, poserTempsTicket, synthese } from "../../../src/vue/temps-ticket/temps-ticket.js";
import { lireSuivi } from "../../../src/projets/demande.ts";
import { Faux } from "../../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const MIN = 60;

const ticket = (n: number, total: number, mergedAt = `2026-10-${String(10 + n).padStart(2, "0")}T10:00:00.000Z`) => ({
  ticket: n,
  claimedAt: "2026-10-01T00:00:00.000Z",
  mergedAt,
  cuisson: total * 0.4,
  cuissonTests: total * 0.1,
  attentePasse: total * 0.1,
  revue: total * 0.2,
  ci: total * 0.1,
  merge: total * 0.1,
});

describe("la synthèse", () => {
  test("la médiane et le plus lent des 10 derniers par date de merge, le plafond par défaut à 15 min", () => {
    const lu = synthese({ enregistrements: [ticket(1, 100 * MIN), ...Array.from({ length: 10 }, (_, i) => ticket(20 + i, (5 + i) * MIN, `2026-11-${String(i + 1).padStart(2, "0")}T10:00:00.000Z`))] }) ?? assert.fail("pas de synthèse");
    assert.equal(lu.nombre, 10, "le plus ancien (100 min) sort de la fenêtre");
    assert.equal(lu.max, 15);
    assert.equal(lu.mediane, 9.5 * MIN);
    assert.deepEqual(lu.plusLent, { ticket: 29, total: 14 * MIN });
    assert.equal(lu.depasse, false);
  });

  test("la cuisson compte ses tests ; cinq phases", () => {
    const lu = synthese({ enregistrements: [ticket(1, 10 * MIN)] }) ?? assert.fail();
    assert.deepEqual(lu.phases.map((p) => p.libelle), ["Cooking", "Waiting for the pass", "Review", "CI", "Merge"]);
    assert.equal(lu.phases[0]?.duree, 5 * MIN);
  });

  test("le plafond du projet remplace le défaut ; un plafond absurde retombe sur 15", () => {
    assert.equal(synthese({ enregistrements: [ticket(1, MIN)], tempsMaxTicketMin: 30 })?.max, 30);
    assert.equal(synthese({ enregistrements: [ticket(1, MIN)], tempsMaxTicketMin: -3 })?.max, 15);
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
  test("normal : la médiane, le plus lent, le plafond, cinq phases, pas d'alerte", () => {
    const bloc = poserTempsTicket(doc, { enregistrements: [ticket(7, 10 * MIN), ticket(8, 12 * MIN), ticket(9, 20 * MIN)] });
    assert.equal(bloc.dataset.temps, "normal");
    const texte = bloc.dessous("span").map((s: { textContent?: string }) => s.textContent ?? "").join("|");
    assert.match(texte, /12 min/);
    assert.match(texte, /max 15 min/);
    assert.doesNotMatch(texte, /Over the max/);
    assert.match(bloc.dessous("p").map((p: { textContent?: string }) => p.textContent ?? "").join("|"), /Slowest: #9 — 20 min/);
    assert.equal(bloc.dessous("li").length, 5);
  });

  test("au-dessus du plafond : le dit en toutes lettres, avec le plafond", () => {
    const bloc = poserTempsTicket(doc, { enregistrements: [ticket(7, 20 * MIN), ticket(8, 25 * MIN)], tempsMaxTicketMin: 15 });
    assert.equal(bloc.dataset.temps, "depasse");
    const texte = bloc.dessous("span").map((s: { textContent?: string }) => s.textContent ?? "").join("|");
    assert.match(texte, /Over the max of 15 min/);
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

  test("une médiane égale au plafond n'est pas au-dessus", () => {
    const bloc = poserTempsTicket(doc, { enregistrements: [ticket(7, 15 * MIN)], tempsMaxTicketMin: 15 });
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

  test("les temps publiés arrivent tels quels, avec le plafond", () => {
    const lignes = [ticket(7, 20 * MIN)];
    assert.deepEqual(relu({ enregistrements: lignes, tempsMaxTicketMin: 30 }), { enregistrements: lignes, tempsMaxTicketMin: 30 });
    assert.equal(relu({ enregistrements: [], tempsMaxTicketMin: -1 })?.tempsMaxTicketMin, 15);
  });

  test("absents ou illisibles : rien", () => {
    assert.equal(relu(undefined), undefined);
    assert.equal(relu({ enregistrements: "non" }), undefined);
  });
});

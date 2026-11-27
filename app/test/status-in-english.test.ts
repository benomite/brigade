// Le haut de `status` est en anglais (#928) : `kitchen`, `connection`, `RED since …`, `ACTIVE` / `LAPSED`,
// `BLOCKED`, `nothing cooks: …`. L'app lit ces lignes dans les deux langues, pour une box dont le
// runtime n'est pas encore à jour : chaque ligne anglaise dit la même chose que sa française.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { alerts, headsOf } from "../src/alerts.ts";
import type { Facts } from "../src/facts.ts";

const A = "2026-10-16T12:00:00.000Z";
const FACTS: Facts = {
  etat: "retenue",
  lu: A,
  dernierTick: A,
  compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 },
  dernierEvenement: null,
  rail: [],
  cooks: [],
  attend: [],
};
const MANAGER = { allume: true, mot: "ALLUMÉ", dit: "" };
const band = (...heads: string[]) => ["projet     parade", ...heads, "", "rail       vide", ""].join("\n");
const readEntry = (status: string) => alerts({ projet: "parade", faits: FACTS, status, manager: MANAGER });
// Ce que dit une bande : le geste que la box nomme est dans sa langue, il suffit qu'il soit repris.
const saidOnes = (status: string) => readEntry(status).map(({ sujet: subject, dit: said, ton: your, appel: call }) => ({ sujet: subject, dit: said, ton: your, appel: call }));
const actions = (status: string) => readEntry(status).map(({ geste: action }) => action);

const PAIRS = {
  "le disjoncteur ouvert": [
    ["cuisine    retenue · disjoncteur OUVERT depuis 1 h 00 (3 échecs d'affilée)"],
    ["kitchen    held · breaker OPEN for 1 h 00 (3 failures in a row)"],
  ],
  "la connexion Max tombée, et le geste après le dernier deux-points": [
    ["cuisine    retenue", "connexion  Max EXPIRÉE depuis 18 min sur box/claude — plus aucun ticket n'est pris : `claude /login` sous le compte du service"],
    ["kitchen    held", "connection Max EXPIRED for 18 min on box/claude — no ticket is taken any more: `claude /login` under the service account"],
  ],
  "aucune station déclarée": [
    ["cuisine    retenue", "stations   AUCUNE DÉCLARÉE depuis 1 h 00 — aucun cook ne part : les poser par `station stations`"],
    ["kitchen    held", "stations   NONE DECLARED for 1 h 00 — no cook leaves: set them with `station stations`"],
  ],
  "la base rouge": [
    ["cuisine    retenue", "base       ROUGE depuis 1 h 10 sur abc1234 — la station ne prend plus de ticket"],
    ["kitchen    held", "base       RED since 1 h 10 ago on abc1234 — the station takes no more tickets"],
  ],
  "le setup bloqué": [
    ["cuisine    retenue", "setup      BLOQUÉ depuis 30 min sur ba5e000 — aucun setup n'est lancé d'ici"],
    ["kitchen    held", "setup      BLOCKED for 30 min on ba5e000 — no setup is launched from here"],
  ],
} as const;

describe("l'app lit le haut de `status` en français comme en anglais", () => {
  for (const [name, [french, english]] of Object.entries(PAIRS)) {
    test(`${name} : la même alerte, le même geste`, () => {
      const [fr, within] = [saidOnes(band(...french)), saidOnes(band(...english))];
      assert.ok(fr.length > 0, "la ligne française ne dit rien");
      assert.deepEqual(within, fr);
      assert.equal(actions(band(...english)).length, fr.length);
    });
  }

  test("le geste que la box nomme après le dernier `: ` est repris tel qu'elle l'écrit", () => {
    const [connection] = readEntry(band("kitchen    held", "connection Max EXPIRED for 18 min on box/claude — no ticket is taken any more: `claude /login` under the service account"));
    assert.equal(connection?.geste, "`claude /login` under the service account");
    assert.equal(connection?.releve, "Max EXPIRED for 18 min on box/claude — no ticket is taken any more");
    const [stations] = readEntry(band("kitchen    held", "stations   NONE DECLARED for 1 h 00 — no cook leaves: set them with `station stations`"));
    assert.equal(stations?.geste, "set them with `station stations`");
  });

  test("les titres sont ceux de la box : `kitchen` et `connection`", () => {
    assert.deepEqual(headsOf(band("kitchen    open")).map(({ titre: title }) => title), ["projet", "kitchen"]);
  });
});

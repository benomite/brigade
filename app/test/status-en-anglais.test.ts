// Le haut de `status` est en anglais (#928) : `kitchen`, `connection`, `RED since …`, `ACTIVE` / `LAPSED`,
// `BLOCKED`, `nothing cooks: …`. L'app lit ces lignes dans les deux langues, pour une box dont le
// runtime n'est pas encore à jour : chaque ligne anglaise dit la même chose que sa française.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { alertes, tetesDe } from "../src/alertes.ts";
import type { Faits } from "../src/faits.ts";

const A = "2026-10-16T12:00:00.000Z";
const FAITS: Faits = {
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
const bande = (...tetes: string[]) => ["projet     parade", ...tetes, "", "rail       vide", ""].join("\n");
const lue = (status: string) => alertes({ projet: "parade", faits: FAITS, status, manager: MANAGER });
// Ce que dit une bande : le geste que la box nomme est dans sa langue, il suffit qu'il soit repris.
const dits = (status: string) => lue(status).map(({ sujet, dit, ton, appel }) => ({ sujet, dit, ton, appel }));
const gestes = (status: string) => lue(status).map(({ geste }) => geste);

const COUPLES = {
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
  "le grant éteint seul": [
    ["cuisine    ouverte", "grant      merge ÉTEINT SEUL il y a 40 min — son échéance est passée : la pass s'arrête à la PR ouverte"],
    ["kitchen    open", "grant      merge LAPSED 40 min ago — its deadline has passed: the pass stops at the open PR"],
  ],
  "le grant bientôt éteint": [
    ["cuisine    ouverte", "grant      merge ACTIF, BIENTÔT ÉTEINT : encore 30 min — une pass verte est mergée sans toi"],
    ["kitchen    open", "grant      merge ACTIVE, EXPIRING SOON: 30 min left — a green pass is merged without you"],
  ],
} as const;

describe("l'app lit le haut de `status` en français comme en anglais", () => {
  for (const [nom, [francais, anglais]] of Object.entries(COUPLES)) {
    test(`${nom} : la même alerte, le même geste`, () => {
      const [fr, en] = [dits(bande(...francais)), dits(bande(...anglais))];
      assert.ok(fr.length > 0, "la ligne française ne dit rien");
      assert.deepEqual(en, fr);
      assert.equal(gestes(bande(...anglais)).length, fr.length);
    });
  }

  test("le geste que la box nomme après le dernier `: ` est repris tel qu'elle l'écrit", () => {
    const [connexion] = lue(bande("kitchen    held", "connection Max EXPIRED for 18 min on box/claude — no ticket is taken any more: `claude /login` under the service account"));
    assert.equal(connexion?.geste, "`claude /login` under the service account");
    assert.equal(connexion?.releve, "Max EXPIRED for 18 min on box/claude — no ticket is taken any more");
    const [stations] = lue(bande("kitchen    held", "stations   NONE DECLARED for 1 h 00 — no cook leaves: set them with `station stations`"));
    assert.equal(stations?.geste, "set them with `station stations`");
  });

  test("les titres sont ceux de la box : `kitchen` et `connection`", () => {
    assert.deepEqual(tetesDe(bande("kitchen    open")).map(({ titre }) => titre), ["projet", "kitchen"]);
  });
});

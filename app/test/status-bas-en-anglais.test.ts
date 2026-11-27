// Le bas de `status` se lit sous ses deux formes (#939), pour une box dont le runtime n'est pas
// encore à jour : chaque forme que `bon.ts` lit l'est en français et en anglais,
// et donne le même résultat. Une ligne qui mêle les deux langues dans une forme n'en est aucune.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { porter } from "../src/bon.ts";

const TITRE = "Valider le SIRET";
const SOURCES = (ligne: string) => ({ lignes: [ligne], bloque: false });
// Ce que le bon dit d'une ligne `rail` : l'état et le détail sont ceux d'une langue, le titre est le même.
const bon = (etat: string, priorite: string, detail: string) => porter({ etat, titre: TITRE }, SOURCES(`${etat}  ${priorite}  ${detail}  ${TITRE}`));
const dits = (etat: string, detail: string) => Object.fromEntries(bon(etat, "prio:2", detail).dit.map(({ libelle, valeur }) => [libelle, valeur]));

describe("bon.ts lit le détail d'un ticket en français comme en anglais", () => {
  // [état, détail] français, puis anglais ; le jour est `j` ou `d`.
  const COUPLES: Record<string, [[string, string], [string, string]]> = {
    "pris, bail en cours": [["pris", "par box/claude depuis 40 min, bail encore 10 min"], ["taken", "by box/claude since 40 min, lease 10 min left"]],
    "pris, coincé, bail échu": [
      ["pris", "par mac/claude depuis 1 h 30, COINCE : sans progrès depuis 35 min, bail échu depuis 5 min"],
      ["taken", "by mac/claude since 1 h 30, STUCK: no progress since 35 min, lease expired since 5 min"],
    ],
    "pris, des jours": [["pris", "par box/claude depuis 2 j, bail encore 3 j"], ["taken", "by box/claude since 2 d, lease 3 d left"]],
    "en attente": [["en attente", "retenu par box/claude (saturée) — depuis 3 min"], ["queued", "held by box/claude (saturated) — since 3 min"]],
    "en attente, sans motif": [["en attente", "depuis 3 min"], ["queued", "since 3 min"]],
    "BLOQUÉ": [["BLOQUÉ", "dépend de #12 — depuis 1 h 00"], ["BLOCKED", "depends on #12 — since 1 h 00"]],
    "en pass": [["en pass", "depuis 4 min, cuisiné par box/claude"], ["in pass", "since 4 min, cooked by box/claude"]],
    "servi": [["servi", "depuis 2 j, cuisiné par mac/claude"], ["served", "since 2 d, cooked by mac/claude"]],
  };
  for (const [nom, [[etatFr, fr], [etatEn, en]]] of Object.entries(COUPLES)) {
    test(`${nom} : lu des deux façons, le même résultat`, () => {
      const [lu, luEn] = [bon(etatFr, "prio:2", fr), bon(etatEn, "prio:2", en)];
      assert.equal(lu.relais, undefined, "la forme française est découpée");
      assert.equal(luEn.relais, undefined, "la forme anglaise est découpée");
      // Les durées en jours s'écrivent `j` ou `d` : la valeur est celle de la ligne, mot pour mot.
      assert.deepEqual(Object.keys(dits(etatFr, fr)), Object.keys(dits(etatEn, en)));
      assert.deepEqual(luEn.sans, lu.sans);
      if (!nom.includes("jours") && !nom.includes("servi")) {
        assert.deepEqual(luEn.dit.map(({ libelle }) => libelle), lu.dit.map(({ libelle }) => libelle));
      }
    });
  }

  test("les valeurs lues sont les mêmes des deux côtés (hors la langue de la valeur elle-même)", () => {
    const fr = dits("pris", "par box/claude depuis 40 min, bail encore 10 min");
    const en = dits("taken", "by box/claude since 40 min, lease 10 min left");
    assert.deepEqual(fr["taken by"], en["taken by"]);
    assert.deepEqual(fr.since, en.since);
    assert.equal(fr.lease, "bail encore 10 min");
    assert.equal(en.lease, "lease 10 min left");
    assert.deepEqual(dits("en pass", "depuis 4 min, cuisiné par box/claude"), dits("in pass", "since 4 min, cooked by box/claude"));
    assert.deepEqual(dits("en attente", "depuis 3 min"), dits("queued", "since 3 min"));
  });

  test("une ligne qui mêle les deux langues n'est pas une forme valide : elle est relayée telle quelle", () => {
    for (const [etat, detail] of [
      ["pris", "by box/claude since 40 min, lease 10 min left"],
      ["taken", "par box/claude depuis 40 min, bail encore 10 min"],
      ["taken", "by box/claude since 40 min, bail encore 10 min"],
      ["pris", "par box/claude depuis 40 min, lease 10 min left"],
      ["taken", "by box/claude depuis 40 min, lease 10 min left"],
      ["taken", "by box/claude since 40 min, COINCE : lease 10 min left"],
      ["en attente", "since 3 min"],
      ["queued", "depuis 3 min"],
      ["BLOQUÉ", "depends on #12 — since 1 h 00"],
      ["BLOCKED", "dépend de #12 — depuis 1 h 00"],
      ["en pass", "since 4 min, cooked by box/claude"],
      ["in pass", "depuis 4 min, cooked by box/claude"],
      ["served", "depuis 4 min, cuisiné par box/claude"],
      ["servi", "since 4 min, cooked by box/claude"],
      ["taken", "by box/claude since 40 j, lease 10 min left"],
      ["pris", "par box/claude depuis 40 d, bail encore 10 min"],
    ] as const) {
      const lu = bon(etat, "prio:2", detail);
      assert.ok(lu.relais !== undefined, `${etat} / ${detail} ne devait pas être découpée`);
      assert.deepEqual(lu.dit, []);
    }
  });
});

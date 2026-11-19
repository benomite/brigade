// La retenue de la cuisine ne nomme que la limite que GitHub a posée : un quota réel bas
// ne la retient pas (#3833) ; un refus dont la reprise dite est passée la tient encore.
import assert from "node:assert/strict";
import { test } from "node:test";
import { limiteDeLaStation } from "../src/limite-github.ts";
import { signauxDeLaStation } from "../src/retenue/brancher.ts";
import { repertoireTemporaire } from "./outils.ts";

const T = (hhmm: string) => Date.parse(`2026-11-05T${hhmm}:00.000Z`);

test("a low remaining quota alone holds nothing; a refusal past its stated resume still does, with its pauses", (t) => {
  const station = repertoireTemporaire(t);
  let instant = T("09:00");
  const limite = limiteDeLaStation(station, { maintenant: () => instant });
  t.after(() => limite.fermer());
  limite.noter("gh", { restant: 100, plafond: 5000, reset: T("10:00") });
  assert.equal(signauxDeLaStation(station, new Date(instant)).limiteGitHub, null);

  limite.suspendre(T("09:01"));
  instant = T("09:02");
  const apres = signauxDeLaStation(station, new Date(instant)).limiteGitHub;
  assert.notEqual(apres, null);
  assert.equal(apres?.refusedAt, new Date(T("09:00")).toISOString());
  assert.notEqual(apres?.pauses, undefined);
});

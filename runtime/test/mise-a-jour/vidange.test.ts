// Ce que la station de la box fait d'une demande de vidange de sa mise à
// jour : elle ne prend plus de ticket, et dit ses cooks en vol (#2547).
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { lireEnVol, retirerLaDemande, tenirLaVidange, VIDANGE } from "../../src/mise-a-jour/vidange.ts";
import { jusqua, repertoireTemporaire } from "../outils.ts";

const demander = (dossier: string, version: string, jusquaMs: number) => writeFileSync(join(dossier, VIDANGE), JSON.stringify({ version, jusqua: new Date(jusquaMs).toISOString() }));

test("sans demande, la station prend ses tickets et dit ses cooks en vol ; demandée vers une autre version, elle se retient et le dit (#2547)", async (t) => {
  const racine = repertoireTemporaire(t);
  const dossier = repertoireTemporaire(t);
  const cooks = [12, 3];
  const dites: string[] = [];
  const vidange = tenirLaVidange({ racine, dossier, enVol: () => cooks, version: "1.0.0", pid: 42, intervalleMs: 5, dire: (ligne) => dites.push(ligne) });
  t.after(() => vidange.arreter());
  assert.equal(vidange.retenue(), false);
  assert.deepEqual(lireEnVol(racine), { pid: 42, vidange: null, cooks: [3, 12] });
  demander(dossier, "1.1.0", Date.now() + 60_000);
  assert.equal(vidange.retenue(), true);
  await jusqua(() => lireEnVol(racine)?.vidange === "1.1.0");
  assert.ok(dites.some((ligne) => ligne.includes("sa mise à jour vers 1.1.0 attend : elle ne prend plus de ticket")), dites.join("\n"));
  cooks.splice(0);
  await jusqua(() => lireEnVol(racine)?.cooks.length === 0);
  retirerLaDemande(dossier);
  assert.equal(vidange.retenue(), false);
});

test("une demande passée son terme, ou vers la version qui tourne, ne retient pas la station (#2547)", (t) => {
  const racine = repertoireTemporaire(t);
  const dossier = repertoireTemporaire(t);
  const vidange = tenirLaVidange({ racine, dossier, enVol: () => [], version: "1.1.0", pid: 42 });
  t.after(() => vidange.arreter());
  // Une mise à jour tuée pendant la vidange : son terme passé, la station reprend.
  demander(dossier, "1.2.0", Date.now() - 1000);
  assert.equal(vidange.retenue(), false);
  // La station relancée sur la version demandée, avant que la demande ne soit retirée.
  demander(dossier, "1.1.0", Date.now() + 60_000);
  assert.equal(vidange.retenue(), false);
});

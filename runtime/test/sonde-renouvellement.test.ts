// La sonde du renouvellement : un systemd simulé, jamais le vrai.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { passagesDuJournal, sonderRenouvellement, type Passage, type Systemd } from "../src/sonde-renouvellement.ts";

const faux = (actif: boolean, passages: Passage[]): Systemd => ({
  minuteurActif: async () => actif,
  passages: async (max) => passages.slice(0, max),
});
// Heure locale : l'état la rend en heure locale, le test la construit de même.
const a = (h: number, m: number) => new Date(2026, 9, 15, h, m, 0);
const reussi = (h: number, m: number): Passage => ({ at: a(h, m), reussi: true, lignes: [] });
const echec = (h: number, m: number, ...lignes: string[]): Passage => ({ at: a(h, m), reussi: false, lignes });

describe("sonde du renouvellement", () => {
  test("tourne et réussit : l'heure du dernier passage réussi", async () => {
    const etat = await sonderRenouvellement(faux(true, [reussi(14, 7), reussi(14, 6)]));
    assert.deepEqual(etat, { etat: "ok", dernierReussi: "14:07", echecsConsecutifs: 0 });
  });

  test("minuteur inactif", async () => {
    const etat = await sonderRenouvellement(faux(false, []));
    assert.equal(etat.etat, "minuteur-inactif");
    assert.equal(etat.dernierReussi, null);
  });

  test("minuteur inactif, un ancien passage réussi gardé", async () => {
    const etat = await sonderRenouvellement(faux(false, [reussi(9, 30)]));
    assert.deepEqual(etat, { etat: "minuteur-inactif", dernierReussi: "09:30", echecsConsecutifs: 0 });
  });

  test("claude introuvable", async () => {
    const etat = await sonderRenouvellement(
      faux(true, [echec(14, 8, "brigade-renouvellement : échec (claude-introuvable) : « claude » ne se lance pas dans ce PATH", "Failed with result 'exit-code'.")]),
    );
    assert.equal(etat.etat, "claude-introuvable");
    assert.equal(etat.echecsConsecutifs, 1);
  });

  test("échec : la raison vient du journal", async () => {
    const etat = await sonderRenouvellement(
      faux(true, [echec(14, 8, "brigade-renouvellement : échec (session-refusee) : Anthropic a refusé le renouvellement", "Failed with result 'exit-code'."), reussi(14, 7)]),
    );
    assert.equal(etat.etat, "echec");
    assert.match((etat as { raison: string }).raison, /session-refusee.*refusé/);
    assert.equal(etat.dernierReussi, "14:07");
  });

  test("compte les échecs consécutifs, du plus récent, jusqu'au dernier réussi", async () => {
    const etat = await sonderRenouvellement(faux(true, [echec(14, 9, "x"), echec(14, 8, "y"), reussi(14, 7), echec(14, 6, "z")]));
    assert.equal(etat.echecsConsecutifs, 2);
  });

  test("minuteur actif sans aucun passage : échec dit", async () => {
    const etat = await sonderRenouvellement(faux(true, []));
    assert.equal(etat.etat, "echec");
  });

  test("lit les passages du journal de systemd", () => {
    const ligne = (message: string, us: number) => JSON.stringify({ MESSAGE: message, __REALTIME_TIMESTAMP: String(us) });
    const sortie = [
      ligne("Starting brigade-renouvellement.service", 1_000_000),
      ligne("Finished brigade-renouvellement.service", 2_000_000),
      ligne("Starting brigade-renouvellement.service", 3_000_000),
      ligne("brigade-renouvellement : échec (claude-introuvable) : absent", 4_000_000),
      ligne("brigade-renouvellement.service: Failed with result 'exit-code'.", 5_000_000),
    ].join("\n");
    const passages = passagesDuJournal(sortie);
    assert.equal(passages.length, 2);
    assert.equal(passages[0]?.reussi, false);
    assert.equal(passages[1]?.reussi, true);
  });
});

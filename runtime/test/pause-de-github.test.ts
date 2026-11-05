// La pause que GitHub impose à la station (#2436) : une seule, pour tous ses
// projets, jusqu'à l'instant que GitHub dit — et, quand il ne le dit pas, une
// minute doublée à chaque limite qui revient, jusqu'à quinze. Le journal la dit
// une fois quand elle commence, une fois quand un appel repart. L'horloge est
// celle du test : rien n'attend le temps réel.
import assert from "node:assert/strict";
import { test } from "node:test";
import { constaterLimite, estLaPauseDeGitHub, journaliserLaPause, LimiteGitHubAtteinte, ouvrirLimite, prendreUnAppel, RECUL_MAX_MS, surLaPauseDeGitHub, type ReponseHttp } from "../src/limite-github.ts";

const SECONDAIRE: ReponseHttp = { statut: 403, entetes: new Map(), corps: JSON.stringify({ message: "You have exceeded a secondary rate limit" }) };
const MINUTE = 60_000;

function horloge() {
  const etat = { instant: Date.parse("2026-11-05T10:54:00Z") };
  return { etat, maintenant: () => etat.instant };
}

test("une limite secondaire dite à un projet retient les appels de tous les projets jusqu'au `retry-after`, puis ils repartent", async () => {
  const h = horloge();
  const limite = ouvrirLimite({ maintenant: h.maintenant });
  const refus = await constaterLimite(limite, { ...SECONDAIRE, entetes: new Map([["retry-after", "300"]]) }, { gh: "gh-absent", maintenant: h.maintenant });
  assert.equal(refus.jusqua, h.etat.instant + 5 * MINUTE);
  for (const projet of ["brigade", "espace", "mirrorlab"]) {
    assert.throws(() => limite.prendre("cuisine", undefined, { projet, lecture: "issues" }), (erreur) => estLaPauseDeGitHub(erreur));
  }
  // Un geste du chef n'est jamais retenu.
  assert.equal(typeof limite.prendre("geste"), "number");
  h.etat.instant += 5 * MINUTE;
  for (const projet of ["brigade", "espace"]) assert.equal(typeof limite.prendre("cuisine", undefined, { projet, lecture: "issues" }), "number");
});

test("sans attente dite, la pause dure une minute, puis double à chaque limite qui revient, jusqu'à quinze ; les refus d'une même rafale ne la doublent pas", async () => {
  const h = horloge();
  const limite = ouvrirLimite({ maintenant: h.maintenant });
  const constater = () => constaterLimite(limite, SECONDAIRE, { gh: "gh-absent", maintenant: h.maintenant });
  const durees: number[] = [];
  for (let fois = 0; fois < 6; fois += 1) {
    const debut = h.etat.instant;
    const refus = await constater();
    // Trois autres requêtes de la même rafale, refusées pendant la pause qu'elle vient de poser.
    for (let autre = 0; autre < 3; autre += 1) assert.equal((await constater()).jusqua, refus.jusqua);
    durees.push(refus.jusqua - debut);
    // La pause passe, un appel repart, et la limite revient aussitôt.
    h.etat.instant = refus.jusqua;
  }
  assert.deepEqual(durees, [1, 2, 4, 8, 15, 15].map((minutes) => minutes * MINUTE));
  assert.equal(durees.at(-1), RECUL_MAX_MS);
  // Quinze minutes sans limite après la dernière pause : la suivante repart d'une minute.
  h.etat.instant += 15 * MINUTE;
  const refus = await constater();
  assert.equal(refus.jusqua - h.etat.instant, MINUTE);
});

test("une limite secondaire dont la réponse porte le reset horaire du quota primaire pause une minute, pas jusqu'à ce reset (#2449)", async () => {
  const h = horloge();
  const limite = ouvrirLimite({ maintenant: h.maintenant });
  // Le refus du 2026-11-05 : quota primaire loin d'être épuisé, reset dans 21 minutes.
  const entetes = new Map([["x-ratelimit-limit", "5000"], ["x-ratelimit-remaining", "3601"], ["x-ratelimit-reset", String((h.etat.instant + 21 * MINUTE) / 1000)]]);
  const refus = await constaterLimite(limite, { ...SECONDAIRE, entetes }, { gh: "gh-absent", maintenant: h.maintenant });
  assert.equal(refus.jusqua - h.etat.instant, MINUTE);
  // Quota primaire épuisé : la pause va bien jusqu'au reset.
  h.etat.instant += 20 * MINUTE;
  const epuise = new Map([["x-ratelimit-remaining", "0"], ["x-ratelimit-reset", String((h.etat.instant + 21 * MINUTE) / 1000)]]);
  const primaire = await constaterLimite(ouvrirLimite({ maintenant: h.maintenant }), { statut: 403, entetes: epuise, corps: JSON.stringify({ message: "API rate limit exceeded" }) }, { gh: "gh-absent", maintenant: h.maintenant });
  assert.equal(primaire.jusqua - h.etat.instant, 21 * MINUTE);
});

test("le journal dit la pause une fois quand elle commence, et une fois quand un appel repart — pas une ligne par projet et par refus", async (t) => {
  const h = horloge();
  const limite = ouvrirLimite({ maintenant: h.maintenant });
  const lignes: string[] = [];
  journaliserLaPause((ligne) => void lignes.push(ligne));
  t.after(() => journaliserLaPause(() => {}));
  const refus = await constaterLimite(limite, SECONDAIRE, { gh: "gh-absent", maintenant: h.maintenant });
  await constaterLimite(limite, SECONDAIRE, { gh: "gh-absent", maintenant: h.maintenant });
  for (const projet of ["brigade", "espace"]) {
    await assert.rejects(prendreUnAppel(limite, { gh: "gh-absent", maintenant: h.maintenant, etiquette: { projet, lecture: "issues" } }), LimiteGitHubAtteinte);
  }
  assert.equal(lignes.length, 1);
  assert.match(lignes[0] ?? "", /^brigade : GitHub limit reached — no call leaves the station before \d\d:\d\d$/);
  h.etat.instant = refus.jusqua;
  await prendreUnAppel(limite, { gh: "gh-absent", maintenant: h.maintenant, etiquette: { projet: "brigade", lecture: "issues" } });
  await prendreUnAppel(limite, { gh: "gh-absent", maintenant: h.maintenant, etiquette: { projet: "espace", lecture: "issues" } });
  assert.deepEqual(lignes.slice(1), ["brigade : GitHub calls resumed"]);
});

test("whoever listens hears a pause once when it starts, with its end, before any call is held — not once per refusal of the burst (#2443)", async (t) => {
  const h = horloge();
  const limite = ouvrirLimite({ maintenant: h.maintenant });
  const entendues: Array<{ depuis: number; jusqua: number; statut: number }> = [];
  const neplus = surLaPauseDeGitHub(({ depuis, jusqua, reponse }) => void entendues.push({ depuis, jusqua, statut: reponse.statut }));
  t.after(neplus);
  // Un écouteur qui lève ne retient pas le refus.
  t.after(surLaPauseDeGitHub(() => {
    throw new Error("cassé");
  }));
  const refus = await constaterLimite(limite, { ...SECONDAIRE, entetes: new Map([["retry-after", "1860"]]) }, { gh: "gh-absent", maintenant: h.maintenant });
  await constaterLimite(limite, SECONDAIRE, { gh: "gh-absent", maintenant: h.maintenant });
  assert.deepEqual(entendues, [{ depuis: h.etat.instant, jusqua: h.etat.instant + 31 * MINUTE, statut: 403 }]);
  assert.equal(refus.jusqua, h.etat.instant + 31 * MINUTE);
  h.etat.instant = refus.jusqua + 20 * MINUTE;
  await constaterLimite(limite, SECONDAIRE, { gh: "gh-absent", maintenant: h.maintenant });
  assert.equal(entendues.length, 2);
});

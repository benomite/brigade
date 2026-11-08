// Les humains du projet, côté app (#2930) : lus et changés par la commande du runtime `humans` (#2929) là où la cuisine
// du projet tourne. Une écriture rend l'adresse de la PR ou la ligne du refus ; une sortie illisible, un runtime trop
// vieux ou un projet sans station ne se devinent pas : ils se disent.
import assert from "node:assert/strict";
import type { ExecFileException } from "node:child_process";
import { describe, test } from "node:test";
import type { Lu, Rendu } from "../src/box.ts";
import { commandeDesHumains, ecrireLesHumains, lireLesHumains } from "../src/humains-du-projet.ts";

const BOX: Lu = { nom: "parade", cuisine: { locale: { node: "node", runtime: "/runtime", racine: "/station", env: {} } } };
const PR = "https://github.com/benomite/parade/pull/52";
const rendu = (sortie: string, code: number | null = null, erreurs = ""): Rendu => ({
  lance: "$ node geste.ts parade humans",
  erreur: code === null ? null : (Object.assign(new Error(`exit ${code}`), { code }) as ExecFileException),
  sortie,
  erreurs,
});
// Un lanceur qui retient les commandes et rend ce qu'on lui donne.
function lanceur(rendre: Rendu) {
  const lancees: string[] = [];
  return { lancees, lancer: async (_: Lu, commande: string) => (lancees.push(commande), rendre) };
}

describe("les humains du projet, par la commande `humans`", () => {
  test("la lecture rend les humains déclarés, avec les seuls rôles connus", async () => {
    const { lancees, lancer } = lanceur(rendu(`${JSON.stringify({ humans: [{ login: "alice", roles: ["product", "chef"] }, { login: "bob", roles: [] }] })}\n`));
    assert.deepEqual(await lireLesHumains("parade", BOX, lancer), [
      { login: "alice", roles: ["product"] },
      { login: "bob", roles: [] },
    ]);
    assert.deepEqual(lancees, ["humans"]);
  });

  test("une lecture qui échoue, illisible, d'un runtime trop vieux ou sans station se dit, sans liste inventée", async () => {
    const echec = await lireLesHumains("parade", BOX, lanceur(rendu("", 1, "brigade: the project's humans are not read — HTTP 502")).lancer);
    assert.ok(!Array.isArray(echec) && echec.sans === "humans unavailable" && echec.detail?.includes("HTTP 502"));
    const illisible = await lireLesHumains("parade", BOX, lanceur(rendu("pas du json")).lancer);
    assert.ok(!Array.isArray(illisible) && illisible.sans === "humans unavailable");
    const vieux = await lireLesHumains("parade", BOX, lanceur(rendu("", 66, "humans is not a runtime command")).lancer);
    assert.ok(!Array.isArray(vieux) && /update it/.test(vieux.sans));
    const { lancees, lancer } = lanceur(rendu("[]"));
    const sansStation = await lireLesHumains("parade", undefined, lancer);
    assert.ok(!Array.isArray(sansStation) && /has no station/.test(sansStation.sans));
    assert.deepEqual(lancees, []);
  });

  test("les mots d'une écriture : un login GitHub et des rôles connus, sinon rien ne part", () => {
    assert.deepEqual(commandeDesHumains({ save: { login: " alice ", roles: ["product", "review"] } }), { commande: "humans save alice product review" });
    assert.deepEqual(commandeDesHumains({ save: { login: "bob", roles: [] } }), { commande: "humans save bob" });
    assert.deepEqual(commandeDesHumains({ remove: "bob" }), { commande: "humans remove bob" });
    assert.ok("refus" in commandeDesHumains({ save: { login: "alice; rm -rf /", roles: [] } }));
    assert.ok("refus" in commandeDesHumains({ save: { login: "alice", roles: ["chef"] } }));
    assert.ok("refus" in commandeDesHumains({ remove: "" }));
  });

  test("une écriture rend l'adresse de la PR, ou la ligne du refus du runtime", async () => {
    const ouverte = lanceur(rendu(`${JSON.stringify({ ok: true, pr: PR })}\n`));
    assert.deepEqual(await ecrireLesHumains("parade", BOX, { save: { login: "carol", roles: ["design"] } }, ouverte.lancer), { pr: PR });
    assert.deepEqual(ouverte.lancees, ["humans save carol design"]);

    const refusee = await ecrireLesHumains("parade", BOX, { remove: "ghost" }, lanceur(rendu(`${JSON.stringify({ ok: false, message: "`ghost` is not a GitHub account" })}\n`, 1)).lancer);
    assert.ok("refus" in refusee && refusee.refus === "ghost is not a GitHub account");

    const illisible = await ecrireLesHumains("parade", BOX, { remove: "bob" }, lanceur(rendu("", 1, "boom")).lancer);
    assert.ok("refus" in illisible && /could not be read/.test(illisible.refus));
    const sansStation = await ecrireLesHumains("parade", undefined, { remove: "bob" }, lanceur(rendu("")).lancer);
    assert.ok("refus" in sansStation && /no station/.test(sansStation.refus));
  });
});

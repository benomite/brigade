// L'en-tête de la fiche d'un ticket : ce que la box en donne, ou pourquoi elle ne le donne pas —
// jamais une valeur devinée, jamais une ligne vide. La priorité vient de la ligne du ticket sous
// `rail`, dans `status`, telle que le runtime l'écrit : `faits` ne la donne pas.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { entete, type Source } from "../src/fiche.ts";

const URL_14 = "https://github.com/benomite/brigade/issues/14";
const RAIL = { etat: "pris", titre: "Le journal en ajout seul" };
const LIGNE = "pris  prio:1  par box/claude depuis 12 min, bail encore 27 min  Le journal en ajout seul";
const TOUT: Source = { titre: RAIL.titre, url: URL_14, rail: RAIL, lignes: [LIGNE] };

describe("l'en-tête de la fiche", () => {
  test("ce que la box donne est posé tel quel : le titre entier, la priorité recopiée, l'issue qui s'ouvre", () => {
    const titre = `${"Un titre très long, ".repeat(40)}jusqu'au bout`;
    assert.deepEqual(entete({ ...TOUT, titre }), {
      titre: { valeur: titre },
      priorite: { valeur: "prio:1", exact: true },
      issue: true,
      pr: { sans: "not given — the box only gives the PR of a served ticket" },
    });
  });

  test("une issue sans `prio:` : `status` écrit `-`, et la fiche le dit en clair — ce n'est pas une priorité manquante", () => {
    assert.deepEqual(entete({ ...TOUT, lignes: [LIGNE.replace("prio:1", "-")] }).priorite, { valeur: "none — its issue carries no `prio:` label" });
    // Le détail peut être vide : la priorité se lit toujours entre l'état et le titre.
    assert.deepEqual(entete({ ...TOUT, rail: { etat: "en attente", titre: "Un ticket" }, lignes: ["en attente  prio:3    Un ticket"] }).priorite, { valeur: "prio:3", exact: true });
  });

  test("une priorité que la box ne donne pas est écrite non communiquée, avec sa raison — jamais devinée", () => {
    const priorite = (source: Partial<Source>) => entete({ ...TOUT, ...source }).priorite;
    const { lignes: _, ...sansStatus } = TOUT;

    assert.deepEqual(entete(sansStatus).priorite, { sans: "not given — `faits` does not give it, and the `rail` line of `status` was not read" });
    const sansLigne = { sans: "not given — `faits` does not give it, and `status` writes no line for this ticket under `rail`" };
    assert.deepEqual(priorite({ lignes: [] }), sansLigne);
    // Un ticket qui n'est pas sur le rail de `faits` : rien ne borne sa ligne.
    const { rail: __, ...horsDuRail } = TOUT;
    assert.deepEqual(entete(horsDuRail).priorite, sansLigne);
    // Une ligne que le runtime n'écrit pas ainsi, une ligne d'un autre état, deux lignes : rien n'en est tiré.
    const illisible = { sans: "not given — `faits` does not give it, and the app does not read it in what `status` writes about this ticket" };
    for (const lignes of [["pris  urgent  par box/claude  Le journal en ajout seul"], [LIGNE.replace("pris", "en pass")], [LIGNE, LIGNE]]) assert.deepEqual(priorite({ lignes }), illisible, lignes.join(" | "));
  });

  test("le titre, l'issue : absents ou vides, ils sont écrits non communiqués ; une adresse qui n'est pas https ne s'ouvre pas", () => {
    const { titre: _, ...sansTitre } = TOUT;
    for (const source of [sansTitre, { ...TOUT, titre: "" }]) assert.deepEqual(entete(source).titre, { sans: "not given — the box returns no title for this ticket" });
    for (const url of [null, undefined]) assert.deepEqual(entete({ ...TOUT, url }).issue, { sans: "not given — the box returns no address for this issue" });
    for (const url of ["http://exemple.fr/14", "file:///etc/passwd", "pas une adresse"]) assert.deepEqual(entete({ ...TOUT, url }).issue, { sans: "the address the box returned is not https: the app does not open it" });
  });

  test("la PR : un lien quand la box en donne une, « aucune » quand le ticket a été servi sans merge, non communiquée sinon", () => {
    assert.equal(entete({ ...TOUT, pr: "https://github.com/benomite/brigade/pull/219" }).pr, true);
    assert.deepEqual(entete({ ...TOUT, pr: null }).pr, { valeur: "none — served without a merge" });
    assert.deepEqual(entete({ ...TOUT, pr: "http://exemple.fr/219" }).pr, { sans: "the address the box returned is not https: the app does not open it" });
    assert.deepEqual(entete(TOUT).pr, { sans: "not given — the box only gives the PR of a served ticket" });
  });
});

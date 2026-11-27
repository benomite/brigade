// L'en-tête de la fiche d'un ticket : ce que la box en donne, ou pourquoi elle ne le donne pas —
// jamais une valeur devinée, jamais une ligne vide. La priorité vient de la ligne du ticket sous
// `rail`, dans `status`, telle que le runtime l'écrit : `faits` ne la donne pas.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { header, type Source } from "../src/card.ts";

const URL_14 = "https://github.com/benomite/brigade/issues/14";
const RAIL = { etat: "pris", titre: "Le journal en ajout seul" };
const LINE = "pris  prio:1  par box/claude depuis 12 min, bail encore 27 min  Le journal en ajout seul";
const ALL: Source = { titre: RAIL.titre, url: URL_14, rail: RAIL, lignes: [LINE] };

describe("l'en-tête de la fiche", () => {
  test("ce que la station donne est posé tel quel : le titre entier, la priorité recopiée, l'issue qui s'ouvre", () => {
    const title = `${"Un titre très long, ".repeat(40)}jusqu'au bout`;
    assert.deepEqual(header({ ...ALL, titre: title }), {
      titre: { valeur: title },
      priorite: { valeur: "prio:1", exact: true },
      issue: true,
    });
  });

  test("une issue sans `prio:` : `status` écrit `-`, et la fiche le dit en clair — ce n'est pas une priorité manquante", () => {
    assert.deepEqual(header({ ...ALL, lignes: [LINE.replace("prio:1", "-")] }).priorite, { valeur: "none — its issue carries no `prio:` label" });
    // Le détail peut être vide : la priorité se lit toujours entre l'état et le titre.
    assert.deepEqual(header({ ...ALL, rail: { etat: "en attente", titre: "Un ticket" }, lignes: ["en attente  prio:3    Un ticket"] }).priorite, { valeur: "prio:3", exact: true });
  });

  test("une issue qui n'est pas sur le rail : sa priorité est celle que la station donne elle-même (`manager upstream`), sans ligne de `status`", () => {
    const enUpstream = (prio: number | null) => header({ titre: "Une issue à venir", url: URL_14, prio }).priorite;

    assert.deepEqual(enUpstream(2), { valeur: "prio:2", exact: true });
    assert.deepEqual(enUpstream(null), { valeur: "none — its issue carries no `prio:` label" });
  });

  test("une priorité que la box ne donne pas est écrite non communiquée, avec sa raison — jamais devinée", () => {
    const priority = (source: Partial<Source>) => header({ ...ALL, ...source }).priorite;
    const { lignes: _, ...withoutStatus } = ALL;

    assert.deepEqual(header(withoutStatus).priorite, { sans: "not given — `facts` does not give it, and the `rail` line of `status` was not read" });
    const withoutLine = { sans: "not given — `facts` does not give it, and `status` writes no line for this ticket under `rail`" };
    assert.deepEqual(priority({ lignes: [] }), withoutLine);
    // Un ticket qui n'est pas sur le rail de `faits` : rien ne borne sa ligne.
    const { rail: __, ...outsideOfRail } = ALL;
    assert.deepEqual(header(outsideOfRail).priorite, withoutLine);
    // Une ligne que le runtime n'écrit pas ainsi, une ligne d'un autre état, deux lignes : rien n'en est tiré.
    const unreadable = { sans: "not given — `facts` does not give it, and the app does not read it in what `status` writes about this ticket" };
    for (const lines of [["pris  urgent  par box/claude  Le journal en ajout seul"], [LINE.replace("pris", "en pass")], [LINE, LINE]]) assert.deepEqual(priority({ lignes: lines }), unreadable, lines.join(" | "));
  });

  test("le titre, l'issue : absents ou vides, ils sont écrits non communiqués ; une adresse qui n'est pas https ne s'ouvre pas", () => {
    const { titre: _, ...withoutTitle } = ALL;
    for (const source of [withoutTitle, { ...ALL, titre: "" }]) assert.deepEqual(header(source).titre, { sans: "not given — the station returns no title for this ticket" });
    for (const url of [null, undefined]) assert.deepEqual(header({ ...ALL, url }).issue, { sans: "not given — the station returns no address for this issue" });
    for (const url of ["http://exemple.fr/14", "file:///etc/passwd", "pas une adresse"]) assert.deepEqual(header({ ...ALL, url }).issue, { sans: "the address the station returned is not https: the app does not open it" });
  });

  test("la PR : un lien quand la box en donne une, « aucune » quand le ticket a été servi sans merge, aucune ligne sinon", () => {
    assert.equal(header({ ...ALL, pr: "https://github.com/benomite/brigade/pull/219" }).pr, true);
    assert.deepEqual(header({ ...ALL, pr: null }).pr, { valeur: "none — served without a merge" });
    assert.deepEqual(header({ ...ALL, pr: "http://exemple.fr/219" }).pr, { sans: "the address the station returned is not https: the app does not open it" });
    assert.equal("pr" in header(ALL), false, "pas de PR donnée : pas de ligne");
  });
});

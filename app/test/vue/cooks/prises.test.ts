// Qui tient un ticket sur GitHub seul (#2220) : l'app lit les commentaires de prise comme la station qui prend le ticket
// (runtime/src/github-etat/prise.ts, `tenant`) — les deux sont jouées ici sur les mêmes commentaires, et disent pareil.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { corpsDeLacher, corpsDePrise, tenant } from "../../../../runtime/src/github-etat/prise.ts";
import { stationsDesPrises, tenantDeLIssue } from "../../../src/vue/cooks/prises.ts";

type Commentaire = { id: number; body: string; author_association: string; created_at: string };
const prise = (id: number, station: string, le: string, association = "OWNER"): Commentaire => ({ id, body: corpsDePrise(station), author_association: association, created_at: le });
const lacher = (id: number, station: string, le: string): Commentaire => ({ id, body: corpsDeLacher(station), author_association: "OWNER", created_at: le });
const retrait = (label: string, le: string) => ({ event: "unlabeled", label: { name: label }, created_at: le });

// Ce que le runtime dit des mêmes faits : la station qui tient, ou null.
const duRuntime = (commentaires: Commentaire[], evenements: ReturnType<typeof retrait>[]) =>
  tenant(
    commentaires.map(({ id, body, author_association, created_at }) => ({ id, body, association: author_association, createdAt: created_at })),
    evenements.map(({ label, created_at }) => ({ label: label.name, createdAt: created_at })),
  )?.station ?? null;

const CAS: { nom: string; commentaires: Commentaire[]; evenements: ReturnType<typeof retrait>[]; tient: string | null }[] = [
  { nom: "aucune prise", commentaires: [], evenements: [], tient: null },
  { nom: "la plus ancienne prise l'emporte", commentaires: [prise(2, "mac/claude", "2026-11-04T03:00:01Z"), prise(1, "box/claude", "2026-11-04T03:00:00Z")], evenements: [], tient: "box/claude" },
  { nom: "même seconde : le plus petit id", commentaires: [prise(9, "mac/claude", "2026-11-04T03:00:00Z"), prise(8, "box/claude", "2026-11-04T03:00:00Z")], evenements: [], tient: "box/claude" },
  { nom: "un lâcher annule tout ce qui le précède", commentaires: [prise(1, "box/claude", "2026-11-04T03:00:00Z"), lacher(2, "box/claude", "2026-11-04T03:10:00Z")], evenements: [], tient: null },
  { nom: "une prise après le lâcher tient", commentaires: [prise(1, "box/claude", "2026-11-04T03:00:00Z"), lacher(2, "box/claude", "2026-11-04T03:10:00Z"), prise(3, "mac/claude", "2026-11-04T03:11:00Z")], evenements: [], tient: "mac/claude" },
  { nom: "le retrait de `taken` lâche, la prise suivante tient", commentaires: [prise(1, "box/claude", "2026-11-04T03:00:00Z"), prise(3, "mac/claude", "2026-11-04T03:20:00Z")], evenements: [retrait("taken", "2026-11-04T03:10:00Z")], tient: "mac/claude" },
  { nom: "le retrait d'un autre label ne lâche rien", commentaires: [prise(1, "box/claude", "2026-11-04T03:00:00Z")], evenements: [retrait("prio:2", "2026-11-04T03:10:00Z")], tient: "box/claude" },
  { nom: "un commentaire hors du dépôt ne prend rien", commentaires: [prise(1, "pirate/claude", "2026-11-04T02:00:00Z", "NONE"), prise(2, "box/claude", "2026-11-04T03:00:00Z")], evenements: [], tient: "box/claude" },
];

describe("qui tient un ticket, d'après son issue", () => {
  for (const { nom, commentaires, evenements, tient } of CAS) {
    test(`${nom} — comme le runtime le lit`, () => {
      assert.equal(tenantDeLIssue(commentaires, evenements)?.station ?? null, tient);
      assert.equal(duRuntime(commentaires, evenements), tient);
    });
  }

  test("la prise dit son heure : celle de son commentaire", () => {
    assert.deepEqual(tenantDeLIssue([prise(1, "box/claude", "2026-11-04T03:00:00Z")], []), { station: "box/claude", le: "2026-11-04T03:00:00Z" });
  });
});

describe("les stations de l'onglet Cooks, d'après les prises", () => {
  test("une station par tenant, dans l'ordre de sa première prise, ses cooks dedans ; chacune cuit", () => {
    const stations = stationsDesPrises([
      { ticket: 12, titre: "Douze", station: "mac/claude", le: "2026-11-04T03:05:00Z" },
      { ticket: 7, titre: "Sept", station: "box/claude", le: "2026-11-04T03:00:00Z" },
      { ticket: 9, titre: "Neuf", station: "box/claude", le: "2026-11-04T03:10:00Z" },
    ]);
    assert.deepEqual(
      stations.map(({ station, cuisson, distante, cooks }) => ({ station, cuisson, distante, cooks: cooks?.map(({ ticket }) => ticket) })),
      [
        { station: "box/claude", cuisson: "cooking", distante: false, cooks: [7, 9] },
        { station: "mac/claude", cuisson: "cooking", distante: false, cooks: [12] },
      ],
    );
  });

  test("aucune prise, aucune station", () => {
    assert.deepEqual(stationsDesPrises([]), []);
  });
});

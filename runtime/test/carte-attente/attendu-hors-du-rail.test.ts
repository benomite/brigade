// #3763 : la porte de prise retient un ticket en file sur tout ticket ouvert qu'il attend, sur le rail ou non
// (`attendusOuverts`, attente-ticket.ts) : sa carte, dans `brigade <project> status`, le dit avec sa source. Un ticket attendu
// fermé ou disparu ne retient plus rien, et ne se dit pas ; un ticket attendu illisible retient, comme à la porte de prise.
import assert from "node:assert/strict";
import { test } from "node:test";
import { lignesDeLAttente } from "../../src/attente-du-rail/status.ts";
import { MARQUE_D_ATTENTE_DE_TICKET } from "../../src/carte-attente/carte-attente.ts";
import { MARQUEUR } from "../../src/fiche.ts";
import { DEPOT } from "../outils.ts";

const MAINTENANT = Date.parse("2026-11-17T10:00:00.000Z");
const issue = (number: number, labels: string[], body = "") => ({ number, title: `Ticket ${number}`, body, created_at: "2026-11-17T09:00:00Z", labels: labels.map((name) => ({ name })) });
const commentaire = (body: string) => ({ id: 1, author_association: "OWNER", body, created_at: "2026-11-17T09:30:00Z" });
const fiche = (attendu: number) => commentaire([MARQUEUR, `- awaiting: #${attendu}`, "- zone: app/"].join("\n"));
const arret = (attendu: number) => commentaire(`${MARQUE_D_ATTENTE_DE_TICKET} #${attendu} -->\nThe cook stopped.`);
const enLigne = async () => ({ lues: [{ name: "box", lastSeen: new Date(MAINTENANT - 30_000).toISOString(), stoppedAt: null, refreshMs: 120_000, selection: [DEPOT] }] });
const EPIQUE = "Split.\n\n<!-- brigade:tickets -->\n| #51 | A | open |\n| #52 | B | closed |\n| #13 | C | open |\n<!-- /brigade:tickets -->";

// Hors du rail : #1912 ouvert, #20 fermé, #30 illisible, #40 disparu, #50 une épique ouverte découpée en #51 (ouvert),
// #52 (fermé) et #13 lui-même.
const HORS_DU_RAIL: Record<number, unknown> = { 1912: { state: "open", body: "" }, 20: { state: "closed", body: "" }, 50: { state: "open", body: EPIQUE }, 51: { state: "open", body: "" }, 52: { state: "closed", body: "" } };
function lecteur(issues: unknown[], commentaires: Record<number, unknown[]>) {
  const lues: string[] = [];
  const lire = async (chemin: string): Promise<unknown> => {
    if (chemin.includes("/issues?")) return issues;
    const sien = /\/issues\/(\d+)\/comments/.exec(chemin);
    if (sien !== null) return commentaires[Number(sien[1])] ?? [];
    if (/\/issues\/\d+\/events/.test(chemin)) return [];
    const seule = new RegExp(`^/repos/${DEPOT}/issues/(\\d+)$`).exec(chemin);
    if (seule === null) throw new Error(`not dictated: ${chemin}`);
    lues.push(chemin);
    const n = Number(seule[1]);
    if (n === 30) throw new Error("GitHub answered HTTP 502");
    if (HORS_DU_RAIL[n] === undefined) throw new Error("GitHub answered HTTP 404");
    return HORS_DU_RAIL[n];
  };
  return { lire, lues };
}

test("status : un ticket retenu par un ticket ouvert hors du rail le dit, de chaque source ; fermé ou disparu, il ne retient rien", async () => {
  const { lire, lues } = lecteur(
    [
      issue(5, ["fire"], "Builds on #1912."),
      issue(6, ["fire"], "Restyle the screen."),
      issue(7, ["fire"], "Restyle the screen."),
      issue(8, ["fire"], "Builds on #20.\nDepends on #40"),
      issue(9, ["fire"], "Restyle the screen."),
      issue(13, ["fire"], "With the identity of #50."),
      issue(14, ["fire"], "Builds on #1912."),
    ],
    { 6: [fiche(1912)], 7: [arret(30)], 9: [fiche(20)] },
  );
  assert.deepEqual(await lignesDeLAttente({ depot: DEPOT, lire, stations: enLigne, maintenant: MAINTENANT }), [
    "queue wait A cook takes the ticket within minutes. It resolves by itself.",
    "  #5  waits for #1912 — read from the body: 'Builds on #1912.'",
    "  #6  waits for #1912 — read from the card",
    "  #7  waits for #30 — read from a cook's stop",
    "  #13  waits for #51 — read from the body: 'With the identity of #50.'",
    "  #14  waits for #1912 — read from the body: 'Builds on #1912.'",
  ]);
  // Chaque ticket hors du rail se lit une fois par lecture du rail, même attendu de plusieurs cartes.
  assert.deepEqual([...lues].sort(), [...new Set(lues)].sort());
  assert.equal(lues.filter((chemin) => chemin.endsWith("/1912")).length, 1);
});

test("status : une file dont chaque ticket attend un ticket ouvert hors du rail attend un autre ticket", async () => {
  const { lire } = lecteur([issue(5, ["fire"], "Builds on #1912."), issue(6, ["fire"])], { 6: [arret(1912)] });
  assert.deepEqual(await lignesDeLAttente({ depot: DEPOT, lire, stations: enLigne, maintenant: MAINTENANT }), [
    "queue wait Every queued ticket waits for another ticket: they start once it merges. It resolves by itself.",
    "  #5  waits for #1912 — read from the body: 'Builds on #1912.'",
    "  #6  waits for #1912 — read from a cook's stop",
  ]);
});

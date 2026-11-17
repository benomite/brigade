// #3763 : un ticket en file retenu par une attente — de son corps, de sa fiche, de l'arrêt d'un cook — dit sur sa carte, dans
// `brigade <project> status`, la ligne `waits for #N — read from …`, jamais une carte libre ; un ticket que rien ne retient
// n'en a aucune. La phrase au-dessus de la file compte les attentes de la fiche et des arrêts :
// une file dont chaque ticket est retenu, par quelque source que ce soit, attend un autre ticket. Le rail de l'app dit la
// même ligne : app/test/attente-du-rail/jamais-awaiting-none-retenu.test.ts.
import assert from "node:assert/strict";
import { test } from "node:test";
import { lignesDeLAttente } from "../../src/attente-du-rail/status.ts";
import { MARQUE_D_ATTENTE_DE_TICKET } from "../../src/carte-attente/carte-attente.ts";
import { MARQUEUR } from "../../src/fiche.ts";
import { DEPOT } from "../outils.ts";

const MAINTENANT = Date.parse("2026-11-17T10:00:00.000Z");
const issue = (number: number, labels: string[], body = "") => ({ number, title: `Ticket ${number}`, html_url: `https://github.com/${DEPOT}/issues/${number}`, body, created_at: "2026-11-17T09:00:00Z", labels: labels.map((name) => ({ name })) });
const commentaire = (body: string) => ({ id: 1, author_association: "OWNER", body, created_at: "2026-11-17T09:30:00Z" });
const fiche = (attendu: number) => commentaire([MARQUEUR, `- awaiting: #${attendu}`, "- zone: app/"].join("\n"));
const arret = (attendu: number) => commentaire(`${MARQUE_D_ATTENTE_DE_TICKET} #${attendu} -->\nThe cook stopped.`);
const EPIQUE = "Split.\n\n<!-- brigade:tickets -->\n| #10 | A | open |\n| #11 | B | open |\n| #12 | C | open |\n<!-- /brigade:tickets -->";
const enLigne = async () => ({ lues: [{ name: "box", lastSeen: new Date(MAINTENANT - 30_000).toISOString(), stoppedAt: null, refreshMs: 120_000, selection: [DEPOT] }] });

// Le rail que GitHub rend, les commentaires de chaque ticket (absents : il n'en a pas ; nuls : ils ne se lisent pas).
type Rail = { issues: unknown[]; commentaires: Record<number, unknown[] | null> };
const lireDe = ({ issues, commentaires }: Rail) => async (chemin: string): Promise<unknown> => {
  if (chemin.includes("/issues?")) return issues;
  const sien = /\/issues\/(\d+)\/comments/.exec(chemin);
  if (sien !== null) {
    const siens = commentaires[Number(sien[1])];
    if (siens === null) throw new Error("GitHub answered HTTP 502");
    return siens ?? [];
  }
  if (/\/issues\/\d+\/events/.test(chemin)) return [];
  throw new Error(`not dictated: ${chemin}`);
};
const status = (rail: Rail) => lignesDeLAttente({ depot: DEPOT, lire: lireDe(rail), stations: enLigne, maintenant: MAINTENANT });

// #4 tenu par un cook ; #5 l'attend par son corps, #6 par sa fiche, #7 par l'arrêt d'un cook ; #8 libre ; #9 aux
// commentaires illisibles ; #12 attend l'épique #3, découpée en #10 (tenu), #11 et #12 lui-même, qui ne s'attend pas.
const TROIS_SOURCES: Rail = {
  issues: [
    issue(3, ["fire"], EPIQUE),
    issue(4, ["fire", "taken"]),
    issue(5, ["fire"], "Builds on #4."),
    issue(6, ["fire"], "Restyle the screen."),
    issue(7, ["fire"], "Restyle the screen."),
    issue(8, ["fire"], "Independent work."),
    issue(9, ["fire"], "Independent work."),
    issue(10, ["fire", "taken"]),
    issue(11, ["fire"]),
    issue(12, ["fire"], "Builds on #3."),
  ],
  commentaires: { 6: [fiche(4)], 7: [arret(4)], 9: null },
};
const CARTES: Record<number, string> = {
  5: "waits for #4 — read from the body: 'Builds on #4.'",
  6: "waits for #4 — read from the card",
  7: "waits for #4 — read from a cook's stop",
  9: "its card and its cooks' stops could not be read on GitHub",
  12: "waits for #10 — read from the body: 'Builds on #3.'; waits for #11 — read from the body: 'Builds on #3.'",
};

test("status : chaque ticket retenu dit son attente et d'où elle est lue ; un ticket libre n'a pas de ligne", async () => {
  assert.deepEqual(await status(TROIS_SOURCES), Object.entries(CARTES).map(([n, ligne]) => `  #${n}  ${ligne}`));
});

// Sans cook qui tourne, la phrase au-dessus de la file : chaque ticket en file retenu, par sa fiche ou l'arrêt d'un cook
// comme par son corps, la file attend un autre ticket ; un seul libre, elle part normalement.
test("status : une file dont chaque ticket est retenu, par sa fiche ou l'arrêt d'un cook, attend un autre ticket", async () => {
  const retenue: Rail = { issues: [issue(5, ["fire"]), issue(6, ["fire"])], commentaires: { 5: [fiche(6)], 6: [arret(5)] } };
  assert.deepEqual(await status(retenue), [
    "queue wait Every queued ticket waits for another ticket: they start once it merges. It resolves by itself.",
    "  #5  waits for #6 — read from the card",
    "  #6  waits for #5 — read from a cook's stop",
  ]);
  const unLibre: Rail = { issues: [issue(5, ["fire"]), issue(6, ["fire"])], commentaires: { 5: [fiche(6)] } };
  const lignes = await status(unLibre);
  assert.match(lignes[0] ?? "", /^queue wait A cook takes the ticket within minutes/);
  assert.deepEqual(lignes.slice(1), ["  #5  waits for #6 — read from the card"]);
});

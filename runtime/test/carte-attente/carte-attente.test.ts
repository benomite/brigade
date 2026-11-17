// Les attentes d'un ticket et leur source (#3763) : celles que la porte de prise obéit — le corps, la fiche, l'arrêt d'un
// cook, moins celles que la cuisine a levées —, chacune avec d'où elle est lue.
import assert from "node:assert/strict";
import { test } from "node:test";
import { direLAttente, ligneDeLaCarte, type TicketDuRail } from "../../src/attente-du-rail/raison.ts";
import { MARQUE_D_ATTENTE_LEVEE } from "../../src/boucle-attente/levee.ts";
import { attentesDuTicket, MARQUE_D_ATTENTE_DE_TICKET } from "../../src/carte-attente/carte-attente.ts";
import { MARQUEUR } from "../../src/fiche.ts";

const fiche = (attend: string) => [MARQUEUR, `- awaiting: ${attend}`, "- zone: runtime/"].join("\n");
const arret = (attendus: string) => `${MARQUE_D_ATTENTE_DE_TICKET} ${attendus} -->\nThe cook stopped.`;

test("les trois sources, chacune avec la sienne ; la phrase du corps, sans sa puce", () => {
  const { attentes, commentairesLus } = attentesDuTicket({ ticket: 5, corps: "Context.\n- Builds on #4, after the identity.", commentaires: [fiche("#6"), arret("#7")] });
  assert.deepEqual(attentes, [
    { ticket: 4, source: "corps", phrase: "Builds on #4, after the identity." },
    { ticket: 6, source: "fiche" },
    { ticket: 7, source: "arret" },
  ]);
  assert.equal(commentairesLus, true);
  assert.deepEqual(attentes.map(direLAttente), ["waits for #4 — read from the body: 'Builds on #4, after the identity.'", "waits for #6 — read from the card", "waits for #7 — read from a cook's stop"]);
});

test("une attente que la cuisine a levée ne se dit plus, de quelque source qu'elle vienne", () => {
  const levee = `${MARQUE_D_ATTENTE_LEVEE} #4 #6 -->\nLifted.`;
  const { attentes } = attentesDuTicket({ ticket: 5, corps: "Depends on #4", commentaires: [fiche("#6"), arret("#7"), levee] });
  assert.deepEqual(attentes, [{ ticket: 7, source: "arret" }]);
});

// Ni le ticket lui-même ni l'épique, quand sa liste la nomme, ne s'y attendent, comme à la porte de prise (`attendusDuCorps`).
test("une épique attendue l'est dans les tickets de son découpage, avec la phrase qui la nomme", () => {
  const { attentes } = attentesDuTicket({ ticket: 50, corps: "Restyle the screen with the identity of #49.", commentaires: [], decoupage: (n) => (n === 49 ? [49, 53, 50] : []) });
  assert.deepEqual(attentes, [{ ticket: 53, source: "corps", phrase: "Restyle the screen with the identity of #49." }]);
});

test("une phrase longue est coupée, une ligne de code n'en est pas une", () => {
  const longue = `This screen builds on #4 ${"and keeps going ".repeat(10)}`;
  const [lue] = attentesDuTicket({ ticket: 5, corps: `${longue}\n\`\`\`\nafter #9\n\`\`\``, commentaires: [] }).attentes;
  assert.equal(lue?.phrase?.length, 80);
  assert.ok(lue?.phrase?.endsWith("…"));
  assert.equal(attentesDuTicket({ ticket: 5, corps: "```\nafter #9\n```", commentaires: [] }).attentes.length, 0);
});

test("des commentaires illisibles : la carte le dit, avec ou sans attente du corps — jamais libre en silence", () => {
  const lus = attentesDuTicket({ ticket: 5, corps: "Restyle the screen.", commentaires: null });
  assert.equal(lus.commentairesLus, false);
  const carte: TicketDuRail = { ticket: 5, etat: "queued", entreLe: null, depend: [], ...lus };
  assert.equal(ligneDeLaCarte(carte, [carte]), "its card and its cooks' stops could not be read on GitHub");
  const derriere: TicketDuRail = { ticket: 6, etat: "queued", entreLe: null, depend: [5], ...attentesDuTicket({ ticket: 6, corps: "After #5.", commentaires: null }) };
  assert.equal(ligneDeLaCarte(derriere, [carte, derriere]), "waits for #5 — read from the body: 'After #5.'; its card and its cooks' stops could not be read on GitHub");
});

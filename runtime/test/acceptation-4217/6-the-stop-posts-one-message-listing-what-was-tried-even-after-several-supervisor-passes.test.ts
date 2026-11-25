// #4217, critère 6 : l'arrêt poste un seul message sur le ticket, même après plusieurs passes du superviseur ; il dit que le ticket s'est arrêté et liste ce qui a été tenté.
// Test d'acceptation gelé (#3725) : le message est le commentaire du ticket qui n'est ni une prise, ni un lâcher, ni un échec, ni une attente, ni une reprise du manager, ni un renvoi.
import assert from "node:assert/strict";
import { test } from "node:test";
import { MARQUE_DE_LA_REPRISE } from "../../src/reprise-du-manager.ts";
import { FauxGitHub } from "../faux-github.ts";

const TICKET = 923;
const LIMITE = 5;
const JOUR_MS = 24 * 3_600_000;
const DU_FLUX = /^<!-- brigade:(prise|lache|echec|waiting|reprise-du-manager|renvoi)\b/;

test("the stop posts one message that says the ticket stopped and lists every try, and several supervisor passes later it is still one", async () => {
  const faux = new FauxGitHub();
  faux.feu(TICKET);
  let maintenant = new Date("2026-11-24T10:00:00Z").getTime();
  let n = 0;
  const station = faux.station("A", { cuisiner: async () => ({ echec: `reason ${(n += 1)}` }), maintenant: () => new Date(maintenant), avertir: () => {} });
  const passe = async () => {
    await station.tour();
    await station.calme();
  };
  for (let tour = 0; tour < 30; tour += 1) {
    const avant = faux.cuissons.length;
    await passe();
    if (faux.ticket(TICKET).labels.has("set-aside:failures") && faux.cuissons.length < LIMITE) {
      faux.poster(TICKET, "manager", `${MARQUE_DE_LA_REPRISE} choice=rewrite -->\nThe manager rewrote the ticket.`);
      for (const label of ["set-aside:failures", "waiting"]) if (faux.ticket(TICKET).labels.has(label)) await faux.pour("supervisor").delabelliser(TICKET, label);
    }
    if (faux.cuissons.length === avant && tour > 2) break;
  }
  assert.equal(faux.cuissons.length, LIMITE, "the ticket reached its total limit");
  const messages = () => (faux.commentaires.get(TICKET) ?? []).map((c) => c.body).filter((corps) => !DU_FLUX.test(corps) && /\bstopped\b/i.test(corps));
  assert.equal(messages().length, 1, "one message says the ticket stopped");
  for (let i = 1; i <= LIMITE; i += 1) assert.match(messages()[0] ?? "", new RegExp(`reason ${i}\\b`), `the message lists try ${i}`);
  // Plusieurs passes du superviseur, des jours plus tard : aucun second message.
  for (let i = 0; i < 5; i += 1) {
    maintenant += JOUR_MS;
    await passe();
  }
  assert.equal(messages().length, 1, "still one message after several supervisor passes");
});

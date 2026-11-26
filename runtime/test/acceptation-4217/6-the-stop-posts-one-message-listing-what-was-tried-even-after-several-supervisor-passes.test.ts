// #4217, critère 6 : l'arrêt poste un seul message sur le ticket, même après plusieurs passes du superviseur ; il dit
// que le ticket s'est arrêté et liste ce qui a été tenté. Le message porte sa marque à lui :
// `<!-- brigade:todo kind=blocked stop=<essais> -->`, la carte de TODO de l'arrêt.
import assert from "node:assert/strict";
import { test } from "node:test";
import { arreterPourDeBon, ESSAIS_AU_TOTAL } from "../../src/claim-hold/essais.ts";
import { MARQUE_DE_LA_REPRISE } from "../../src/reprise-du-manager.ts";
import { FauxGitHub } from "../faux-github.ts";

const TICKET = 923;
const JOUR_MS = 24 * 3_600_000;
const MARQUE_D_ARRET = /^<!-- brigade:todo kind=blocked stop=\d+ -->/;

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
    // Une passe du superviseur : le ticket parqué par ses échecs revient sur le rail, réécrit.
    if (faux.ticket(TICKET).labels.has("parked")) {
      faux.poster(TICKET, "manager", `${MARQUE_DE_LA_REPRISE} station=A choice=rewrite -->\nThe manager rewrote the ticket.`);
      await faux.pour("supervisor").delabelliser(TICKET, "parked");
    }
    if (faux.cuissons.length === avant && tour > 2) break;
  }
  assert.equal(faux.cuissons.length, ESSAIS_AU_TOTAL, "the ticket reached its total limit");
  const messages = () => (faux.commentaires.get(TICKET) ?? []).map((c) => c.body).filter((corps) => MARQUE_D_ARRET.test(corps));
  assert.equal(messages().length, 1, "one message says the ticket stopped");
  assert.match(messages()[0] ?? "", /stopped for good after 5 tries in total/);
  for (let i = 1; i <= ESSAIS_AU_TOTAL; i += 1) assert.match(messages()[0] ?? "", new RegExp(`^${i}\\. reason ${i}$`, "m"), `the message lists try ${i}`);
  // Plusieurs passes, des jours plus tard — la station, et le geste d'arrêt rejoué : aucun second message.
  for (let i = 0; i < 5; i += 1) {
    maintenant += JOUR_MS;
    await passe();
    if (faux.ticket(TICKET).labels.has("parked")) await faux.pour("supervisor").delabelliser(TICKET, "parked");
    assert.equal(await arreterPourDeBon(faux.pour("supervisor"), TICKET, "supervisor", ["again"]), false, "a stop already on does not post again");
  }
  assert.equal(messages().length, 1, "still one message after several supervisor passes");
});

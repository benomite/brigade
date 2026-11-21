// Ticket 3761 : un ticket en file retenu par un ticket en WAITING est dit en WAITING sur le rail de l'app — dans la colonne
// Waiting, sa carte disant « waits for `#N`, WAITING on <qui> » —, et dans la file du second ; jamais un ticket en file au
// repos : ni compté en file, ni ticket prêt de la cuisine arrêtée ou muette. Seul sur le rail depuis plus d'une heure, la
// ligne en tête du rail le nomme, et ce qu'il attend.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { comprendre, tableau, type Carte, type Faits } from "../../../src/faits.ts";
import type { AppelGitHub, ReponseGitHub } from "../../../src/tableau/client.ts";
import { lireLeTableauDuDepot, type TableauLu } from "../../../src/tableau/lecture.ts";
import { avecCeQuiAttendLeChef } from "../../../src/tableau/attente-du-chef.ts";
import { statusDuTableau } from "../../../src/tableau/rail.ts";
import { attenteDuRailLue } from "../../../src/vue/attente-du-rail/attente-du-rail.ts";
import { corpsDeLAttente } from "../../../../runtime/src/attente-github/attente-github.ts";

const DEPOT = "acme/kitchen";
const LU = new Date("2026-11-17T10:00:00.000Z");
const ok = (data: unknown): ReponseGitHub => ({ status: 200, data });
const issue = (number: number, labels: string[], body = "") => ({ number, title: `Ticket ${number}`, body, html_url: `https://github.com/${DEPOT}/issues/${number}`, created_at: "2026-11-07T09:00:00Z", labels: labels.map((name) => ({ name })) });
const MARQUE = { body: corpsDeLAttente({ what: "the collaborator's answer", who: "a collaborator", followUp: "2026-11-24T09:00:00.000Z" }), author_association: "OWNER", created_at: "2026-11-07T09:00:00Z" };

// #1912 en WAITING sur un collaborateur ; #3734 en file depuis `minutes`, qui l'attend ; #3800, s'il est là, en file, libre.
function github(minutes: number, { marque = true, libre = false } = {}): AppelGitHub {
  return async (chemin) => {
    if (chemin.includes("/issues?") && chemin.includes("labels=fire")) return ok([issue(1912, ["fire", "waiting"]), issue(3734, ["fire", "prio:1", "model:opus", "effort:medium"], "Depends on #1912"), ...(libre ? [issue(3800, ["fire", "model:opus", "effort:medium"])] : [])]);
    if (chemin.includes("/issues/1912/comments")) return marque ? ok([MARQUE]) : { status: 502, data: {} };
    if (/\/issues\/\d+\/events/.test(chemin)) return ok([{ event: "labeled", label: { name: "fire" }, created_at: new Date(LU.getTime() - minutes * 60_000).toISOString() }]);
    if (chemin.includes("/issues?labels=waiting") || /\/issues\/\d+\/comments/.test(chemin) || chemin.includes("/issues?") || chemin.includes("/pulls?")) return ok([]);
    return { status: 404, data: {} };
  };
}
const lire = async (appeler: AppelGitHub): Promise<TableauLu> => {
  const lu = await avecCeQuiAttendLeChef(await lireLeTableauDuDepot({ depot: DEPOT, appeler, maintenant: () => LU }), appeler);
  assert.ok(lu.lu, "the rail is read");
  return lu;
};
const faitsDe = (lu: TableauLu) => comprendre(JSON.stringify(lu.faits)) as Faits;
const colonne = (faits: Faits, nom: string): Carte[] => tableau(faits).rail.colonnes.find((une) => une.nom === nom)?.cartes ?? assert.fail(`no column ${nom}`);

describe("un ticket en file que retient un ticket en WAITING", () => {
  test("sa carte est dans Waiting et dit les deux tickets, sans geste de WAITING ; il n'est pas dans On the rail", async () => {
    const faits = faitsDe(await lire(github(30)));
    const carte = colonne(faits, "Waiting").find(({ ticket }) => ticket === 3734) ?? assert.fail("#3734 is not in Waiting");
    assert.match(carte.ligne ?? "", /^waits for `#1912`, WAITING on a collaborator/);
    assert.deepEqual(carte.liens, [1912]);
    assert.equal(carte.titre, "Ticket 3734");
    assert.equal(carte.gestes, undefined);
    assert.equal(carte.mot ?? carte.etat, "waiting");
    assert.equal(colonne(faits, "On the rail").some(({ ticket }) => ticket === 3734), false);
  });

  test("la file du second le dit en WAITING : jamais en file au repos, ni compté en file", async () => {
    const lu = await lire(github(30));
    const status = statusDuTableau(lu);
    assert.match(status, /^ {2}#3734 {2}waits for `#1912`, WAITING on a collaborator/m);
    assert.doesNotMatch(status, /#3734 {2}queued|Normal wait|takes the ticket within minutes/);
    assert.match(status, /^rail {7}2 WAITING$/m);
  });

  test("ni cuisine arrêtée, ni cuisine muette ne le disent prêt ; un ticket libre à côté reste en file", async () => {
    const seul = faitsDe(await lire(github(26 * 60)));
    assert.equal(seul.arretCuisine, undefined);
    assert.equal(seul.alertesDuRail, undefined);
    const avecUnLibre = faitsDe(await lire(github(30, { libre: true })));
    assert.deepEqual(colonne(avecUnLibre, "On the rail").map(({ ticket }) => ticket), [3800]);
    assert.equal(avecUnLibre.attenteDuRail?.raison, "normale");
  });

  test("les commentaires du ticket en WAITING ne se lisent pas : qui n'est pas dit, et le rail reste lu", async () => {
    const carte = colonne(faitsDe(await lire(github(30, { marque: false }))), "Waiting").find(({ ticket }) => ticket === 3734);
    assert.match(carte?.ligne ?? "", /^waits for `#1912`, WAITING on a third party/);
  });
});

describe("la ligne en tête du rail", () => {
  test("le seul ticket du rail retenu depuis plus d'une heure : elle le nomme, et le ticket qu'il attend", async () => {
    const attente = faitsDe(await lire(github(61))).attenteDuRail;
    assert.equal(attente?.raison, "waiting");
    assert.match(attente?.phrase ?? "", /^#3734 has not been able to leave for 1 h: it waits for `#1912`, WAITING on a collaborator/);
  });

  test("sous l'heure, elle ne nomme ni l'un ni l'autre", async () => {
    const attente = faitsDe(await lire(github(59))).attenteDuRail;
    assert.equal(attente?.raison, "waiting");
    assert.doesNotMatch(attente?.phrase ?? "", /#3734|#1912/);
  });

  test("`facts` porte la raison `waiting` jusqu'à la vue", () => {
    assert.deepEqual(attenteDuRailLue({ raison: "waiting", phrase: "x", geste: null, stations: [] }), { attenteDuRail: { raison: "waiting", phrase: "x", geste: null, stations: [] } });
  });
});

// Ticket 3761 : un ticket en file retenu par un ticket en WAITING est dit en WAITING sur le rail de l'app — dans la colonne
// Waiting, sa carte disant « waits for `#N`, WAITING on <qui> » —, et dans la file du second ; jamais un ticket en file au
// repos : ni compté en file, ni ticket prêt de la cuisine arrêtée ou muette. Seul sur le rail depuis plus d'une heure, la
// ligne en tête du rail le nomme, et ce qu'il attend.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { understand, board, type Card, type Facts } from "../../../src/facts.ts";
import type { CallGitHub, AnswerGitHub } from "../../../src/board/client.ts";
import { readTheBoardOfRepository, type BoardRead } from "../../../src/board/read.ts";
import { withWhatAwaitingTheChef } from "../../../src/board/wait-of-chef.ts";
import { statusOfBoard } from "../../../src/board/rail.ts";
import { waitOfRailRead } from "../../../src/vue/wait-of-rail/wait-of-rail.ts";
import { corpsDuParking } from "../../../../runtime/src/attente-github/marque.ts";

const REPOSITORY = "acme/kitchen";
const READ = new Date("2026-11-17T10:00:00.000Z");
const ok = (data: unknown): AnswerGitHub => ({ status: 200, data });
const issue = (number: number, labels: string[], body = "") => ({ number, title: `Ticket ${number}`, body, html_url: `https://github.com/${REPOSITORY}/issues/${number}`, created_at: "2026-11-07T09:00:00Z", labels: labels.map((name) => ({ name })) });
const BRAND = { body: corpsDuParking({ what: "the collaborator's answer", who: "a collaborator", followUp: "2026-11-24T09:00:00.000Z" }), author_association: "OWNER", created_at: "2026-11-07T09:00:00Z" };

// #1912 en WAITING sur un collaborateur ; #3734 en file depuis `minutes`, qui l'attend ; #3800, s'il est là, en file, libre.
function github(minutes: number, { marque: brand = true, libre: free = false } = {}): CallGitHub {
  return async (path) => {
    if (path.includes("/issues?") && path.includes("labels=fire")) return ok([issue(1912, ["fire", "parked"]), issue(3734, ["fire", "prio:1", "model:opus", "effort:medium"], "Depends on #1912"), ...(free ? [issue(3800, ["fire", "model:opus", "effort:medium"])] : [])]);
    if (path.includes("/issues/1912/comments")) return brand ? ok([BRAND]) : { status: 502, data: {} };
    if (/\/issues\/\d+\/events/.test(path)) return ok([{ event: "labeled", label: { name: "fire" }, created_at: new Date(READ.getTime() - minutes * 60_000).toISOString() }]);
    if (path.includes("/issues?labels=parked") || /\/issues\/\d+\/comments/.test(path) || path.includes("/issues?") || path.includes("/pulls?")) return ok([]);
    return { status: 404, data: {} };
  };
}
const read = async (call: CallGitHub): Promise<BoardRead> => {
  const readOne = await withWhatAwaitingTheChef(await readTheBoardOfRepository({ depot: REPOSITORY, appeler: call, maintenant: () => READ }), call);
  assert.ok(readOne.lu, "the rail is read");
  return readOne;
};
const factsOf = (readOne: BoardRead) => understand(JSON.stringify(readOne.faits)) as Facts;
const column = (facts: Facts, name: string): Card[] => board(facts).rail.colonnes.find((one) => one.nom === name)?.cartes ?? assert.fail(`no column ${name}`);

describe("un ticket en file que retient un ticket en WAITING", () => {
  test("sa carte est dans Waiting et dit les deux tickets, sans geste de WAITING ; il n'est pas dans On the rail", async () => {
    const facts = factsOf(await read(github(30)));
    const card = column(facts, "Waiting").find(({ ticket }) => ticket === 3734) ?? assert.fail("#3734 is not in Waiting");
    assert.match(card.ligne ?? "", /^waits for `#1912`, parked, waiting for a collaborator/);
    assert.deepEqual(card.liens, [1912]);
    assert.equal(card.titre, "Ticket 3734");
    assert.equal(card.gestes, undefined);
    assert.equal(card.mot ?? card.etat, "waiting");
    assert.equal(column(facts, "On the rail").some(({ ticket }) => ticket === 3734), false);
  });

  test("la file du second le dit en WAITING : jamais en file au repos, ni compté en file", async () => {
    const readOne = await read(github(30));
    const status = statusOfBoard(readOne);
    assert.match(status, /^ {2}#3734 {2}waits for `#1912`, parked, waiting for a collaborator/m);
    assert.doesNotMatch(status, /#3734 {2}queued|Normal wait|takes the ticket within minutes/);
    assert.match(status, /^rail {7}2 WAITING$/m);
  });

  test("ni cuisine arrêtée, ni cuisine muette ne le disent prêt ; un ticket libre à côté reste en file", async () => {
    const only = factsOf(await read(github(26 * 60)));
    assert.equal(only.arretCuisine, undefined);
    assert.equal(only.alertesDuRail, undefined);
    const withOneFree = factsOf(await read(github(30, { libre: true })));
    assert.deepEqual(column(withOneFree, "On the rail").map(({ ticket }) => ticket), [3800]);
    assert.equal(withOneFree.attenteDuRail?.raison, "normale");
  });

  test("les commentaires du ticket en WAITING ne se lisent pas : qui n'est pas dit, et le rail reste lu", async () => {
    const card = column(factsOf(await read(github(30, { marque: false }))), "Waiting").find(({ ticket }) => ticket === 3734);
    assert.match(card?.ligne ?? "", /^waits for `#1912`, parked, waiting for someone/);
  });
});

describe("la ligne en tête du rail", () => {
  test("le seul ticket du rail retenu depuis plus d'une heure : elle le nomme, et le ticket qu'il attend", async () => {
    const wait = factsOf(await read(github(61))).attenteDuRail;
    assert.equal(wait?.raison, "waiting");
    assert.match(wait?.phrase ?? "", /^#3734 has not been able to leave for 1 h: it waits for `#1912`, parked, waiting for a collaborator/);
  });

  test("sous l'heure, elle ne nomme ni l'un ni l'autre", async () => {
    const wait = factsOf(await read(github(59))).attenteDuRail;
    assert.equal(wait?.raison, "waiting");
    assert.doesNotMatch(wait?.phrase ?? "", /#3734|#1912/);
  });

  test("`facts` porte la raison `waiting` jusqu'à la vue", () => {
    assert.deepEqual(waitOfRailRead({ raison: "waiting", phrase: "x", geste: null, stations: [] }), { attenteDuRail: { raison: "waiting", phrase: "x", geste: null, stations: [] } });
  });
});

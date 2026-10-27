// Un ticket qui demande une capacité qu'aucune station ne fournit n'arrive pas
// au chef : le manager le réécrit ou le redécoupe d'abord ; si c'est
// impossible, le ticket attend sur le rail, et son issue dit l'accès qui le
// ferait partir — rien n'entre dans TODO (#1834). Sur une cuisine complète.
import assert from "node:assert/strict";
import { describe, test, type TestContext } from "node:test";
import { cartesEnTodo } from "../src/carte-todo.ts";
import { MARQUEUR } from "../src/fiche.ts";
import { MARQUEUR_MANAGER } from "../src/juger.ts";
import { lireStations } from "../src/stations-declarees.ts";
import { chef, cuisine, issue, type Options } from "./aides/cuisine.ts";
import { jusqua } from "./outils.ts";

const STATIONS = lireStations({ BRIGADE_STATIONS: "box/claude:2:code,box/playwright:1:navigateur-headless" });

// Une cuisine dont le manager est allumé, et un ticket 14 qui demande `requis`.
function brigade(t: TestContext, requis: string, jugement: string, options: Options = {}) {
  const c = cuisine(t, { stations: STATIONS, scenario: "muet", manager: { jugement }, ...options });
  chef(c.repertoire, "manager.enabled");
  c.gh.ficher(14, "2026-10-08T09:00:00Z", [MARQUEUR, "- zone : runtime/src/rail.ts", `- requiert : ${requis}`].join("\n"));
  c.gh.poser(issue(14));
  const faits = (type: string) => c.journal.duTicket(14).filter((e) => e.type === type);
  const laisserTourner = async () => {
    const depart = c.gh.sondages.ouvertes;
    await jusqua(() => c.gh.sondages.ouvertes >= depart + 3);
  };
  return { ...c, faits, laisserTourner };
}

describe("un ticket qui demande ce qu'aucune station ne fournit", { concurrency: 8 }, () => {
  test("il est renvoyé en réécriture avant TODO : redécoupé, il sort du rail, ses sous-tickets partent, le journal le dit et aucune carte n'est posée", async (t) => {
    const c = brigade(t, "chrome-connecté", "decoupe-tickets");
    await jusqua(() => c.faits("manager.capability-resplit").length === 1);

    assert.deepEqual(c.faits("manager.capability-resplit")[0]?.payload, { missing: ["chrome-connecté"], run: null });
    assert.match(c.lancements().find((l) => l.args.includes("--tools"))?.args.join("\n") ?? "", /chrome-connecté/);
    await jusqua(() => c.gh.creations.length === 3);
    assert.deepEqual([c.etat(14), c.dernier("ticket.86", 14)?.reason], ["86", "manager:split"]);
    assert.deepEqual(cartesEnTodo(c.journal.base), []);
    assert.equal(c.faits("manager.capability-gestured").length, 0);
    assert.ok(c.gh.commentaires.some(([n, corps]) => n === 14 && corps.includes(MARQUEUR_MANAGER) && /redécoupé/.test(corps)));
  });

  test("la réécriture est impossible : le ticket attend sur le rail, 86, et son issue nomme l'accès à donner et la raison — aucune carte dans TODO (#1834)", async (t) => {
    const c = brigade(t, "chrome-connecté", "decoupe-question");
    await jusqua(() => c.faits("manager.capability-gestured").length === 1);
    await jusqua(() => c.gh.commentaires.some(([n, corps]) => n === 14 && /le ticket attend sur le rail/.test(corps)));

    assert.deepEqual(c.faits("manager.capability-gestured")[0]?.payload.missing, ["chrome-connecté"]);
    const [, corps] = c.gh.commentaires.find(([n, texte]) => n === 14 && /le ticket attend sur le rail/.test(texte)) ?? [];
    assert.match(corps ?? "", /no station provides `chrome-connecté`/);
    assert.match(corps ?? "", /Il repart seul dès qu'une station le fournit — .*station stations <machine>\/<engine>:<cook cap>:chrome-connecté/);
    assert.match(corps ?? "", /Rien n'est demandé au chef dans TODO\./);
    assert.equal(c.faits("manager.capability-resplit").length, 0);
    assert.deepEqual([c.gh.creations, c.etat(14), c.dernier("ticket.86", 14)?.reason], [[], "86", "no-station: chrome-connecté"]);
    // Ni proposée au triage, ni entrée dans TODO, même après d'autres sondages.
    await c.laisserTourner();
    assert.deepEqual(cartesEnTodo(c.journal.base), []);
    assert.deepEqual(c.journal.tout().filter((e) => e.type === "todo.held" || e.type === "todo.entered"), []);
    assert.equal(c.faits("manager.capability-gestured").length, 1);
  });

  test("une capacité qu'une station fournit garde le comportement actuel : le ticket part, sans renvoi ni carte", async (t) => {
    const c = brigade(t, "navigateur-headless", "decoupe-tickets");
    await jusqua(() => c.etat(14) === "taken");
    await c.laisserTourner();

    assert.equal(c.journal.duTicket(14).find((e) => e.type === "ticket.taken")?.author, "station:box/playwright");
    assert.deepEqual([c.faits("manager.capability-resplit").length, c.faits("manager.capability-gestured").length], [0, 0]);
    assert.equal(c.lancements().filter((l) => l.args.includes("--tools")).length, 0);
    assert.deepEqual(cartesEnTodo(c.journal.base), []);
  });
});

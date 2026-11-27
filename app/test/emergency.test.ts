// L'urgence à l'écran : plus rien ne cuit, et c'est le chef que toute la cuisine attend. Sa ligne
// passe en tête de la bande, au-dessus de tout, marquée à part, avec ce qui est attendu, son geste et
// depuis combien de temps tout est à l'arrêt ; la case du projet la dit, autrement qu'une alerte
// (alerts.ts, « L'urgence »). Une décision qui ne retient qu'une partie du rail ne change rien.
// Ce que la box rend est écrit ici par le runtime lui-même — `faits` et `status`, joués
// dans ce process sur un vrai journal (runtime/src/etat.ts) : la forme que
// la bande lit est tenue contre celle que le runtime écrit. La sortie de `manager` est recopiée
// telle que l'ancien runtime l'écrivait (runtime/src/manager-cli.ts, supprimé avec lui, #4499).
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { decrireEtat, faits as runtimeFacts, lireEtat } from "../../runtime/src/etat.ts";
import type { Fait } from "../../runtime/src/evenements.ts";
import { ouvrirJournal } from "../../runtime/src/journal.ts";
import { alerts, MANAGER_NOT_SAYS, signalOf, holdBands, type Alert, type Band } from "../src/alerts.ts";
import { POWER_UP } from "../src/power-up.ts";
import { putAside } from "../src/awaiting.ts";
import { forTheBar } from "../src/bar.ts";
import type { Reading } from "../src/box.ts";
import { EXAMPLE, type Project } from "../src/config.ts";
import { PALETTE } from "../src/colors.ts";
import { KITCHEN_ACTIONS } from "../src/kitchen.ts";
import { BANNER, understand } from "../src/facts.ts";
import { CONFIRMED, DIRECT } from "../src/actions.ts";
import { EFFORTS, MODELS } from "../src/projects/projects.ts";
import { TABS, HEADINGS } from "../src/tabs.ts";
import { playTheVue, repos } from "./helpers/false-vue.ts";

const DAY = "2026-10-15";
const STATION = "box/claude";
const LIMITS = { turns: 100, durationMs: 3_600_000, tokens: 2_000_000, idleMs: 600_000 };
const pr = (ticket: number) => `https://exemple.test/pull/${ticket}`;
const hour = (h: string) => `${DAY}T${h}.000Z`;
const reading = (command: string, text: string, a: string): Reading => ({ projet: "parade", demande: 1, a, sorties: [{ commande: command, texte: text }] });

// La sortie de `manager` d'un manager allumé par le chef à 8 h — celle de cette cuisine, telle que l'ancien runtime
// l'écrivait.
const MANAGER_ON = [
  "manager               ON since 2026-10-15T08:00:00.000Z (by chef) — it judges the open issues, sets `fire` and the calibration",
  "latest decisions      none",
  "set aside             none",
  "epics                 none",
  "reactions             none",
  "held gestures         none",
].join("\n") + "\n";

// Une cuisine dont le test tient l'horloge, où tout va bien hors du rail — runtime en marche,
// version à jour, manager allumé —, et ce que l'app en dessine : `faits` et `status` écrits par le
// runtime, et `manager`, lus comme le process principal les lit.
function kitchen(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "brigade-app-urgence-"));
  let instant = hour("08:00:00");
  const log = ouvrirJournal(directory, { maintenant: () => new Date(instant) });
  t.after(() => {
    log.fermer();
    rmSync(directory, { recursive: true, force: true });
  });
  const note = (done: Fait, ticket: number | null = null, author = "runtime") => void log.ajouter({ project: "parade", ticket, author, ...done });
  const a = (h: string) => void (instant = hour(h));
  const arrive = (ticket: number, zone: string[]) =>
    note(
      { type: "ticket.arrived", payload: { title: `Ticket ${ticket}`, priority: null, createdAt: `2026-10-01T00:00:${ticket % 60}Z`, url: `https://exemple.test/${ticket}`, card: { waitsFor: [], zone, problems: [] } } },
      ticket,
      "github",
    );
  // Le ticket déjà sur le rail, pris, cuisiné, livré avec sa PR.
  const cook = (ticket: number) => {
    note({ type: "ticket.taken", payload: { station: STATION, leaseUntil: "2026-11-30T00:00:00.000Z" } }, ticket, `station:${STATION}`);
    note({ type: "cook.launched", payload: { run: `${ticket}-aa`, limits: LIMITS, stream: `runs/${ticket}-aa.jsonl`, branch: `cook/${ticket}-aa`, worktree: `worktrees/${ticket}-aa` } }, ticket);
    note({ type: "cook.exited", payload: { run: `${ticket}-aa`, outcome: "ok", code: 0, signal: null, turns: 3, tokens: 1000, durationMs: 1000 } }, ticket);
    note({ type: "ticket.passing", payload: { station: STATION } }, ticket, `station:${STATION}`);
    note({ type: "pass.started", payload: { run: `${ticket}-aa`, pr: pr(ticket), number: ticket, sha: `sha-${ticket}` } }, ticket, "pass");
  };
  // Verte, et laissée au chef : à merger à la main.
  const retain = (ticket: number) => note({ type: "pass.held", payload: { reason: "review-required" } } as never, ticket, "pass");
  const render = (h: string) => {
    const now = new Date(hour(h));
    const state = lireEtat(log, now);
    return { faits: runtimeFacts(state, now), status: `${decrireEtat(state, now).join("\n")}\n`, manager: MANAGER_ON };
  };
  // La bande, d'après `faits` tel que la box l'a rendu — ou tel qu'un `retoucher` le donne.
  const band = (h: string, retoucher: (facts: Record<string, unknown>) => Record<string, unknown> = (facts) => facts): Band => {
    const rendered = render(h);
    const readOne = hour(h);
    const bands = holdBands({ etablir: 1, minimum: 0 });
    bands.ouvrir(["parade"]);
    bands.veiller(["parade"]);
    bands.faits(reading("facts", `${JSON.stringify(retoucher({ ...rendered.faits }))}\n`, readOne));
    bands.status(putAside(reading("status", rendered.status, readOne)));
    return bands.manager(reading("manager", rendered.manager, readOne));
  };
  note({ type: "runtime.started", payload: { pid: 1, host: "box", node: "v26" } } as Fait);
  note({ type: "manager.enabled", payload: {} }, null, "chef");
  note({ type: "station.announced", payload: { station: STATION, engine: "claude", provides: ["opus"], maxCooks: 2 } });
  return { noter: note, a, arriver: arrive, cuisiner: cook, retenir: retain, rendre: render, bande: band };
}

// L'exemple du ticket : une livraison à merger à la main qui tient toutes les zones du rail.
function allHeld(t: TestContext) {
  const served = kitchen(t);
  const { a, arriver: arrive, cuisiner: cook, retenir: retain } = served;
  arrive(535, ["runtime", "app"]);
  arrive(536, ["runtime/src"]);
  arrive(537, ["app/src"]);
  cook(535);
  a("08:30:00");
  retain(535);
  return served;
}

describe("l'urgence dans la bande", () => {
  test("une cause que l'app ne nomme pas se dit avec le mot de la box, sans rien inventer", () => {
    const facts = understand(
      JSON.stringify({
        etat: "ouverte",
        lu: hour("10:00:00"),
        dernierTick: null,
        compteurs: { rail: 1, auTravail: 0, aLaPass: 0, attend: 1, livres24h: 0 },
        dernierEvenement: null,
        rail: [],
        urgence: { decision: "#9", ticket: 9, cause: "question", geste: "une question t'attend sur l'issue", url: null, depuis: hour("09:59:00"), retenus: [10], autres: [] },
      }),
    );
    if ("informe" in facts) assert.fail(facts.informe);
    const [first] = alerts({ projet: "parade", faits: facts, status: { sans: "pas lu" }, manager: { sans: MANAGER_NOT_SAYS } });
    assert.equal(first?.dit, "the whole kitchen is waiting for you on #9 (question) — at a standstill for 1 min");
    assert.equal(first.pourquoi, "1 ticket held, none can cook until you act: #10");
  });
});

describe("sans urgence, rien ne change", () => {
  test("une cuisine qui va bien : la bande reste vide, la case sans signal", (t) => {
    const { bande: band } = kitchen(t);
    const { manager, ...readEntry } = band("10:00:00");
    assert.deepEqual(readEntry, { projet: "parade", alertes: [], signal: undefined });
    assert.equal(manager !== undefined && "allume" in manager && manager.allume, true);
  });

  test("le « stop » du chef retient la cuisine lui-même : sa ligne, pas celle de l'urgence", (t) => {
    const { noter: note, bande: band } = allHeld(t);
    note({ type: "kitchen.stopped", payload: {} }, null, "chef");
    const readEntry = band("10:00:00");
    assert.deepEqual(
      readEntry.alertes.map(({ sujet: subject }) => subject),
      ["cuisine"],
    );
    assert.equal(readEntry.signal?.etat, "alerte");
  });

  test("une urgence qui n'a pas la forme refuse `faits` entier, comme tout autre champ", () => {
    const readOne = understand(
      JSON.stringify({ etat: "ouverte", lu: hour("10:00:00"), dernierTick: null, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, rail: [], urgence: { decision: "#9" } }),
    );
    assert.ok("informe" in readOne);
    assert.match(readOne.informe, /urgence\.ticket/);
  });
});

describe("l'urgence à l'écran", () => {
  const PARADE: Project = { nom: "parade", dossier: "/tmp/parade" };
  const BALOO: Project = { nom: "baloo", dossier: "/tmp/baloo" };
  const open = () =>
    playTheVue({
      demarrage: () => ({
        configuration: forTheBar({ chemin: "/tmp/app.json", projets: [PARADE, BALOO] }, () => true),
        palette: PALETTE,
        exemple: EXAMPLE,
        onglets: TABS,
        rubriques: HEADINGS,
        gestes: { allumage: POWER_UP, cuisine: KITCHEN_ACTIONS, directs: DIRECT, confirmes: CONFIRMED },
        banniere: BANNER,
        calibrage: { modeles: MODELS, efforts: EFFORTS },
        code: undefined,
      }),
      espace: () => [],
    });
  const URGENT: Alert = { sujet: "urgence", verifie: true, ton: "rouge", dit: "the whole kitchen is waiting for your merge of #535 — at a standstill for 5 h 28", releve: "#535  livraison verte — à merger à la main", geste: "do what #535 waits for, as the station writes it", appel: { demande: true }, prix: "none" };
  const ORDINARY: Alert = { sujet: "cuisine", verifie: true, ton: "rouge", dit: "kitchen stopped by your “stop”: no cook goes, until “resume”", geste: "resume the kitchen", appel: { geste: "reprendre" }, prix: "—" };

  test("la ligne d'urgence est posée la première, marquée « URGENT », et dit ce que la box écrit", async () => {
    const vue = await open();
    vue.element("projets").children[1]?.click();
    await repos();
    const readEntries = [URGENT, ORDINARY];
    vue.dire("surAlertes", { projet: "parade", alertes: readEntries, signal: signalOf(readEntries) });

    const [first, second] = vue.element("alertes").children;
    assert.equal(first?.dataset.sujet, "urgence");
    const brand = first.dessous("span").find((pose) => pose.className === "urgent") ?? assert.fail("pas de marque d'urgence");
    assert.equal(brand.textContent, "URGENT");
    assert.match(first.textContent, /URGENTthe whole kitchen is waiting for your merge of #535 — at a standstill for 5 h 28/);
    // Ce que la box écrit de la décision n'est pas écrit à plat : il se lit, mot pour mot, derrière « detail » (#907).
    assert.doesNotMatch(first.textContent, /livraison verte/);
    (first.dessous("button").find((pose) => pose.className === "detail") ?? assert.fail("pas de « detail »")).click();
    assert.deepEqual(vue.element("alertes").children[0]?.dessous("pre").map(({ textContent }) => textContent), ["#535  livraison verte — à merger à la main"]);
    // Une ligne ordinaire n'a pas la marque.
    assert.equal(second?.dataset.sujet, "cuisine");
    assert.equal(second.dessous("span").find((pose) => pose.className === "urgent"), undefined);
  });

  test("la case d'un projet dont toute la cuisine attend porte le signe de l'urgence, pas celui d'une alerte", async () => {
    const vue = await open();
    const signalOfTheCase = (rank: number) => vue.element("projets").children[rank]?.children.find((pose) => pose.className === "signal");
    vue.dire("surAlertes", { projet: "parade", alertes: [URGENT, ORDINARY], signal: signalOf([ORDINARY, URGENT]) });
    vue.dire("surAlertes", { projet: "baloo", alertes: [ORDINARY], signal: signalOf([ORDINARY]) });

    const urgent = signalOfTheCase(1) ?? assert.fail("pas de signal sur parade");
    assert.equal(urgent.dataset.etat, "urgence");
    assert.equal(urgent.textContent, "!!");
    assert.match(urgent.title, /^parade: the whole kitchen is waiting for your merge of #535 — at a standstill for 5 h 28 ; kitchen stopped.* — urgent: the whole kitchen is waiting for you/);
    const ordinary = signalOfTheCase(2) ?? assert.fail("pas de signal sur baloo");
    assert.equal(ordinary.dataset.etat, "alerte");
    assert.equal(ordinary.textContent, "!");

    // L'urgence levée, la case reprend le signal d'une alerte.
    vue.dire("surAlertes", { projet: "parade", alertes: [ORDINARY], signal: signalOf([ORDINARY]) });
    assert.equal(signalOfTheCase(1)?.dataset.etat, "alerte");
    assert.equal(signalOfTheCase(1)?.textContent, "!");
  });
});

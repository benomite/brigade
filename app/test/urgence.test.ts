// L'urgence à l'écran : plus rien ne cuit, et c'est le chef que toute la cuisine attend. Sa ligne
// passe en tête de la bande, au-dessus de tout, marquée à part, avec ce qui est attendu, son geste et
// depuis combien de temps tout est à l'arrêt ; la case du projet la dit, autrement qu'une alerte
// (alerts.ts, « L'urgence »). Une décision qui ne retient qu'une partie du rail ne change rien.
// Ce que la box rend est écrit ici par le runtime lui-même — `faits`, `status` et `manager`, joués
// dans ce process sur un vrai journal (runtime/src/etat.ts) : la forme que
// la bande lit est tenue contre celle que le runtime écrit.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { decrireEtat, faits as runtimeFacts, lireEtat } from "../../runtime/src/etat.ts";
import type { Fait } from "../../runtime/src/evenements.ts";
import { ouvrirJournal } from "../../runtime/src/journal.ts";
import { principal as manager } from "../../runtime/src/manager-cli.ts";
import { alerts, MANAGER_PAS_DIT, signalDe, holdBandes, type Alert, type Bande } from "../src/alerts.ts";
import { ALLUMAGE } from "../src/allumage.ts";
import { mettreAPart } from "../src/awaiting.ts";
import { pourLaBar } from "../src/bar.ts";
import type { Read } from "../src/box.ts";
import { EXEMPLE, type Project } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import { KITCHEN_ACTIONS } from "../src/kitchen.ts";
import { BANNIERE, comprendre } from "../src/facts.ts";
import { CONFIRMES, DIRECTS } from "../src/actions.ts";
import { EFFORTS, MODELES } from "../src/projects/projects.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import { jouerLaVue, repos } from "./aides/fausse-vue.ts";

const DAY = "2026-10-15";
const STATION = "box/claude";
const LIMITES = { turns: 100, durationMs: 3_600_000, tokens: 2_000_000, idleMs: 600_000 };
const pr = (ticket: number) => `https://exemple.test/pull/${ticket}`;
const heure = (h: string) => `${DAY}T${h}.000Z`;
const read = (command: string, texte: string, a: string): Read => ({ projet: "parade", demande: 1, a, sorties: [{ commande: command, texte }] });

// Une cuisine dont le test tient l'horloge, où tout va bien hors du rail — runtime en marche,
// version à jour, manager allumé —, et ce que l'app en dessine : `faits`, `status` et `manager`
// écrits par le runtime, lus comme le process principal les lit.
function kitchen(t: TestContext) {
  const repertoire = mkdtempSync(join(tmpdir(), "brigade-app-urgence-"));
  let instant = heure("08:00:00");
  const log = ouvrirJournal(repertoire, { maintenant: () => new Date(instant) });
  t.after(() => {
    log.fermer();
    rmSync(repertoire, { recursive: true, force: true });
  });
  const noter = (fait: Fait, ticket: number | null = null, author = "runtime") => void log.ajouter({ project: "parade", ticket, author, ...fait });
  const a = (h: string) => void (instant = heure(h));
  const arriver = (ticket: number, zone: string[]) =>
    noter(
      { type: "ticket.arrived", payload: { title: `Ticket ${ticket}`, priority: null, createdAt: `2026-10-01T00:00:${ticket % 60}Z`, url: `https://exemple.test/${ticket}`, card: { waitsFor: [], zone, problems: [] } } },
      ticket,
      "github",
    );
  // Le ticket déjà sur le rail, pris, cuisiné, livré avec sa PR.
  const cook = (ticket: number) => {
    noter({ type: "ticket.taken", payload: { station: STATION, leaseUntil: "2026-11-30T00:00:00.000Z" } }, ticket, `station:${STATION}`);
    noter({ type: "cook.launched", payload: { run: `${ticket}-aa`, limits: LIMITES, stream: `runs/${ticket}-aa.jsonl`, branch: `cook/${ticket}-aa`, worktree: `worktrees/${ticket}-aa` } }, ticket);
    noter({ type: "cook.exited", payload: { run: `${ticket}-aa`, outcome: "ok", code: 0, signal: null, turns: 3, tokens: 1000, durationMs: 1000 } }, ticket);
    noter({ type: "ticket.passing", payload: { station: STATION } }, ticket, `station:${STATION}`);
    noter({ type: "pass.started", payload: { run: `${ticket}-aa`, pr: pr(ticket), number: ticket, sha: `sha-${ticket}` } }, ticket, "pass");
  };
  // Verte, et laissée au chef : à merger à la main.
  const retenir = (ticket: number) => noter({ type: "pass.held", payload: { reason: "review-required" } } as never, ticket, "pass");
  const rendre = (h: string) => {
    const maintenant = new Date(heure(h));
    const state = lireEtat(log, maintenant);
    const lines: string[] = [];
    void manager({ args: [], env: { BRIGADE_STATE_DIR: repertoire }, dire: (line) => void lines.push(line), redire: (line) => assert.fail(line) });
    return { faits: runtimeFacts(state, maintenant), status: `${decrireEtat(state, maintenant).join("\n")}\n`, manager: `${lines.join("\n")}\n` };
  };
  // La bande, d'après `faits` tel que la box l'a rendu — ou tel qu'un `retoucher` le donne.
  const bande = (h: string, retoucher: (facts: Record<string, unknown>) => Record<string, unknown> = (facts) => facts): Bande => {
    const rendu = rendre(h);
    const lu = heure(h);
    const bandes = holdBandes({ etablir: 1, minimum: 0 });
    bandes.ouvrir(["parade"]);
    bandes.veiller(["parade"]);
    bandes.faits(read("facts", `${JSON.stringify(retoucher({ ...rendu.faits }))}\n`, lu));
    bandes.status(mettreAPart(read("status", rendu.status, lu)));
    return bandes.manager(read("manager", rendu.manager, lu));
  };
  noter({ type: "runtime.started", payload: { pid: 1, host: "box", node: "v26" } } as Fait);
  noter({ type: "manager.enabled", payload: {} }, null, "chef");
  noter({ type: "station.announced", payload: { station: STATION, engine: "claude", provides: ["opus"], maxCooks: 2 } });
  return { noter, a, arriver, cuisiner: cook, retenir, rendre, bande };
}

// L'exemple du ticket : une livraison à merger à la main qui tient toutes les zones du rail.
function toutRetenu(t: TestContext) {
  const served = kitchen(t);
  const { a, arriver, cuisiner: cook, retenir } = served;
  arriver(535, ["runtime", "app"]);
  arriver(536, ["runtime/src"]);
  arriver(537, ["app/src"]);
  cook(535);
  a("08:30:00");
  retenir(535);
  return served;
}

describe("l'urgence dans la bande", () => {
  test("une cause que l'app ne nomme pas se dit avec le mot de la box, sans rien inventer", () => {
    const facts = comprendre(
      JSON.stringify({
        etat: "ouverte",
        lu: heure("10:00:00"),
        dernierTick: null,
        compteurs: { rail: 1, auTravail: 0, aLaPass: 0, attend: 1, livres24h: 0 },
        dernierEvenement: null,
        rail: [],
        urgence: { decision: "#9", ticket: 9, cause: "question", geste: "une question t'attend sur l'issue", url: null, depuis: heure("09:59:00"), retenus: [10], autres: [] },
      }),
    );
    if ("informe" in facts) assert.fail(facts.informe);
    const [first] = alerts({ projet: "parade", faits: facts, status: { sans: "pas lu" }, manager: { sans: MANAGER_PAS_DIT } });
    assert.equal(first?.dit, "the whole kitchen is waiting for you on #9 (question) — at a standstill for 1 min");
    assert.equal(first.pourquoi, "1 ticket held, none can cook until you act: #10");
  });
});

describe("sans urgence, rien ne change", () => {
  test("une cuisine qui va bien : la bande reste vide, la case sans signal", (t) => {
    const { bande } = kitchen(t);
    const { manager, ...lue } = bande("10:00:00");
    assert.deepEqual(lue, { projet: "parade", alertes: [], signal: undefined });
    assert.equal(manager !== undefined && "allume" in manager && manager.allume, true);
  });

  test("le « stop » du chef retient la cuisine lui-même : sa ligne, pas celle de l'urgence", (t) => {
    const { noter, bande } = toutRetenu(t);
    noter({ type: "kitchen.stopped", payload: {} }, null, "chef");
    const lue = bande("10:00:00");
    assert.deepEqual(
      lue.alertes.map(({ sujet }) => sujet),
      ["cuisine"],
    );
    assert.equal(lue.signal?.etat, "alerte");
  });

  test("une urgence qui n'a pas la forme refuse `faits` entier, comme tout autre champ", () => {
    const lu = comprendre(
      JSON.stringify({ etat: "ouverte", lu: heure("10:00:00"), dernierTick: null, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, rail: [], urgence: { decision: "#9" } }),
    );
    assert.ok("informe" in lu);
    assert.match(lu.informe, /urgence\.ticket/);
  });
});

describe("l'urgence à l'écran", () => {
  const PARADE: Project = { nom: "parade", dossier: "/tmp/parade" };
  const BALOO: Project = { nom: "baloo", dossier: "/tmp/baloo" };
  const ouvrir = () =>
    jouerLaVue({
      demarrage: () => ({
        configuration: pourLaBar({ chemin: "/tmp/app.json", projets: [PARADE, BALOO] }, () => true),
        palette: PALETTE,
        exemple: EXEMPLE,
        onglets: ONGLETS,
        rubriques: RUBRIQUES,
        gestes: { allumage: ALLUMAGE, cuisine: KITCHEN_ACTIONS, directs: DIRECTS, confirmes: CONFIRMES },
        banniere: BANNIERE,
        calibrage: { modeles: MODELES, efforts: EFFORTS },
        code: undefined,
      }),
      espace: () => [],
    });
  const URGENTE: Alert = { sujet: "urgence", verifie: true, ton: "rouge", dit: "the whole kitchen is waiting for your merge of #535 — at a standstill for 5 h 28", releve: "#535  livraison verte — à merger à la main", geste: "do what #535 waits for, as the station writes it", appel: { demande: true }, prix: "none" };
  const ORDINAIRE: Alert = { sujet: "cuisine", verifie: true, ton: "rouge", dit: "kitchen stopped by your “stop”: no cook goes, until “resume”", geste: "resume the kitchen", appel: { geste: "reprendre" }, prix: "—" };

  test("la ligne d'urgence est posée la première, marquée « URGENT », et dit ce que la box écrit", async () => {
    const vue = await ouvrir();
    vue.element("projets").children[1]?.click();
    await repos();
    const lues = [URGENTE, ORDINAIRE];
    vue.dire("surAlertes", { projet: "parade", alertes: lues, signal: signalDe(lues) });

    const [first, seconde] = vue.element("alertes").children;
    assert.equal(first?.dataset.sujet, "urgence");
    const marque = first.dessous("span").find((pose) => pose.className === "urgent") ?? assert.fail("pas de marque d'urgence");
    assert.equal(marque.textContent, "URGENT");
    assert.match(first.textContent, /URGENTthe whole kitchen is waiting for your merge of #535 — at a standstill for 5 h 28/);
    // Ce que la box écrit de la décision n'est pas écrit à plat : il se lit, mot pour mot, derrière « detail » (#907).
    assert.doesNotMatch(first.textContent, /livraison verte/);
    (first.dessous("button").find((pose) => pose.className === "detail") ?? assert.fail("pas de « detail »")).click();
    assert.deepEqual(vue.element("alertes").children[0]?.dessous("pre").map(({ textContent }) => textContent), ["#535  livraison verte — à merger à la main"]);
    // Une ligne ordinaire n'a pas la marque.
    assert.equal(seconde?.dataset.sujet, "cuisine");
    assert.equal(seconde.dessous("span").find((pose) => pose.className === "urgent"), undefined);
  });

  test("la case d'un projet dont toute la cuisine attend porte le signe de l'urgence, pas celui d'une alerte", async () => {
    const vue = await ouvrir();
    const signalDeLaCase = (rang: number) => vue.element("projets").children[rang]?.children.find((pose) => pose.className === "signal");
    vue.dire("surAlertes", { projet: "parade", alertes: [URGENTE, ORDINAIRE], signal: signalDe([ORDINAIRE, URGENTE]) });
    vue.dire("surAlertes", { projet: "baloo", alertes: [ORDINAIRE], signal: signalDe([ORDINAIRE]) });

    const urgente = signalDeLaCase(1) ?? assert.fail("pas de signal sur parade");
    assert.equal(urgente.dataset.etat, "urgence");
    assert.equal(urgente.textContent, "!!");
    assert.match(urgente.title, /^parade: the whole kitchen is waiting for your merge of #535 — at a standstill for 5 h 28 ; kitchen stopped.* — urgent: the whole kitchen is waiting for you/);
    const ordinaire = signalDeLaCase(2) ?? assert.fail("pas de signal sur baloo");
    assert.equal(ordinaire.dataset.etat, "alerte");
    assert.equal(ordinaire.textContent, "!");

    // L'urgence levée, la case reprend le signal d'une alerte.
    vue.dire("surAlertes", { projet: "parade", alertes: [ORDINAIRE], signal: signalDe([ORDINAIRE]) });
    assert.equal(signalDeLaCase(1)?.dataset.etat, "alerte");
    assert.equal(signalDeLaCase(1)?.textContent, "!");
  });
});

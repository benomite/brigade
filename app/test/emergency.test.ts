// L'urgence à l'écran : plus rien ne cuit, et c'est le chef que toute la cuisine attend. Sa ligne
// passe en tête de la bande, au-dessus de tout, marquée à part, avec ce qui est attendu, son geste et
// depuis combien de temps tout est à l'arrêt ; la case du projet la dit, autrement qu'une alerte
// (alerts.ts, « L'urgence »). Une décision qui ne retient qu'une partie du rail ne change rien.
// Ce que la box rend est ce que l'ancien runtime (runtime/src/etat.ts) écrivait — `faits` et `status`, figés dans
// fixtures/old-runtime-emergency.frozen : la forme que la bande lit est tenue contre celle qu'il écrivait.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { alerts, signalOf, holdBands, type Alert, type Band } from "../src/alerts.ts";
import { putAside } from "../src/awaiting.ts";
import { forTheBar } from "../src/bar.ts";
import type { Reading } from "../src/box.ts";
import { EXAMPLE, type Project } from "../src/config.ts";
import { PALETTE } from "../src/colors.ts";
import { BANNER, understand } from "../src/facts.ts";
import { EFFORTS, MODELS } from "../src/projects/projects.ts";
import { TABS, HEADINGS } from "../src/tabs.ts";
import { playTheVue, repos } from "./helpers/false-vue.ts";

const DAY = "2026-10-15";
const hour = (h: string) => `${DAY}T${h}.000Z`;
const reading = (command: string, text: string, a: string): Reading => ({ projet: "parade", demande: 1, a, sorties: [{ commande: command, texte: text }] });

// Ce que le runtime d'avant la #4775 rendait de la cuisine de ces tests, figé dans fixtures/old-runtime-emergency.frozen
// (`faits`, la forme, et `status`, le texte, de l'ancien `faits` et `decrireEtat`, runtime/src/etat.ts, à 10:00:00) :
//   plain : une cuisine où tout va bien hors du rail — runtime en marche, manager activé, la station box/claude annoncée ;
//   allHeld : l'exemple du ticket — #535, #536, #537 arrivés, #535 livré et laissé au chef (une livraison à merger à la
//     main qui tient toutes les zones du rail) ;
//   allHeldThenStopped : le même, après le « stop » du chef.
type Scenario = "plain" | "allHeld" | "allHeldThenStopped";
const RENDERED = JSON.parse(readFileSync(new URL("./fixtures/old-runtime-emergency.frozen", import.meta.url), "utf8")) as Record<Scenario, { faits: Record<string, unknown>; status: string }>;

// Une cuisine figée, et ce que l'app en dessine : `faits` et `status` de l'ancien runtime, lus comme le process principal
// les lit.
function kitchen(initial: Scenario = "plain") {
  let scenario = initial;
  const note = (done: { type: string }) => {
    assert.equal(done.type, "kitchen.stopped", `pas d'état figé pour ${done.type}`);
    assert.equal(scenario, "allHeld");
    scenario = "allHeldThenStopped";
  };
  // La bande, d'après `faits` tel que la box l'a rendu — ou tel qu'un `retoucher` le donne.
  const band = (h: string, retoucher: (facts: Record<string, unknown>) => Record<string, unknown> = (facts) => facts): Band => {
    assert.equal(h, "10:00:00");
    const rendered = RENDERED[scenario];
    const readOne = hour(h);
    const bands = holdBands({ etablir: 1, minimum: 0 });
    bands.ouvrir(["parade"]);
    bands.veiller(["parade"]);
    bands.faits(reading("facts", `${JSON.stringify(retoucher({ ...rendered.faits }))}\n`, readOne));
    return bands.status(putAside(reading("status", rendered.status, readOne)));
  };
  return { noter: note, bande: band };
}

// L'exemple du ticket : une livraison à merger à la main qui tient toutes les zones du rail.
const allHeld = () => kitchen("allHeld");

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
    const [first] = alerts({ projet: "parade", faits: facts, status: { sans: "pas lu" } });
    assert.equal(first?.dit, "the whole kitchen is waiting for you on #9 (question) — at a standstill for 1 min");
    assert.equal(first.pourquoi, "1 ticket held, none can cook until you act: #10");
  });
});

describe("sans urgence, rien ne change", () => {
  test("une cuisine qui va bien : la bande reste vide, la case sans signal", () => {
    const { bande: band } = kitchen();
    assert.deepEqual(band("10:00:00"), { projet: "parade", alertes: [], signal: undefined });
  });

  test("le « stop » du chef retient la cuisine lui-même : sa ligne, pas celle de l'urgence", () => {
    const { noter: note, bande: band } = allHeld();
    note({ type: "kitchen.stopped" });
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
        gestes: {},
        banniere: BANNER,
        calibrage: { modeles: MODELS, efforts: EFFORTS },
        code: undefined,
      }),
      espace: () => [],
    });
  const URGENT: Alert = { sujet: "urgence", verifie: true, ton: "rouge", dit: "the whole kitchen is waiting for your merge of #535 — at a standstill for 5 h 28", releve: "#535  livraison verte — à merger à la main", geste: "do what #535 waits for, as the station writes it", appel: { demande: true }, prix: "none" };
  const ORDINARY: Alert = { sujet: "cuisine", verifie: true, ton: "rouge", dit: "kitchen stopped by your “stop”: no cook goes, until “resume”", geste: "resume the kitchen", appel: { demande: true }, prix: "—" };

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

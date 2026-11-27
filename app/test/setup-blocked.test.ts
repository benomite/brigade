// Le setup du projet bloqué (#644) : le runtime l'écrit en tête de `status` (`setup  BLOQUÉ…`),
// et sa cause et son geste dans l'entrée `setup` du bloc `attend`. L'app le dit dans la bande
// d'alertes du projet — ce texte-là, mot pour mot — et sur la pastille de sa case ; quand le
// runtime ne le dit plus, bande et pastille reviennent d'elles-mêmes. Ce que la box rend est écrit
// ici par le runtime lui-même, sur un vrai journal, comme alertes.test.ts.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { decrireEtat, faits as runtimeFacts, lireEtat } from "../../runtime/src/etat.ts";
import type { Fait } from "../../runtime/src/evenements.ts";
import { ouvrirJournal } from "../../runtime/src/journal.ts";
import { alerts, entryOfSetup, holdBands, type Alert, type Band } from "../src/alerts.ts";
import { putAside } from "../src/awaiting.ts";
import { forTheBar } from "../src/bar.ts";
import type { Reading } from "../src/box.ts";
import { EXAMPLE, type Project } from "../src/config.ts";
import { PALETTE } from "../src/colors.ts";
import { BANNER, understand } from "../src/facts.ts";
import { EFFORTS, MODELS } from "../src/projects/projects.ts";
import { TABS, HEADINGS } from "../src/tabs.ts";
import { playTheVue, repos } from "./helpers/false-vue.ts";

const DAY = "2026-10-14";
const STATION = "box/claude";
const reading = (command: string, text: string): Reading => ({ projet: "parade", demande: 1, a: `${DAY}T10:00:01.000Z`, sorties: [{ commande: command, texte: text }] });

// Ce que le runtime écrit de l'entrée, après sa tête et son « depuis » (runtime/test/attend.test.ts).
const REFUSAL_NETWORK =
  "setup impossible: the door refuses `cdn.sheetjs.com` (`.claude/brigade/worktree-setup.sh`, code de sortie 1, twice identically) — to declare in the project's `.claude/brigade/reseau`, one line per host, then merge into the integration branch; setups start again on their own as soon as the integration branch moves; until then, none is launched, for any ticket";
const SETUP_A_FIX =
  "setup impossible: `.claude/brigade/worktree-setup.sh` fails twice identically (code de sortie 1) — what it said is on #15 — to fix: the project's setup, then merge into the integration branch; setups start again on their own as soon as the integration branch moves; until then, none is launched, for any ticket";

// Une cuisine saine — runtime en marche, une station, version à jour — dont le
// test tient l'horloge. `bande` : ce que l'app en dessine, lu comme le process principal le lit.
function kitchen(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "brigade-app-setup-"));
  let instant = `${DAY}T09:00:00.000Z`;
  const log = ouvrirJournal(directory, { maintenant: () => new Date(instant) });
  t.after(() => {
    log.fermer();
    rmSync(directory, { recursive: true, force: true });
  });
  const note = (done: Fait, ticket: number | null = null, author = "runtime") => void log.ajouter({ project: "parade", ticket, author, ...done });
  note({ type: "runtime.started", payload: { pid: 1, host: "box", node: "v26" } });
  note({ type: "station.announced", payload: { station: STATION, engine: "claude", provides: ["opus"], maxCooks: 2 } });
  note({ type: "manager.enabled", payload: {} }, null, "chef");
  const render = () => {
    const now = new Date(`${DAY}T10:00:00.000Z`);
    const state = lireEtat(log, now);
    return { faits: `${JSON.stringify(runtimeFacts(state, now))}\n`, status: `${decrireEtat(state, now).join("\n")}\n` };
  };
  const bands = holdBands({ etablir: 1, minimum: 0 });
  bands.ouvrir(["parade"]);
  bands.veiller(["parade"]);
  const band = (): Band => {
    const rendered = render();
    bands.faits(reading("facts", rendered.faits));
    return bands.status(putAside(reading("status", rendered.status)));
  };
  // Deux échecs à l'identique, le second bloque (#643) — à 9 h 30, sur la base `ba5e0001`.
  const block = (hosts: string[]) => {
    instant = `${DAY}T09:30:00.000Z`;
    for (const ticket of [14, 15]) {
      note({ type: "ticket.arrived", payload: { title: `Ticket ${ticket}`, priority: null, createdAt: `2026-10-01T00:00:${ticket}Z`, url: `https://exemple.test/${ticket}` } }, ticket, "github");
      note({ type: "setup.failed", payload: { station: STATION, why: "code de sortie 1", hosts } }, ticket, `station:${STATION}`);
    }
    note({ type: "setup.blocked", payload: { station: STATION, why: "code de sortie 1", hosts, base: "ba5e0001ffff" } }, 15, `station:${STATION}`);
  };
  // La branche d'intégration a bougé : les setups reprennent.
  const unblock = () => {
    instant = `${DAY}T09:45:00.000Z`;
    note({ type: "setup.unblocked", payload: { station: STATION, base: "ba5e0002ffff" } }, null, `station:${STATION}`);
  };
  return { noter: note, rendre: render, bande: band, bloquer: block, debloquer: unblock };
}

const ofSetup = (band: Alert[]) => band.filter(({ dit: said }) => said.startsWith("project setup impossible"));
function theLine(band: Alert[]): Alert {
  const lines = ofSetup(band);
  assert.equal(lines.length, 1, JSON.stringify(band, null, 2));
  return lines[0] as Alert;
}

describe("le setup du projet bloqué, dans la bande d'alertes", () => {
  test("un hôte refusé : la ligne reprend la cause et le geste du runtime, mot pour mot — c'est la seule cause de la cuisine retenue, et toute la cuisine l'attend", (t) => {
    const { bande: band, bloquer: block } = kitchen(t);
    block(["cdn.sheetjs.com:443"]);
    const { alertes: readEntries, signal } = band();

    const line = theLine(readEntries);
    assert.equal(line.sujet, "cuisine");
    assert.equal(line.verifie, true);
    assert.equal(line.ton, "rouge");
    assert.equal(line.dit, "project setup impossible: no worktree is set up, no cook goes, for any ticket");
    assert.equal(line.releve, REFUSAL_NETWORK);
    assert.equal(line.pourquoi, undefined);
    assert.match(line.geste, /`\.claude\/brigade\/reseau`.*merge on the integration branch/);
    // Le geste se joue dans le dépôt du projet, hors de l'app : une demande au second.
    assert.deepEqual(line.appel, { demande: true });
    assert.match(line.prix, /^no cook is interrupted/);
    // La cuisine est retenue, et sa cause est lue : pas de « kitchen held » sans cause. Le runtime ne dit plus
    // d'urgence (ticket 3945) : la ligne du setup est seule, et la pastille de la case la reflète.
    assert.deepEqual(readEntries.map(({ dit: said }) => said), [line.dit]);
    assert.deepEqual(signal, { etat: "alerte", dit: line.dit });
  });

  test("sans hôte refusé : la ligne dit que le setup est à corriger, et l'issue où lire ce qu'il a dit", (t) => {
    const { bande: band, bloquer: block } = kitchen(t);
    block([]);
    assert.equal(theLine(band().alertes).releve, SETUP_A_FIX);
  });

  test("débloqué, le runtime ne le dit plus : la ligne sort de la bande et la pastille s'éteint, sans geste ; rebloqué, elles reviennent", (t) => {
    const { bande: band, bloquer: block, debloquer: unblock } = kitchen(t);
    block(["cdn.sheetjs.com:443"]);
    assert.equal(band().signal?.etat, "alerte");

    unblock();
    const back = band();
    assert.deepEqual(back.alertes, []);
    assert.equal(back.signal, undefined);

    block(["cdn.sheetjs.com:443"]);
    assert.equal(theLine(band().alertes).releve, REFUSAL_NETWORK);
  });

  test("une station distante cuisine encore : la cuisine est ouverte, la ligne le dit, moins grave — et la pastille est en alerte", (t) => {
    const { noter: note, bande: band, bloquer: block } = kitchen(t);
    block([]);
    note({ type: "station.announced", payload: { station: "mac/claude", engine: "claude", provides: ["opus"], maxCooks: 1, remote: true } });
    const { alertes: readEntries, signal } = band();
    const line = theLine(readEntries);
    assert.equal(line.ton, "jaune");
    assert.equal(line.dit, "project setup impossible: no worktree is set up on its main station, for any ticket — only a remote station still cooks");
    assert.equal(line.releve, SETUP_A_FIX);
    assert.deepEqual(readEntries.map(({ dit: said }) => said), [line.dit]);
    assert.equal(signal?.etat, "alerte");
  });

  test("le bloc `attend` laissé dans `status` se lit aussi ; absent, la ligne reprend la tête et dit que la cause n'est pas dans la lecture", (t) => {
    const { rendre: render, bloquer: block } = kitchen(t);
    block(["cdn.sheetjs.com:443"]);
    const rendered = render();
    const facts = understand(rendered.faits);
    assert.ok(!("informe" in facts));

    // `status` entier, son bloc à sa place.
    assert.equal(theLine(alerts({ projet: "parade", faits: facts, status: rendered.status })).releve, REFUSAL_NETWORK);

    // `status` sans son bloc, et rien à côté : la tête, et ce qui manque.
    const shownOne = putAside(reading("status", rendered.status));
    assert.ok("attend" in shownOne);
    const withoutBlock = shownOne.sorties[0]?.texte ?? assert.fail();
    const line = theLine(alerts({ projet: "parade", faits: facts, status: withoutBlock }));
    assert.match(line.releve ?? "", /^BLOCKED for 30 min on ba5e000 — /);
    assert.match(line.pourquoi ?? "", /`attend` block/);
  });

  test("l'entrée `setup` se lit à sa tête seule : ni un ticket, ni une autre entrée", () => {
    const block = [
      "attend     2 décisions attendent le chef — la plus ancienne depuis 1 h 00",
      "  #12  depuis 1 h 00  setup impossible : ce n'est pas l'entrée du projet",
      "  setup  depuis 20 min  setup impossible : la vraie",
      "      ce qui la précise",
      "  base  depuis 10 min  BASE ROUGE",
      "fin attend",
    ].join("\n");
    assert.equal(entryOfSetup(block), "setup impossible : la vraie\nce qui la précise");
    assert.equal(entryOfSetup("attend     rien n'attend le chef\nfin attend\n"), undefined);
    // Le même bloc, en anglais (#927).
    const english = ["awaiting   2 decisions await the chef — the oldest for 1 h 00", "  #12  for 1 h 00  setup impossible: not the project's entry", "  setup  for 20 min  setup impossible: the real one", "      what details it", "end awaiting"].join("\n");
    assert.equal(entryOfSetup(english), "setup impossible: the real one\nwhat details it");
  });
});

describe("le setup du projet bloqué, à l'écran", () => {
  const PARADE: Project = { nom: "parade", dossier: "/tmp/parade" };
  const OTHER: Project = { nom: "baloo", dossier: "/tmp/baloo" };
  const open = () =>
    playTheVue({
      demarrage: () => ({
        configuration: forTheBar({ chemin: "/tmp/app.json", projets: [PARADE, OTHER] }, () => true),
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

  test("la pastille de la case dit l'alerte, la bande porte le texte du runtime ; débloqué, l'une s'éteint et l'autre se cache", async (t) => {
    const { bande: band, bloquer: block, debloquer: unblock } = kitchen(t);
    block(["cdn.sheetjs.com:443"]);
    const vue = await open();
    const pill = () => vue.element("projets").children[1]?.children.find((pose) => pose.className === "signal");

    // L'app s'ouvre sur « Tous les projets » : la case de parade porte le signal de la ligne du setup.
    vue.dire("surAlertes", band());
    const pose = pill() ?? assert.fail("pas de pastille sur parade");
    assert.equal(pose.dataset.etat, "alerte");
    assert.match(pose.title, /^parade: project setup impossible: no worktree is set up, no cook goes, for any ticket/);

    // L'espace de parade : la bande en tête, la ligne et le texte du runtime, mot pour mot.
    pose.click();
    await repos();
    const alertsOfTheVue = vue.element("alertes");
    assert.equal(alertsOfTheVue.hidden, false);
    const [line] = alertsOfTheVue.children;
    assert.equal(line?.dataset.sujet, "cuisine");
    // Le texte du runtime n'est pas écrit à plat : il se lit, mot pour mot, derrière « detail » (#907).
    assert.deepEqual(line?.dessous("pre"), []);
    (line?.dessous("button").find((pose) => pose.className === "detail") ?? assert.fail("pas de « detail »")).click();
    const unfolded = alertsOfTheVue.children[0] ?? assert.fail("plus de ligne");
    assert.deepEqual(unfolded.dessous("pre").map(({ textContent }) => textContent), [REFUSAL_NETWORK]);

    // Débloqué : la bande se vide et se cache ; revenu sur « Tous les projets », la case n'a pas de pastille.
    unblock();
    vue.dire("surAlertes", band());
    assert.equal(alertsOfTheVue.hidden, true);
    assert.equal(alertsOfTheVue.children.length, 0);
    vue.element("projets").children[0]?.click();
    await repos();
    assert.equal(pill(), undefined);
  });
});

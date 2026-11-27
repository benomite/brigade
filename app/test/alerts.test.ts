// La bande d'alertes : vide quand tout va bien, chaque ligne avec son geste et son prix, et
// l'inconnu est dit. Trois états y entrent — le manager, la version en service, la cuisine —
// et chacun s'y éprouve sain (rien n'est posé), en panne (une ligne, sa cause, son
// geste, son prix) et non dit (une ligne « non vérifié » qui le nomme).
// Ce que la box rend est écrit ici par le runtime lui-même — `faits`, `status` et `manager`,
// joués dans ce process sur un vrai journal (runtime/src/etat.ts) :
// la forme que la bande lit est tenue contre celle que le runtime écrit.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { decrireEtat, faits as runtimeFacts, lireEtat } from "../../runtime/src/etat.ts";
import type { Fait } from "../../runtime/src/evenements.ts";
import { ouvrirJournal } from "../../runtime/src/journal.ts";
import { managerOutput } from "./helpers/manager-output.ts";
import { GESTE_DE_STATION_A_CHAUD_EN } from "../../runtime/src/stations-declarees.ts";
import { DISPLAY_MINIMUM, alerts, buttonOf, MANAGER_NOT_SAYS, signalOf, holdBands, type Alert, type Subject } from "../src/alerts.ts";
import { putAside } from "../src/awaiting.ts";
import type { Reading } from "../src/box.ts";
import { forTheBar } from "../src/bar.ts";
import { EXAMPLE, type Project } from "../src/config.ts";
import { PALETTE } from "../src/colors.ts";
import { BANNER, understand, type Facts } from "../src/facts.ts";
import { EFFORTS, MODELS } from "../src/projects/projects.ts";
import { TABS, HEADINGS } from "../src/tabs.ts";
import { playTheVue, repos, type Answers } from "./helpers/false-vue.ts";

const DAY = "2026-10-13";
const reading = (command: string, text: string): Reading => ({ projet: "parade", demande: 1, a: `${DAY}T10:00:01.000Z`, sorties: [{ commande: command, texte: text }] });
const KITCHEN = { locale: { node: "node", runtime: "/tmp/runtime", racine: "/tmp/station", env: {} } };

// La box a répondu, la commande a échoué : une lecture ratée, pas une box muette (#728).
const MISSED: Reading = { projet: "parade", demande: 1, a: `${DAY}T10:00:01.000Z`, erreur: "$ station parade facts\nnpm error Missing script: facts\n\n→ code de sortie 1", atteinte: true, cas: null };
const NOT_JOINED: Reading = { projet: "parade", demande: 1, a: `${DAY}T10:00:01.000Z`, erreur: "$ station parade facts\nconnection refused\n\n→ code de sortie 255", atteinte: false, cas: null };

// Une cuisine dont le test tient l'horloge, et ce que la box en rend : `faits`, `status` et
// `manager`, écrits par le runtime. `bande` : ce que l'app en dessine, lu comme le process
// principal le lit — `faits`, puis `status` son bloc `attend` mis à part, puis l'onglet Manager.
function kitchen(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "brigade-app-alertes-"));
  let instant = `${DAY}T09:00:00.000Z`;
  const log = ouvrirJournal(directory, { maintenant: () => new Date(instant) });
  t.after(() => {
    log.fermer();
    rmSync(directory, { recursive: true, force: true });
  });
  const note = (done: Fait, author = "runtime") => void log.ajouter({ project: "parade", ticket: null, author, ...done });
  // Une heure du jour du test, ou un instant entier.
  const when = (hour: string) => (hour.includes("T") ? hour : `${DAY}T${hour}.000Z`);
  const a = (hour: string) => void (instant = when(hour));
  const render = (hour: string) => {
    const now = new Date(when(hour));
    const state = lireEtat(log, now);
    return { faits: `${JSON.stringify(runtimeFacts(state, now))}\n`, status: `${decrireEtat(state, now).join("\n")}\n`, manager: managerOutput(log) };
  };
  const band = (hour = "10:00:00", { avecManager: withManager = true } = {}): Alert[] => {
    const rendered = render(hour);
    const bands = holdBands({ etablir: 1, minimum: 0 });
    bands.ouvrir(["parade"]);
    bands.veiller(["parade"]);
    bands.faits(reading("facts", rendered.faits));
    const readEntry = bands.status(putAside(reading("status", rendered.status)));
    return withManager ? bands.manager(reading("manager", rendered.manager)).alertes : readEntry.alertes;
  };
  return { noter: note, a, rendre: render, bande: band };
}

// Une cuisine qui tourne, et où tout va bien : runtime en marche, manager allumé.
function healthy(t: TestContext) {
  const served = kitchen(t);
  served.noter({ type: "runtime.started", payload: { pid: 1, host: "box", node: "v26" } });
  served.noter({ type: "manager.enabled", payload: {} }, "chef");
  return served;
}

const of = (band: Alert[], subject: Subject) => band.filter((alert) => alert.sujet === subject);
// Une ligne en panne : vérifiée, et qui dit sa cause, son geste et son prix.
function inOutage(band: Alert[], subject: Subject): Alert {
  const lines = of(band, subject);
  assert.equal(lines.length, 1, JSON.stringify(band, null, 2));
  const [line] = lines as [Alert];
  assert.equal(line.verifie, true);
  for (const said of [line.dit, line.geste, line.prix]) assert.notEqual(said.trim(), "");
  return line;
}
// Une ligne « non vérifié » : elle nomme l'état, dit pourquoi, et n'est pas « sain ».
function notChecks(band: Alert[], subject: Subject, named: string): Alert {
  const lines = of(band, subject);
  assert.equal(lines.length, 1, JSON.stringify(band, null, 2));
  const [line] = lines as [Alert];
  assert.equal(line.verifie, false);
  assert.match(line.dit, new RegExp(`${named}.* not verified$`));
  assert.notEqual(line.pourquoi?.trim() ?? "", "");
  for (const said of [line.geste, line.prix]) assert.notEqual(said.trim(), "");
  return line;
}

describe("l'interrupteur GitHub seul refusé par le runtime (ticket 2161)", () => {
  test("`facts` en porte la raison : une ligne en tête de la bande ; accepté ou absent, aucune", (t) => {
    const served = healthy(t);
    const withIt = (githubOnly: unknown) => {
      const rendered = served.rendre("10:00:00");
      const bands = holdBands({ etablir: 1, minimum: 0 });
      bands.ouvrir(["parade"]);
      bands.veiller(["parade"]);
      bands.faits(reading("facts", `${JSON.stringify({ ...JSON.parse(rendered.faits), githubSeul: githubOnly })}\n`));
      bands.status(putAside(reading("status", rendered.status)));
      return bands.manager(reading("manager", rendered.manager)).alertes;
    };
    const line = inOutage(withIt({ etat: "refused", reason: "the station name \"a/b\" cannot sign a claim or a verdict", since: `${DAY}T09:00:00.000Z` }), "cuisine");
    assert.match(line.dit, /^GitHub-only state refused: the station name .* cannot sign a claim or a verdict — nothing is cooked for this project$/);
    assert.deepEqual(withIt({ etat: "accepted", since: `${DAY}T09:00:00.000Z` }), []);
    assert.deepEqual(withIt(undefined), []);
  });
});

describe("la bande d'alertes : vide quand tout va bien", () => {
  test("manager allumé, version à jour, cuisine ouverte : la bande est vide", (t) => {
    assert.deepEqual(healthy(t).bande(), []);
  });

  test("ce qui ne change rien aux cinq minutes à venir n'y entre jamais : la sauvegarde trop vieille, ou jamais faite", (t) => {
    const { noter: note, a, rendre: render, bande: band } = healthy(t);
    assert.match(render("10:00:00").status, /^backup {5}NEVER DONE/m);
    assert.deepEqual(band(), []);

    a("2026-10-10T09:30:00.000Z");
    note({ type: "backup.completed", payload: { name: "parade-1", lastSeq: 3, events: 3, streams: 0 } }, "sauvegarde");
    assert.match(render("10:00:00").status, /^backup {5}TOO OLD/m);
    // Ni l'âge de la sauvegarde, ni rien de ce qui se dit d'elle.
    assert.deepEqual(band("10:00:00"), []);
  });
});

describe("le manager : sain, éteint, non dit", () => {
  test("allumé : rien", (t) => {
    assert.deepEqual(of(healthy(t).bande(), "manager"), []);
  });

  test("éteint : la ligne dit ce que le runtime en écrit, mot pour mot, et propose d'allumer le projet — en disant ce que ça engage", (t) => {
    const { noter: note, bande: band } = healthy(t);
    note({ type: "manager.disabled", payload: {} }, "chef");

    const line = inOutage(band(), "manager");
    assert.equal(line.ton, "rouge");
    assert.equal(line.dit, "project off — nothing new is taken, split or merged");
    assert.equal(line.releve, `OFF since ${DAY}T09:00:00.000Z (by chef) — no issue is judged, what it set stays set`);
    // L'app n'a plus de geste pour l'allumer : la ligne le dit, sans bouton.
    assert.equal(line.appel, undefined);
    assert.equal(line.bouton, undefined);
    assert.match(line.geste, /nothing to do from the app/);
  });

  // L'interrupteur du projet (#1406) : le manager le suit, et sa ligne le dit.
  test("l'interrupteur du projet éteint : la ligne du manager le dit, une seule — la cuisine retenue par lui n'en fait pas une seconde", (t) => {
    const { noter: note, bande: band } = healthy(t);
    note({ type: "project.switched-off", payload: {} }, "chef");

    const lines = band();
    assert.deepEqual(lines.map(({ sujet: subject, dit: said }) => [subject, said]), [["manager", "project off — nothing new is taken, split or merged"]]);
    assert.match(lines[0]?.releve ?? "", /^OFF since \S+ \(by chef\) — the project switch is off: `brigade \S+ switch on` turns it on — no issue is judged/);
    note({ type: "project.switched-on", payload: {} }, "chef");
    assert.deepEqual(band(), []);
  });

  test("jamais allumé : éteint aussi", (t) => {
    const { noter: note, bande: band } = kitchen(t);
    note({ type: "runtime.started", payload: { pid: 1, host: "box", node: "v26" } });
    assert.match(inOutage(band(), "manager").releve ?? "", /^OFF — never turned on/);
  });

  test("pas encore lu par l'app : la première lecture en cours n'affiche rien — ni « allumé », ni « non vérifié » (#721)", (t) => {
    assert.deepEqual(of(healthy(t).bande("10:00:00", { avecManager: false }), "manager"), []);
  });

  test("non dit — la lecture de `manager` a échoué, ou n'a pas la forme : non vérifié, avec ce qui en a été obtenu", () => {
    const bands = holdBands({ etablir: 1, minimum: 0 });
    bands.ouvrir(["parade"]);
    assert.match(notChecks(bands.manager({ ...NOT_JOINED, erreur: NOT_JOINED.erreur.replace("faits", "manager") }).alertes, "manager", "project switch").pourquoi ?? "", /^`manager` was not read: not reached/);
    assert.match(notChecks(bands.manager(reading("manager", "erreur\n")).alertes, "manager", "project switch").pourquoi ?? "", /does not have the expected shape/);
  });

  test("lu par la veille de l'app, sans onglet : un manager allumé ne dit rien, éteint se dit, et un onglet quitté n'y change rien", (t) => {
    const { noter: note, rendre: render } = healthy(t);
    const bands = holdBands({ etablir: 1, minimum: 0 });
    bands.ouvrir(["parade"]);
    assert.deepEqual(of(bands.manager(reading("manager", render("10:00:00").manager)).alertes, "manager"), []);
    // Rien ne lâche l'état lu : la veille le rafraîchit, quel que soit l'onglet affiché.
    assert.deepEqual(of(bands.faits(reading("facts", render("10:00:30").faits)).alertes, "manager"), []);
    note({ type: "manager.disabled", payload: {} }, "chef");
    inOutage(bands.manager(reading("manager", render("10:01:00").manager)).alertes, "manager");
  });
});

describe("la cuisine : ouverte, gelée, non dite", () => {
  test("ouverte : rien", (t) => {
    assert.deepEqual(of(healthy(t).bande(), "cuisine"), []);
  });

  test("aucune station déclarée : la cuisine est gelée — la ligne le dit, et le geste est celui du runtime, mot pour mot", (t) => {
    const { noter: note, bande: band } = healthy(t);
    note({ type: "stations.undeclared", payload: {} });

    const line = inOutage(band(), "cuisine");
    assert.equal(line.dit, "no station declared: no cook goes, the kitchen is frozen");
    assert.equal(line.releve, "NONE DECLARED for 1 h 00 — no cook leaves, the tickets stay waiting");
    assert.equal(line.geste, GESTE_DE_STATION_A_CHAUD_EN);
    // Déclarer une station se joue sur la box, hors de l'app : le geste est une demande au second.
    assert.deepEqual(line.appel, { demande: true });
    assert.equal(line.prix, "a runtime restart: what is in flight is interrupted — the station does not say what is");
  });

  test("arrêtée par le « stop » du chef : la ligne le dit, sans geste ni bouton", (t) => {
    const { noter: note, bande: band } = healthy(t);
    note({ type: "kitchen.stopped", payload: {} }, "chef");

    const line = inOutage(band(), "cuisine");
    assert.equal(line.appel, undefined);
    assert.equal(line.bouton, undefined);
  });

  test("le disjoncteur ouvert : la ligne de `status` mot pour mot, sans geste ni bouton — une information (#2140, #3911)", (t) => {
    const { noter: note, bande: band } = healthy(t);
    note({ type: "breaker.opened", payload: { failures: 3, threshold: 3 } });

    const line = inOutage(band(), "cuisine");
    assert.equal(line.releve, "breaker OPEN for 1 h 00 (0 failures in a row)");
    assert.equal(line.disjoncteur, true);
    assert.equal(line.appel, undefined);
    assert.equal(line.bouton, undefined);
  });

  test("runtime arrêté : rien ne tourne — le geste se joue sur la box, il est une demande au second", (t) => {
    const { noter: note, bande: band } = healthy(t);
    note({ type: "runtime.stopped", payload: { signal: "SIGTERM" } });

    const line = inOutage(band(), "cuisine");
    assert.equal(line.dit, "runtime stopped: nothing is running, no ticket is taken");
    assert.match(line.geste, /systemctl start brigade@parade/);
    assert.deepEqual(line.appel, { demande: true });
  });

  test("retenue, et `status` pas lu : la ligne dit qu'elle est retenue, et que sa cause n'est pas lue", (t) => {
    const { noter: note, rendre: render } = healthy(t);
    note({ type: "stations.undeclared", payload: {} });
    const bands = holdBands({ etablir: 1, minimum: 0 });
    bands.ouvrir(["parade"]);
    const line = inOutage(bands.faits(reading("facts", render("10:00:00").faits)).alertes, "cuisine");
    assert.equal(line.dit, "kitchen held: it is running, but no cook goes any more");
    assert.match(line.pourquoi ?? "", /^its cause was not read: `status` is only read for the project shown/);
  });

  test("non dite — `faits` pas joint, pas encore lu, ou pas dans sa forme : « état de la cuisine non vérifié »", () => {
    const bands = holdBands({ etablir: 1, minimum: 0 });
    const [first] = bands.ouvrir(["parade"]);
    // La première lecture est en cours : rien ne se dit avant son résultat.
    assert.deepEqual(first?.alertes, []);
    assert.equal(notChecks(bands.faits(NOT_JOINED).alertes, "cuisine", "kitchen state").pourquoi, "`facts` was not read: not reached");
    assert.equal(notChecks(bands.faits(reading("facts", "pas du json\n")).alertes, "cuisine", "kitchen state").pourquoi, "the station did not return the shape of `facts`: this is not JSON");
  });
});

describe("il n'y a plus de grant : `status` n'en dit rien, et l'app n'en dit rien non plus", () => {
  // Ce que dit la bande d'un `status` donné, ses autres lignes étant celles d'une cuisine saine.
  const bandWith = (t: TestContext, addition: string[]): Alert[] => {
    const { rendre: render } = healthy(t);
    const bands = holdBands({ etablir: 1, minimum: 0 });
    bands.ouvrir(["parade"]);
    bands.veiller(["parade"]);
    const rendered = render("10:00:00");
    bands.faits(reading("facts", rendered.faits));
    const [head, ...suite] = rendered.status.split("\n");
    bands.status(putAside(reading("status", [head, ...addition, ...suite].join("\n"))));
    return bands.manager(reading("manager", rendered.manager)).alertes;
  };

  test("un `status` sans ligne `grant` : aucune alerte, et rien n'y parle de grant", (t) => {
    const { rendre: render } = healthy(t);
    assert.doesNotMatch(render("10:00:00").status, /^grant/m);
    const band = bandWith(t, []);
    assert.deepEqual(band, []);
    assert.doesNotMatch(JSON.stringify(band), /grant/i);
  });

  test("une ligne `grant` illisible, ou d'un runtime d'avant, ne fait aucune alerte : ni éteinte, ni bientôt éteinte, ni « non vérifié »", (t) => {
    for (const line of [
      "grant      merge LAPSED 40 min ago — its deadline has passed: the pass stops at the open PR",
      "grant      merge ÉTEINT SEUL il y a 40 min — son échéance est passée : la pass s'arrête à la PR ouverte",
      "grant      merge ACTIVE, EXPIRING SOON: 30 min left — a green pass is merged without you",
      "grant      merge ACTIF, BIENTÔT ÉTEINT : encore 30 min — une pass verte est mergée sans toi",
      "grant      n'importe quoi, que l'app ne lit pas",
      "grant      ",
    ]) {
      const band = bandWith(t, [line]);
      assert.deepEqual(band, [], line);
      assert.doesNotMatch(JSON.stringify(band), /grant/i, line);
    }
  });

  test("`status` pas lu, pas joint ou pas dans sa forme : aucune ligne « grant state not verified »", () => {
    const bands = holdBands({ etablir: 1, minimum: 0 });
    bands.ouvrir(["parade"]);
    bands.veiller(["parade"]);
    for (const readEntry of [bands.status({ ...NOT_JOINED, erreur: NOT_JOINED.erreur.replace("faits", "status") }), bands.status(putAside(reading("status", "rien de connu\n")))]) {
      assert.doesNotMatch(JSON.stringify(readEntry.alertes), /grant/i);
    }
  });
});

describe("la bande, à l'écran", () => {
  const PARADE: Project = { nom: "parade", dossier: "/tmp/parade" };
  const open = async (more: Answers = {}) => {
    const vue = await playTheVue({
      ...more,
      demarrage: () => ({
        configuration: forTheBar({ chemin: "/tmp/app.json", projets: [PARADE] }, () => true),
        palette: PALETTE,
        exemple: EXAMPLE,
        onglets: TABS, rubriques: HEADINGS,
        gestes: {},
        banniere: BANNER,
        calibrage: { modeles: MODELS, efforts: EFFORTS },
        code: undefined,
      }),
      espace: () => [],
    });
    vue.element("projets").children[1]?.click();
    await repos();
    return vue;
  };

  test("vide, elle est cachée : elle ne prend aucune place ; la ligne de la cuisine à l'arrêt se montre, sans geste à jouer", async (t) => {
    const { rendre: render, noter: note } = healthy(t);
    const vue = await open();
    const band = vue.element("alertes");

    vue.dire("surAlertes", { projet: "parade", alertes: [] });
    assert.equal(band.hidden, true);
    assert.equal(band.children.length, 0);

    note({ type: "kitchen.stopped", payload: {} }, "chef");
    const bands = holdBands({ etablir: 1, minimum: 0 });
    bands.ouvrir(["parade"]);
    bands.faits(reading("facts", render("10:00:00").faits));
    bands.status(putAside(reading("status", render("10:00:00").status)));
    vue.dire("surAlertes", bands.manager(reading("manager", render("10:00:00").manager)));
    assert.equal(band.hidden, false);
    const [line] = band.children;
    assert.equal(line?.dataset.sujet, "cuisine");
    assert.match(line?.textContent ?? "", /kitchen stopped by your “stop”/);
    // L'app n'a plus de geste pour la reprendre : aucun bouton de geste, aucune confirmation, rien ne part.
    assert.deepEqual(line?.dessous("button").filter((pose) => pose.dataset.geste !== undefined), []);
    assert.deepEqual(line?.dessous("section").filter((pose) => pose.className === "confirmation"), []);
    assert.deepEqual(vue.appels.filter(({ geste: action }) => action === "geste" || action === "confirmer"), []);
  });

  test("une ligne dont le geste demande du jugement écrit sa demande dans le second : aucun geste ne part, rien n'est confirmé, rien n'est envoyé", async (t) => {
    const { rendre: render, noter: note } = healthy(t);
    note({ type: "stations.undeclared", payload: {} });
    const bands = holdBands({ etablir: 1, minimum: 0 });
    bands.ouvrir(["parade"]);
    bands.faits(reading("facts", render("10:00:00").faits));
    bands.status(putAside(reading("status", render("10:00:00").status)));
    const readEntry = bands.manager(reading("manager", render("10:00:00").manager));
    const writtenOne = { id: 1, projet: "parade", genre: "second" as const, titre: "second · claude", note: "écrit dans le second, sans Entrée", arrete: false };
    const vue = await open({ demanderAlerte: () => writtenOne });
    vue.dire("surAlertes", readEntry);

    const line = () => vue.element("alertes").children.find((pose) => pose.dataset.sujet === "cuisine") ?? assert.fail("pas de ligne");
    const request = () => line().dessous("button").find((pose) => pose.dataset.geste === "demande") ?? assert.fail("pas de demande");
    // Son geste coûte un redémarrage : le bouton ouvre d'abord ce qu'il coûte.
    assert.equal(request().textContent, "ask the second…");
    // La commande que la box nomme n'est écrite nulle part, pas même derrière « detail » : le bouton est le seul geste.
    assert.doesNotMatch(line().textContent, /brigade <projet>/);
    (line().dessous("button").find((pose) => pose.className === "detail") ?? assert.fail("pas de « detail »")).click();
    assert.ok(!line().textContent.includes(GESTE_DE_STATION_A_CHAUD_EN), "le geste est écrit derrière « detail »");
    request().click();
    await repos();
    // La confirmation dit le prix du geste, en une ligne ; rien n'est encore écrit.
    const openOne = line().dessous("section").find((pose) => pose.className === "confirmation") ?? assert.fail("pas de confirmation");
    assert.equal(openOne.dessous("p").find(({ className }) => className === "prix")?.textContent, "a runtime restart: what is in flight is interrupted — the station does not say what is?");
    assert.deepEqual(vue.appels.filter(({ geste: action }) => action === "demanderAlerte"), []);
    (openOne.dessous("button").find(({ dataset }) => dataset.oui !== undefined) ?? assert.fail("pas de « oui »")).click();
    await repos();

    // La vue nomme la ligne ; la phrase se compose dans le process principal, d'après la bande.
    assert.deepEqual(vue.dernier("demanderAlerte"), ["parade", "cuisine", "no station declared: no cook goes, the kitchen is frozen"]);
    assert.deepEqual(vue.appels.filter(({ geste: action }) => action === "geste" || action === "confirmer" || action === "inscrire"), []);
    assert.equal(vue.element("note-second").textContent, writtenOne.note);
  });

  test("une ligne « non vérifié » se pose aussi, marquée comme telle", async () => {
    const vue = await open();
    const bands = holdBands({ etablir: 1, minimum: 0 });
    bands.ouvrir(["parade"]);
    vue.dire("surAlertes", bands.faits(NOT_JOINED));
    const lines = vue.element("alertes").children;
    assert.deepEqual(
      lines.map((line) => [line.dataset.sujet, line.dataset.verifie]),
      [["cuisine", "non"]],
    );
  });
});

describe("le signal d'un projet sur sa case de la barre", () => {
  const PARADE: Project = { nom: "parade", dossier: "/tmp/parade" };
  const OTHER: Project = { nom: "baloo", dossier: "/tmp/baloo" };
  const open = () =>
    playTheVue({
      demarrage: () => ({
        configuration: forTheBar({ chemin: "/tmp/app.json", projets: [PARADE, OTHER] }, () => true),
        palette: PALETTE,
        exemple: EXAMPLE,
        onglets: TABS, rubriques: HEADINGS,
        gestes: {},
        banniere: BANNER,
        calibrage: { modeles: MODELS, efforts: EFFORTS },
        code: undefined,
      }),
      espace: () => [],
    });
  const signalOfTheCase = (vue: Awaited<ReturnType<typeof open>>, rank: number) => vue.element("projets").children[rank]?.children.find((pose) => pose.className === "signal");
  const alert = (checks: boolean): Alert => ({ sujet: "cuisine", verifie: checks, ton: "rouge", dit: checks ? "kitchen stopped by your “stop”" : "kitchen state not verified", geste: "resume the kitchen", prix: "—" });

  test("sans alerte : aucun signal ; avec alerte : un signal ; non vérifié : dit comme tel, jamais sain", () => {
    assert.equal(signalOf([]), undefined);
    assert.equal(signalOf([alert(true)])?.etat, "alerte");
    assert.equal(signalOf([alert(false)])?.etat, "non-verifie");
    assert.equal(signalOf([alert(false), alert(true)])?.etat, "alerte");
    // Une bande jamais lue ne dit rien le temps de sa première lecture ; sa lecture ratée, elle, est non vérifiée.
    const bands = holdBands({ etablir: 1, minimum: 0 });
    assert.equal(bands.ouvrir(["baloo"])[0]?.signal, undefined);
    assert.equal(bands.faits({ ...NOT_JOINED, projet: "baloo" }).signal?.etat, "non-verifie");
  });

  test("sur la barre : le signal n'est posé que sur un projet non affiché, et son clic ouvre l'espace du projet", async () => {
    const vue = await open();
    // La barre : « T », parade, baloo. L'app s'ouvre sur « Tous les projets ».
    vue.dire("surAlertes", { projet: "baloo", alertes: [alert(true)], signal: signalOf([alert(true)]) });
    vue.dire("surAlertes", { projet: "parade", alertes: [], signal: undefined });
    assert.equal(signalOfTheCase(vue, 1), undefined);
    const pose = signalOfTheCase(vue, 2) ?? assert.fail("pas de signal sur baloo");
    assert.equal(pose.dataset.etat, "alerte");
    assert.match(pose.title, /baloo: kitchen stopped by your “stop” — alert: something needs doing/);

    vue.dire("surAlertes", { projet: "parade", alertes: [alert(false)], signal: signalOf([alert(false)]) });
    const check = signalOfTheCase(vue, 1) ?? assert.fail("pas de signal sur parade");
    assert.equal(check.dataset.etat, "non-verifie");
    assert.match(check.title, /not verified: the app could not read this state/);

    // Le projet affiché ne porte pas de signal : sa bande est sous les yeux ; il le reprend en le quittant.
    vue.element("projets").children[1]?.click();
    await repos();
    assert.equal(signalOfTheCase(vue, 1), undefined);
    assert.notEqual(signalOfTheCase(vue, 2), undefined);

    // Le clic sur le signal ouvre l'espace de baloo : sa bande, avec le geste et le prix, est en tête.
    vue.dire("surAlertes", { projet: "baloo", alertes: [alert(true)], signal: signalOf([alert(true)]) });
    (signalOfTheCase(vue, 2) ?? assert.fail()).click();
    await repos();
    assert.equal(vue.element("tous").hidden, true);
    assert.equal(vue.element("alertes").hidden, false);
    assert.equal(signalOfTheCase(vue, 2), undefined);
    assert.notEqual(signalOfTheCase(vue, 1), undefined);

    // La bande qui se vide retire le signal.
    vue.dire("surAlertes", { projet: "baloo", alertes: [], signal: undefined });
    assert.equal(signalOfTheCase(vue, 2), undefined);
  });

  test("la bande dit la plus grave d'abord : une alerte lue avant un état non vérifié, le rouge avant le jaune", () => {
    const readOne = alerts({ projet: "baloo", faits: { sans: "pas lu" }, status: { sans: "pas lu" }, manager: { sans: MANAGER_NOT_SAYS } });
    const ranks = readOne.map(({ verifie: checks }) => checks);
    assert.deepEqual(ranks, [...ranks].sort((a, b) => Number(b) - Number(a)));
  });
});

describe("la bande ne clignote pas (#721)", () => {
  const clock = () => {
    let t = 0;
    return { maintenant: () => t, avancer: (ms: number) => void (t += ms) };
  };
  const OK = (render: (h: string) => { faits: string }) => reading("facts", render("10:00:00").faits);

  test("une lecture en cours n'affiche rien ; une lecture ratée une fois puis réussie au tour suivant non plus", (t) => {
    const { rendre: render } = healthy(t);
    const bands = holdBands();
    assert.deepEqual(bands.ouvrir(["parade"])[0]?.alertes, []);
    assert.deepEqual(bands.veiller(["parade"])[0]?.alertes, []);
    assert.deepEqual(bands.faits(NOT_JOINED).alertes, []);
    assert.deepEqual(of(bands.faits(OK(render)).alertes, "cuisine"), []);
    assert.deepEqual(bands.faits(OK(render)).alertes.filter(({ verifie: checks }) => !checks).map(({ sujet: subject }) => subject), []);
  });

  test("une alerte qui tient sur deux lectures de suite s'affiche, une fois, et reste ; identique, la bande est la même", () => {
    const bands = holdBands();
    bands.ouvrir(["parade"]);
    assert.deepEqual(bands.faits(MISSED).alertes, []);
    const two = bands.faits(MISSED);
    assert.equal(notChecks(two.alertes, "cuisine", "kitchen state").pourquoi, "`facts` was not read: reached, but `facts` did not answer");
    assert.equal(bands.faits(MISSED), two, "même contenu : aucun mouvement");
  });

  test("une alerte dite reste le temps d'être lue, puis part quand l'état est levé", (t) => {
    const { rendre: render } = healthy(t);
    const h = clock();
    const bands = holdBands({ maintenant: h.maintenant });
    bands.ouvrir(["parade"]);
    bands.faits(MISSED);
    assert.equal(bands.faits(MISSED).alertes.length > 0, true);
    h.avancer(1000);
    const lifted = bands.faits(OK(render));
    assert.equal(lifted.alertes.some(({ verifie: checks }) => !checks), true, "tenue : lue trop peu de temps");
    h.avancer(DISPLAY_MINIMUM);
    assert.equal(bands.faits(OK(render)).alertes.some(({ verifie: checks }) => !checks), false);
  });

  test("une réception de `status` entre deux lectures de `faits` n'établit pas ce que `faits` a raté une fois", (t) => {
    const { rendre: render } = healthy(t);
    const bands = holdBands();
    bands.ouvrir(["parade"]);
    bands.veiller(["parade"]);
    bands.faits(NOT_JOINED);
    const status = bands.status(putAside(reading("status", render("10:00:00").status)));
    assert.deepEqual(status.alertes.filter(({ verifie: checks }) => !checks).map(({ sujet: subject }) => subject), []);
    assert.deepEqual(bands.faits(OK(render)).alertes.filter(({ verifie: checks }) => !checks), []);
    // Deux lectures de `faits` de suite ratées, `status` entre elles : établie.
    bands.faits(NOT_JOINED);
    bands.status(putAside(reading("status", render("10:00:00").status)));
    assert.equal(of(bands.faits(NOT_JOINED).alertes, "cuisine").length, 1);
  });
  test("les échecs de `status` ne comptent pas pour une alerte dont vient `faits`, et inversement (#746)", (t) => {
    const { rendre: render } = healthy(t);
    const bands = holdBands();
    bands.ouvrir(["parade"]);
    bands.veiller(["parade"]);
    const statusRate = { ...NOT_JOINED, erreur: NOT_JOINED.erreur.replace("facts", "status") };
    const kitchen = (b: { alertes: Alert[] }) => of(b.alertes, "cuisine").filter(({ pourquoi: why }) => why?.includes("`facts`"));
    // `status` rate deux fois de suite : ce qu'il dit est établi, pas ce que `faits` n'a raté qu'une fois.
    bands.status(putAside({ ...statusRate, projet: "parade" }));
    bands.faits(NOT_JOINED);
    const after = bands.status(putAside({ ...statusRate, projet: "parade" }));
    assert.deepEqual(kitchen(after), []);
    assert.deepEqual(kitchen(bands.faits(OK(render))), []);
    // `faits` rate deux fois de suite, entrelacé de `status` réussi : établie.
    bands.faits(NOT_JOINED);
    bands.status(putAside(reading("status", render("10:00:00").status)));
    assert.equal(kitchen(bands.faits(NOT_JOINED)).length, 1);
  });
});

describe("le mot du bouton d'une alerte", () => {
  test("une demande au second, un onglet, une relecture : un mot court, jamais une commande", () => {
    assert.equal(buttonOf({ appel: { demande: true } }), "ask the second");
    assert.equal(buttonOf({ appel: { onglet: "parametres" } }), "open Settings");
    assert.equal(buttonOf({ appel: { relire: true } }), "try again now");
    assert.equal(buttonOf({}), undefined);
  });

  test("toute alerte de la bande qui appelle un geste porte le mot de son bouton, sans commande", () => {
    const band = alerts({ projet: "parade", faits: { sans: "first reading in progress" }, status: { sans: "x" }, manager: { sans: "y" } });
    assert.ok(band.length > 0);
    for (const alert of band) if (alert.appel !== undefined) assert.ok(alert.bouton !== undefined && !alert.bouton.includes("`"), alert.dit);
  });
});


describe("la limite d'appels de GitHub", () => {
  const RESUMPTION = new Date(`${DAY}T10:20:00.000Z`);
  const hhmm = `${String(RESUMPTION.getHours()).padStart(2, "0")}:${String(RESUMPTION.getMinutes()).padStart(2, "0")}`;
  const SAYS = `GitHub is rate-limiting calls, back around ${hhmm}`;

  test("dite par la box, la ligne est seule, à l'heure locale, et tombe quand `faits` ne la porte plus", (t) => {
    const { rendre: render } = healthy(t);
    const bands = holdBands({ etablir: 1, minimum: 0 });
    bands.ouvrir(["parade"]);
    const rendered = render("10:00:00");

    const limited = bands.faits(reading("facts", `${JSON.stringify({ ...JSON.parse(rendered.faits), limiteGithub: RESUMPTION.toISOString() })}\n`)).alertes;
    assert.deepEqual(of(limited, "github").map(({ dit: said }) => said), [SAYS]);
    assert.doesNotMatch(JSON.stringify(of(limited, "github")), /request id|terms|HTTP 4|rate limit/i);

    const resumption = bands.faits(reading("facts", rendered.faits)).alertes;
    assert.deepEqual(of(resumption, "github"), []);
  });

  test("dite par l'app elle-même (la box ne passe plus par GitHub), la ligne vient de sa propre erreur et tombe à la reprise", (t) => {
    const { rendre: render } = healthy(t);
    const bands = holdBands({ etablir: 1, minimum: 0 });
    bands.ouvrir(["parade"]);
    bands.faits(reading("facts", render("10:00:00").faits));

    const [limited] = bands.limite({ reprise: RESUMPTION.toISOString() });
    assert.deepEqual(of(limited?.alertes ?? [], "github").map(({ dit: said }) => said), [SAYS]);

    const [lifted] = bands.limite(undefined);
    assert.deepEqual(of(lifted?.alertes ?? [], "github"), []);
  });
});

describe("le budget d'écritures de la box (#2226)", () => {
  const LINE = "held by the GitHub write budget — 450 of 450 in the last hour, next write at 10:20";
  const status = (withIt: boolean) => `project     parade\n${withIt ? `github      ${LINE}\n` : ""}kitchen     open\n`;

  test("la ligne `github` de `status` se dit mot pour mot dans la bande, et tombe avec elle", (t) => {
    const { rendre: render } = healthy(t);
    const facts = JSON.parse(render("10:00:00").faits) as Facts;
    const manager = { sans: MANAGER_NOT_SAYS };
    const saidOne = alerts({ projet: "parade", faits: facts, status: status(true), manager });
    assert.deepEqual(of(saidOne, "github").map(({ dit: said, ton: your, verifie: checks }) => ({ dit: said, ton: your, verifie: checks })), [{ dit: LINE, ton: "jaune", verifie: true }]);
    assert.deepEqual(of(alerts({ projet: "parade", faits: facts, status: status(false), manager }), "github"), []);
  });
});

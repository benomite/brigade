// La bande d'alertes : vide quand tout va bien, chaque ligne avec son geste et son prix, et
// l'inconnu est dit. Trois états y entrent — le manager, la version en service, la cuisine —
// et chacun s'y éprouve sain (rien n'est posé), en panne (une ligne, sa cause, son
// geste, son prix) et non dit (une ligne « non vérifié » qui le nomme).
// Ce que la box rend est écrit ici par le runtime lui-même — `faits`, `status` et `manager`,
// joués dans ce process sur un vrai journal (runtime/src/etat.ts, runtime/src/manager-cli.ts) :
// la forme que la bande lit est tenue contre celle que le runtime écrit.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { decrireEtat, faits as runtimeFacts, lireEtat } from "../../runtime/src/etat.ts";
import type { Fait } from "../../runtime/src/evenements.ts";
import { ouvrirJournal } from "../../runtime/src/journal.ts";
import { principal as manager } from "../../runtime/src/manager-cli.ts";
import { GESTE_DE_STATION_A_CHAUD_EN } from "../../runtime/src/stations-declarees.ts";
import { DISPLAY_MINIMUM, alerts, buttonDe, MANAGER_PAS_DIT, signalDe, holdBandes, type Alert, type Sujet } from "../src/alerts.ts";
import { mettreAPart } from "../src/awaiting.ts";
import type { Read } from "../src/box.ts";
import { ALLUMAGE } from "../src/allumage.ts";
import { pourLaBar } from "../src/bar.ts";
import { EXEMPLE, type Project } from "../src/config.ts";
import { PALETTE } from "../src/couleurs.ts";
import { confirmationDe, type Lus } from "../src/confirmation.ts";
import { KITCHEN_ACTIONS } from "../src/kitchen.ts";
import { BANNIERE, comprendre, type Facts } from "../src/facts.ts";
import { CONFIRMES, DIRECTS } from "../src/actions.ts";
import { EFFORTS, MODELES } from "../src/projects/projects.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import { jouerLaVue, repos, type Answers } from "./aides/fausse-vue.ts";

const DAY = "2026-10-13";
const read = (command: string, texte: string): Read => ({ projet: "parade", demande: 1, a: `${DAY}T10:00:01.000Z`, sorties: [{ commande: command, texte }] });
const KITCHEN = { locale: { node: "node", runtime: "/tmp/runtime", racine: "/tmp/station", env: {} } };

// La box a répondu, la commande a échoué : une lecture ratée, pas une box muette (#728).
const RATEE: Read = { projet: "parade", demande: 1, a: `${DAY}T10:00:01.000Z`, erreur: "$ station parade facts\nnpm error Missing script: facts\n\n→ code de sortie 1", atteinte: true, cas: null };
const PAS_JOINT: Read = { projet: "parade", demande: 1, a: `${DAY}T10:00:01.000Z`, erreur: "$ station parade facts\nconnection refused\n\n→ code de sortie 255", atteinte: false, cas: null };

// Une cuisine dont le test tient l'horloge, et ce que la box en rend : `faits`, `status` et
// `manager`, écrits par le runtime. `bande` : ce que l'app en dessine, lu comme le process
// principal le lit — `faits`, puis `status` son bloc `attend` mis à part, puis l'onglet Manager.
function kitchen(t: TestContext) {
  const repertoire = mkdtempSync(join(tmpdir(), "brigade-app-alertes-"));
  let instant = `${DAY}T09:00:00.000Z`;
  const log = ouvrirJournal(repertoire, { maintenant: () => new Date(instant) });
  t.after(() => {
    log.fermer();
    rmSync(repertoire, { recursive: true, force: true });
  });
  const noter = (fait: Fait, author = "runtime") => void log.ajouter({ project: "parade", ticket: null, author, ...fait });
  // Une heure du jour du test, ou un instant entier.
  const quand = (heure: string) => (heure.includes("T") ? heure : `${DAY}T${heure}.000Z`);
  const a = (heure: string) => void (instant = quand(heure));
  const rendre = (heure: string) => {
    const maintenant = new Date(quand(heure));
    const state = lireEtat(log, maintenant);
    const lines: string[] = [];
    void manager({ args: [], env: { BRIGADE_STATE_DIR: repertoire }, dire: (line) => void lines.push(line), redire: (line) => assert.fail(line) });
    return { faits: `${JSON.stringify(runtimeFacts(state, maintenant))}\n`, status: `${decrireEtat(state, maintenant).join("\n")}\n`, manager: `${lines.join("\n")}\n` };
  };
  const bande = (heure = "10:00:00", { avecManager = true } = {}): Alert[] => {
    const rendu = rendre(heure);
    const bandes = holdBandes({ etablir: 1, minimum: 0 });
    bandes.ouvrir(["parade"]);
    bandes.veiller(["parade"]);
    bandes.faits(read("facts", rendu.faits));
    const lue = bandes.status(mettreAPart(read("status", rendu.status)));
    return avecManager ? bandes.manager(read("manager", rendu.manager)).alertes : lue.alertes;
  };
  return { noter, a, rendre, bande };
}

// Une cuisine qui tourne, et où tout va bien : runtime en marche, manager allumé.
function saine(t: TestContext) {
  const served = kitchen(t);
  served.noter({ type: "runtime.started", payload: { pid: 1, host: "box", node: "v26" } });
  served.noter({ type: "manager.enabled", payload: {} }, "chef");
  return served;
}

const du = (bande: Alert[], sujet: Sujet) => bande.filter((alert) => alert.sujet === sujet);
// Une ligne en panne : vérifiée, et qui dit sa cause, son geste et son prix.
function enOutage(bande: Alert[], sujet: Sujet): Alert {
  const lines = du(bande, sujet);
  assert.equal(lines.length, 1, JSON.stringify(bande, null, 2));
  const [line] = lines as [Alert];
  assert.equal(line.verifie, true);
  for (const dit of [line.dit, line.geste, line.prix]) assert.notEqual(dit.trim(), "");
  return line;
}
// Une ligne « non vérifié » : elle nomme l'état, dit pourquoi, et n'est pas « sain ».
function nonVerifie(bande: Alert[], sujet: Sujet, nomme: string): Alert {
  const lines = du(bande, sujet);
  assert.equal(lines.length, 1, JSON.stringify(bande, null, 2));
  const [line] = lines as [Alert];
  assert.equal(line.verifie, false);
  assert.match(line.dit, new RegExp(`${nomme}.* not verified$`));
  assert.notEqual(line.pourquoi?.trim() ?? "", "");
  for (const dit of [line.geste, line.prix]) assert.notEqual(dit.trim(), "");
  return line;
}

describe("l'interrupteur GitHub seul refusé par le runtime (ticket 2161)", () => {
  test("`facts` en porte la raison : une ligne en tête de la bande ; accepté ou absent, aucune", (t) => {
    const served = saine(t);
    const avec = (githubOnly: unknown) => {
      const rendu = served.rendre("10:00:00");
      const bandes = holdBandes({ etablir: 1, minimum: 0 });
      bandes.ouvrir(["parade"]);
      bandes.veiller(["parade"]);
      bandes.faits(read("facts", `${JSON.stringify({ ...JSON.parse(rendu.faits), githubSeul: githubOnly })}\n`));
      bandes.status(mettreAPart(read("status", rendu.status)));
      return bandes.manager(read("manager", rendu.manager)).alertes;
    };
    const line = enOutage(avec({ etat: "refused", reason: "the station name \"a/b\" cannot sign a claim or a verdict", since: `${DAY}T09:00:00.000Z` }), "cuisine");
    assert.match(line.dit, /^GitHub-only state refused: the station name .* cannot sign a claim or a verdict — nothing is cooked for this project$/);
    assert.deepEqual(avec({ etat: "accepted", since: `${DAY}T09:00:00.000Z` }), []);
    assert.deepEqual(avec(undefined), []);
  });
});

describe("la bande d'alertes : vide quand tout va bien", () => {
  test("manager allumé, version à jour, cuisine ouverte : la bande est vide", (t) => {
    assert.deepEqual(saine(t).bande(), []);
  });

  test("ce qui ne change rien aux cinq minutes à venir n'y entre jamais : la sauvegarde trop vieille, ou jamais faite", (t) => {
    const { noter, a, rendre, bande } = saine(t);
    assert.match(rendre("10:00:00").status, /^backup {5}NEVER DONE/m);
    assert.deepEqual(bande(), []);

    a("2026-10-10T09:30:00.000Z");
    noter({ type: "backup.completed", payload: { name: "parade-1", lastSeq: 3, events: 3, streams: 0 } }, "sauvegarde");
    assert.match(rendre("10:00:00").status, /^backup {5}TOO OLD/m);
    // Ni l'âge de la sauvegarde, ni rien de ce qui se dit d'elle.
    assert.deepEqual(bande("10:00:00"), []);
  });
});

describe("le manager : sain, éteint, non dit", () => {
  test("allumé : rien", (t) => {
    assert.deepEqual(du(saine(t).bande(), "manager"), []);
  });

  test("éteint : la ligne dit ce que le runtime en écrit, mot pour mot, et propose d'allumer le projet — en disant ce que ça engage", (t) => {
    const { noter, bande } = saine(t);
    noter({ type: "manager.disabled", payload: {} }, "chef");

    const line = enOutage(bande(), "manager");
    assert.equal(line.ton, "rouge");
    assert.equal(line.dit, "project off — nothing new is taken, split or merged");
    assert.equal(line.releve, `OFF since ${DAY}T09:00:00.000Z (by chef) — no issue is judged, what it set stays set`);
    assert.equal(line.geste, "switch the project on");
    assert.deepEqual(line.appel, { geste: "projet-allumer" });
    assert.equal(line.bouton, "switch the project on");
    assert.match(line.prix, /judges the whole open backlog, what it judges executable is taken at once, and green deliveries are merged/);
  });

  // L'interrupteur du projet (#1406) : le manager le suit, et sa ligne le dit.
  test("l'interrupteur du projet éteint : la ligne du manager le dit, une seule — la cuisine retenue par lui n'en fait pas une seconde", (t) => {
    const { noter, bande } = saine(t);
    noter({ type: "project.switched-off", payload: {} }, "chef");

    const lines = bande();
    assert.deepEqual(lines.map(({ sujet, dit }) => [sujet, dit]), [["manager", "project off — nothing new is taken, split or merged"]]);
    assert.match(lines[0]?.releve ?? "", /^OFF since \S+ \(by chef\) — the project switch is off: `brigade \S+ switch on` turns it on — no issue is judged/);
    noter({ type: "project.switched-on", payload: {} }, "chef");
    assert.deepEqual(bande(), []);
  });

  test("jamais allumé : éteint aussi", (t) => {
    const { noter, bande } = kitchen(t);
    noter({ type: "runtime.started", payload: { pid: 1, host: "box", node: "v26" } });
    assert.match(enOutage(bande(), "manager").releve ?? "", /^OFF — never turned on/);
  });

  test("pas encore lu par l'app : la première lecture en cours n'affiche rien — ni « allumé », ni « non vérifié » (#721)", (t) => {
    assert.deepEqual(du(saine(t).bande("10:00:00", { avecManager: false }), "manager"), []);
  });

  test("non dit — la lecture de `manager` a échoué, ou n'a pas la forme : non vérifié, avec ce qui en a été obtenu", () => {
    const bandes = holdBandes({ etablir: 1, minimum: 0 });
    bandes.ouvrir(["parade"]);
    assert.match(nonVerifie(bandes.manager({ ...PAS_JOINT, erreur: PAS_JOINT.erreur.replace("faits", "manager") }).alertes, "manager", "project switch").pourquoi ?? "", /^`manager` was not read: not reached/);
    assert.match(nonVerifie(bandes.manager(read("manager", "erreur\n")).alertes, "manager", "project switch").pourquoi ?? "", /does not have the expected shape/);
  });

  test("lu par la veille de l'app, sans onglet : un manager allumé ne dit rien, éteint se dit, et un onglet quitté n'y change rien", (t) => {
    const { noter, rendre } = saine(t);
    const bandes = holdBandes({ etablir: 1, minimum: 0 });
    bandes.ouvrir(["parade"]);
    assert.deepEqual(du(bandes.manager(read("manager", rendre("10:00:00").manager)).alertes, "manager"), []);
    // Rien ne lâche l'état lu : la veille le rafraîchit, quel que soit l'onglet affiché.
    assert.deepEqual(du(bandes.faits(read("facts", rendre("10:00:30").faits)).alertes, "manager"), []);
    noter({ type: "manager.disabled", payload: {} }, "chef");
    enOutage(bandes.manager(read("manager", rendre("10:01:00").manager)).alertes, "manager");
  });
});

describe("la cuisine : ouverte, gelée, non dite", () => {
  test("ouverte : rien", (t) => {
    assert.deepEqual(du(saine(t).bande(), "cuisine"), []);
  });

  test("aucune station déclarée : la cuisine est gelée — la ligne le dit, et le geste est celui du runtime, mot pour mot", (t) => {
    const { noter, bande } = saine(t);
    noter({ type: "stations.undeclared", payload: {} });

    const line = enOutage(bande(), "cuisine");
    assert.equal(line.dit, "no station declared: no cook goes, the kitchen is frozen");
    assert.equal(line.releve, "NONE DECLARED for 1 h 00 — no cook leaves, the tickets stay waiting");
    assert.equal(line.geste, GESTE_DE_STATION_A_CHAUD_EN);
    // Déclarer une station se joue sur la box, hors de l'app : le geste est une demande au second.
    assert.deepEqual(line.appel, { demande: true });
    assert.equal(line.prix, "a runtime restart: what is in flight is interrupted — the station does not say what is");
  });

  test("arrêtée par le « stop » du chef : reprendre, et ce que ça relance", (t) => {
    const { noter, bande } = saine(t);
    noter({ type: "kitchen.stopped", payload: {} }, "chef");

    const line = enOutage(bande(), "cuisine");
    assert.deepEqual(line.appel, { geste: "reprendre" });
    assert.match(line.prix, /start again at once/);
  });

  test("le disjoncteur ouvert : la ligne de `status` mot pour mot, sans geste ni bouton — une information (#2140, #3911)", (t) => {
    const { noter, bande } = saine(t);
    noter({ type: "breaker.opened", payload: { failures: 3, threshold: 3 } });

    const line = enOutage(bande(), "cuisine");
    assert.equal(line.releve, "breaker OPEN for 1 h 00 (0 failures in a row)");
    assert.equal(line.disjoncteur, true);
    assert.equal(line.appel, undefined);
    assert.equal(line.bouton, undefined);
  });

  test("runtime arrêté : rien ne tourne — le geste se joue sur la box, il est une demande au second", (t) => {
    const { noter, bande } = saine(t);
    noter({ type: "runtime.stopped", payload: { signal: "SIGTERM" } });

    const line = enOutage(bande(), "cuisine");
    assert.equal(line.dit, "runtime stopped: nothing is running, no ticket is taken");
    assert.match(line.geste, /systemctl start brigade@parade/);
    assert.deepEqual(line.appel, { demande: true });
  });

  test("retenue, et `status` pas lu : la ligne dit qu'elle est retenue, et que sa cause n'est pas lue", (t) => {
    const { noter, rendre } = saine(t);
    noter({ type: "stations.undeclared", payload: {} });
    const bandes = holdBandes({ etablir: 1, minimum: 0 });
    bandes.ouvrir(["parade"]);
    const line = enOutage(bandes.faits(read("facts", rendre("10:00:00").faits)).alertes, "cuisine");
    assert.equal(line.dit, "kitchen held: it is running, but no cook goes any more");
    assert.match(line.pourquoi ?? "", /^its cause was not read: `status` is only read for the project shown/);
  });

  test("non dite — `faits` pas joint, pas encore lu, ou pas dans sa forme : « état de la cuisine non vérifié »", () => {
    const bandes = holdBandes({ etablir: 1, minimum: 0 });
    const [first] = bandes.ouvrir(["parade"]);
    // La première lecture est en cours : rien ne se dit avant son résultat.
    assert.deepEqual(first?.alertes, []);
    assert.equal(nonVerifie(bandes.faits(PAS_JOINT).alertes, "cuisine", "kitchen state").pourquoi, "`facts` was not read: not reached");
    assert.equal(nonVerifie(bandes.faits(read("facts", "pas du json\n")).alertes, "cuisine", "kitchen state").pourquoi, "the station did not return the shape of `facts`: this is not JSON");
  });
});

describe("il n'y a plus de grant : `status` n'en dit rien, et l'app n'en dit rien non plus", () => {
  // Ce que dit la bande d'un `status` donné, ses autres lignes étant celles d'une cuisine saine.
  const bandeAvec = (t: TestContext, addition: string[]): Alert[] => {
    const { rendre } = saine(t);
    const bandes = holdBandes({ etablir: 1, minimum: 0 });
    bandes.ouvrir(["parade"]);
    bandes.veiller(["parade"]);
    const rendu = rendre("10:00:00");
    bandes.faits(read("facts", rendu.faits));
    const [tete, ...suite] = rendu.status.split("\n");
    bandes.status(mettreAPart(read("status", [tete, ...addition, ...suite].join("\n"))));
    return bandes.manager(read("manager", rendu.manager)).alertes;
  };

  test("un `status` sans ligne `grant` : aucune alerte, et rien n'y parle de grant", (t) => {
    const { rendre } = saine(t);
    assert.doesNotMatch(rendre("10:00:00").status, /^grant/m);
    const bande = bandeAvec(t, []);
    assert.deepEqual(bande, []);
    assert.doesNotMatch(JSON.stringify(bande), /grant/i);
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
      const bande = bandeAvec(t, [line]);
      assert.deepEqual(bande, [], line);
      assert.doesNotMatch(JSON.stringify(bande), /grant/i, line);
    }
  });

  test("`status` pas lu, pas joint ou pas dans sa forme : aucune ligne « grant state not verified »", () => {
    const bandes = holdBandes({ etablir: 1, minimum: 0 });
    bandes.ouvrir(["parade"]);
    bandes.veiller(["parade"]);
    for (const lue of [bandes.status({ ...PAS_JOINT, erreur: PAS_JOINT.erreur.replace("faits", "status") }), bandes.status(mettreAPart(read("status", "rien de connu\n")))]) {
      assert.doesNotMatch(JSON.stringify(lue.alertes), /grant/i);
    }
  });
});

describe("la bande, à l'écran", () => {
  const PARADE: Project = { nom: "parade", dossier: "/tmp/parade" };
  const ouvrir = async (plus: Answers = {}) => {
    const vue = await jouerLaVue({
      ...plus,
      demarrage: () => ({
        configuration: pourLaBar({ chemin: "/tmp/app.json", projets: [PARADE] }, () => true),
        palette: PALETTE,
        exemple: EXEMPLE,
        onglets: ONGLETS, rubriques: RUBRIQUES,
        gestes: { allumage: ALLUMAGE, cuisine: KITCHEN_ACTIONS, directs: DIRECTS, confirmes: CONFIRMES },
        banniere: BANNIERE,
        calibrage: { modeles: MODELES, efforts: EFFORTS },
        code: undefined,
      }),
      espace: () => [],
    });
    vue.element("projets").children[1]?.click();
    await repos();
    return vue;
  };

  test("vide, elle est cachée : elle ne prend aucune place ; une ligne la montre, et son geste, confirmé, ne part qu'à son « oui »", async (t) => {
    const { rendre, noter } = saine(t);
    const lus = (): Lus => {
      const facts = comprendre(rendre("10:00:00").faits);
      return "informe" in facts ? { sans: facts.informe } : { faits: facts, a: `${DAY}T10:00:01.000Z` };
    };
    const vue = await ouvrir({ confirmer: (_, id) => confirmationDe(id, PARADE, lus(), KITCHEN) });
    const bande = vue.element("alertes");

    vue.dire("surAlertes", { projet: "parade", alertes: [] });
    assert.equal(bande.hidden, true);
    assert.equal(bande.children.length, 0);

    noter({ type: "kitchen.stopped", payload: {} }, "chef");
    const bandes = holdBandes({ etablir: 1, minimum: 0 });
    bandes.ouvrir(["parade"]);
    bandes.faits(read("facts", rendre("10:00:00").faits));
    bandes.status(mettreAPart(read("status", rendre("10:00:00").status)));
    vue.dire("surAlertes", bandes.manager(read("manager", rendre("10:00:00").manager)));
    assert.equal(bande.hidden, false);
    const [line] = bande.children;
    assert.equal(line?.dataset.sujet, "cuisine");
    assert.match(line?.textContent ?? "", /kitchen stopped by your “stop”.*resume the kitchen…/);
    // Le prix n'est ni écrit à côté du bouton ni à son survol (#907) : c'est la confirmation, au clic, qui le dit.
    assert.doesNotMatch(line?.textContent ?? "", /cost:|start again/);
    assert.ok(!(line?.dessous("button") ?? []).some((pose) => /start again/.test(pose.ariaLabel)), "le prix est encore à côté du bouton");

    // Le clic ouvre la confirmation, sous la ligne : elle dit ce qu'il relance, et rien ne part.
    (line?.dessous("button").find((pose) => pose.dataset.geste === "confirme") ?? assert.fail("pas de bouton")).click();
    await repos();
    assert.deepEqual(vue.dernier("confirmer"), ["parade", "reprendre"]);
    assert.deepEqual(vue.appels.filter(({ geste: action }) => action === "geste"), []);
    const ouverte = bande.children[0]?.dessous("section").find((pose) => pose.className === "confirmation") ?? assert.fail("pas de confirmation");
    assert.match(ouverte.textContent, /resume the kitchen/);
    assert.match(ouverte.textContent, /queued tickets start again, on your quota/);

    // Son « oui » le fait partir, une fois, et le dit au process principal.
    (ouverte.dessous("button").find((choice) => choice.dataset.oui !== undefined) ?? assert.fail("pas de « oui »")).click();
    await repos();
    assert.deepEqual(
      vue.appels.filter(({ geste: action }) => action === "geste").map(({ args }) => args),
      [["parade", "reprendre", true]],
    );
  });

  test("une ligne dont le geste demande du jugement écrit sa demande dans le second : aucun geste ne part, rien n'est confirmé, rien n'est envoyé", async (t) => {
    const { rendre, noter } = saine(t);
    noter({ type: "stations.undeclared", payload: {} });
    const bandes = holdBandes({ etablir: 1, minimum: 0 });
    bandes.ouvrir(["parade"]);
    bandes.faits(read("facts", rendre("10:00:00").faits));
    bandes.status(mettreAPart(read("status", rendre("10:00:00").status)));
    const lue = bandes.manager(read("manager", rendre("10:00:00").manager));
    const ecrite = { id: 1, projet: "parade", genre: "second" as const, titre: "second · claude", note: "écrit dans le second, sans Entrée", arrete: false };
    const vue = await ouvrir({ demanderAlerte: () => ecrite });
    vue.dire("surAlertes", lue);

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
    const ouverte = line().dessous("section").find((pose) => pose.className === "confirmation") ?? assert.fail("pas de confirmation");
    assert.equal(ouverte.dessous("p").find(({ className }) => className === "prix")?.textContent, "a runtime restart: what is in flight is interrupted — the station does not say what is?");
    assert.deepEqual(vue.appels.filter(({ geste: action }) => action === "demanderAlerte"), []);
    (ouverte.dessous("button").find(({ dataset }) => dataset.oui !== undefined) ?? assert.fail("pas de « oui »")).click();
    await repos();

    // La vue nomme la ligne ; la phrase se compose dans le process principal, d'après la bande.
    assert.deepEqual(vue.dernier("demanderAlerte"), ["parade", "cuisine", "no station declared: no cook goes, the kitchen is frozen"]);
    assert.deepEqual(vue.appels.filter(({ geste: action }) => action === "geste" || action === "confirmer" || action === "inscrire"), []);
    assert.equal(vue.element("note-second").textContent, ecrite.note);
  });

  test("une ligne « non vérifié » se pose aussi, marquée comme telle", async () => {
    const vue = await ouvrir();
    const bandes = holdBandes({ etablir: 1, minimum: 0 });
    bandes.ouvrir(["parade"]);
    vue.dire("surAlertes", bandes.faits(PAS_JOINT));
    const lines = vue.element("alertes").children;
    assert.deepEqual(
      lines.map((line) => [line.dataset.sujet, line.dataset.verifie]),
      [["cuisine", "non"]],
    );
  });
});

describe("le signal d'un projet sur sa case de la barre", () => {
  const PARADE: Project = { nom: "parade", dossier: "/tmp/parade" };
  const AUTRE: Project = { nom: "baloo", dossier: "/tmp/baloo" };
  const ouvrir = () =>
    jouerLaVue({
      demarrage: () => ({
        configuration: pourLaBar({ chemin: "/tmp/app.json", projets: [PARADE, AUTRE] }, () => true),
        palette: PALETTE,
        exemple: EXEMPLE,
        onglets: ONGLETS, rubriques: RUBRIQUES,
        gestes: { allumage: ALLUMAGE, cuisine: KITCHEN_ACTIONS, directs: DIRECTS, confirmes: CONFIRMES },
        banniere: BANNIERE,
        calibrage: { modeles: MODELES, efforts: EFFORTS },
        code: undefined,
      }),
      espace: () => [],
    });
  const signalDeLaCase = (vue: Awaited<ReturnType<typeof ouvrir>>, rang: number) => vue.element("projets").children[rang]?.children.find((pose) => pose.className === "signal");
  const alert = (verifie: boolean): Alert => ({ sujet: "cuisine", verifie, ton: "rouge", dit: verifie ? "kitchen stopped by your “stop”" : "kitchen state not verified", geste: "resume the kitchen", prix: "—" });

  test("sans alerte : aucun signal ; avec alerte : un signal ; non vérifié : dit comme tel, jamais sain", () => {
    assert.equal(signalDe([]), undefined);
    assert.equal(signalDe([alert(true)])?.etat, "alerte");
    assert.equal(signalDe([alert(false)])?.etat, "non-verifie");
    assert.equal(signalDe([alert(false), alert(true)])?.etat, "alerte");
    // Une bande jamais lue ne dit rien le temps de sa première lecture ; sa lecture ratée, elle, est non vérifiée.
    const bandes = holdBandes({ etablir: 1, minimum: 0 });
    assert.equal(bandes.ouvrir(["baloo"])[0]?.signal, undefined);
    assert.equal(bandes.faits({ ...PAS_JOINT, projet: "baloo" }).signal?.etat, "non-verifie");
  });

  test("sur la barre : le signal n'est posé que sur un projet non affiché, et son clic ouvre l'espace du projet", async () => {
    const vue = await ouvrir();
    // La barre : « T », parade, baloo. L'app s'ouvre sur « Tous les projets ».
    vue.dire("surAlertes", { projet: "baloo", alertes: [alert(true)], signal: signalDe([alert(true)]) });
    vue.dire("surAlertes", { projet: "parade", alertes: [], signal: undefined });
    assert.equal(signalDeLaCase(vue, 1), undefined);
    const pose = signalDeLaCase(vue, 2) ?? assert.fail("pas de signal sur baloo");
    assert.equal(pose.dataset.etat, "alerte");
    assert.match(pose.title, /baloo: kitchen stopped by your “stop” — alert: something needs doing/);

    vue.dire("surAlertes", { projet: "parade", alertes: [alert(false)], signal: signalDe([alert(false)]) });
    const verif = signalDeLaCase(vue, 1) ?? assert.fail("pas de signal sur parade");
    assert.equal(verif.dataset.etat, "non-verifie");
    assert.match(verif.title, /not verified: the app could not read this state/);

    // Le projet affiché ne porte pas de signal : sa bande est sous les yeux ; il le reprend en le quittant.
    vue.element("projets").children[1]?.click();
    await repos();
    assert.equal(signalDeLaCase(vue, 1), undefined);
    assert.notEqual(signalDeLaCase(vue, 2), undefined);

    // Le clic sur le signal ouvre l'espace de baloo : sa bande, avec le geste et le prix, est en tête.
    vue.dire("surAlertes", { projet: "baloo", alertes: [alert(true)], signal: signalDe([alert(true)]) });
    (signalDeLaCase(vue, 2) ?? assert.fail()).click();
    await repos();
    assert.equal(vue.element("tous").hidden, true);
    assert.equal(vue.element("alertes").hidden, false);
    assert.equal(signalDeLaCase(vue, 2), undefined);
    assert.notEqual(signalDeLaCase(vue, 1), undefined);

    // La bande qui se vide retire le signal.
    vue.dire("surAlertes", { projet: "baloo", alertes: [], signal: undefined });
    assert.equal(signalDeLaCase(vue, 2), undefined);
  });

  test("la bande dit la plus grave d'abord : une alerte lue avant un état non vérifié, le rouge avant le jaune", () => {
    const lu = alerts({ projet: "baloo", faits: { sans: "pas lu" }, status: { sans: "pas lu" }, manager: { sans: MANAGER_PAS_DIT } });
    const rangs = lu.map(({ verifie }) => verifie);
    assert.deepEqual(rangs, [...rangs].sort((a, b) => Number(b) - Number(a)));
  });
});

describe("la bande ne clignote pas (#721)", () => {
  const horloge = () => {
    let t = 0;
    return { maintenant: () => t, avancer: (ms: number) => void (t += ms) };
  };
  const OK = (rendre: (h: string) => { faits: string }) => read("facts", rendre("10:00:00").faits);

  test("une lecture en cours n'affiche rien ; une lecture ratée une fois puis réussie au tour suivant non plus", (t) => {
    const { rendre } = saine(t);
    const bandes = holdBandes();
    assert.deepEqual(bandes.ouvrir(["parade"])[0]?.alertes, []);
    assert.deepEqual(bandes.veiller(["parade"])[0]?.alertes, []);
    assert.deepEqual(bandes.faits(PAS_JOINT).alertes, []);
    assert.deepEqual(du(bandes.faits(OK(rendre)).alertes, "cuisine"), []);
    assert.deepEqual(bandes.faits(OK(rendre)).alertes.filter(({ verifie }) => !verifie).map(({ sujet }) => sujet), []);
  });

  test("une alerte qui tient sur deux lectures de suite s'affiche, une fois, et reste ; identique, la bande est la même", () => {
    const bandes = holdBandes();
    bandes.ouvrir(["parade"]);
    assert.deepEqual(bandes.faits(RATEE).alertes, []);
    const deux = bandes.faits(RATEE);
    assert.equal(nonVerifie(deux.alertes, "cuisine", "kitchen state").pourquoi, "`facts` was not read: reached, but `facts` did not answer");
    assert.equal(bandes.faits(RATEE), deux, "même contenu : aucun mouvement");
  });

  test("une alerte dite reste le temps d'être lue, puis part quand l'état est levé", (t) => {
    const { rendre } = saine(t);
    const h = horloge();
    const bandes = holdBandes({ maintenant: h.maintenant });
    bandes.ouvrir(["parade"]);
    bandes.faits(RATEE);
    assert.equal(bandes.faits(RATEE).alertes.length > 0, true);
    h.avancer(1000);
    const levee = bandes.faits(OK(rendre));
    assert.equal(levee.alertes.some(({ verifie }) => !verifie), true, "tenue : lue trop peu de temps");
    h.avancer(DISPLAY_MINIMUM);
    assert.equal(bandes.faits(OK(rendre)).alertes.some(({ verifie }) => !verifie), false);
  });

  test("une réception de `status` entre deux lectures de `faits` n'établit pas ce que `faits` a raté une fois", (t) => {
    const { rendre } = saine(t);
    const bandes = holdBandes();
    bandes.ouvrir(["parade"]);
    bandes.veiller(["parade"]);
    bandes.faits(PAS_JOINT);
    const status = bandes.status(mettreAPart(read("status", rendre("10:00:00").status)));
    assert.deepEqual(status.alertes.filter(({ verifie }) => !verifie).map(({ sujet }) => sujet), []);
    assert.deepEqual(bandes.faits(OK(rendre)).alertes.filter(({ verifie }) => !verifie), []);
    // Deux lectures de `faits` de suite ratées, `status` entre elles : établie.
    bandes.faits(PAS_JOINT);
    bandes.status(mettreAPart(read("status", rendre("10:00:00").status)));
    assert.equal(du(bandes.faits(PAS_JOINT).alertes, "cuisine").length, 1);
  });
  test("les échecs de `status` ne comptent pas pour une alerte dont vient `faits`, et inversement (#746)", (t) => {
    const { rendre } = saine(t);
    const bandes = holdBandes();
    bandes.ouvrir(["parade"]);
    bandes.veiller(["parade"]);
    const statusRate = { ...PAS_JOINT, erreur: PAS_JOINT.erreur.replace("facts", "status") };
    const kitchen = (b: { alertes: Alert[] }) => du(b.alertes, "cuisine").filter(({ pourquoi }) => pourquoi?.includes("`facts`"));
    // `status` rate deux fois de suite : ce qu'il dit est établi, pas ce que `faits` n'a raté qu'une fois.
    bandes.status(mettreAPart({ ...statusRate, projet: "parade" }));
    bandes.faits(PAS_JOINT);
    const apres = bandes.status(mettreAPart({ ...statusRate, projet: "parade" }));
    assert.deepEqual(kitchen(apres), []);
    assert.deepEqual(kitchen(bandes.faits(OK(rendre))), []);
    // `faits` rate deux fois de suite, entrelacé de `status` réussi : établie.
    bandes.faits(PAS_JOINT);
    bandes.status(mettreAPart(read("status", rendre("10:00:00").status)));
    assert.equal(kitchen(bandes.faits(PAS_JOINT)).length, 1);
  });
});

describe("le mot du bouton d'une alerte", () => {
  test("un geste du socle, une demande au second, un onglet : un mot court, jamais une commande", () => {
    assert.equal(buttonDe({ geste: "switch the project on", appel: { geste: "projet-allumer" } }), "switch the project on");
    assert.equal(buttonDe({ geste: "resume the kitchen, once you have read why they fail", appel: { geste: "reprendre" } }), "resume the kitchen");
    assert.equal(buttonDe({ geste: "start it on the station: `systemctl start brigade@parade`", appel: { demande: true } }), "ask the second");
    assert.equal(buttonDe({ geste: "read it: Settings reads the project on the station", appel: { onglet: "parametres" } }), "open Settings");
    assert.equal(buttonDe({ geste: "nothing to do: this is on brigade" }), undefined);
  });

  test("toute alerte de la bande qui appelle un geste porte le mot de son bouton, sans commande", () => {
    const bande = alerts({ projet: "parade", faits: { sans: "first reading in progress" }, status: { sans: "x" }, manager: { sans: "y" } });
    assert.ok(bande.length > 0);
    for (const alert of bande) if (alert.appel !== undefined) assert.ok(alert.bouton !== undefined && !alert.bouton.includes("`"), alert.dit);
  });
});


describe("la limite d'appels de GitHub", () => {
  const RESUMPTION = new Date(`${DAY}T10:20:00.000Z`);
  const hhmm = `${String(RESUMPTION.getHours()).padStart(2, "0")}:${String(RESUMPTION.getMinutes()).padStart(2, "0")}`;
  const DIT = `GitHub is rate-limiting calls, back around ${hhmm}`;

  test("dite par la box, la ligne est seule, à l'heure locale, et tombe quand `faits` ne la porte plus", (t) => {
    const { rendre } = saine(t);
    const bandes = holdBandes({ etablir: 1, minimum: 0 });
    bandes.ouvrir(["parade"]);
    const rendu = rendre("10:00:00");

    const limitee = bandes.faits(read("facts", `${JSON.stringify({ ...JSON.parse(rendu.faits), limiteGithub: RESUMPTION.toISOString() })}\n`)).alertes;
    assert.deepEqual(du(limitee, "github").map(({ dit }) => dit), [DIT]);
    assert.doesNotMatch(JSON.stringify(du(limitee, "github")), /request id|terms|HTTP 4|rate limit/i);

    const resumption = bandes.faits(read("facts", rendu.faits)).alertes;
    assert.deepEqual(du(resumption, "github"), []);
  });

  test("dite par l'app elle-même (la box ne passe plus par GitHub), la ligne vient de sa propre erreur et tombe à la reprise", (t) => {
    const { rendre } = saine(t);
    const bandes = holdBandes({ etablir: 1, minimum: 0 });
    bandes.ouvrir(["parade"]);
    bandes.faits(read("facts", rendre("10:00:00").faits));

    const [limitee] = bandes.limite({ reprise: RESUMPTION.toISOString() });
    assert.deepEqual(du(limitee?.alertes ?? [], "github").map(({ dit }) => dit), [DIT]);

    const [levee] = bandes.limite(undefined);
    assert.deepEqual(du(levee?.alertes ?? [], "github"), []);
  });
});

describe("le budget d'écritures de la box (#2226)", () => {
  const LINE = "held by the GitHub write budget — 450 of 450 in the last hour, next write at 10:20";
  const status = (avec: boolean) => `project     parade\n${avec ? `github      ${LINE}\n` : ""}kitchen     open\n`;

  test("la ligne `github` de `status` se dit mot pour mot dans la bande, et tombe avec elle", (t) => {
    const { rendre } = saine(t);
    const facts = JSON.parse(rendre("10:00:00").faits) as Facts;
    const manager = { sans: MANAGER_PAS_DIT };
    const dite = alerts({ projet: "parade", faits: facts, status: status(true), manager });
    assert.deepEqual(du(dite, "github").map(({ dit, ton, verifie }) => ({ dit, ton, verifie })), [{ dit: LINE, ton: "jaune", verifie: true }]);
    assert.deepEqual(du(alerts({ projet: "parade", faits: facts, status: status(false), manager }), "github"), []);
  });
});

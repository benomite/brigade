// La carte de WAITING d'un ticket qui attend une capacité (#1958, épique #1950) : deux sorties, chacune d'un geste —
// la donner à une station du projet, ou en faire le travail d'un humain —, et sur aucune autre carte. Puis sa tâche
// dans TODO, à qui elle revient (le chef par défaut, changeable), avec le titre, le contexte et les critères de sa carte.
// Les faits sont ceux que le runtime écrit lui-même (runtime/src/etat.ts, `faits`), passés par le process principal
// tel qu'il est (faits.ts) ; la vue est jouée contre le faux pont (aides/fausse-vue.ts). Les modules de la carte
// (vue/attente-capacite/) sont aussi lus seuls.
import assert from "node:assert/strict";
import type { ExecFileException } from "node:child_process";
import { describe, test, type TestContext } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mettreEnAttente } from "../../../../runtime/src/attente.ts";
import { faits as faitsDuRuntime, lireEtat } from "../../../../runtime/src/etat.ts";
import type { GitHub } from "../../../../runtime/src/github.ts";
import { ouvrirJournal, type Journal } from "../../../../runtime/src/journal.ts";
import { confierAUnHumain as confierAuRuntime } from "../../../../runtime/src/sortie-attente-capacite/sortie.ts";
import { ALLUMAGE } from "../../../src/allumage.ts";
import { pourLaBarre } from "../../../src/barre.ts";
import type { Rendu } from "../../../src/box.ts";
import { EXEMPLE } from "../../../src/config.ts";
import { PALETTE } from "../../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../../src/cuisine.ts";
import { BANNIERE, comprendre, tenirFaits } from "../../../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../../../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../../../src/grants.ts";
import { ONGLETS, RUBRIQUES } from "../../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../../src/projets/projets.ts";
import { lireStations, type Guide, type StationsLues } from "../../../src/service.ts";
import { commandeHumaine, confierAUnHumain } from "../../../src/vue/attente-capacite/geste.ts";
import { requisLus, tacheLue } from "../../../src/vue/attente-capacite/lecture.ts";
import { aAjouter, DONNER, HUMAIN, PAS_LUES, poserSorties, poserTache, REASSIGNER } from "../../../src/vue/attente-capacite/sorties.js";
import { Faux, type Jouee, jouerLaVue, ouvrirOnglet, repos } from "../../aides/fausse-vue.ts";

const PARADE = "parade";
const A = "2026-10-21T10:04:12.000Z";
const MAINTENANT = new Date(A);
const CORPS = ["## Context", "", "Capture the signed-in form.", "", "## Acceptance criteria", "", "- the capture shows the form signed in", "", "---", "_split by the manager_"].join("\n");

// Les stations du projet, telles que `installation stations --json` les rend : aucune ne fournit `chrome-connecté`.
const stations = (pc: string[]): StationsLues =>
  lireStations(
    JSON.stringify({
      etape: { id: "stations", etat: "faite" },
      proposees: [],
      absent: null,
      declarees: [
        { nom: "box/claude", moteur: "claude", fournit: ["code", "raisonnement"], cooks: 3, distante: false },
        { nom: "pc/claude", moteur: "claude", fournit: pc, cooks: 2, distante: true },
      ],
    }),
  ) ?? assert.fail("la forme de `installation stations --json` n'est plus lue");
const guide = (lues: StationsLues): Guide => ({
  projet: PARADE,
  deplie: false,
  titre: "parade is installed",
  lecture: { etat: "lue", a: A },
  etapes: [],
  courante: null,
  annonces: { etat: "lues", liste: [] },
  demarrage: { refus: "nothing to start" },
  termine: true,
  controle: { a: A, stations: lues },
});

// Le runtime du projet : #22 demande `chrome-connecté` et `code`, aucune station ne fournit le premier — WAITING faute
// de capacité ; #24 attend un tiers — WAITING aussi, pour une autre raison ; #23 attend sur le rail.
function runtime(t: TestContext) {
  const repertoire = mkdtempSync(join(tmpdir(), "attente-capacite-"));
  const journal = ouvrirJournal(repertoire, { maintenant: () => MAINTENANT });
  t.after(() => {
    journal.fermer();
    rmSync(repertoire, { recursive: true, force: true });
  });
  const arriver = (ticket: number, titre: string, requires: string[] = []) =>
    journal.ajouter({
      project: PARADE,
      ticket,
      author: "github",
      type: "ticket.arrived",
      payload: { title: titre, priority: null, createdAt: `2026-10-01T00:00:${ticket}Z`, url: `https://github.com/chef/parade/issues/${ticket}`, card: { waitsFor: [], zone: [`zone/${ticket}/`], problems: [], ...(requires.length === 0 ? {} : { requires }) } },
    });
  arriver(22, "La capture du formulaire", ["chrome-connecté", "code"]);
  // Le 86 que le runtime déclarait d'un ticket qu'aucune station ne peut cuisiner, écrit tel qu'il l'écrivait.
  journal.ajouter({ project: PARADE, ticket: 22, author: "runtime", type: "ticket.86", payload: { reason: "no-station: chrome-connecté", until: null } });
  arriver(23, "L'export du journal");
  arriver(24, "Le menu du soir");
  mettreEnAttente(journal, PARADE, 24, { quoi: "the client's written approval", qui: "the client" }, MAINTENANT);
  return { journal, json: () => JSON.stringify(faitsDuRuntime(lireEtat(journal, MAINTENANT), MAINTENANT)) };
}

// Le GitHub du runtime, réduit à ce que `rail human` touche : l'issue lue, ses labels, son commentaire.
const github = (): GitHub => ({ issue: async () => ({ body: CORPS }), labelliser: async () => {}, delabelliser: async () => {}, commenter: async () => {} }) as unknown as GitHub;

const demarrage = () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade" }] }, () => true),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});

async function ouvrir(): Promise<Jouee> {
  const vue = await jouerLaVue({
    demarrage,
    espace: () => [],
    service: () => guide(stations(["code"])),
    changerUneStation: () => ({ fait: "pc/claude saved; the other stations are unchanged" }),
    confierAUnHumain: () => ({ fait: "#22: a human's job, in TODO", detail: "" }),
  });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  for (let tour = 0; tour < 3; tour++) await repos();
  return vue;
}
const recevoir = (vue: Jouee, json: string) => {
  const recue = tenirFaits().recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: json }] });
  vue.dire("surFaits", { ...recue, demande: vue.dernier("faits")[0] as number });
};
const colonne = (vue: Jouee, nom: string): Faux => vue.element("rail").dessous("section").find((pose) => pose.className === "colonne" && pose.dessous("span")[0]?.textContent === nom) ?? assert.fail(`pas de colonne ${nom}`);
// Un bon, par son numéro : un bouton qui ouvre l'issue, ou un mot quand la box ne connaît pas son adresse.
const bon = (ou: Faux, ticket: number): Faux | undefined =>
  ou.dessous("li").find((pose) => pose.className === "bon" && [...pose.dessous("button"), ...pose.dessous("span")].some(({ className, textContent }) => className.split(" ").includes("ticket") && textContent === `#${ticket}`));
const sorties = (ou: Faux | undefined) => ou?.dessous("button").filter((pose) => pose.dataset.sortie !== undefined) ?? [];
const bouton = (ou: Faux, texte: string): Faux => ou.dessous("button").find((pose) => pose.textContent === texte) ?? assert.fail(`pas de bouton « ${texte} »`);
const cliquer = async (pose: Faux) => {
  pose.click();
  for (let tour = 0; tour < 3; tour++) await repos();
};

describe("la carte de WAITING d'un ticket qui attend une capacité", () => {
  test("deux sorties sur elle, la station recommandée ; aucune sur une carte de WAITING qui attend un tiers, ni sur une carte du rail", async (t) => {
    const vue = await ouvrir();
    recevoir(vue, runtime(t).json());

    const waiting = colonne(vue, "Waiting");
    const carte = bon(waiting, 22) ?? assert.fail("#22 n'est pas dans WAITING");
    assert.deepEqual(sorties(carte).map(({ textContent, className }) => [textContent, className]), [
      [DONNER, "recommande"],
      [HUMAIN, ""],
    ]);
    assert.deepEqual(sorties(bon(waiting, 24) ?? assert.fail("#24 n'est pas dans WAITING")), []);
    assert.deepEqual(sorties(bon(colonne(vue, "On the rail"), 23) ?? assert.fail("#23 n'est pas sur le rail")), []);
  });

  test("« Give it to a station » : les stations du projet, la première choisie ; un choix, une confirmation, et ce que la carte demande s'ajoute à la station choisie", async (t) => {
    const vue = await ouvrir();
    recevoir(vue, runtime(t).json());
    const carte = () => bon(colonne(vue, "Waiting"), 22) ?? assert.fail("#22 a quitté WAITING");

    await cliquer(bouton(carte(), DONNER));
    const radios = () => carte().dessous("input").filter(({ type }) => type === "radio");
    assert.deepEqual(radios().map(({ value, checked }) => [value, checked]), [
      ["box/claude", true],
      ["pc/claude", false],
    ]);
    // Le choix : pc/claude, qui ne fournit que `code`.
    radios()[1]?.declencher("change");
    await repos();
    assert.match(carte().dessous("p").find(({ className }) => className === "titre")?.textContent ?? "", /^Give #22 to pc\/claude\? It will provide chrome-connecté from now on\.$/);
    // La confirmation.
    await cliquer(bouton(carte(), "Give it to pc/claude"));

    assert.deepEqual(vue.dernier("changerUneStation"), [PARADE, "pc/claude", { cooks: 2, fournit: ["code", "chrome-connecté"] }]);
    assert.equal(carte().dessous("p").find(({ className }) => className === "fait")?.textContent, "pc/claude provides chrome-connecté and code: #22 goes back on the rail and leaves for it");
    assert.throws(() => vue.dernier("confierAUnHumain"), /n'a pas appelé/);
  });

  test("la station relue fournit la capacité : son formulaire, rouvert sur Cooks, la montre cochée", async (t) => {
    const vue = await ouvrir();
    recevoir(vue, runtime(t).json());
    // Ce que `changerUneStation` pousse après avoir relu les stations (service.ts, `relireLesStations`).
    vue.dire("surGuide", guide(stations(["code", "chrome-connecté"])));
    await ouvrirOnglet(vue, "Cooks");
    await cliquer(vue.element("rail").dessous("button").find((pose) => pose.className === "editer" && pose.ariaLabel === "edit pc/claude") ?? assert.fail("pas de « edit » pour pc/claude"));

    const forme = vue.element("rail").dessous("div").find(({ className, ariaLabel }) => className === "edition" && ariaLabel === "edit pc/claude") ?? assert.fail("le formulaire n'est pas ouvert");
    const cochees = forme.dessous("input").filter(({ type, checked }) => type === "checkbox" && checked).map(({ ariaLabel }) => ariaLabel);
    assert.deepEqual(cochees.sort(), ["chrome-connecté", "code"]);
  });

  test("« It's a human's job » : une confirmation, puis `rail human` ; la carte quitte WAITING pour TODO, tâche du chef, avec le titre, le contexte et les critères, et ne revient pas en WAITING", async (t) => {
    const vue = await ouvrir();
    const { journal, json } = runtime(t);
    recevoir(vue, json());
    const carte = () => bon(colonne(vue, "Waiting"), 22) ?? assert.fail("#22 a quitté WAITING");

    await cliquer(bouton(carte(), HUMAIN));
    assert.match(carte().dessous("p").find(({ className }) => className === "titre")?.textContent ?? "", /^Make #22 a human's job\? It leaves the rail and waits in TODO as a task for the chef/);
    await cliquer(bouton(carte(), "Send it to TODO"));
    assert.deepEqual(vue.dernier("confierAUnHumain"), [PARADE, 22]);

    // Ce que la box joue, puis relit.
    assert.equal((await confierAuRuntime(journal as Journal, github(), PARADE, 22)).done, true);
    recevoir(vue, json());

    assert.equal(bon(colonne(vue, "Waiting"), 22), undefined);
    const enTodo = bon(colonne(vue, "Todo"), 22) ?? assert.fail("#22 n'est pas dans TODO");
    // Hors du rail, la carte garde son titre : la tâche le donne.
    assert.equal(enTodo.dessous("strong")[0]?.textContent, "La capture du formulaire");
    const tache = enTodo.dessous("section").find(({ className }) => className === "tache-humaine") ?? assert.fail("pas de tâche sur la carte");
    const champ = tache.dessous("input")[0] ?? assert.fail("pas de champ");
    assert.equal(champ.value, "chef");
    assert.equal(tache.dessous("strong").find(({ className }) => className === "titre-tache")?.textContent, "La capture du formulaire");
    assert.equal(tache.dessous("p").find(({ className }) => className === "contexte-tache")?.textContent, "Capture the signed-in form.");
    assert.deepEqual(tache.dessous("ul")[0]?.dessous("li").map(({ textContent }) => textContent), ["the capture shows the form signed in"]);
    assert.match(tache.dessous("p").find(({ className }) => className === "manque-tache")?.textContent ?? "", /^No station provides chrome-connecté: this is the chef's task\.$/);
    // « reassign » attend qu'un autre nom soit tapé ; tapé, il part, d'un clic.
    assert.equal(bouton(tache, REASSIGNER).disabled, true);
    champ.value = "alice";
    champ.declencher("input");
    assert.equal(bouton(tache, REASSIGNER).disabled, false);
    await cliquer(bouton(tache, REASSIGNER));
    assert.deepEqual(vue.dernier("confierAUnHumain"), [PARADE, 22, "alice"]);
  });
});

describe("les modules de la carte, lus seuls", () => {
  const doc = { createElement: (balise: string) => new Faux(balise) };
  const rien = { ouvrir: () => {}, fermer: () => {}, choisir: () => {}, donner: () => {}, confier: () => {} };

  test("sans station lue, « Give it to a station » le dit en une ligne, sans liste", () => {
    const pose = poserSorties(doc, { ticket: 22, requiert: ["macos"], stations: undefined, etat: { ouverte: "station", envoi: false } }, rien) as Faux;
    assert.equal(pose.dessous("p").find(({ className }) => className === "vide")?.textContent, PAS_LUES);
    assert.equal(pose.dessous("input").length, 0);
  });

  test("un envoi en route : rien ne repart, ni les sorties, ni la confirmation", () => {
    const [box] = stations(["code"]).declarees;
    const pose = poserSorties(doc, { ticket: 22, requiert: ["macos"], stations: box === undefined ? [] : [box], etat: { ouverte: "station", envoi: true } }, rien) as Faux;
    assert.ok(pose.dessous("button").every(({ disabled }) => disabled));
  });

  test("une tâche sans contexte ni critère ne montre que ce qu'elle a", () => {
    const pose = poserTache(doc, { ticket: 22, tache: { assignee: "bob", missing: ["macos"], title: "T", context: "", criteria: [] }, etat: { envoi: false } }, { taper: () => {}, reassigner: () => {} }) as Faux;
    assert.deepEqual(pose.dessous("h5"), []);
    assert.equal(pose.dessous("input")[0]?.value, "bob");
  });

  test("ce que la station choisie doit fournir de plus : ce que la carte demande et qu'elle n'a pas", () => {
    const [, pc] = stations(["code"]).declarees;
    assert.deepEqual(aAjouter(["chrome-connecté", "code"], pc ?? assert.fail()), ["chrome-connecté"]);
  });

  test("`requiert` et `tache` se lisent de `facts` ; d'une autre forme, ils ne sont pas donnés", () => {
    assert.deepEqual(requisLus(["macos"]), { requiert: ["macos"] });
    assert.deepEqual(requisLus("macos"), {});
    assert.deepEqual(requisLus([]), {});
    assert.deepEqual(tacheLue({ assignee: "chef", missing: ["macos"], title: "T", context: "", criteria: [] }), { tache: { assignee: "chef", missing: ["macos"], title: "T", context: "", criteria: [] } });
    assert.deepEqual(tacheLue({ assignee: "chef" }), {});
    const lus = comprendre(JSON.stringify({ etat: "ouverte", lu: A, dernierTick: null, compteurs: { rail: 1, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, rail: [{ ticket: 22, etat: "WAITING", titre: "T", url: "https://x/22", requiert: ["macos"] }] }));
    assert.ok(!("informe" in lus));
    assert.deepEqual(lus.rail[0]?.requiert, ["macos"]);
  });
});

describe("« It's a human's job » part là où la cuisine tourne : `rail human`", () => {
  const LU = { nom: PARADE, cuisine: {} } as never;
  const rendu = (sortie: string, erreurs = "", code: number | null = null): Rendu => ({ lance: "$ node geste.ts parade rail human 22", erreur: code === null ? null : (Object.assign(new Error("exit"), { code }) as ExecFileException), sortie, erreurs });

  test("la commande : le chef sans nom, un mot sinon ; rien d'autre ne part", () => {
    assert.equal(commandeHumaine(22, undefined), "rail human 22");
    assert.equal(commandeHumaine(22, "chef"), "rail human 22");
    assert.equal(commandeHumaine(22, "@alice"), "rail human 22 alice");
    assert.ok(typeof commandeHumaine(22, "alice; rm -rf /") !== "string");
    assert.ok(typeof commandeHumaine("22", "alice") !== "string");
  });

  test("fait, la ligne du runtime sans son prix ; refusé, sa raison, le détail au survol ; sans cuisine, rien ne part", async () => {
    const lances: string[] = [];
    const fait = await confierAUnHumain(PARADE, LU, 22, "alice", async (_, commande) => (lances.push(commande), rendu("#22: a human's job, in TODO — cost: the ticket leaves the rail\n")));
    assert.deepEqual([lances, "fait" in fait && fait.fait], [["rail human 22 alice"], "#22: a human's job, in TODO"]);
    const refuse = await confierAUnHumain(PARADE, LU, 22, "", async () => rendu("", "brigade : #22 is not touched: #22 is already the chef's job — cost: none: nothing was changed\n", 1));
    assert.equal("refus" in refuse && refuse.refus, "nothing was changed: #22 is already the chef's job");
    assert.deepEqual(await confierAUnHumain(PARADE, undefined, 22, "", async () => assert.fail("rien ne part")), { refus: "nothing was sent: “parade” has no station — there is no command to run" });
  });
});

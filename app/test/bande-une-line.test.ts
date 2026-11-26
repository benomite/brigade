// Toute la bande d'alertes suit la même règle (#907) : une alerte tient en une ligne — ce qui ne va
// pas — et un contrôle — le geste qui le lève. Le prix de ce geste n'est pas posé à côté : la
// confirmation, au clic, le dit. Ce que la box en écrit, mot pour mot, est derrière « detail ». Et l'espace
// n'a qu'un interrupteur, celui du projet (#1406).
// La bande est celle que le process principal dirait (alerts.ts), d'après des sorties de `status`
// telles que le runtime les écrit ; la vue est jouée telle qu'elle est, devant un faux document.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { holdBandes, type Bande } from "../src/alerts.ts";
import { ALLUMAGE } from "../src/allumage.ts";
import { mettreAPart } from "../src/awaiting.ts";
import { pourLaBar } from "../src/bar.ts";
import type { Read } from "../src/box.ts";
import { EXEMPLE, type Project } from "../src/config.ts";
import type { Kitchen } from "../src/box.ts";
import { confirmationDe } from "../src/confirmation.ts";
import { PALETTE } from "../src/couleurs.ts";
import { KITCHEN_ACTIONS } from "../src/kitchen.ts";
import { BANNIERE, type Facts } from "../src/facts.ts";
import { CONFIRMES, DIRECTS } from "../src/actions.ts";
import { EFFORTS, MODELES } from "../src/projects/projects.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import { type Faux, type Jouee, jouerLaVue, type Answers, repos } from "./aides/fausse-vue.ts";

const A = "2026-10-13T10:00:01.000Z";
const KITCHEN: Kitchen = { locale: { node: "node", runtime: "/runtime", racine: "/station", env: {} } };
const PARADE: Project = { nom: "parade", dossier: "/tmp/parade" };
const read = (command: string, texte: string): Read => ({ projet: "parade", demande: 1, a: A, sorties: [{ commande: command, texte }] });

// Les lignes de tête de `status` (runtime/src/etat.ts, `decrireEtat`), mot pour mot.
const CONNECTION = "connexion  Max DÉCONNECTÉE depuis 18 min sur box/claude — plus aucun ticket n'est pris : `claude /login` sous le compte du service";
const BASE_RED = "base       ROUGE depuis 1 h 10 sur abc1234 — la station ne prend plus de ticket, la pass ne juge ni ne merge";
const GRANT_D_AVANT = "grant      merge ACTIF, BIENTÔT ÉTEINT : encore 30 min — une pass verte est mergée sans toi";
const statusAvec = (...tetes: string[]) => ["projet     parade", "cuisine    ouverte", ...tetes, "", "rail       vide", ""].join("\n");
const valeur = (line: string) => line.slice(11);

// `manager`, tel que le runtime l'écrit, allumé par le chef (runtime/src/manager-cli.ts).
const MANAGER_ALLUME = "manager               ALLUMÉ depuis le 2026-10-13T09:25:21.838Z (par chef) — il juge les issues ouvertes, pose `fire` et le calibrage\n";

const FACTS: Facts = {
  etat: "retenue",
  lu: A,
  dernierTick: A,
  compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 },
  dernierEvenement: null,
  rail: [],
  cooks: [],
  attend: [],
};

// La bande que le process principal dirait : `facts`, `status` (sans lui, rien n'est lu) et `manager` lus.
// `etat` : celui de la cuisine dans `facts` — retenue, ce qui la retient fait ses lignes.
function bandeLue(status?: string, state: Facts["etat"] = "retenue"): Bande {
  const bandes = holdBandes({ etablir: 1, minimum: 0 });
  bandes.ouvrir(["parade"]);
  bandes.faits(read("facts", JSON.stringify({ ...FACTS, etat: state })));
  if (status !== undefined) bandes.status(mettreAPart(read("status", status)));
  return bandes.manager(read("manager", MANAGER_ALLUME));
}

async function ouvrir(answers: Answers = {}): Promise<Jouee> {
  const vue = await jouerLaVue({
    demarrage: () => ({
      configuration: pourLaBar({ chemin: "/tmp/app.json", projets: [PARADE] }, () => true),
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
    confirmer: (_, id) => confirmationDe(id, PARADE, { sans: "pas lus" }, KITCHEN),
    geste: () => undefined,
    ...answers,
  });
  vue.element("projets").children[1]?.click();
  await repos();
  return vue;
}

const lines = (vue: Jouee) => vue.element("alertes").children;
const lineDe = (vue: Jouee, debut: string): Faux => lines(vue).find((line) => line.children[0]?.textContent.includes(debut)) ?? assert.fail(`pas de ligne « ${debut} »`);
// Les boutons d'une ligne de la bande, hors survols : son contrôle, et « detail ».
const boutonsDe = (line: Faux) => (line.children[0]?.children ?? []).filter(({ balise }) => balise === "button");
const controleDe = (line: Faux) => boutonsDe(line).find(({ className }) => className !== "detail") ?? assert.fail("pas de contrôle");
const detailDe = (line: Faux) => boutonsDe(line).find(({ className }) => className === "detail") ?? assert.fail("pas de « detail »");
const confirmationDe_ = (line: Faux) => line.children.find(({ className }) => className === "confirmation");
const bascule = (vue: Jouee, id: string): Faux => vue.element(id).dessous("button").find(({ className }) => className === "bascule") ?? assert.fail(`pas d'interrupteur dans #${id}`);
const callsDe = (vue: Jouee, ...actions: string[]) => vue.appels.filter(({ geste: action }) => actions.includes(action)).map(({ geste: action, args }) => [action, ...args]);

describe("une alerte : une ligne, un contrôle", () => {
  test("chaque ligne de la bande tient en une ligne — sa pastille, ce qui ne va pas, « detail », son contrôle — sans phrase de plus, ni sortie brute, ni prix", async () => {
    const vue = await ouvrir();
    vue.dire("surAlertes", bandeLue(statusAvec(CONNECTION, BASE_RED)));
    await repos();

    assert.deepEqual(
      lines(vue).map((line) => line.children[0]?.children.find(({ balise }) => balise === "strong")?.textContent),
      ["Max connection down: no ticket is taken any more", "base red: the station takes no more tickets, the pass neither judges nor merges"],
    );
    for (const line of lines(vue)) {
      // Un seul enfant : la ligne. Rien dessous tant que le chef ne déplie ni ne clique.
      assert.deepEqual(line.children.map(({ balise, className }) => `${balise}.${className}`), ["p.ligne"]);
      // Un contrôle, et « detail » : aucun autre bouton, aucun survol de prix à côté.
      assert.deepEqual(boutonsDe(line).map(({ className }) => className === "detail"), [true, false]);
      assert.deepEqual(line.dessous("button").filter(({ className }) => className === "aide"), []);
      assert.deepEqual(line.dessous("pre"), []);
    }
    const ecrit = vue.element("alertes").textContent;
    assert.doesNotMatch(ecrit, /DÉCONNECTÉE|ROUGE|abc1234|claude \/login/, "la sortie brute de la box est dans la bande");
    assert.doesNotMatch(ecrit, /start again|interrupted|replayed/, "un prix est posé dans la bande");
  });

  test("« detail » déplie, dessous, ce que la ligne sait de plus — la box mot pour mot, jamais le geste à recopier ; une relecture ne le replie pas, un second clic si", async () => {
    const vue = await ouvrir();
    const lue = bandeLue(statusAvec(CONNECTION, BASE_RED));
    vue.dire("surAlertes", lue);
    await repos();

    const deplier = detailDe(lineDe(vue, "base red"));
    assert.equal(deplier.textContent, "detail");
    assert.equal(deplier.ariaExpanded, "false");
    deplier.click();
    const base = lineDe(vue, "base red");
    assert.equal(detailDe(base).ariaExpanded, "true");
    const detail = base.children.find(({ className }) => className === "detail") ?? assert.fail("rien de déplié");
    assert.deepEqual(detail.dessous("pre").map(({ textContent }) => textContent), [valeur(BASE_RED)]);
    // Le geste n'y est pas : le seul geste montré est le bouton de la ligne (règle #830).
    assert.doesNotMatch(detail.textContent, /to lift it|clear what makes it red|replay its gates/);
    // Le prix n'est pas dans le détail non plus : c'est la confirmation qui le dit.
    assert.doesNotMatch(detail.textContent, /replayed/);
    // L'autre ligne reste repliée.
    assert.equal(lineDe(vue, "Max connection").children.length, 1);

    // La bande relue — la même, ou une autre lecture : le détail reste ouvert.
    vue.dire("surAlertes", { ...lue, alertes: [...lue.alertes] });
    await repos();
    assert.equal(lineDe(vue, "base red").children.length, 2);

    detailDe(lineDe(vue, "base red")).click();
    assert.equal(lineDe(vue, "base red").children.length, 1);

    // La connexion Max : son détail dit ce que la box en écrit, sans la commande qui la rétablit (règle #830).
    detailDe(lineDe(vue, "Max connection")).click();
    const connection = lineDe(vue, "Max connection").children.find(({ className }) => className === "detail") ?? assert.fail("rien de déplié");
    assert.deepEqual(connection.dessous("pre").map(({ textContent }) => textContent), ["Max DÉCONNECTÉE depuis 18 min sur box/claude — plus aucun ticket n'est pris"]);
    assert.doesNotMatch(connection.textContent, /claude \/login|to lift it/);
  });
});

describe("le prix est dans la confirmation, au clic", () => {
  test("une demande au second dont le geste coûte : le clic ouvre la confirmation, qui dit son prix en une ligne ; le « oui » écrit la demande, sans l'envoyer", async () => {
    const vue = await ouvrir({ demanderAlerte: () => ({ id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "écrit", arrete: false }) });
    vue.dire("surAlertes", bandeLue(statusAvec(BASE_RED)));
    await repos();

    const controle = controleDe(lineDe(vue, "base red"));
    assert.equal(controle.textContent, "ask the second…");
    controle.click();
    await repos();
    assert.deepEqual(callsDe(vue, "demanderAlerte", "geste", "confirmer"), [], "rien ne part avant le « oui »");
    const ouverte = confirmationDe_(lineDe(vue, "base red")) ?? assert.fail("pas de confirmation sous la ligne");
    assert.equal(ouverte.dessous("p").find(({ className }) => className === "titre")?.textContent, "⚠️ ask the second to lift it");
    const prix = ouverte.dessous("p").filter(({ className }) => className === "prix");
    assert.deepEqual(prix.map(({ textContent }) => textContent), ["no cook is interrupted: its gates are replayed?"]);

    (ouverte.dessous("button").find(({ dataset }) => dataset.oui !== undefined) ?? assert.fail("pas de « oui »")).click();
    await repos();
    assert.deepEqual(callsDe(vue, "demanderAlerte", "geste"), [["demanderAlerte", "parade", "cuisine", "base red: the station takes no more tickets, the pass neither judges nor merges"]]);
    assert.equal(confirmationDe_(lineDe(vue, "base red")), undefined);
  });

  test("« non » referme sans rien écrire ; recliqué, le contrôle la referme aussi", async () => {
    const vue = await ouvrir();
    vue.dire("surAlertes", bandeLue(statusAvec(BASE_RED)));
    await repos();

    controleDe(lineDe(vue, "base red")).click();
    const non = confirmationDe_(lineDe(vue, "base red"))?.dessous("button").find(({ textContent }) => textContent === "no, write nothing") ?? assert.fail("pas de « non »");
    non.click();
    assert.equal(confirmationDe_(lineDe(vue, "base red")), undefined);
    controleDe(lineDe(vue, "base red")).click();
    assert.notEqual(confirmationDe_(lineDe(vue, "base red")), undefined);
    assert.equal(controleDe(lineDe(vue, "base red")).ariaExpanded, "true");
    controleDe(lineDe(vue, "base red")).click();
    assert.equal(confirmationDe_(lineDe(vue, "base red")), undefined);
    assert.deepEqual(callsDe(vue, "demanderAlerte", "geste"), []);
  });

  test("une demande dont le geste ne coûte rien s'écrit au clic, sans confirmation", async () => {
    const vue = await ouvrir({ demanderAlerte: () => undefined });
    const lue = bandeLue(statusAvec());
    vue.dire("surAlertes", { ...lue, alertes: [{ sujet: "station", verifie: true, ton: "rouge", dit: "station “box” missing", geste: "put `claude` back on the box", bouton: "ask the second", appel: { demande: true }, prix: "none for the kitchen: it is done on the box itself" }] });
    await repos();

    const controle = controleDe(lineDe(vue, "station"));
    assert.equal(controle.textContent, "ask the second");
    controle.click();
    await repos();
    assert.deepEqual(callsDe(vue, "demanderAlerte"), [["demanderAlerte", "parade", "station", "station “box” missing"]]);
    assert.equal(confirmationDe_(lineDe(vue, "station")), undefined);
  });
});

// Un seul interrupteur pour tout le projet (#1406). Le grant `merge` n'existe plus : une ligne `grant` de `status`,
// que le runtime n'écrit plus, ne dit rien de plus.
describe("l'espace n'a qu'un interrupteur", () => {
  test("la bande ne porte que l'état du projet, et l'espace n'a que l'interrupteur du projet", async () => {
    assert.equal("merge" in bandeLue(statusAvec(), "ouverte"), false);
    const vue = await ouvrir();
    vue.dire("surAlertes", bandeLue(statusAvec(), "ouverte"));
    await repos();

    assert.throws(() => vue.element("interrupteur-merge"), /aucun élément/);
    assert.throws(() => vue.element("interrupteur-manager"), /aucun élément/);
    const interrupteurs = vue.poses().filter(({ className }) => className === "interrupteur-de-tete");
    assert.deepEqual(interrupteurs.map(({ id }) => id), ["interrupteur-projet"]);
    assert.equal(bascule(vue, "interrupteur-projet").textContent, "project on");
  });

  test("une ligne `grant` d'avant, dans `status`, ne fait ni ligne de bande ni interrupteur", async () => {
    const vue = await ouvrir();
    vue.dire("surAlertes", bandeLue(statusAvec(GRANT_D_AVANT), "ouverte"));
    await repos();
    assert.equal(vue.element("alertes").hidden, true);
    assert.throws(() => vue.element("interrupteur-merge"), /aucun élément/);
  });
});

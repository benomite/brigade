// Lancer un nettoyage depuis la partie closer (vue/closer/lancement/lancement.js, #991) : le bouton
// ouvre une confirmation qui dit ce que ça coûte et ce que le closer va faire, et rien ne part sans le
// « oui » du chef ; demandée, la place dit où en est la demande — en attente et de quoi, en cours,
// refusée et pourquoi, finie — et, tant qu'elle n'est pas partie, l'annule. Le module est lu seul,
// sur un faux document, puis la vue jouée telle qu'elle est (aides/fausse-vue.ts), sous Settings → Closer.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../../../src/allumage.ts";
import { pourLaBarre } from "../../../src/barre.ts";
import type { Lecture } from "../../../src/box.ts";
import { BOUTONS } from "../../../src/boutons.ts";
import type { Rendu } from "../../../src/closer-lancement.ts";
import { EXEMPLE } from "../../../src/config.ts";
import { PALETTE } from "../../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../../src/cuisine.ts";
import { BANNIERE } from "../../../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../../../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../../../src/grants.ts";
import { GESTES_DU_MANAGER } from "../../../src/manager.ts";
import { ONGLETS, RUBRIQUES } from "../../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../../src/projets/projets.ts";
import {
  ANNULER,
  apresRendu,
  EN_ATTENTE,
  EN_COURS,
  FERA,
  FINIE,
  LANCER,
  LIT_L_APERCU,
  lireLancement,
  NON,
  OUI,
  poserLancement,
  REFUSEE,
  RELECTURE,
  REPOS,
  TITRE,
  type Etat,
} from "../../../src/vue/closer/lancement/lancement.js";
import { COMMANDE } from "../../../src/vue/closer/section.js";
import { Faux, jouerLaVue, ouvrirLecture, repos } from "../../aides/fausse-vue.ts";
import { APERCU, DEMANDES, lue, SANS_CLOSER } from "./donnees.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const A = "2026-10-19T12:00:00.000Z";
const quand = (instant: string) => new Date(instant).toLocaleString("en-US");

// --- Le module seul -------------------------------------------------------------------

const appels: string[] = [];
const GESTES = {
  lancer: () => void appels.push("lancer"),
  confirmer: () => void appels.push("confirmer"),
  renoncer: () => void appels.push("renoncer"),
  annuler: () => void appels.push("annuler"),
};
const poser = (request: unknown, etat: Etat = REPOS) => {
  const lu = lireLancement(lue(request)) ?? assert.fail("pas de lancement lu");
  const racine = new Faux("div");
  racine.append(...poserLancement(doc, lu, etat, GESTES));
  return racine;
};
const bouton = (racine: Faux, texte: string) => racine.dessous("button").find(({ textContent }) => textContent === texte);
const etat = (racine: Faux) => racine.dessous("p").find(({ className }) => className.split(" ")[0] === "etat");

describe("la place du lancement, lue seule", () => {
  test("sans demande : le bouton recommandé, son prix au survol, aucune ligne d'état", () => {
    const racine = poser(DEMANDES.none);
    const lancer = bouton(racine, LANCER) ?? assert.fail("pas de bouton");
    assert.equal(lancer.className, "recommande");
    assert.equal(lancer.disabled, false);
    assert.equal(etat(racine), undefined);
    // Le prix n'est pas écrit sous le bouton : il est au survol, à côté.
    const aide = racine.dessous("button").find(({ className }) => className === "aide") ?? assert.fail("pas de survol");
    assert.match(aide.ariaLabel, /sonnet \/ medium · 500,000 tokens at most · 500 lines removed at most/);
    assert.doesNotMatch(racine.textContent, /500,000/);
    appels.length = 0;
    lancer.click();
    assert.deepEqual(appels, ["lancer"]);
  });

  test("sans closer réglé, il n'y a pas de lancement à poser", () => {
    assert.equal(lireLancement(SANS_CLOSER), undefined);
    assert.equal(lireLancement({ erreur: "x" }), undefined);
    // Un runtime qui ne dit pas la demande : « none », rien n'est deviné.
    const { request: _, ...sansDemande } = lue(DEMANDES.none);
    assert.deepEqual(lireLancement(sansDemande)?.demande, { state: "none" });
  });

  test("l'aperçu en route : le bouton ne s'appuie plus, une ligne le dit", () => {
    const racine = poser(DEMANDES.none, { etape: "apercu" });
    assert.equal(bouton(racine, LANCER)?.disabled, true);
    assert.equal(etat(racine)?.textContent, LIT_L_APERCU);
  });

  test("la confirmation dit le prix en une ligne, ce que le closer va faire, et ce que deviendrait la demande", () => {
    const racine = poser(DEMANDES.none, { etape: "confirmer", apercu: APERCU });
    const confirmation = racine.dessous("section").find(({ className }) => className === "confirmation") ?? assert.fail("pas de confirmation");
    const [titre, prix] = confirmation.children;
    assert.equal(titre?.textContent, TITRE);
    assert.equal(prix?.className, "prix");
    assert.equal(prix?.textContent, "closer on sonnet / medium · starts under 1 cook in flight · 500,000 tokens at most · 500 lines removed at most");
    assert.equal(confirmation.dessous("p").filter(({ className }) => className === "prix").length, 1);
    assert.ok(confirmation.dessous("p").some(({ textContent }) => textContent === FERA));
    assert.deepEqual(confirmation.dessous("li").map(({ textContent }) => textContent), APERCU.does);
    const maintenant = confirmation.dessous("p").find(({ className }) => className === "maintenant") ?? assert.fail("pas de ligne");
    assert.equal(maintenant.children[0]?.textContent, "a request would leave within the second");
    // Le « oui » se distingue ; les deux réponses sont en bas, côte à côte, après ce qu'elles engagent.
    const reponses = confirmation.children.at(-1) ?? assert.fail("pas de réponses");
    assert.equal(reponses.className, "reponses");
    const [oui, non] = reponses.children;
    assert.deepEqual([oui?.textContent, oui?.className, oui?.disabled, non?.textContent], [OUI, "recommande", false, NON]);
    appels.length = 0;
    non?.click();
    oui?.click();
    assert.deepEqual(appels, ["renoncer", "confirmer"]);
  });

  test("une demande qui serait refusée, ou qui l'est déjà, n'a pas de « oui » : la ligne dit pourquoi", () => {
    for (const outcome of ["refused", "impossible", "already-requested"] as const) {
      const apercu = { ...APERCU, ifRequested: { outcome, reason: null, text: `a request would be refused, nothing would start — nothing to tidy up` } };
      const racine = poser(DEMANDES.none, { etape: "confirmer", apercu });
      assert.equal(bouton(racine, OUI)?.disabled, true, outcome);
      assert.ok(racine.dessous("p").some(({ className }) => className === "maintenant ferme"), outcome);
    }
    const sansCloser = poser(DEMANDES.none, { etape: "confirmer", apercu: { ...APERCU, configured: false, cost: null } });
    assert.equal(bouton(sansCloser, OUI)?.disabled, true);
  });

  test("en attente, et de quoi : la tête de la raison se lit, elle entière au survol — et le bouton d'annulation", () => {
    const racine = poser(DEMANDES.waiting);
    const ligne = etat(racine) ?? assert.fail("pas d'état");
    assert.equal(ligne.className, "etat retenue");
    assert.equal(ligne.children[0]?.textContent, `${EN_ATTENTE}: start condition not met: 3 cooks in flight for a threshold of 1`);
    assert.match(ligne.dessous("button")[0]?.ariaLabel ?? "", /rail is empty/);
    assert.ok(bouton(racine, ANNULER));
    assert.equal(bouton(racine, LANCER), undefined, "une demande à la fois");
    appels.length = 0;
    bouton(racine, ANNULER)?.click();
    assert.deepEqual(appels, ["annuler"]);
    // Plus rien ne la retient : elle part au prochain réveil — encore annulable.
    const part = poser(DEMANDES.leaves);
    assert.match(etat(part)?.textContent ?? "", /leaves at the runtime's next wake-up/);
    assert.ok(bouton(part, ANNULER));
  });

  test("en cours : la ligne, et plus aucun bouton — ni annuler, ni lancer", () => {
    const racine = poser(DEMANDES.running);
    const ligne = etat(racine) ?? assert.fail("pas d'état");
    assert.equal(ligne.className, "etat cours");
    assert.equal(ligne.children[0]?.textContent, `${EN_COURS} — since ${quand(DEMANDES.running.since)}`);
    assert.deepEqual(racine.dessous("button").filter(({ className }) => className !== "aide"), []);
  });

  test("refusée et pourquoi, finie : la ligne, et le bouton qui relance", () => {
    const refusee = poser(DEMANDES.refused);
    assert.equal(etat(refusee)?.className, "etat refusee");
    assert.equal(etat(refusee)?.children[0]?.textContent, `${REFUSEE} on ${quand(DEMANDES.refused.at)}: nothing to tidy up`);
    assert.ok(bouton(refusee, LANCER));
    const finie = poser(DEMANDES.done);
    assert.equal(etat(finie)?.className, "etat finie");
    assert.equal(etat(finie)?.children[0]?.textContent, `${FINIE} on ${quand(DEMANDES.done.at)}`);
    assert.ok(bouton(finie, LANCER));
    assert.equal(bouton(finie, ANNULER), undefined);
  });

  test("annulée : la place est celle d'avant toute demande", () => {
    assert.deepEqual(poser(DEMANDES.cancelled).children.map(({ textContent }) => textContent), poser(DEMANDES.none).children.map(({ textContent }) => textContent));
  });

  test("aucune commande ni code de sortie à l'écran, dans aucun état", () => {
    const etats: [unknown, Etat][] = [
      ...Object.values(DEMANDES).map((demande): [unknown, Etat] => [demande, REPOS]),
      [DEMANDES.none, { etape: "confirmer", apercu: APERCU }],
      [DEMANDES.none, { etape: "refus", dit: "the station could not be asked — not reached", detail: "$ ssh -o BatchMode=yes -- box brigade parade closing preview --json\n→ exit code 255" }],
    ];
    for (const [demande, etape] of etats) assert.doesNotMatch(poser(demande, etape).textContent, /ssh|brigade|exit code|`/);
  });
});

describe("ce que la box a rendu, et l'étape qui suit", () => {
  test("l'aperçu ouvre la confirmation ; demandée ou retirée, la place attend la relecture", () => {
    assert.deepEqual(apresRendu("apercu", { apercu: APERCU }), { etape: "confirmer", apercu: APERCU });
    assert.deepEqual(apresRendu("lancer", { demandee: { outcome: "requested", waits: null, text: "…" } }), { etape: "relecture", dit: "the cleanup is requested" });
    assert.deepEqual(apresRendu("lancer", { demandee: { outcome: "refused", reason: { reason: "nothing", observed: null, limit: null, detail: null }, text: "…" } }), { etape: "relecture", dit: "the cleanup was refused" });
    assert.deepEqual(apresRendu("annuler", { retiree: { outcome: "cancelled", since: A, text: "…" } }), { etape: "relecture", dit: "the cleanup is cancelled" });
    assert.deepEqual(apresRendu("annuler", { retiree: { outcome: "refused", run: "closing-1", text: "…" } }), { etape: "relecture", dit: "the cleanup has already left: it cannot be cancelled" });
  });

  test("ce qui n'a rien écrit reste un refus, en une ligne, le détail à part", () => {
    assert.deepEqual(apresRendu("apercu", { refus: "the station could not be asked — not reached", detail: "→ exit code 255" }), { etape: "refus", dit: "the station could not be asked — not reached", detail: "→ exit code 255" });
    const impossible = apresRendu("lancer", { demandee: { outcome: "impossible", text: "no runtime is running on this project: the closing pass is not requested — nothing would start it" } });
    assert.deepEqual(impossible, { etape: "refus", dit: "the cleanup was not requested — no runtime is running on this project: the closing pass is not requested", detail: "no runtime is running on this project: the closing pass is not requested — nothing would start it" });
  });
});

// --- La vue jouée ----------------------------------------------------------------------

const lecture = (objet: unknown, demande: number): Lecture => ({ projet: "parade", demande, a: A, sorties: [{ commande: COMMANDE, texte: `${JSON.stringify(objet)}\n` }] });

async function ouvrir(closer: (action: string) => Rendu | undefined) {
  const vue = await jouerLaVue({
    demarrage: () => ({
      configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade", box: { hote: "box" } }], hotes: ["box"] }),
      palette: PALETTE,
      exemple: EXEMPLE,
      onglets: ONGLETS,
      rubriques: RUBRIQUES,
      boutons: BOUTONS,
      gestes: { manager: GESTES_DU_MANAGER, allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
      banniere: BANNIERE,
      calibrage: { modeles: MODELES, efforts: EFFORTS },
      code: undefined,
    }),
    espace: () => [],
    closer: (_projet, action) => closer(action),
  });
  (vue.element("projets").children.at(1) ?? assert.fail("pas de case parade")).click();
  await repos();
  await ouvrirLecture(vue, "Closer");
  const page = vue.element("closer");
  const demande = () => (vue.dernier("onglet") as [string, string, number])[2];
  const dire = async (request: unknown) => {
    vue.dire("surContenu", lecture(lue(request), demande()), undefined, undefined);
    await repos();
  };
  const place = () => page.children.find(({ className }) => className === "closer-lancement") ?? assert.fail("pas de place du lancement");
  const gestes = () => vue.appels.filter(({ geste }) => geste === "closer").map(({ args }) => args);
  const cliquer = async (texte: string) => {
    (place().dessous("button").find(({ textContent }) => textContent === texte) ?? assert.fail(`pas de « ${texte} »`)).click();
    await repos();
  };
  return { vue, page, demande, dire, place, gestes, cliquer };
}

describe("le lancement, dans la partie closer du projet", () => {
  test("le bouton ouvre la confirmation, d'après l'aperçu ; « no » la ferme, et aucune demande ne part", async () => {
    const { dire, place, gestes, cliquer } = await ouvrir((action) => (action === "apercu" ? { apercu: APERCU } : assert.fail(`${action} ne devait pas partir`)));
    await dire(DEMANDES.none);
    await cliquer(LANCER);
    assert.deepEqual(gestes(), [["parade", "apercu"]]);
    const confirmation = place().dessous("section")[0] ?? assert.fail("pas de confirmation");
    assert.match(confirmation.textContent, /500,000 tokens at most/);
    assert.match(confirmation.textContent, /it opens one PR, handed to the pass/);
    await cliquer(NON);
    assert.deepEqual(place().dessous("section"), []);
    assert.ok(place().dessous("button").some(({ textContent }) => textContent === LANCER));
    // Seul l'aperçu est parti : ni demande, ni annulation.
    assert.deepEqual(gestes(), [["parade", "apercu"]]);
  });

  test("« yes » envoie une demande, une seule, avec le « oui » ; la relecture montre où elle en est", async () => {
    const { dire, place, gestes, cliquer, demande } = await ouvrir((action) =>
      action === "apercu" ? { apercu: APERCU } : action === "lancer" ? { demandee: { outcome: "requested", waits: null, text: "closing pass requested" } } : undefined,
    );
    await dire(DEMANDES.none);
    await cliquer(LANCER);
    const avant = demande();
    await cliquer(OUI);
    assert.deepEqual(gestes(), [["parade", "apercu"], ["parade", "lancer", true]]);
    // L'onglet est relu tout de suite ; en attendant, la place dit ce qui est fait, sans bouton.
    assert.equal(demande(), avant + 1);
    assert.equal(place().textContent, `the cleanup is requested — ${RELECTURE}`);
    assert.deepEqual(place().dessous("button"), []);
    // La lecture qui suit le geste le montre : la demande attend, et s'annule.
    await dire(DEMANDES.waiting);
    assert.match(place().textContent, new RegExp(`^${EN_ATTENTE}: start condition not met`));
    assert.ok(place().dessous("button").some(({ textContent }) => textContent === ANNULER));
    assert.equal(gestes().filter(([, action]) => action === "lancer").length, 1);
  });

  test("annuler la demande qui attend : la place revient à « rien de demandé » ; partie, plus d'annulation", async () => {
    const { dire, place, gestes, cliquer } = await ouvrir((action) => (action === "annuler" ? { retiree: { outcome: "cancelled", since: A, text: "withdrawn" } } : undefined));
    await dire(DEMANDES.waiting);
    await cliquer(ANNULER);
    assert.deepEqual(gestes(), [["parade", "annuler"]]);
    assert.equal(place().textContent, `the cleanup is cancelled — ${RELECTURE}`);
    await dire(DEMANDES.cancelled);
    assert.deepEqual(place().dessous("button").filter(({ className }) => className !== "aide").map(({ textContent }) => textContent), [LANCER]);
    await dire(DEMANDES.running);
    assert.deepEqual(place().dessous("button").filter(({ className }) => className !== "aide"), []);
    assert.match(place().textContent, new RegExp(`^${EN_COURS}`));
  });

  test("une box qui ne répond pas à l'aperçu : une ligne, son détail au survol, et le bouton reste", async () => {
    const { dire, place, cliquer } = await ouvrir(() => ({ refus: "the station could not be asked — not reached", detail: "$ ssh box\n→ exit code 255" }));
    await dire(DEMANDES.none);
    await cliquer(LANCER);
    assert.deepEqual(place().dessous("section"), []);
    const ligne = place().dessous("p").find(({ className }) => className === "etat indisponible") ?? assert.fail("pas de ligne");
    assert.equal(ligne.children[0]?.textContent, "the station could not be asked — not reached");
    assert.doesNotMatch(place().textContent, /ssh|exit code/);
    assert.ok(place().dessous("button").some(({ textContent }) => textContent === LANCER));
  });

  test("sans closer réglé : aucun bouton de lancement", async () => {
    const { vue, page, demande } = await ouvrir(() => undefined);
    vue.dire("surContenu", lecture(SANS_CLOSER, demande()), undefined, undefined);
    await repos();
    assert.equal(page.children.find(({ className }) => className === "closer-lancement"), undefined);
    assert.equal(page.dessous("button").find(({ textContent }) => textContent === LANCER), undefined);
  });
});

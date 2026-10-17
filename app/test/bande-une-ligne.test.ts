// Toute la bande d'alertes suit la même règle (#907) : une alerte tient en une ligne — ce qui ne va
// pas — et un contrôle — le geste qui le lève. Le prix de ce geste n'est pas posé à côté : la
// confirmation, au clic, le dit. Ce que la box en écrit, mot pour mot, est derrière « detail ». Et le
// grant `merge`, qui s'allume et s'éteint, est un interrupteur — le même que celui du manager (#906).
// La bande est celle que le process principal dirait (alertes.ts), d'après des sorties de `status`
// telles que le runtime les écrit ; la vue est jouée telle qu'elle est, devant un faux document.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { etatDuMerge, tenirBandes, type Bande } from "../src/alertes.ts";
import { ALLUMAGE } from "../src/allumage.ts";
import { mettreAPart } from "../src/attend.ts";
import { pourLaBarre } from "../src/barre.ts";
import { BOUTONS } from "../src/boutons.ts";
import type { Lecture } from "../src/box.ts";
import { EXEMPLE, type Projet } from "../src/config.ts";
import { confirmationDe } from "../src/confirmation.ts";
import { PALETTE } from "../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../src/cuisine.ts";
import { BANNIERE, type Faits } from "../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../src/grants.ts";
import { EFFORTS, MODELES } from "../src/installation.ts";
import { GESTES_DU_MANAGER } from "../src/manager.ts";
import { ONGLETS, RUBRIQUES } from "../src/onglets.ts";
import { type Faux, type Jouee, jouerLaVue, type Reponses, repos } from "./aides/fausse-vue.ts";

const A = "2026-10-13T10:00:01.000Z";
const PARADE: Projet = { nom: "parade", dossier: "/tmp/parade", box: { hote: "box" } };
const lecture = (commande: string, texte: string): Lecture => ({ projet: "parade", demande: 1, a: A, sorties: [{ commande, texte }] });

// Les lignes de tête de `status` (runtime/src/etat.ts, `decrireEtat`), mot pour mot.
const CONNEXION = "connexion  Max DÉCONNECTÉE depuis 18 min sur box/claude — plus aucun ticket n'est pris : `claude /login` sous le compte du service";
const BASE_ROUGE = "base       ROUGE depuis 1 h 10 sur abc1234 — la station ne prend plus de ticket, la pass ne juge ni ne merge";
const MERGE_SEUL = "grant      merge ÉTEINT SEUL il y a 40 min — son échéance est passée : la pass s'arrête à la PR ouverte, plus rien n'est mergé sans toi";
const MERGE_ACTIF = "grant      merge ACTIF, sans échéance, depuis 2 h — une pass verte est mergée sans toi";
const MERGE_BIENTOT = "grant      merge ACTIF, BIENTÔT ÉTEINT : encore 30 min — une pass verte est mergée sans toi";
const statusAvec = (...tetes: string[]) => ["projet     parade", "cuisine    ouverte", ...tetes, "", "rail       vide", ""].join("\n");
const valeur = (ligne: string) => ligne.slice(11);

// `manager`, tel que le runtime l'écrit, allumé par le chef (runtime/src/manager-cli.ts).
const MANAGER_ALLUME = "manager               ALLUMÉ depuis le 2026-10-13T09:25:21.838Z (par chef) — il juge les issues ouvertes, pose `fire` et le calibrage\n";

const FAITS: Faits = {
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
function bandeLue(status?: string, etat: Faits["etat"] = "retenue"): Bande {
  const bandes = tenirBandes({ etablir: 1, minimum: 0 });
  bandes.ouvrir(["parade"]);
  bandes.faits(lecture("facts", JSON.stringify({ ...FAITS, etat })));
  if (status !== undefined) bandes.status(mettreAPart(lecture("status", status)));
  return bandes.manager(lecture("manager", MANAGER_ALLUME));
}

async function ouvrir(reponses: Reponses = {}): Promise<Jouee> {
  const vue = await jouerLaVue({
    demarrage: () => ({
      configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [PARADE], hotes: ["box"] }),
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
    confirmer: (_, id, grant) => confirmationDe(id, PARADE, { sans: "pas lus" }, grant),
    geste: () => undefined,
    ...reponses,
  });
  vue.element("projets").children[1]?.click();
  await repos();
  return vue;
}

const lignes = (vue: Jouee) => vue.element("alertes").children;
const ligneDe = (vue: Jouee, debut: string): Faux => lignes(vue).find((ligne) => ligne.children[0]?.textContent.includes(debut)) ?? assert.fail(`pas de ligne « ${debut} »`);
// Les boutons d'une ligne de la bande, hors survols : son contrôle, et « detail ».
const boutonsDe = (ligne: Faux) => (ligne.children[0]?.children ?? []).filter(({ balise }) => balise === "button");
const controleDe = (ligne: Faux) => boutonsDe(ligne).find(({ className }) => className !== "detail") ?? assert.fail("pas de contrôle");
const detailDe = (ligne: Faux) => boutonsDe(ligne).find(({ className }) => className === "detail") ?? assert.fail("pas de « detail »");
const confirmationDe_ = (ligne: Faux) => ligne.children.find(({ className }) => className === "confirmation");
const bascule = (vue: Jouee, id: string): Faux => vue.element(id).dessous("button").find(({ className }) => className === "bascule") ?? assert.fail(`pas d'interrupteur dans #${id}`);
const appelsDe = (vue: Jouee, ...gestes: string[]) => vue.appels.filter(({ geste }) => gestes.includes(geste)).map(({ geste, args }) => [geste, ...args]);

describe("une alerte : une ligne, un contrôle", () => {
  test("chaque ligne de la bande tient en une ligne — sa pastille, ce qui ne va pas, « detail », son contrôle — sans phrase de plus, ni sortie brute, ni prix", async () => {
    const vue = await ouvrir();
    vue.dire("surAlertes", bandeLue(statusAvec(CONNEXION, BASE_ROUGE, MERGE_BIENTOT)));
    await repos();

    assert.deepEqual(
      lignes(vue).map((ligne) => ligne.children[0]?.children.find(({ balise }) => balise === "strong")?.textContent),
      ["Max connection down: no ticket is taken any more", "base red: the station takes no more tickets, the pass neither judges nor merges", "grant `merge` expiring soon: then, the pass will stop at the open PR"],
    );
    for (const ligne of lignes(vue)) {
      // Un seul enfant : la ligne. Rien dessous tant que le chef ne déplie ni ne clique.
      assert.deepEqual(ligne.children.map(({ balise, className }) => `${balise}.${className}`), ["p.ligne"]);
      // Un contrôle, et « detail » : aucun autre bouton, aucun survol de prix à côté.
      assert.deepEqual(boutonsDe(ligne).map(({ className }) => className === "detail"), [true, false]);
      assert.deepEqual(ligne.dessous("button").filter(({ className }) => className === "aide"), []);
      assert.deepEqual(ligne.dessous("pre"), []);
    }
    const ecrit = vue.element("alertes").textContent;
    assert.doesNotMatch(ecrit, /DÉCONNECTÉE|ROUGE|abc1234|claude \/login|BIENTÔT/, "la sortie brute de la box est dans la bande");
    assert.doesNotMatch(ecrit, /start again|interrupted|replayed|merged without you/, "un prix est posé dans la bande");
  });

  test("« detail » déplie, dessous, ce que la ligne sait de plus — la box mot pour mot, jamais le geste à recopier ; une relecture ne le replie pas, un second clic si", async () => {
    const vue = await ouvrir();
    const lue = bandeLue(statusAvec(CONNEXION, BASE_ROUGE));
    vue.dire("surAlertes", lue);
    await repos();

    const deplier = detailDe(ligneDe(vue, "base red"));
    assert.equal(deplier.textContent, "detail");
    assert.equal(deplier.ariaExpanded, "false");
    deplier.click();
    const base = ligneDe(vue, "base red");
    assert.equal(detailDe(base).ariaExpanded, "true");
    const detail = base.children.find(({ className }) => className === "detail") ?? assert.fail("rien de déplié");
    assert.deepEqual(detail.dessous("pre").map(({ textContent }) => textContent), [valeur(BASE_ROUGE)]);
    // Le geste n'y est pas : le seul geste montré est le bouton de la ligne (règle #830).
    assert.doesNotMatch(detail.textContent, /to lift it|clear what makes it red|replay its gates/);
    // Le prix n'est pas dans le détail non plus : c'est la confirmation qui le dit.
    assert.doesNotMatch(detail.textContent, /replayed/);
    // L'autre ligne reste repliée.
    assert.equal(ligneDe(vue, "Max connection").children.length, 1);

    // La bande relue — la même, ou une autre lecture : le détail reste ouvert.
    vue.dire("surAlertes", { ...lue, alertes: [...lue.alertes] });
    await repos();
    assert.equal(ligneDe(vue, "base red").children.length, 2);

    detailDe(ligneDe(vue, "base red")).click();
    assert.equal(ligneDe(vue, "base red").children.length, 1);

    // La connexion Max : son détail dit ce que la box en écrit, sans la commande qui la rétablit (règle #830).
    detailDe(ligneDe(vue, "Max connection")).click();
    const connexion = ligneDe(vue, "Max connection").children.find(({ className }) => className === "detail") ?? assert.fail("rien de déplié");
    assert.deepEqual(connexion.dessous("pre").map(({ textContent }) => textContent), ["Max DÉCONNECTÉE depuis 18 min sur box/claude — plus aucun ticket n'est pris"]);
    assert.doesNotMatch(connexion.textContent, /claude \/login|to lift it/);
  });
});

describe("le prix est dans la confirmation, au clic", () => {
  test("une demande au second dont le geste coûte : le clic ouvre la confirmation, qui dit son prix en une ligne ; le « oui » écrit la demande, sans l'envoyer", async () => {
    const vue = await ouvrir({ demanderAlerte: () => ({ id: 1, projet: "parade", genre: "second", titre: "second · claude", note: "écrit", arrete: false }) });
    vue.dire("surAlertes", bandeLue(statusAvec(BASE_ROUGE)));
    await repos();

    const controle = controleDe(ligneDe(vue, "base red"));
    assert.equal(controle.textContent, "ask the second…");
    controle.click();
    await repos();
    assert.deepEqual(appelsDe(vue, "demanderAlerte", "geste", "confirmer"), [], "rien ne part avant le « oui »");
    const ouverte = confirmationDe_(ligneDe(vue, "base red")) ?? assert.fail("pas de confirmation sous la ligne");
    assert.equal(ouverte.dessous("strong")[0]?.textContent, "⚠️ ask the second to lift it");
    const prix = ouverte.dessous("p").filter(({ className }) => className === "prix");
    assert.deepEqual(prix.map(({ textContent }) => textContent), ["no cook is interrupted: its gates are replayed?"]);

    (ouverte.dessous("button").find(({ dataset }) => dataset.oui !== undefined) ?? assert.fail("pas de « oui »")).click();
    await repos();
    assert.deepEqual(appelsDe(vue, "demanderAlerte", "geste"), [["demanderAlerte", "parade", "cuisine", "base red: the station takes no more tickets, the pass neither judges nor merges"]]);
    assert.equal(confirmationDe_(ligneDe(vue, "base red")), undefined);
  });

  test("« non » referme sans rien écrire ; recliqué, le contrôle la referme aussi", async () => {
    const vue = await ouvrir();
    vue.dire("surAlertes", bandeLue(statusAvec(BASE_ROUGE)));
    await repos();

    controleDe(ligneDe(vue, "base red")).click();
    const non = confirmationDe_(ligneDe(vue, "base red"))?.dessous("button").find(({ textContent }) => textContent === "no, write nothing") ?? assert.fail("pas de « non »");
    non.click();
    assert.equal(confirmationDe_(ligneDe(vue, "base red")), undefined);
    controleDe(ligneDe(vue, "base red")).click();
    assert.notEqual(confirmationDe_(ligneDe(vue, "base red")), undefined);
    assert.equal(controleDe(ligneDe(vue, "base red")).ariaExpanded, "true");
    controleDe(ligneDe(vue, "base red")).click();
    assert.equal(confirmationDe_(ligneDe(vue, "base red")), undefined);
    assert.deepEqual(appelsDe(vue, "demanderAlerte", "geste"), []);
  });

  test("une demande dont le geste ne coûte rien s'écrit au clic, sans confirmation", async () => {
    const vue = await ouvrir({ demanderAlerte: () => undefined });
    const lue = bandeLue(statusAvec());
    vue.dire("surAlertes", { ...lue, alertes: [{ sujet: "station", verifie: true, ton: "rouge", dit: "station “box” missing", geste: "put `claude` back on the box", bouton: "ask the second", appel: { demande: true }, prix: "none for the kitchen: it is done on the box itself" }] });
    await repos();

    const controle = controleDe(ligneDe(vue, "station"));
    assert.equal(controle.textContent, "ask the second");
    controle.click();
    await repos();
    assert.deepEqual(appelsDe(vue, "demanderAlerte"), [["demanderAlerte", "parade", "station", "station “box” missing"]]);
    assert.equal(confirmationDe_(ligneDe(vue, "station")), undefined);
  });
});

describe("le grant `merge` est un interrupteur", () => {
  test("la bande porte son état, lu dans `status` : actif, éteint seul, ou sans ligne — pas actif ; `status` pas lu, ce n'est pas « éteint »", () => {
    assert.deepEqual(etatDuMerge(statusAvec(MERGE_ACTIF)), { actif: true, releve: valeur(MERGE_ACTIF) });
    assert.deepEqual(etatDuMerge(statusAvec(MERGE_BIENTOT)), { actif: true, releve: valeur(MERGE_BIENTOT) });
    assert.deepEqual(etatDuMerge(statusAvec(MERGE_SEUL)), { actif: false, seul: true, releve: valeur(MERGE_SEUL) });
    assert.deepEqual(etatDuMerge(statusAvec()), { actif: false });
    assert.ok("sans" in etatDuMerge({ sans: "`status` was not read: not reached" }));
    assert.ok("sans" in etatDuMerge(statusAvec("grant      merge QUELQUE CHOSE")));
    assert.deepEqual(bandeLue(statusAvec(MERGE_ACTIF), "ouverte").merge, { actif: true, releve: valeur(MERGE_ACTIF) });
    const pasLu = bandeLue().merge;
    assert.ok(pasLu !== undefined && "sans" in pasLu, JSON.stringify(pasLu));
  });

  test("le même rendu que celui du manager : une glissière et son mot, « merge on » ou « merge off », sa ligne de `status` au survol", async () => {
    const vue = await ouvrir();
    vue.dire("surAlertes", bandeLue(statusAvec(MERGE_ACTIF), "ouverte"));
    await repos();

    assert.equal(vue.element("interrupteur-merge").hidden, false);
    assert.equal(vue.element("interrupteur-merge").className, vue.element("interrupteur-manager").className);
    const merge = bascule(vue, "interrupteur-merge");
    const manager = bascule(vue, "interrupteur-manager");
    const forme = (pose: Faux) => [pose.role, pose.className, ...pose.children.map(({ balise, className }) => `${balise}.${className}`)];
    assert.deepEqual(forme(merge), forme(manager));
    assert.equal(merge.role, "switch");
    assert.equal(merge.ariaChecked, "true");
    assert.equal(merge.dataset.etat, "allume");
    assert.equal(merge.textContent, "merge on");
    assert.match(merge.title, /^merge ACTIF, sans échéance, depuis 2 h — une pass verte est mergée sans toi\n/);
    assert.match(manager.textContent, /^manager on$/);

    vue.dire("surAlertes", bandeLue(statusAvec(), "ouverte"));
    await repos();
    const eteint = bascule(vue, "interrupteur-merge");
    assert.equal(eteint.ariaChecked, "false");
    assert.equal(eteint.dataset.etat, "eteint");
    assert.equal(eteint.textContent, "merge off");
    assert.equal(eteint.dataset.marque, undefined);
    // Le prix n'est pas posé à côté de l'interrupteur.
    assert.doesNotMatch(vue.element("interrupteur-merge").textContent, /merged without you/);
  });

  test("éteint de lui-même, il le marque — et la bande ne pose plus sa ligne : l'interrupteur la dit, et la lève ; « bientôt éteint » reste une ligne, à prolonger", async () => {
    const vue = await ouvrir();
    const seul = bandeLue(statusAvec(MERGE_SEUL), "ouverte");
    // La ligne reste dans les données : c'est elle qui fait le signal de la case, dans la barre.
    assert.deepEqual(seul.alertes.map(({ sujet }) => sujet), ["grant"]);
    vue.dire("surAlertes", seul);
    await repos();

    const eteint = bascule(vue, "interrupteur-merge");
    assert.equal(eteint.textContent, "merge off");
    assert.equal(eteint.dataset.marque, "seul");
    assert.match(eteint.title, /^merge ÉTEINT SEUL il y a 40 min/);
    assert.equal(vue.element("alertes").hidden, true);

    vue.dire("surAlertes", bandeLue(statusAvec(MERGE_BIENTOT), "ouverte"));
    await repos();
    assert.equal(bascule(vue, "interrupteur-merge").textContent, "merge on");
    assert.equal(controleDe(ligneDe(vue, "grant `merge` expiring soon")).textContent, "ask the second…");
  });

  test("pas lu : ni « on » ni « off », et un clic ne bascule rien", async () => {
    const vue = await ouvrir();
    vue.dire("surAlertes", bandeLue());
    await repos();
    const inconnu = bascule(vue, "interrupteur-merge");
    assert.equal(inconnu.ariaChecked, "mixed");
    assert.equal(inconnu.disabled, true);
    assert.equal(inconnu.textContent, "merge …");
    inconnu.click();
    await repos();
    assert.deepEqual(appelsDe(vue, "confirmer", "geste"), []);
  });

  test("un clic le bascule : éteint, il ouvre la confirmation d'accorder, qui dit son prix ; allumé, celle de révoquer — rien ne part avant le « oui »", async () => {
    const vue = await ouvrir();
    vue.dire("surAlertes", bandeLue(statusAvec(), "ouverte"));
    await repos();

    bascule(vue, "interrupteur-merge").click();
    await repos();
    assert.deepEqual(vue.dernier("confirmer"), ["parade", "grant-activer", "merge"]);
    const accorder = vue.element("interrupteur-merge").dessous("div").find(({ className }) => className === "confirmation") ?? assert.fail("pas de confirmation sous l'interrupteur");
    assert.match(accorder.textContent, /enable the `merge` grant/);
    assert.deepEqual(accorder.dessous("p").filter(({ className }) => className === "prix").map(({ textContent }) => textContent), ["A green pass will be merged without you: the pass merges what it judges green, with no expiry or number of uses — until you revoke it."]);
    assert.deepEqual(appelsDe(vue, "geste"), []);
    (accorder.dessous("button").find(({ dataset }) => dataset.oui !== undefined) ?? assert.fail("pas de « oui »")).click();
    await repos();
    assert.deepEqual(appelsDe(vue, "geste"), [["geste", "parade", "grant-activer", "merge", true]]);

    vue.dire("surAlertes", bandeLue(statusAvec(MERGE_ACTIF), "ouverte"));
    await repos();
    bascule(vue, "interrupteur-merge").click();
    await repos();
    assert.deepEqual(vue.dernier("confirmer"), ["parade", "grant-revoquer", "merge"]);
    const revoquer = vue.element("interrupteur-merge").dessous("div").find(({ className }) => className === "confirmation") ?? assert.fail("pas de confirmation");
    assert.match(revoquer.textContent, /revoke the `merge` grant/);
    assert.equal(bascule(vue, "interrupteur-merge").ariaChecked, "true", "la confirmation ouverte ne bascule rien");
  });
});

// La carte d'une correction proposée dans la file du projet (#999) : la vue jouée telle qu'elle est,
// devant un faux document (aides/fausse-vue.ts), sur ce que le process principal range des faits de la
// box (faits.ts, correction.ts). Une proposition, une carte, au-dessus des colonnes du rail — aucune
// sans proposition. Elle dit ce qu'on attend du chef en tête, la cause, chaque ticket concerné qui
// s'ouvre d'un clic, la correction en diff — ajouts et retraits chacun de sa classe, son signe gardé —,
// ce qu'elle a coûté ; « yes » lance l'acceptation, « no » le refus, et la carte quitte la file.
// Le module de la carte est aussi lu seul, sur un faux document (vue/correction/carte.js).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { BOUTONS } from "../../src/boutons.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { carteDeCorrection, SANS_GESTE, type Rendu } from "../../src/correction.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE, tenirFaits, type Faits } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../../src/grants.ts";
import { GESTES_DU_MANAGER } from "../../src/manager.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import { ATTENDU, COUTE, NON, OUI, poserCorrection, PRIX_DU_OUI, REPOS } from "../../src/vue/correction/carte.js";
import { Faux, type Jouee, jouerLaVue, type Reponses, repos } from "../aides/fausse-vue.ts";
import { CORRECTION, FAITS } from "./donnees.ts";

const A = "2026-10-13T10:04:12.000Z";
const PARADE = "parade";
const demarrage = () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade", box: { hote: "box" } }], hotes: ["box"] }),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  boutons: BOUTONS,
  gestes: { manager: GESTES_DU_MANAGER, allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});

async function ouvrir(reponses: Reponses = {}): Promise<Jouee> {
  const vue = await jouerLaVue({ demarrage, espace: () => [], ...reponses });
  (vue.element("projets").children.at(1) ?? assert.fail("pas d'entrée")).click();
  await repos();
  return vue;
}
// Les faits que la box rend, passés par le process principal tel qu'il est : la vue reçoit ce qu'il range.
function recevoir(vue: Jouee, faits: Faits = FAITS) {
  const recue = tenirFaits().recevoir({ projet: PARADE, demande: 0, a: A, sorties: [{ commande: "facts", texte: JSON.stringify(faits) }] });
  vue.dire("surFaits", { ...recue, demande: vue.dernier("faits")[0] as number });
}
const cartes = (vue: Jouee) => vue.element("rail").dessous("section").filter((pose) => pose.className === "correction");
const carte = (vue: Jouee): Faux => cartes(vue)[0] ?? assert.fail("pas de carte de correction dans la file");
const bouton = (ou: Faux, texte: string): Faux => ou.dessous("button").find((pose) => pose.textContent === texte) ?? assert.fail(`pas de bouton « ${texte} »`);
const { corrections: _, ...SANS } = FAITS;

describe("la carte d'une correction proposée, dans la file du projet", () => {
  test("une proposition : une carte, au-dessus des colonnes du rail ; sans proposition, aucune", async () => {
    const vue = await ouvrir();
    recevoir(vue);
    assert.equal(cartes(vue).length, 1);
    const enfants = vue.element("rail").children;
    const grille = enfants.findIndex((pose) => pose.className === "colonnes");
    assert.ok(grille > enfants.indexOf(carte(vue)), "la carte est posée sous les colonnes");

    for (const faits of [SANS, { ...FAITS, corrections: [] }]) {
      recevoir(vue, faits);
      assert.equal(cartes(vue).length, 0);
      assert.ok(vue.element("rail").dessous("section").some((pose) => pose.className === "colonne"), "le rail n'est plus posé");
    }
    // Deux propositions, deux cartes : la plus ancienne d'abord.
    recevoir(vue, { ...FAITS, corrections: [CORRECTION, { ...CORRECTION, proposition: 415, titre: "blocking review" }] });
    assert.deepEqual(
      cartes(vue).map((pose) => pose.dessous("strong")[0]?.textContent),
      ["red gates: app tests", "blocking review"],
    );
  });

  test("ce qu'on attend du chef, en tête ; puis la cause", async () => {
    const vue = await ouvrir();
    recevoir(vue);
    const [attendu, tete] = carte(vue).children;
    assert.equal(attendu?.textContent, ATTENDU);
    assert.equal(tete?.dessous("strong")[0]?.textContent, "red gates: app tests");
    assert.ok(carte(vue).dessous("p").some((pose) => pose.textContent === "The guidance never says a test waits for a fact."));
  });

  test("chaque ticket concerné est un lien qui ouvre son issue d'un clic ; un ticket sans adresse est posé seul", async () => {
    const vue = await ouvrir({ ouvrirIssue: () => true });
    recevoir(vue);
    const ligne = carte(vue).dessous("p").find((pose) => pose.className === "tickets") ?? assert.fail("pas de tickets");
    const liens = ligne.dessous("button");
    assert.deepEqual(liens.map((pose) => pose.textContent), ["#3", "#5"]);
    for (const lien of liens) assert.equal(lien.className, "ticket mono");
    bouton(ligne, "#5").click();
    await repos();
    assert.deepEqual(vue.dernier("ouvrirIssue"), [PARADE, 5]);
    bouton(ligne, "#3").click();
    await repos();
    assert.deepEqual(vue.dernier("ouvrirIssue"), [PARADE, 3]);
    const seul = ligne.dessous("span").find((pose) => pose.textContent === "#8") ?? assert.fail("#8 n'est pas posé");
    assert.equal(seul.className, "ticket mono");
  });

  test("la correction en diff : un fichier par bloc, ses lignes ajoutées et retirées chacune de sa classe, signe gardé", async () => {
    const vue = await ouvrir();
    recevoir(vue);
    const fichiers = carte(vue).dessous("section").filter((pose) => pose.className === "fichier-diff");
    assert.deepEqual(
      fichiers.map((fichier) => fichier.dessous("p")[0]?.children.map((pose) => pose.textContent)),
      [
        ["CLAUDE.md", "+2", "−1"],
        [".claude/brigade/gates.sh", "+1", "−0"],
      ],
    );
    const [claude] = fichiers;
    const pre = claude?.dessous("pre")[0] ?? assert.fail("pas de diff");
    assert.equal(pre.className, "diff");
    assert.deepEqual(
      pre.children.map((ligne) => [ligne.className, ligne.textContent]),
      [
        ["morceau", "@@ -1,3 +1,4 @@ Conventions\n"],
        ["", " - Tests: `npm test`.\n"],
        ["retrait", "-- A test may wait a few seconds.\n"],
        ["ajout", "+- A test never runs against the clock:\n"],
        ["ajout", "+  it waits for a fact.\n"],
        ["", " - Never kill a process by its name."],
      ],
    );
    // Le `pre` se lit et se recopie tel quel : ses lignes, dans l'ordre, sans leurs têtes de fichier.
    assert.equal(pre.textContent, "@@ -1,3 +1,4 @@ Conventions\n - Tests: `npm test`.\n-- A test may wait a few seconds.\n+- A test never runs against the clock:\n+  it waits for a fact.\n - Never kill a process by its name.");
  });

  test("ce que la proposition a coûté se lit sur la carte ; le prix du « yes » est dans son survol, pas sous le bouton", async () => {
    const vue = await ouvrir();
    recevoir(vue);
    const cout = carte(vue).dessous("p").find((pose) => pose.className === "cout-correction") ?? assert.fail("pas de coût");
    assert.match(cout.textContent, new RegExp(`^${COUTE} 18,342 tokens · proposed `));
    const reponses = carte(vue).dessous("div").find((pose) => pose.className === "reponses") ?? assert.fail("pas de réponses");
    assert.equal(bouton(reponses, OUI).className, "recommande");
    assert.equal(bouton(reponses, NON).className, "");
    const aides = reponses.dessous("button").filter((pose) => pose.className === "aide");
    assert.deepEqual(aides.map((aide) => (aide as { ariaLabel?: string }).ariaLabel), [PRIX_DU_OUI]);
    assert.ok(!carte(vue).textContent.includes(PRIX_DU_OUI), "le prix du « yes » est écrit à plat");
  });

  for (const [libelle, reponse] of [
    [OUI, "yes"],
    [NON, "no"],
  ] as const) {
    test(`« ${libelle} » lance ${reponse === "yes" ? "l'acceptation" : "le refus"} de cette proposition ; écrite, la carte quitte la file et \`facts\` est relu`, async () => {
      const vue = await ouvrir({ corriger: (_projet, _proposition, voulue) => ({ tranchee: voulue, dit: "" }) });
      recevoir(vue);
      const relectures = vue.appels.filter(({ geste }) => geste === "relireBox").length;
      bouton(carte(vue), libelle).click();
      await repos();
      assert.deepEqual(vue.dernier("corriger"), [PARADE, 412, reponse]);
      assert.equal(vue.appels.filter(({ geste }) => geste === "corriger").length, 1);
      assert.equal(cartes(vue).length, 0);
      assert.equal(vue.appels.filter(({ geste }) => geste === "relireBox").length, relectures + 1);
      // La lecture qui suit ne la porte plus : rien ne revient. Une lecture qui la porterait encore ne la remet pas.
      recevoir(vue);
      assert.equal(cartes(vue).length, 0);
      recevoir(vue, SANS);
      assert.equal(cartes(vue).length, 0);
      // Proposée de nouveau, plus tard, sous le même numéro qu'aucune lecture ne portait plus : elle attend de nouveau.
      recevoir(vue);
      assert.equal(cartes(vue).length, 1);
    });
  }

  test("tant que la box n'a pas répondu, les deux réponses attendent : un second clic ne lance rien", async () => {
    let repondre: (rendu: Rendu) => void = () => assert.fail("pas lancé");
    const vue = await ouvrir({ corriger: () => new Promise<Rendu>((rendre) => (repondre = rendre)) as unknown as Rendu });
    recevoir(vue);
    bouton(carte(vue), OUI).click();
    await repos();
    assert.ok(bouton(carte(vue), OUI).disabled && bouton(carte(vue), NON).disabled);
    assert.ok(carte(vue).textContent.includes("sending your “yes”…"));
    bouton(carte(vue), NON).click();
    await repos();
    assert.equal(vue.appels.filter(({ geste }) => geste === "corriger").length, 1);
    repondre({ tranchee: "yes", dit: "" });
    await repos();
    assert.equal(cartes(vue).length, 0);
  });

  test("rien n'est écrit — le runtime ne connaît pas le geste : la carte reste, ses deux réponses aussi, et une ligne le dit, le détail au survol", async () => {
    const detail = "$ ssh -o BatchMode=yes -- box brigade parade correction yes 412\n→ exit code 66";
    const vue = await ouvrir({ corriger: () => ({ refus: SANS_GESTE, detail }) });
    recevoir(vue);
    bouton(carte(vue), OUI).click();
    await repos();
    assert.equal(cartes(vue).length, 1);
    const refus = carte(vue).dessous("p").find((pose) => pose.className === "refus") ?? assert.fail("le refus n'est pas dit");
    assert.equal(refus.children[0]?.textContent, SANS_GESTE);
    assert.equal((refus.dessous("button")[0] as { ariaLabel?: string } | undefined)?.ariaLabel, detail);
    assert.ok(!carte(vue).textContent.includes("exit code"), "le code de sortie est écrit à plat");
    assert.ok(!bouton(carte(vue), OUI).disabled && !bouton(carte(vue), NON).disabled);
    assert.equal(vue.appels.filter(({ geste }) => geste === "relireBox").length, 0);
  });
});

describe("le module de la carte, seul", () => {
  const doc = { createElement: (balise: string) => new Faux(balise) };

  test("tranchée, la carte n'est plus posée", () => {
    const pose = carteDeCorrection(CORRECTION);
    assert.equal(poserCorrection(doc, pose, REPOS, { ouvrir: () => {}, repondre: () => {} }).length, 1);
    assert.deepEqual(poserCorrection(doc, pose, { etape: "tranchee", reponse: "no" }, { ouvrir: () => {}, repondre: () => {} }), []);
  });

  test("sans motif, aucune ligne à sa place", () => {
    const [racine] = poserCorrection(doc, carteDeCorrection({ ...CORRECTION, motif: null }), REPOS, { ouvrir: () => {}, repondre: () => {} });
    assert.ok(racine !== undefined);
    assert.equal((racine as Faux).dessous("p").filter((pose) => pose.className === "motif").length, 0);
  });
});

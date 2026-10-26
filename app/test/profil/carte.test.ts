// La carte d'un profil de cook proposé dans la file du projet (#1053) : la vue jouée telle qu'elle est,
// devant un faux document (aides/fausse-vue.ts), sur ce que le process principal range des faits de la
// box (faits.ts, profil.ts). Une proposition, une carte, au-dessus des colonnes du rail — aucune sans
// proposition. Elle dit ce qu'on attend du chef en tête, le nom du profil et son domaine, les chiffres
// qui le justifient, chaque ticket du domaine qui s'ouvre d'un clic, ce que le profil contiendrait —
// skills, périmètre, carnet — ; « yes » poste l'acceptation sur le tableau de la cuisine, « no » le refus, et
// la carte le dit jusqu'à la lecture qui ne la porte plus.
// Le module de la carte est aussi lu seul, sur un faux document (vue/profil/carte.js).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { BOUTONS } from "../../src/boutons.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import type { Rendu } from "../../src/correction.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE, tenirFaits, type Faits } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../../src/grants.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { carteDeProfil } from "../../src/profil.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import { POSTE } from "../../src/tableau-gestes/rail.ts";
import { ENVOI, REPOS } from "../../src/vue/correction/carte.js";
import { ATTENDU, CARNET_VIDE, EFFET_DU_NON, EFFET_DU_OUI, NON, OUI, poserProfil, POURQUOI_SANS_SKILLS, SANS_SKILLS } from "../../src/vue/profil/carte.js";
import { Faux, type Jouee, jouerLaVue, type Reponses, repos } from "../aides/fausse-vue.ts";
import { CORRECTION } from "../correction/donnees.ts";
import { FAITS, PROFIL } from "./donnees.ts";

const A = "2026-10-13T10:04:12.000Z";
const PARADE = "parade";
const demarrage = () => ({
  configuration: pourLaBarre({ chemin: "/tmp/app.json", projets: [{ nom: PARADE, dossier: "/tmp/parade", box: { hote: "box" } }], hotes: ["box"] }),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  boutons: BOUTONS,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
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
const cartes = (vue: Jouee) => vue.element("rail").dessous("section").filter((pose) => pose.className === "profil");
const carte = (vue: Jouee): Faux => cartes(vue)[0] ?? assert.fail("pas de carte de profil dans la file");
const bouton = (ou: Faux, texte: string): Faux => ou.dessous("button").find((pose) => pose.textContent === texte) ?? assert.fail(`pas de bouton « ${texte} »`);
const parClasse = (ou: Faux, balise: string, classe: string): Faux[] => ou.dessous(balise).filter((pose) => pose.className === classe);
const { profils: _, ...SANS } = FAITS;
const COMMENTAIRE = "https://github.com/acme/parade/issues/1#issuecomment-5013";

describe("la carte d'un profil proposé, dans la file du projet", () => {
  test("une proposition : une carte, au-dessus des colonnes du rail ; sans proposition, aucune", async () => {
    const vue = await ouvrir();
    recevoir(vue);
    assert.equal(cartes(vue).length, 1);
    const enfants = vue.element("rail").children;
    const grille = enfants.findIndex((pose) => pose.className === "colonnes");
    assert.ok(grille > enfants.indexOf(carte(vue)), "la carte est posée sous les colonnes");

    for (const faits of [SANS, { ...FAITS, profils: [] }]) {
      recevoir(vue, faits);
      assert.equal(cartes(vue).length, 0);
      assert.ok(vue.element("rail").dessous("section").some((pose) => pose.className === "colonne"), "le rail n'est plus posé");
    }
    // Deux propositions, deux cartes : la plus ancienne d'abord.
    recevoir(vue, { ...FAITS, profils: [PROFIL, { ...PROFIL, proposition: 380, nom: "runtime-src", domaine: "runtime/src" }] });
    assert.deepEqual(
      cartes(vue).map((pose) => pose.dessous("strong")[0]?.textContent),
      ["app-src-vue", "runtime-src"],
    );
  });

  test("une correction et un profil proposés : chacun sa carte, la correction d'abord", async () => {
    const vue = await ouvrir();
    recevoir(vue, { ...FAITS, corrections: [CORRECTION] });
    const enfants = vue.element("rail").children;
    const correction = enfants.findIndex((pose) => pose.className === "correction");
    const profil = enfants.findIndex((pose) => pose.className === "profil");
    assert.ok(correction >= 0 && profil > correction);
  });

  test("ce qu'on attend du chef, en tête ; puis le nom du profil, son domaine et les chiffres qui le justifient, les seuils au survol", async () => {
    const vue = await ouvrir();
    recevoir(vue);
    const [attendu, tete] = carte(vue).children;
    assert.equal(attendu?.textContent, ATTENDU);
    assert.equal(tete?.dessous("strong")[0]?.textContent, "app-src-vue");
    assert.equal(tete?.dessous("code")[0]?.textContent, "app/src/vue");
    const chiffres = parClasse(carte(vue), "p", "chiffres");
    assert.deepEqual(
      chiffres.map((ligne) => ligne.children[0]?.textContent ?? ligne.textContent),
      ["5 of the last 20 tickets served touch it", "delivered on the first try: 40% here (2 of 5), against 75% for the whole project (15 of 20) — 35 points below"],
    );
    const seuils = carteDeProfil(PROFIL).seuils;
    assert.equal((chiffres[1]?.dessous("button")[0] as { ariaLabel?: string } | undefined)?.ariaLabel, seuils);
    assert.ok(!carte(vue).textContent.includes(seuils), "les seuils sont écrits à plat");
  });

  test("chaque ticket du domaine est un lien qui ouvre son issue d'un clic ; un ticket sans adresse est posé seul", async () => {
    const vue = await ouvrir({ ouvrirIssue: () => true });
    recevoir(vue);
    const ligne = parClasse(carte(vue), "p", "tickets")[0] ?? assert.fail("pas de tickets");
    const liens = ligne.dessous("button");
    assert.deepEqual(liens.map((pose) => pose.textContent), ["#4", "#7", "#9", "#11"]);
    for (const lien of liens) assert.equal(lien.className, "ticket mono");
    for (const ticket of [9, 4]) {
      bouton(ligne, `#${ticket}`).click();
      await repos();
      assert.deepEqual(vue.dernier("ouvrirIssue"), [PARADE, ticket]);
    }
    const seul = ligne.dessous("span").find((pose) => pose.textContent === "#14") ?? assert.fail("#14 n'est pas posé");
    assert.equal(seul.className, "ticket mono");
  });

  test("ce que le profil contiendrait : ses skills — aucune proposée, pourquoi au survol —, son périmètre, son carnet de départ leçon par leçon", async () => {
    const vue = await ouvrir();
    recevoir(vue);
    const contenu = parClasse(carte(vue), "div", "contenu")[0] ?? assert.fail("pas de contenu");
    const lignes = parClasse(contenu, "p", "ligne-contenu");
    assert.deepEqual(
      lignes.map((ligne) => ligne.children[0]?.textContent),
      ["skills", "perimeter", "notebook"],
    );
    const [skills, perimetre, carnet] = lignes;
    assert.equal(skills?.children[1]?.textContent, SANS_SKILLS);
    assert.equal((skills?.dessous("button")[0] as { ariaLabel?: string } | undefined)?.ariaLabel, POURQUOI_SANS_SKILLS);
    assert.deepEqual(perimetre?.dessous("code").map((pose) => pose.textContent), ["app/src/vue"]);
    assert.equal(carnet?.children[1]?.textContent, "starts with 2 lessons of the project, born of this domain's tickets");
    const lecons = contenu.dessous("li");
    assert.deepEqual(
      lecons.map((lecon) => lecon.children.map((pose) => pose.textContent)),
      [
        ["L-007", "A view change is judged on a screenshot.", "from #9"],
        ["L-012", "Reuse the bricks before writing a new style.", "from #11, retro-3"],
      ],
    );
  });

  test("des skills proposées se lisent chacune en monospace ; un carnet vide le dit, sans liste", async () => {
    const vue = await ouvrir();
    recevoir(vue, { ...FAITS, profils: [{ ...PROFIL, skills: ["frontend-design", "screenshots"], carnet: [] }] });
    const contenu = parClasse(carte(vue), "div", "contenu")[0] ?? assert.fail("pas de contenu");
    const [skills, , carnet] = parClasse(contenu, "p", "ligne-contenu");
    assert.deepEqual(skills?.dessous("code").map((pose) => pose.textContent), ["frontend-design", "screenshots"]);
    assert.equal(skills?.dessous("button").length, 0);
    assert.equal(carnet?.children[1]?.textContent, CARNET_VIDE);
    assert.equal(contenu.dessous("li").length, 0);
  });

  test("« yes » est recommandé ; ce que chacune des deux réponses fait est dans son survol, pas sous le bouton", async () => {
    const vue = await ouvrir();
    recevoir(vue);
    const reponses = parClasse(carte(vue), "div", "reponses")[0] ?? assert.fail("pas de réponses");
    assert.equal(bouton(reponses, OUI).className, "recommande");
    assert.equal(bouton(reponses, NON).className, "");
    const aides = reponses.dessous("button").filter((pose) => pose.className === "aide");
    assert.deepEqual(aides.map((aide) => (aide as { ariaLabel?: string }).ariaLabel), [EFFET_DU_OUI, EFFET_DU_NON]);
    for (const effet of [EFFET_DU_OUI, EFFET_DU_NON]) assert.ok(!carte(vue).textContent.includes(effet), "un survol est écrit à plat");
  });

  for (const [libelle, reponse] of [
    [OUI, "yes"],
    [NON, "no"],
  ] as const) {
    test(`« ${libelle} » poste ${reponse === "yes" ? "l'acceptation" : "le refus"} de cette proposition sur le tableau ; postée, la carte le dit, ses réponses inactives, \`facts\` est relu, et elle part avec la lecture qui ne la porte plus`, async () => {
      const vue = await ouvrir({ trancherLeProfil: (_projet, _proposition, voulue) => ({ postee: voulue, dit: POSTE, detail: COMMENTAIRE }) });
      recevoir(vue);
      const relectures = vue.appels.filter(({ geste }) => geste === "relireBox").length;
      bouton(carte(vue), libelle).click();
      await repos();
      assert.deepEqual(vue.dernier("trancherLeProfil"), [PARADE, 377, reponse]);
      assert.equal(vue.appels.filter(({ geste }) => geste === "trancherLeProfil").length, 1);
      assert.equal(vue.appels.filter(({ geste }) => geste === "corriger").length, 0);
      assert.equal(vue.appels.filter(({ geste }) => geste === "relireBox").length, relectures + 1);
      // La lecture qui la porte encore — la box ne l'a pas encore tranchée — la garde, postée.
      recevoir(vue);
      assert.equal(cartes(vue).length, 1);
      const postee = parClasse(carte(vue), "p", "postee")[0] ?? assert.fail("la réponse postée n'est pas dite");
      assert.equal(postee.children[0]?.textContent, `your “${reponse}”: ${POSTE}`);
      assert.equal((postee.dessous("button")[0] as { ariaLabel?: string } | undefined)?.ariaLabel, COMMENTAIRE);
      assert.ok(bouton(carte(vue), OUI).disabled && bouton(carte(vue), NON).disabled);
      // La lecture qui ne la porte plus : la box l'a tranchée, la carte quitte la file.
      recevoir(vue, SANS);
      assert.equal(cartes(vue).length, 0);
    });
  }

  test("tant que la réponse n'est pas postée, les deux réponses attendent : un second clic ne lance rien", async () => {
    let repondre: (rendu: Rendu) => void = () => assert.fail("pas lancé");
    const vue = await ouvrir({ trancherLeProfil: () => new Promise<Rendu>((rendre) => (repondre = rendre)) as unknown as Rendu });
    recevoir(vue);
    bouton(carte(vue), NON).click();
    await repos();
    assert.ok(bouton(carte(vue), OUI).disabled && bouton(carte(vue), NON).disabled);
    assert.ok(carte(vue).textContent.includes(ENVOI.no));
    bouton(carte(vue), OUI).click();
    await repos();
    assert.equal(vue.appels.filter(({ geste }) => geste === "trancherLeProfil").length, 1);
    repondre({ postee: "no", dit: POSTE, detail: COMMENTAIRE });
    await repos();
    assert.equal(cartes(vue).length, 1);
    assert.equal(parClasse(carte(vue), "p", "postee").length, 1);
  });

  test("rien n'est posté — GitHub refuse le commentaire : la carte reste, ses deux réponses aussi, et une ligne le dit, le détail au survol", async () => {
    const refus = "nothing was posted: GitHub refused the comment";
    const detail = "POST repos/acme/parade/issues/1/comments → HTTP 403: Resource not accessible by integration";
    const vue = await ouvrir({ trancherLeProfil: () => ({ refus, detail }) });
    recevoir(vue);
    bouton(carte(vue), OUI).click();
    await repos();
    assert.equal(cartes(vue).length, 1);
    const dite = parClasse(carte(vue), "p", "refus")[0] ?? assert.fail("le refus n'est pas dit");
    assert.equal(dite.children[0]?.textContent, refus);
    assert.equal((dite.dessous("button")[0] as { ariaLabel?: string } | undefined)?.ariaLabel, detail);
    assert.ok(!carte(vue).textContent.includes("HTTP 403"), "la réponse de GitHub est écrite à plat");
    assert.ok(!bouton(carte(vue), OUI).disabled && !bouton(carte(vue), NON).disabled);
    assert.equal(vue.appels.filter(({ geste }) => geste === "relireBox").length, 0);
  });
});

describe("le module de la carte, seul", () => {
  const doc = { createElement: (balise: string) => new Faux(balise) };

  test("postée, la carte reste posée, ses deux réponses inactives", () => {
    const pose = carteDeProfil(PROFIL);
    assert.equal(poserProfil(doc, pose, REPOS, { ouvrir: () => {}, repondre: () => {} }).length, 1);
    const [racine] = poserProfil(doc, pose, { etape: "postee", reponse: "yes", dit: POSTE, detail: "" }, { ouvrir: () => {}, repondre: () => {} });
    assert.ok(racine !== undefined);
    const boutons = (racine as Faux).dessous("button").filter((b) => b.textContent === OUI || b.textContent === NON);
    assert.equal(boutons.length, 2);
    for (const b of boutons) assert.ok(b.disabled);
  });
});

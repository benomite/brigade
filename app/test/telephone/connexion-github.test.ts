// La connexion du téléphone à GitHub (#2500, épique #2498) : sur une installation neuve, le premier écran de l'app
// Android demande de se connecter à GitHub, d'un bouton — ni code d'appairage, ni QR, ni adresse de station. Le login
// parti, l'écran montre le code à taper sur la page de GitHub ; connecté, l'app passe à ses projets ; refusé, annulé ou
// GitHub injoignable, l'écran reste et le dit. Sur le desktop, rien de tout cela n'est posé. La vue est jouée telle
// qu'elle est (aides/fausse-vue.ts) ; ce que le pont de l'app Android fait avec GitHub est éprouvé à part
// (packaging/android.test.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { EXEMPLE } from "../../src/config.ts";
import type { DebutDeConnexion } from "../../src/connexion-github.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import type { Telephone } from "../../src/vue/pont.d.ts";
import { ATTENDU, SE_CONNECTER, TITRE } from "../../src/vue/connexion-github.js";
import { type Faux, jouerLaVue, repos } from "../aides/fausse-vue.ts";

const CODE: DebutDeConnexion = { code: "A1B2-C3D4", page: "https://github.com/login/device" };

// Le démarrage que le pont de l'app Android rend : les constantes de l'app, aucun projet, et le téléphone. `null` : le
// desktop, dont le démarrage ne dit aucun téléphone.
const demarrage = (telephone: Telephone | null) => () => ({
  configuration: pourLaBarre({ chemin: "no projects file on this phone", projets: [] }),
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
  ...(telephone === null ? {} : { telephone }),
});

// L'app Android lancée ; `debut` : ce que le pont rend au login — le code, ou pourquoi il n'est pas parti.
async function auLancement({ debut = () => CODE, telephone = {} }: { debut?: () => DebutDeConnexion | Promise<DebutDeConnexion>; telephone?: Telephone | null } = {}) {
  const vue = await jouerLaVue({ demarrage: demarrage(telephone), espace: () => [], seConnecterAGitHub: debut });
  const ecran = () => vue.element("connexion-github");
  const boutons = () => ecran().dessous("button").filter((pose) => pose.parentElement?.className === "action");
  const bouton = (texte: string) => boutons().find((pose) => pose.textContent === texte) as Faux;
  const refus = () => ecran().dessous("p").find((pose) => pose.className === "refus");
  const seConnecter = async () => {
    (boutons()[0] ?? assert.fail("pas de bouton")).click();
    await repos();
  };
  const logins = () => vue.appels.filter(({ geste }) => geste === "seConnecterAGitHub").length;
  return { vue, ecran, boutons, bouton, refus, seConnecter, logins };
}

describe("sur une installation neuve, le premier écran connecte le téléphone à GitHub", () => {
  test("il demande de se connecter à GitHub, d'un bouton — ni champ de code, ni QR, ni adresse ; le reste de l'app est caché derrière", async () => {
    const { vue, ecran, boutons, logins } = await auLancement();
    assert.equal(ecran().hidden, false);
    assert.equal(vue.element("cadre").hidden, true);
    assert.equal(ecran().dessous("h2")[0]?.firstChild, TITRE);
    assert.equal(ecran().dessous("p").find((pose) => pose.className === "attendu")?.textContent, ATTENDU);
    assert.deepEqual(
      boutons().map((pose) => [pose.textContent, pose.className, pose.disabled]),
      [[SE_CONNECTER, "recommande", false]],
    );
    assert.deepEqual(ecran().dessous("input"), []);
    assert.doesNotMatch(ecran().textContent, /pair|QR|station's address|code your station/i);
    assert.equal(logins(), 0);
    // Ce que fait la connexion est au survol du titre, jamais à plat.
    assert.match(ecran().dessous("h2")[0]?.dessous("button")[0]?.ariaLabel ?? "", /no station is involved/);
  });

  test("le login parti, l'écran montre le code à taper sur la page de GitHub, et de quoi la rouvrir ; un second clic ne relance rien", async () => {
    const { vue, ecran, bouton, seConnecter, logins } = await auLancement();
    await seConnecter();
    assert.equal(logins(), 1);
    assert.equal(ecran().dessous("p").find((pose) => pose.className === "code-de-connexion")?.textContent, "Type the code A1B2-C3D4 on the GitHub page that opened in your browser.");
    assert.equal(bouton("signing in…").disabled, true);
    bouton("signing in…").click();
    await repos();
    assert.equal(logins(), 1);
    bouton("open the GitHub page again").click();
    await repos();
    assert.deepEqual(vue.dernier("ouvrirLaPage"), ["https://github.com/login/device"]);
    assert.equal(vue.element("cadre").hidden, true);
  });

  test("connecté : l'app passe à « Tous les projets », une ligne en tête dit sous quel compte", async () => {
    const { vue, ecran, seConnecter } = await auLancement();
    await seConnecter();
    vue.dire("surConnexionGitHub", { connecte: true, compte: "benomite" });
    await repos();
    assert.equal(vue.element("cadre").hidden, false);
    assert.equal(vue.element("tous").hidden, false);
    assert.equal(vue.element("ajout").hidden, true);
    assert.equal(ecran().className, "fait");
    assert.match(ecran().textContent, /^Signed in to GitHub as benomite\./);
    // Ses projets se lisent sur GitHub (#2501) : la section le dit, jusqu'à la première liste lue.
    assert.match(vue.element("tous").textContent, /Your projects on GitHub: first read in progress…/);
  });

  test("annulé ou refusé sur GitHub : l'écran reste, la ligne le dit, le détail au survol — et le bouton relance", async () => {
    const { vue, refus, boutons, seConnecter, logins } = await auLancement();
    await seConnecter();
    vue.dire("surConnexionGitHub", { refus: "The sign-in was cancelled on GitHub: this phone is not signed in.", detail: "github.com answered 200 — access_denied" });
    await repos();
    assert.equal(vue.element("cadre").hidden, true);
    assert.match(refus()?.textContent ?? "", /^The sign-in was cancelled on GitHub: this phone is not signed in\./);
    assert.equal(refus()?.dessous("button").find((pose) => pose.className === "aide")?.ariaLabel, "github.com answered 200 — access_denied");
    assert.deepEqual(
      boutons().map((pose) => [pose.textContent, pose.disabled]),
      [[SE_CONNECTER, false]],
    );
    await seConnecter();
    assert.equal(logins(), 2);
    assert.equal(refus(), undefined);
  });

  test("le login qui ne part pas — GitHub injoignable, ou le pont qui lève — se dit sous le bouton, et l'écran reste", async () => {
    const injoignable = await auLancement({ debut: () => ({ refus: "This phone could not reach GitHub: check its connection, then try again.", detail: "Unable to resolve host" }) });
    await injoignable.seConnecter();
    assert.match(injoignable.refus()?.textContent ?? "", /^This phone could not reach GitHub/);
    assert.equal(injoignable.vue.element("cadre").hidden, true);
    const leve = await auLancement({ debut: () => Promise.reject(new Error("the app's native bridge is missing")) });
    await leve.seConnecter();
    assert.match(leve.refus()?.textContent ?? "", /^The GitHub sign-in could not be started on this phone\./);
    assert.equal(leve.refus()?.dessous("button").find((pose) => pose.className === "aide")?.ariaLabel, "the app's native bridge is missing");
  });

  test("une fin qui arrive sans login parti est laissée", async () => {
    const { vue } = await auLancement();
    vue.dire("surConnexionGitHub", { connecte: true, compte: "benomite" });
    await repos();
    assert.equal(vue.element("cadre").hidden, true);
  });
});

describe("hors d'une installation neuve", () => {
  test("le téléphone déjà connecté : l'app s'ouvre sur « Tous les projets », le compte en tête, sans écran de connexion", async () => {
    const { vue, ecran } = await auLancement({ telephone: { github: { compte: null } } });
    assert.equal(vue.element("cadre").hidden, false);
    assert.equal(vue.element("tous").hidden, false);
    assert.match(ecran().textContent, /^This phone is signed in to GitHub\./);
    assert.deepEqual(ecran().dessous("button").filter((pose) => pose.parentElement?.className === "action"), []);
  });

  test("le desktop, qui ne rend aucun `telephone` : rien n'est posé, et sans projet l'app s'ouvre sur les stations du chef (#1434)", async () => {
    const { vue, ecran } = await auLancement({ telephone: null });
    assert.equal(ecran().hidden, true);
    assert.equal(ecran().children.length, 0);
    assert.equal(vue.element("cadre").hidden, false);
    assert.ok(vue.element("tous").children[0]?.classList.contains("premier-lancement"));
  });
});

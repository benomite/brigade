// La connexion du téléphone à GitHub (#2500, épique #2498) : sur une installation neuve, le premier écran de l'app
// Android demande de se connecter à GitHub, d'un bouton — ni code d'appairage, ni QR, ni adresse de station. Le login
// parti, l'écran montre le code à taper sur la page de GitHub ; connecté, l'app passe à ses projets ; refusé, annulé ou
// GitHub injoignable, l'écran reste et le dit. Sur le desktop, rien de tout cela n'est posé. La vue est jouée telle
// qu'elle est (helpers/false-vue.ts) ; ce que le pont de l'app Android fait avec GitHub est éprouvé à part
// (packaging/android.test.ts).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE } from "../../src/config.ts";
import type { StartOfConnection } from "../../src/connection-github.ts";
import { PALETTE } from "../../src/colors.ts";

import { TABS, HEADINGS } from "../../src/tabs.ts";
import { EFFORTS, MODELS } from "../../src/projects/projects.ts";
import type { Phone } from "../../src/vue/bridge.d.ts";
import { EXPECTED, ITSELF_CONNECT, TITLE } from "../../src/vue/connection-github.js";
import { type Fake, playTheVue, repos } from "../helpers/false-vue.ts";

const CODE: StartOfConnection = { code: "A1B2-C3D4", page: "https://github.com/login/device" };

// Le démarrage que le pont de l'app Android rend : les constantes de l'app, aucun projet, et le téléphone. `null` : le
// desktop, dont le démarrage ne dit aucun téléphone.
const startup = (phone: Phone | null) => () => ({
  configuration: forTheBar({ chemin: "no projects file on this phone", projets: [] }),
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS,
  rubriques: HEADINGS,
  gestes: {},
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  ...(phone === null ? {} : { telephone: phone }),
});

// L'app Android lancée ; `debut` : ce que le pont rend au login — le code, ou pourquoi il n'est pas parti.
async function atLaunch({ debut: start = () => CODE, telephone: phone = {} }: { debut?: () => StartOfConnection | Promise<StartOfConnection>; telephone?: Phone | null } = {}) {
  const vue = await playTheVue({ demarrage: startup(phone), espace: () => [], seConnecterAGitHub: start });
  const screen = () => vue.element("connexion-github");
  const buttons = () => screen().dessous("button").filter((pose) => pose.parentElement?.className === "action");
  const button = (text: string) => buttons().find((pose) => pose.textContent === text) as Fake;
  const refusal = () => screen().dessous("p").find((pose) => pose.className === "refus");
  const itselfConnect = async () => {
    (buttons()[0] ?? assert.fail("pas de bouton")).click();
    await repos();
  };
  const logins = () => vue.appels.filter(({ geste: action }) => action === "seConnecterAGitHub").length;
  return { vue, ecran: screen, boutons: buttons, bouton: button, refus: refusal, seConnecter: itselfConnect, logins };
}

describe("sur une installation neuve, le premier écran connecte le téléphone à GitHub", () => {
  test("il demande de se connecter à GitHub, d'un bouton — ni champ de code, ni QR, ni adresse ; le reste de l'app est caché derrière", async () => {
    const { vue, ecran: screen, boutons: buttons, logins } = await atLaunch();
    assert.equal(screen().hidden, false);
    assert.equal(vue.element("cadre").hidden, true);
    assert.equal(screen().dessous("h2")[0]?.firstChild, TITLE);
    assert.equal(screen().dessous("p").find((pose) => pose.className === "attendu")?.textContent, EXPECTED);
    assert.deepEqual(
      buttons().map((pose) => [pose.textContent, pose.className, pose.disabled]),
      [[ITSELF_CONNECT, "recommande", false]],
    );
    assert.deepEqual(screen().dessous("input"), []);
    assert.doesNotMatch(screen().textContent, /pair|QR|station's address|code your station/i);
    assert.equal(logins(), 0);
    // Ce que fait la connexion est au survol du titre, jamais à plat.
    assert.match(screen().dessous("h2")[0]?.dessous("button")[0]?.ariaLabel ?? "", /no station is involved/);
  });

  test("le login parti, l'écran montre le code à taper sur la page de GitHub, et de quoi la rouvrir ; un second clic ne relance rien", async () => {
    const { vue, ecran: screen, bouton: button, seConnecter: itselfConnect, logins } = await atLaunch();
    await itselfConnect();
    assert.equal(logins(), 1);
    assert.equal(screen().dessous("p").find((pose) => pose.className === "code-de-connexion")?.textContent, "Type the code A1B2-C3D4 on the GitHub page that opened in your browser.");
    assert.equal(button("signing in…").disabled, true);
    button("signing in…").click();
    await repos();
    assert.equal(logins(), 1);
    button("open the GitHub page again").click();
    await repos();
    assert.deepEqual(vue.dernier("ouvrirLaPage"), ["https://github.com/login/device"]);
    assert.equal(vue.element("cadre").hidden, true);
  });

  test("connecté : l'app passe à « Tous les projets », une ligne en tête dit sous quel compte", async () => {
    const { vue, ecran: screen, seConnecter: itselfConnect } = await atLaunch();
    await itselfConnect();
    vue.dire("surConnexionGitHub", { connecte: true, compte: "benomite" });
    await repos();
    assert.equal(vue.element("cadre").hidden, false);
    assert.equal(vue.element("tous").hidden, false);
    assert.equal(vue.element("ajout").hidden, true);
    assert.equal(screen().className, "fait");
    assert.match(screen().textContent, /^Signed in to GitHub as benomite\./);
    // Ses projets se lisent sur GitHub (#2501) : la section le dit, jusqu'à la première liste lue.
    assert.match(vue.element("tous").textContent, /Your projects on GitHub: first read in progress…/);
  });

  test("annulé ou refusé sur GitHub : l'écran reste, la ligne le dit, le détail au survol — et le bouton relance", async () => {
    const { vue, refus: refusal, boutons: buttons, seConnecter: itselfConnect, logins } = await atLaunch();
    await itselfConnect();
    vue.dire("surConnexionGitHub", { refus: "The sign-in was cancelled on GitHub: this phone is not signed in.", detail: "github.com answered 200 — access_denied" });
    await repos();
    assert.equal(vue.element("cadre").hidden, true);
    assert.match(refusal()?.textContent ?? "", /^The sign-in was cancelled on GitHub: this phone is not signed in\./);
    assert.equal(refusal()?.dessous("button").find((pose) => pose.className === "aide")?.ariaLabel, "github.com answered 200 — access_denied");
    assert.deepEqual(
      buttons().map((pose) => [pose.textContent, pose.disabled]),
      [[ITSELF_CONNECT, false]],
    );
    await itselfConnect();
    assert.equal(logins(), 2);
    assert.equal(refusal(), undefined);
  });

  test("le login qui ne part pas — GitHub injoignable, ou le pont qui lève — se dit sous le bouton, et l'écran reste", async () => {
    const unreachable = await atLaunch({ debut: () => ({ refus: "This phone could not reach GitHub: check its connection, then try again.", detail: "Unable to resolve host" }) });
    await unreachable.seConnecter();
    assert.match(unreachable.refus()?.textContent ?? "", /^This phone could not reach GitHub/);
    assert.equal(unreachable.vue.element("cadre").hidden, true);
    const lifted = await atLaunch({ debut: () => Promise.reject(new Error("the app's native bridge is missing")) });
    await lifted.seConnecter();
    assert.match(lifted.refus()?.textContent ?? "", /^The GitHub sign-in could not be started on this phone\./);
    assert.equal(lifted.refus()?.dessous("button").find((pose) => pose.className === "aide")?.ariaLabel, "the app's native bridge is missing");
  });

  test("une fin qui arrive sans login parti est laissée", async () => {
    const { vue } = await atLaunch();
    vue.dire("surConnexionGitHub", { connecte: true, compte: "benomite" });
    await repos();
    assert.equal(vue.element("cadre").hidden, true);
  });
});

describe("hors d'une installation neuve", () => {
  test("le téléphone déjà connecté : l'app s'ouvre sur « Tous les projets », le compte en tête, sans écran de connexion", async () => {
    const { vue, ecran: screen } = await atLaunch({ telephone: { github: { compte: null } } });
    assert.equal(vue.element("cadre").hidden, false);
    assert.equal(vue.element("tous").hidden, false);
    assert.match(screen().textContent, /^This phone is signed in to GitHub\./);
    assert.deepEqual(screen().dessous("button").filter((pose) => pose.parentElement?.className === "action"), []);
  });

  test("le desktop, qui ne rend aucun `telephone` : rien n'est posé, et sans projet l'app s'ouvre sur « Tous les projets » (#4799)", async () => {
    const { vue, ecran: screen } = await atLaunch({ telephone: null });
    assert.equal(screen().hidden, true);
    assert.equal(screen().children.length, 0);
    assert.equal(vue.element("cadre").hidden, false);
    assert.equal(vue.element("tous").hidden, false);
    assert.equal(vue.element("ajout").hidden, true);
  });
});

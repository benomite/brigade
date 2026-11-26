// Le compte GitHub de cet ordinateur (#2475), tel que le premier lancement et l'écran « Add a project » le disent (#3181) :
// tel que son `gh` le tient — jamais tapé. Connecté, « Connected to GitHub as <login>. » et de quoi changer de compte ;
// sans compte, un bouton « connect to GitHub » et rien d'autre à remplir ; changé, le compte est relu. Joué devant un
// faux document : ni Electron, ni navigateur.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { AccountGitHub } from "../../src/connection-github.ts";
import {
  CHANGER_DE_ACCOUNT,
  connecteEnTantQue,
  poserLeAccount,
  type StateDuAccount,
  type ActionsDuAccount,
  READ_DU_ACCOUNT,
  RELIRE_LE_ACCOUNT,
  SANS_ANSWER,
  SE_CONNECTER,
  holdLeAccount,
} from "../../src/vue/journey-project/account.js";
import { CONNECTION_EN_ROUTE, ROUVRIR_LA_PAGE, tapeLeCode } from "../../src/vue/journey-project/connection.js";
import { Faux, repos } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };

function uneStep(state: StateDuAccount) {
  const facts: string[] = [];
  const actions: ActionsDuAccount = {
    seConnecter: () => void facts.push("se connecter"),
    changerDeCompte: () => void facts.push("changer de compte"),
    relireLeCompte: () => void facts.push("relire le compte"),
    ouvrirLaPage: (url) => void facts.push(`page ${url}`),
  };
  const step = new Faux("div");
  step.append(...(poserLeAccount(doc, state, actions) as Faux[]));
  const boutons = () => step.dessous("button").filter((button) => button.className !== "aide").map((button) => button.textContent);
  const button = (texte: string) => step.dessous("button").find((candidat) => candidat.textContent === texte) ?? assert.fail(`pas de bouton « ${texte} » : ${boutons().join(", ")}`);
  return { etape: step, faits: facts, bouton: button, boutons };
}

describe("connecté : l'étape dit le compte de cet ordinateur", () => {
  test("« Connected to GitHub as <login>. », le login en gras, tel que `gh` le tient", () => {
    const { etape: step } = uneStep({ compte: { login: "octo-chef" } });
    const dit = step.dessous("p").find((pose) => pose.className === "compte-connecte") ?? assert.fail("pas de compte dit");
    assert.equal(dit.textContent, "Connected to GitHub as octo-chef.");
    assert.equal(connecteEnTantQue("octo-chef"), "Connected to GitHub as octo-chef.");
    assert.deepEqual(dit.dessous("strong").map((login) => [login.textContent, login.className]), [["octo-chef", "mono"]]);
  });

  test("aucun champ à remplir, dans aucun état de l'étape", () => {
    const states: StateDuAccount[] = [{}, { compte: { login: "octo-chef" } }, { compte: { nonConnecte: true } }, { compte: { refus: "GitHub cannot be reached from this computer." } }, { compte: { nonConnecte: true }, connexion: { code: "A1B2-C3D4", page: "https://github.com/login/device" } }];
    for (const state of states) {
      const { etape: step } = uneStep(state);
      assert.deepEqual([...step.dessous("input"), ...step.dessous("label"), ...step.dessous("select")], []);
    }
  });
});

describe("sans compte connecté : un bouton « connect to GitHub », et rien d'autre", () => {
  test("le seul geste de l'étape, recommandé ; un clic lance la connexion", () => {
    const { faits: facts, bouton: button, boutons } = uneStep({ compte: { nonConnecte: true } });
    assert.deepEqual(boutons(), [SE_CONNECTER]);
    assert.equal(SE_CONNECTER, "connect to GitHub");
    assert.equal(button(SE_CONNECTER).className, "recommande");
    button(SE_CONNECTER).click();
    assert.deepEqual(facts, ["se connecter"]);
  });

  test("lancée, le bouton attend et le code à taper se lit ; la page se rouvre d'un bouton", () => {
    assert.equal(uneStep({ compte: { nonConnecte: true }, connexion: { enRoute: true } }).bouton(CONNECTION_EN_ROUTE).disabled, true);
    const { etape: step, bouton: button, faits: facts } = uneStep({ compte: { nonConnecte: true }, connexion: { code: "A1B2-C3D4", page: "https://github.com/login/device" } });
    assert.equal(step.dessous("p").find((pose) => pose.className === "code-de-connexion")?.textContent, tapeLeCode("A1B2-C3D4"));
    button(ROUVRIR_LA_PAGE).click();
    assert.deepEqual(facts, ["page https://github.com/login/device"]);
  });

  test("en lecture, l'étape le dit ; illisible, la raison en une phrase, le détail au survol, la page qui la lève et « read again »", () => {
    assert.equal(uneStep({}).etape.dessous("p").find((pose) => pose.role === "status")?.textContent, READ_DU_ACCOUNT);
    const { etape: step, bouton: button, faits: facts } = uneStep({ compte: { refus: "The GitHub CLI (`gh`) is not installed on this computer.", detail: "spawn gh ENOENT", lien: "https://cli.github.com" } });
    const refusal = step.dessous("p").find((pose) => pose.className === "refus") ?? assert.fail("pas de raison");
    assert.equal(refusal.dessous("span")[0]?.textContent, "The GitHub CLI (gh) is not installed on this computer.");
    assert.equal(refusal.dessous("button")[0]?.ariaLabel, "spawn gh ENOENT");
    assert.equal(button("get the GitHub CLI").className, "recommande");
    button("get the GitHub CLI").click();
    button(RELIRE_LE_ACCOUNT).click();
    assert.deepEqual(facts, ["page https://cli.github.com", "relire le compte"]);
  });
});

describe("changer de compte : un geste visible, et le compte relu au bout", () => {
  test("connecté, « switch GitHub account » est dans l'étape — un geste second, son effet au survol —, et lance la connexion", () => {
    const { bouton: button, faits: facts, boutons } = uneStep({ compte: { login: "octo-chef" } });
    assert.deepEqual(boutons(), [CHANGER_DE_ACCOUNT]);
    assert.equal(button(CHANGER_DE_ACCOUNT).className, "");
    assert.match(button(CHANGER_DE_ACCOUNT).title, /another GitHub account/);
    button(CHANGER_DE_ACCOUNT).click();
    assert.deepEqual(facts, ["changer de compte"]);
  });

  test("le changement en route : le compte d'avant reste dit, le bouton attend, le code à taper se lit", () => {
    const { etape: step, bouton: button } = uneStep({ compte: { login: "octo-chef" }, connexion: { code: "A1B2-C3D4", page: "https://github.com/login/device" } });
    assert.equal(button(CONNECTION_EN_ROUTE).disabled, true);
    assert.ok(step.dessous("p").some((pose) => pose.textContent === connecteEnTantQue("octo-chef")));
    assert.equal(step.dessous("p").find((pose) => pose.className === "code-de-connexion")?.textContent, tapeLeCode("A1B2-C3D4"));
  });

  test("au bout de la connexion, le compte est relu : l'étape dit celui que l'ordinateur tient désormais", async () => {
    const answers: AccountGitHub[] = [{ login: "octo-chef" }, { login: "autre-chef" }];
    let lectures = 0;
    let rendus = 0;
    const account = holdLeAccount({ pont: { compteGitHub: async () => answers[lectures++] ?? assert.fail("une lecture de trop") }, rendre: () => void rendus++ });
    account.lireUneFois();
    account.lireUneFois();
    await repos();
    assert.equal(lectures, 1);
    assert.deepEqual(account.etat.compte, { login: "octo-chef" });
    account.apresLaConnexion();
    // En route : l'étape dit qu'elle lit.
    assert.equal(account.etat.compte, undefined);
    await repos();
    assert.equal(lectures, 2);
    assert.ok(rendus >= 4);
    const { etape: step } = uneStep(account.etat);
    assert.ok(step.dessous("p").some((pose) => pose.textContent === connecteEnTantQue("autre-chef")));
  });

  test("une lecture qui ne répond pas, ou lève, se dit en une phrase ; la dernière demandée l'emporte", async () => {
    const muet = holdLeAccount({ pont: {}, rendre: () => {} });
    await muet.lire();
    assert.deepEqual(muet.etat.compte, { refus: SANS_ANSWER });
    const leve = holdLeAccount({ pont: { compteGitHub: () => Promise.reject(new Error("ipc fermé")) }, rendre: () => {} });
    await leve.lire();
    assert.deepEqual(leve.etat.compte, { refus: SANS_ANSWER, detail: "ipc fermé" });
    const rendre: Array<(account: AccountGitHub) => void> = [];
    const croisees = holdLeAccount({ pont: { compteGitHub: () => new Promise((resoudre) => void rendre.push(resoudre)) }, rendre: () => {} });
    const first = croisees.lire();
    const seconde = croisees.lire();
    rendre[1]?.({ login: "autre-chef" });
    rendre[0]?.({ login: "octo-chef" });
    await Promise.all([first, seconde]);
    assert.deepEqual(croisees.etat.compte, { login: "autre-chef" });
  });
});

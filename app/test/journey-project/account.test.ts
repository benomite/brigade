// Le compte GitHub de cet ordinateur (#2475), tel que le premier lancement et l'écran « Add a project » le disent (#3181) :
// tel que son `gh` le tient — jamais tapé. Connecté, « Connected to GitHub as <login>. » et de quoi changer de compte ;
// sans compte, un bouton « connect to GitHub » et rien d'autre à remplir ; changé, le compte est relu. Joué devant un
// faux document : ni Electron, ni navigateur.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { AccountGitHub } from "../../src/connection-github.ts";
import {
  CHANGE_OF_ACCOUNT,
  connectedAs,
  setTheAccount,
  type StateOfAccount,
  type ActionsOfAccount,
  READ_OF_ACCOUNT,
  REREAD_THE_ACCOUNT,
  WITHOUT_ANSWER,
  ITSELF_CONNECT,
  holdTheAccount,
} from "../../src/vue/addition-project/account.js";
import { CONNECTION_IN_ROUTE, REOPEN_THE_PAGE, tapeTheCode } from "../../src/vue/addition-project/connection.js";
import { Fake, repos } from "../helpers/false-vue.ts";

const doc = { createElement: (balise: string) => new Fake(balise) };

function oneStep(state: StateOfAccount) {
  const facts: string[] = [];
  const actions: ActionsOfAccount = {
    seConnecter: () => void facts.push("se connecter"),
    changerDeCompte: () => void facts.push("changer de compte"),
    relireLeCompte: () => void facts.push("relire le compte"),
    ouvrirLaPage: (url) => void facts.push(`page ${url}`),
  };
  const step = new Fake("div");
  step.append(...(setTheAccount(doc, state, actions) as Fake[]));
  const buttons = () => step.dessous("button").filter((button) => button.className !== "aide").map((button) => button.textContent);
  const button = (text: string) => step.dessous("button").find((candidate) => candidate.textContent === text) ?? assert.fail(`pas de bouton « ${text} » : ${buttons().join(", ")}`);
  return { etape: step, faits: facts, bouton: button, boutons: buttons };
}

describe("connecté : l'étape dit le compte de cet ordinateur", () => {
  test("« Connected to GitHub as <login>. », le login en gras, tel que `gh` le tient", () => {
    const { etape: step } = oneStep({ compte: { login: "octo-chef" } });
    const said = step.dessous("p").find((pose) => pose.className === "compte-connecte") ?? assert.fail("pas de compte dit");
    assert.equal(said.textContent, "Connected to GitHub as octo-chef.");
    assert.equal(connectedAs("octo-chef"), "Connected to GitHub as octo-chef.");
    assert.deepEqual(said.dessous("strong").map((login) => [login.textContent, login.className]), [["octo-chef", "mono"]]);
  });

  test("aucun champ à remplir, dans aucun état de l'étape", () => {
    const states: StateOfAccount[] = [{}, { compte: { login: "octo-chef" } }, { compte: { nonConnecte: true } }, { compte: { refus: "GitHub cannot be reached from this computer." } }, { compte: { nonConnecte: true }, connexion: { code: "A1B2-C3D4", page: "https://github.com/login/device" } }];
    for (const state of states) {
      const { etape: step } = oneStep(state);
      assert.deepEqual([...step.dessous("input"), ...step.dessous("label"), ...step.dessous("select")], []);
    }
  });
});

describe("sans compte connecté : un bouton « connect to GitHub », et rien d'autre", () => {
  test("le seul geste de l'étape, recommandé ; un clic lance la connexion", () => {
    const { faits: facts, bouton: button, boutons: buttons } = oneStep({ compte: { nonConnecte: true } });
    assert.deepEqual(buttons(), [ITSELF_CONNECT]);
    assert.equal(ITSELF_CONNECT, "connect to GitHub");
    assert.equal(button(ITSELF_CONNECT).className, "recommande");
    button(ITSELF_CONNECT).click();
    assert.deepEqual(facts, ["se connecter"]);
  });

  test("lancée, le bouton attend et le code à taper se lit ; la page se rouvre d'un bouton", () => {
    assert.equal(oneStep({ compte: { nonConnecte: true }, connexion: { enRoute: true } }).bouton(CONNECTION_IN_ROUTE).disabled, true);
    const { etape: step, bouton: button, faits: facts } = oneStep({ compte: { nonConnecte: true }, connexion: { code: "A1B2-C3D4", page: "https://github.com/login/device" } });
    assert.equal(step.dessous("p").find((pose) => pose.className === "code-de-connexion")?.textContent, tapeTheCode("A1B2-C3D4"));
    button(REOPEN_THE_PAGE).click();
    assert.deepEqual(facts, ["page https://github.com/login/device"]);
  });

  test("en lecture, l'étape le dit ; illisible, la raison en une phrase, le détail au survol, la page qui la lève et « read again »", () => {
    assert.equal(oneStep({}).etape.dessous("p").find((pose) => pose.role === "status")?.textContent, READ_OF_ACCOUNT);
    const { etape: step, bouton: button, faits: facts } = oneStep({ compte: { refus: "The GitHub CLI (`gh`) is not installed on this computer.", detail: "spawn gh ENOENT", lien: "https://cli.github.com" } });
    const refusal = step.dessous("p").find((pose) => pose.className === "refus") ?? assert.fail("pas de raison");
    assert.equal(refusal.dessous("span")[0]?.textContent, "The GitHub CLI (gh) is not installed on this computer.");
    assert.equal(refusal.dessous("button")[0]?.ariaLabel, "spawn gh ENOENT");
    assert.equal(button("get the GitHub CLI").className, "recommande");
    button("get the GitHub CLI").click();
    button(REREAD_THE_ACCOUNT).click();
    assert.deepEqual(facts, ["page https://cli.github.com", "relire le compte"]);
  });
});

describe("changer de compte : un geste visible, et le compte relu au bout", () => {
  test("connecté, « switch GitHub account » est dans l'étape — un geste second, son effet au survol —, et lance la connexion", () => {
    const { bouton: button, faits: facts, boutons: buttons } = oneStep({ compte: { login: "octo-chef" } });
    assert.deepEqual(buttons(), [CHANGE_OF_ACCOUNT]);
    assert.equal(button(CHANGE_OF_ACCOUNT).className, "");
    assert.match(button(CHANGE_OF_ACCOUNT).title, /another GitHub account/);
    button(CHANGE_OF_ACCOUNT).click();
    assert.deepEqual(facts, ["changer de compte"]);
  });

  test("le changement en route : le compte d'avant reste dit, le bouton attend, le code à taper se lit", () => {
    const { etape: step, bouton: button } = oneStep({ compte: { login: "octo-chef" }, connexion: { code: "A1B2-C3D4", page: "https://github.com/login/device" } });
    assert.equal(button(CONNECTION_IN_ROUTE).disabled, true);
    assert.ok(step.dessous("p").some((pose) => pose.textContent === connectedAs("octo-chef")));
    assert.equal(step.dessous("p").find((pose) => pose.className === "code-de-connexion")?.textContent, tapeTheCode("A1B2-C3D4"));
  });

  test("au bout de la connexion, le compte est relu : l'étape dit celui que l'ordinateur tient désormais", async () => {
    const answers: AccountGitHub[] = [{ login: "octo-chef" }, { login: "autre-chef" }];
    let readings = 0;
    let renderedOnes = 0;
    const account = holdTheAccount({ pont: { compteGitHub: async () => answers[readings++] ?? assert.fail("une lecture de trop") }, rendre: () => void renderedOnes++ });
    account.lireUneFois();
    account.lireUneFois();
    await repos();
    assert.equal(readings, 1);
    assert.deepEqual(account.etat.compte, { login: "octo-chef" });
    account.apresLaConnexion();
    // En route : l'étape dit qu'elle lit.
    assert.equal(account.etat.compte, undefined);
    await repos();
    assert.equal(readings, 2);
    assert.ok(renderedOnes >= 4);
    const { etape: step } = oneStep(account.etat);
    assert.ok(step.dessous("p").some((pose) => pose.textContent === connectedAs("autre-chef")));
  });

  test("une lecture qui ne répond pas, ou lève, se dit en une phrase ; la dernière demandée l'emporte", async () => {
    const silent = holdTheAccount({ pont: {}, rendre: () => {} });
    await silent.lire();
    assert.deepEqual(silent.etat.compte, { refus: WITHOUT_ANSWER });
    const lifted = holdTheAccount({ pont: { compteGitHub: () => Promise.reject(new Error("ipc fermé")) }, rendre: () => {} });
    await lifted.lire();
    assert.deepEqual(lifted.etat.compte, { refus: WITHOUT_ANSWER, detail: "ipc fermé" });
    const render: Array<(account: AccountGitHub) => void> = [];
    const crossed = holdTheAccount({ pont: { compteGitHub: () => new Promise((resolve) => void render.push(resolve)) }, rendre: () => {} });
    const first = crossed.lire();
    const second = crossed.lire();
    render[1]?.({ login: "autre-chef" });
    render[0]?.({ login: "octo-chef" });
    await Promise.all([first, second]);
    assert.deepEqual(crossed.etat.compte, { login: "autre-chef" });
  });
});

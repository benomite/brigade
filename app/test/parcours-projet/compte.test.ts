// L'étape du compte, la première du parcours d'ajout (#2475, épique #2473) : le compte GitHub de cet ordinateur, tel
// que son `gh` le tient — jamais tapé. Connecté, « Connected to GitHub as <login>. » et de quoi changer de compte ;
// sans compte, un bouton « connect to GitHub » et rien d'autre à remplir ; changé, le compte est relu. Joué devant un
// faux document : ni Electron, ni navigateur.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { CompteGitHub } from "../../src/connexion-github.ts";
import {
  CHANGER_DE_COMPTE,
  connecteEnTantQue,
  etapeDuCompte,
  LECTURE_DU_COMPTE,
  RELIRE_LE_COMPTE,
  SANS_REPONSE,
  SE_CONNECTER,
  tenirLeCompte,
} from "../../src/vue/parcours-projet/compte.js";
import { CONNEXION_EN_ROUTE, ROUVRIR_LA_PAGE, tapeLeCode } from "../../src/vue/parcours-projet/connexion.js";
import { poserParcoursProjet, type EtatDuParcours, type GestesDuParcours } from "../../src/vue/parcours-projet/parcours.js";
import { Faux, repos } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };

function uneEtape(etat: EtatDuParcours) {
  const faits: string[] = [];
  const gestes: GestesDuParcours = {
    seConnecter: () => void faits.push("se connecter"),
    changerDeCompte: () => void faits.push("changer de compte"),
    relireLeCompte: () => void faits.push("relire le compte"),
    ouvrirLaPage: (url) => void faits.push(`page ${url}`),
  };
  const ecran = poserParcoursProjet(doc, etat, gestes, { etapes: [etapeDuCompte] }) as Faux;
  const etape = ecran.dessous("li").find((ligne) => ligne.dataset.etape === "compte") ?? assert.fail("pas d'étape du compte");
  const boutons = () => etape.dessous("button").filter((bouton) => bouton.className !== "aide").map((bouton) => bouton.textContent);
  const bouton = (texte: string) => etape.dessous("button").find((candidat) => candidat.textContent === texte) ?? assert.fail(`pas de bouton « ${texte} » : ${boutons().join(", ")}`);
  return { etape, faits, bouton, boutons };
}

describe("connecté : l'étape dit le compte de cet ordinateur", () => {
  test("« Connected to GitHub as <login>. », le login en gras, tel que `gh` le tient ; l'étape est faite", () => {
    const { etape } = uneEtape({ compte: { login: "octo-chef" } });
    const dit = etape.dessous("p").find((pose) => pose.className === "compte-connecte") ?? assert.fail("pas de compte dit");
    assert.equal(dit.textContent, "Connected to GitHub as octo-chef.");
    assert.equal(connecteEnTantQue("octo-chef"), "Connected to GitHub as octo-chef.");
    assert.deepEqual(dit.dessous("strong").map((login) => [login.textContent, login.className]), [["octo-chef", "mono"]]);
    assert.equal(etape.dataset.etat, "faite");
    assert.equal(etapeDuCompte.faite({ compte: { login: "octo-chef" } }), true);
  });

  test("aucun champ à remplir, dans aucun état de l'étape", () => {
    const etats: EtatDuParcours[] = [{}, { compte: { login: "octo-chef" } }, { compte: { nonConnecte: true } }, { compte: { refus: "GitHub cannot be reached from this computer." } }, { compte: { nonConnecte: true }, connexion: { code: "A1B2-C3D4", page: "https://github.com/login/device" } }];
    for (const etat of etats) {
      const { etape } = uneEtape(etat);
      assert.deepEqual([...etape.dessous("input"), ...etape.dessous("label"), ...etape.dessous("select")], []);
    }
  });
});

describe("sans compte connecté : un bouton « connect to GitHub », et rien d'autre", () => {
  test("le seul geste de l'étape, recommandé ; un clic lance la connexion", () => {
    const { etape, faits, bouton, boutons } = uneEtape({ compte: { nonConnecte: true } });
    assert.deepEqual(boutons(), [SE_CONNECTER]);
    assert.equal(SE_CONNECTER, "connect to GitHub");
    assert.equal(bouton(SE_CONNECTER).className, "recommande");
    assert.equal(etape.dataset.etat, "courante");
    bouton(SE_CONNECTER).click();
    assert.deepEqual(faits, ["se connecter"]);
  });

  test("lancée, le bouton attend et le code à taper se lit ; la page se rouvre d'un bouton", () => {
    assert.equal(uneEtape({ compte: { nonConnecte: true }, connexion: { enRoute: true } }).bouton(CONNEXION_EN_ROUTE).disabled, true);
    const { etape, bouton, faits } = uneEtape({ compte: { nonConnecte: true }, connexion: { code: "A1B2-C3D4", page: "https://github.com/login/device" } });
    assert.equal(etape.dessous("p").find((pose) => pose.className === "code-de-connexion")?.textContent, tapeLeCode("A1B2-C3D4"));
    bouton(ROUVRIR_LA_PAGE).click();
    assert.deepEqual(faits, ["page https://github.com/login/device"]);
  });

  test("en lecture, l'étape le dit ; illisible, la raison en une phrase, le détail au survol, la page qui la lève et « read again »", () => {
    assert.equal(uneEtape({}).etape.dessous("p").find((pose) => pose.role === "status")?.textContent, LECTURE_DU_COMPTE);
    const { etape, bouton, faits } = uneEtape({ compte: { refus: "The GitHub CLI (`gh`) is not installed on this computer.", detail: "spawn gh ENOENT", lien: "https://cli.github.com" } });
    const refus = etape.dessous("p").find((pose) => pose.className === "refus") ?? assert.fail("pas de raison");
    assert.equal(refus.dessous("span")[0]?.textContent, "The GitHub CLI (gh) is not installed on this computer.");
    assert.equal(refus.dessous("button")[0]?.ariaLabel, "spawn gh ENOENT");
    assert.equal(bouton("get the GitHub CLI").className, "recommande");
    bouton("get the GitHub CLI").click();
    bouton(RELIRE_LE_COMPTE).click();
    assert.deepEqual(faits, ["page https://cli.github.com", "relire le compte"]);
  });
});

describe("changer de compte : un geste visible, et le compte relu au bout", () => {
  test("connecté, « switch GitHub account » est dans l'étape — un geste second, son effet au survol —, et lance la connexion", () => {
    const { bouton, faits, boutons } = uneEtape({ compte: { login: "octo-chef" } });
    assert.deepEqual(boutons(), [CHANGER_DE_COMPTE]);
    assert.equal(bouton(CHANGER_DE_COMPTE).className, "");
    assert.match(bouton(CHANGER_DE_COMPTE).title, /another GitHub account/);
    bouton(CHANGER_DE_COMPTE).click();
    assert.deepEqual(faits, ["changer de compte"]);
  });

  test("le changement en route : le compte d'avant reste dit, le bouton attend, le code à taper se lit", () => {
    const { etape, bouton } = uneEtape({ compte: { login: "octo-chef" }, connexion: { code: "A1B2-C3D4", page: "https://github.com/login/device" } });
    assert.equal(bouton(CONNEXION_EN_ROUTE).disabled, true);
    assert.ok(etape.dessous("p").some((pose) => pose.textContent === connecteEnTantQue("octo-chef")));
    assert.equal(etape.dessous("p").find((pose) => pose.className === "code-de-connexion")?.textContent, tapeLeCode("A1B2-C3D4"));
  });

  test("au bout de la connexion, le compte est relu : l'étape dit celui que l'ordinateur tient désormais", async () => {
    const reponses: CompteGitHub[] = [{ login: "octo-chef" }, { login: "autre-chef" }];
    let lectures = 0;
    let rendus = 0;
    const compte = tenirLeCompte({ pont: { compteGitHub: async () => reponses[lectures++] ?? assert.fail("une lecture de trop") }, rendre: () => void rendus++ });
    compte.lireUneFois();
    compte.lireUneFois();
    await repos();
    assert.equal(lectures, 1);
    assert.deepEqual(compte.etat.compte, { login: "octo-chef" });
    compte.apresLaConnexion();
    // En route : l'étape dit qu'elle lit.
    assert.equal(compte.etat.compte, undefined);
    await repos();
    assert.equal(lectures, 2);
    assert.ok(rendus >= 4);
    const { etape } = uneEtape(compte.etat);
    assert.ok(etape.dessous("p").some((pose) => pose.textContent === connecteEnTantQue("autre-chef")));
  });

  test("une lecture qui ne répond pas, ou lève, se dit en une phrase ; la dernière demandée l'emporte", async () => {
    const muet = tenirLeCompte({ pont: {}, rendre: () => {} });
    await muet.lire();
    assert.deepEqual(muet.etat.compte, { refus: SANS_REPONSE });
    const leve = tenirLeCompte({ pont: { compteGitHub: () => Promise.reject(new Error("ipc fermé")) }, rendre: () => {} });
    await leve.lire();
    assert.deepEqual(leve.etat.compte, { refus: SANS_REPONSE, detail: "ipc fermé" });
    const rendre: Array<(compte: CompteGitHub) => void> = [];
    const croisees = tenirLeCompte({ pont: { compteGitHub: () => new Promise((resoudre) => void rendre.push(resoudre)) }, rendre: () => {} });
    const premiere = croisees.lire();
    const seconde = croisees.lire();
    rendre[1]?.({ login: "autre-chef" });
    rendre[0]?.({ login: "octo-chef" });
    await Promise.all([premiere, seconde]);
    assert.deepEqual(croisees.etat.compte, { login: "autre-chef" });
  });
});

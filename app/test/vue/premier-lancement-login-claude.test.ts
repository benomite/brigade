// Le premier lancement, Claude Code pas connecté sur cet ordinateur (#4057) : l'ouverture d'un projet ne démarre rien, sa
// phrase le dit sous la station avec « log in » — le login de la panne « Max connection lost » —, et la fin du login
// relance l'ouverture : connecté, la copie part et la cuisine démarre. Le login rendu se dit sous la phrase.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { StationsDuChef } from "../../../runtime/src/appairage/stations-du-chef.ts";
import { ALLUMAGE } from "../../src/allumage.ts";
import { pourLaBarre } from "../../src/barre.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS } from "../../src/gestes.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { PAS_CONNECTE, type Ouverture } from "../../src/premier-lancement.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import { ouvertureDe, ouvertureDite, REESSAYER, SE_CONNECTER_A_CLAUDE } from "../../src/vue/premier-lancement.js";
import { Faux, jouerLaVue, repos } from "../aides/fausse-vue.ts";

const VU = "2026-11-24T09:00:00.000Z";
const LISTEES: StationsDuChef = {
  state: "listed",
  unreadable: [],
  stations: [{ id: "gbox", name: "parade-box", machine: "Debian 12", kind: "ordinateur", cooks: true, version: "2.4.0", online: true, lastSeen: VU, stoppedAt: null, projects: [{ name: "parade", repository: "benomite/parade" }] }],
};
const demarrage = () => ({
  configuration: pourLaBarre({ chemin: "/home/chef/.config/brigade/app.json", projets: [] }),
  poste: { nom: "this computer", mac: false },
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
});
const RETENUE: Ouverture = { state: "login", project: "parade", repository: "benomite/parade", cause: "login" as const, reason: PAS_CONNECTE("parade") };
const EN_ATTENTE = new Promise<Ouverture>(() => {}) as unknown as Ouverture;

test("not logged in: the step says so under its station and offers log in; the login's end opens the project again", async () => {
  let essais = 0;
  const vue = await jouerLaVue({
    demarrage,
    stationsDuChef: () => LISTEES,
    compteGitHub: () => ({ login: "chef" }),
    ouvrirDUneStation: () => (++essais === 1 ? RETENUE : EN_ATTENTE),
    seConnecterAClaude: () => ({ fait: "the login page opens in your browser" }),
    espace: () => [],
  });
  (vue.element("tous").dessous("button").find((bouton) => bouton.textContent === "parade") ?? assert.fail()).click();
  await repos();
  const tous = vue.element("tous");
  assert.equal((tous.dessous("p").find((pose) => pose.className === "refus") ?? assert.fail("no sentence")).dessous("span")[0]?.textContent, PAS_CONNECTE("parade"));
  (tous.dessous("button").find((bouton) => bouton.textContent === SE_CONNECTER_A_CLAUDE) ?? assert.fail("no log in")).click();
  await repos();
  assert.equal(vue.appels.filter(({ geste }) => geste === "seConnecterAClaude").length, 1);
  assert.ok(vue.element("tous").dessous("p").some((pose) => pose.textContent === "the login page opens in your browser"), "the login's answer is said");
  assert.equal(essais, 1, "nothing opens before the login ends");
  vue.dire("surLoginClaude");
  await repos();
  assert.equal(essais, 2);
  assert.equal(vue.element("tous").dessous("p").find((pose) => pose.className === "ouverture")?.textContent, ouvertureDe("parade"));
});

test("a login's end with no opening held back opens nothing", async () => {
  let essais = 0;
  const vue = await jouerLaVue({ demarrage, stationsDuChef: () => LISTEES, ouvrirDUneStation: () => (++essais, EN_ATTENTE), espace: () => [] });
  vue.dire("surLoginClaude");
  await repos();
  assert.equal(essais, 0);
});

test("a login that could not start says why, under the sentence, and log in stays", () => {
  const doc = { createElement: (balise: string) => new Faux(balise) };
  const ouverture = { station: "gbox", projet: "parade", depot: "benomite/parade", echec: RETENUE as Extract<Ouverture, { state: "login" }>, login: { refus: "the login was not launched" } };
  const geste = { ouvrir: () => {}, seConnecter: () => {}, seConnecterAClaude: () => {}, ouvrirLaPage: () => {} };
  const poses = ouvertureDite(doc, ouverture, {}, geste) as unknown as Faux[];
  const textes = poses.flatMap((pose) => [pose, ...pose.descendants()]).map((pose) => pose.textContent);
  assert.ok(textes.includes("the login was not launched"));
  assert.deepEqual(
    poses.flatMap((pose) => pose.dessous("button")).map((bouton) => bouton.textContent),
    [SE_CONNECTER_A_CLAUDE, REESSAYER],
  );
});

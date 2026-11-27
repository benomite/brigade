// Les outils requis dans la vue jouée (#4059) : le premier lancement les vérifie d'abord — un outil qui manque prend la
// place du compte, la connexion ne tourne pas, l'ouverture d'un projet attend et repart une fois l'outil installé —, et
// le login Max sans Claude Code montre son écran dans l'avis.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Home } from "../../src/home.ts";
import { forTheBar } from "../../src/bar.ts";
import { EXAMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/colors.ts";
import { BANNER } from "../../src/facts.ts";
import { TABS, HEADINGS } from "../../src/tabs.ts";
import type { ToolMissing, ToolRequired } from "../../src/tools-required.ts";
import type { StationsOfChef } from "../../src/first-launch.ts";
import type { Outage } from "../../src/outages/outages.ts";
import { EFFORTS, MODELS } from "../../src/projects/projects.ts";
import type { StationVue } from "../../src/stations/stations.ts";
import { ITSELF_CONNECT } from "../../src/vue/journey-project/account.js";
import { OPEN_THIS_PROJECT } from "../../src/vue/first-launch.js";
import { ALREADY_INSTALLS } from "../../src/vue/tools-required/tools-required.js";
import { type Fake, type Played, playTheVue, openAllTheStations, repos } from "../helpers/false-vue.ts";

const base = () => ({
  palette: PALETTE,
  exemple: EXAMPLE,
  onglets: TABS,
  rubriques: HEADINGS,
  gestes: {},
  banniere: BANNER,
  calibrage: { modeles: MODELS, efforts: EFFORTS },
  code: undefined,
});
const fresh = () => ({ ...base(), configuration: forTheBar({ chemin: "/home/chef/.config/brigade/app.json", projets: [] }), poste: { nom: "this Mac", mac: true } });
// Le `gh` de ce Mac n'est connecté à aucun compte, tel que le process principal le lit.
const WITHOUT_ACCOUNT: StationsOfChef = {
  state: "sign-in-required",
  reason: "This computer is not signed in to GitHub, so brigade cannot read the stations you have paired.",
  action: { id: "github-sign-in", label: "Sign in to GitHub", command: ["gh", "auth", "login", "--hostname", "github.com", "--web", "--git-protocol", "https"] },
};
// Ce qui manque à un Mac nu, et le pas qui l'installe.
const INSTALLATIONS: Record<ToolRequired, ToolMissing["installation"]> = {
  gh: { texte: "Install the GitHub CLI with its macOS installer: on its latest release, download the file ending in `macOS_universal.pkg` and open it.", lien: "https://cli.github.com" },
  git: { texte: "Install Git with Apple's command line developer tools: run `xcode-select --install` in a terminal, then follow the installer macOS opens.", lien: "https://git-scm.com/download/mac" },
  claude: { texte: "Install Claude Code with its official installer: run `curl -fsSL https://claude.ai/install.sh | bash` in a terminal.", lien: "https://code.claude.com/docs/en/setup" },
};
const missing = (tool: ToolRequired): ToolMissing => ({ outil: tool, installation: INSTALLATIONS[tool] });

const all = (vue: Played) => vue.element("tous");
const buttons = (or: Fake) => or.dessous("button").map((b) => b.textContent);
const button = (or: Fake, text: string) => or.dessous("button").find((b) => b.textContent === text) ?? assert.fail(`pas de bouton « ${text} » : ${buttons(or).join(", ")}`);
const toolMissing = (or: Fake) => or.dessous("section").find((s) => s.className === "ecran-outil-manquant");
const calls = (vue: Played, action: string) => vue.appels.filter((call) => call.geste === action);

test("sans gh, le premier lancement montre son écran à la place du compte ; installé, le compte revient, sans connexion lancée", async () => {
  let lack: ToolMissing[] = [missing("gh")];
  const vue = await playTheVue({ demarrage: fresh, stationsDuChef: () => WITHOUT_ACCOUNT, compteGitHub: () => ({ nonConnecte: true }), outilsManquants: () => lack, espace: () => [] });
  await repos();
  assert.deepEqual(calls(vue, "outilsManquants")[0]?.args, [["git", "gh"]]);
  const screen = toolMissing(all(vue)) ?? assert.fail("pas d'écran de l'outil manquant");
  assert.equal(screen.dataset.outil, "gh");
  assert.ok(!buttons(all(vue)).includes(ITSELF_CONNECT), "le bouton de connexion attend l'outil");
  // Le projet se tape toujours dessous.
  assert.ok(buttons(all(vue)).includes(OPEN_THIS_PROJECT));
  lack = [];
  button(all(vue), ALREADY_INSTALLS).click();
  await repos();
  assert.equal(toolMissing(all(vue)), undefined);
  assert.ok(buttons(all(vue)).includes(ITSELF_CONNECT));
  assert.equal(calls(vue, "seConnecterAGitHub").length, 0);
});

test("la connexion vérifie d'abord : gh parti entre-temps, elle ne tourne pas, et son écran le dit", async () => {
  let lack: ToolMissing[] = [];
  const vue = await playTheVue({ demarrage: fresh, stationsDuChef: () => WITHOUT_ACCOUNT, compteGitHub: () => ({ nonConnecte: true }), outilsManquants: () => lack, seConnecterAGitHub: () => ({ code: "ABCD-1234", page: "https://github.com/login/device" }), espace: () => [] });
  await repos();
  lack = [missing("gh")];
  button(all(vue), ITSELF_CONNECT).click();
  await repos();
  assert.equal(calls(vue, "seConnecterAGitHub").length, 0);
  assert.equal(toolMissing(all(vue))?.dataset.outil, "gh");
  // Là, la connexion part.
  lack = [];
  button(all(vue), ALREADY_INSTALLS).click();
  await repos();
  button(all(vue), ITSELF_CONNECT).click();
  await repos();
  assert.equal(calls(vue, "seConnecterAGitHub").length, 1);
});

test("sans git, l'ouverture d'un projet attend son écran, puis repart d'elle-même, le projet tapé gardé", async () => {
  let lack: ToolMissing[] = [];
  const vue = await playTheVue({
    demarrage: fresh,
    stationsDuChef: () => WITHOUT_ACCOUNT,
    compteGitHub: () => ({ login: "chef" }),
    outilsManquants: () => lack,
    ouvrirDUneStation: (name: string, repository: string) => ({ state: "failed", project: name, repository: repository, cause: "unknown", reason: "stop here" }),
    espace: () => [],
  });
  await repos();
  lack = [missing("git")];
  const field = all(vue).dessous("input").find((entry) => entry.id === "projet-du-premier") ?? assert.fail("pas de champ");
  field.value = "chef/parade";
  field.declencher("input");
  button(all(vue), OPEN_THIS_PROJECT).click();
  await repos();
  assert.equal(calls(vue, "ouvrirDUneStation").length, 0);
  assert.equal(toolMissing(all(vue))?.dataset.outil, "git");
  lack = [];
  button(all(vue), ALREADY_INSTALLS).click();
  await repos();
  assert.deepEqual(calls(vue, "ouvrirDUneStation").map(({ args }) => args.slice(0, 2)), [["parade", "chef/parade"]]);
});

const CONNECTION: Outage = { cle: "connexion-max:2026-10-15T11:48:00.000Z", sujet: "connexion-max", ligne: "Max connection lost 12 min ago", survol: "nothing cooks on box until you log in", bouton: { libelle: "log in", geste: "login" } };
const BOX: StationVue = { id: "g1", nom: "box", machine: "macOS 26", etat: "en-ligne", ligne: "online · no project", pannes: [CONNECTION], dit: "online", version: "1.4.0", projets: [], max: "perdue" };
const HOME: Home = { projets: [], stations: [{ id: "g1", nom: "box", ton: "rouge", dit: "online · Max connection lost", phrase: "online · no cook running", survol: "macOS 26" }], sante: { ton: "rouge", dit: "Max: connection lost on box", survol: "" } };

test("le login Max sans Claude Code : l'écran de l'outil manquant s'ouvre dans l'avis, et se referme une fois installé", async () => {
  let lack: ToolMissing[] = [missing("claude")];
  const vue = await playTheVue({
    demarrage: () => ({ ...base(), configuration: forTheBar({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true), stations: { a: "2026-10-15T12:00:00.000Z", stations: [BOX] }, accueil: HOME }),
    panne: () => ({ outilManquant: "claude", refus: "the login was not launched: Claude Code is not installed on this computer" }),
    outilsManquants: () => lack,
    espace: () => [],
  });
  await openAllTheStations(vue);
  (vue.element("toutes-les-stations").dessous("button").find(({ className }) => className === "ligne") ?? assert.fail("pas de ligne de station")).click();
  await repos();
  const opinion = vue.element("avis");
  assert.equal(opinion.hidden, true);
  button(vue.element("station"), "log in").click();
  await repos();
  assert.deepEqual(calls(vue, "outilsManquants").at(-1)?.args, [["claude"]]);
  assert.equal(opinion.hidden, false);
  assert.equal(toolMissing(opinion)?.dataset.outil, "claude");
  assert.match(opinion.textContent, /Claude Code is not installed on this computer/);
  lack = [];
  button(opinion, ALREADY_INSTALLS).click();
  await repos();
  assert.equal(opinion.hidden, true);
  // Un login qui part ne l'ouvre pas.
  lack = [missing("claude")];
  const other = await playTheVue({
    demarrage: () => ({ ...base(), configuration: forTheBar({ chemin: "/tmp/app.json", projets: [{ nom: "parade", dossier: "/tmp/parade" }] }, () => true), stations: { a: "2026-10-15T12:00:00.000Z", stations: [BOX] }, accueil: HOME }),
    panne: () => ({ fait: "the login page opens in your browser" }),
    outilsManquants: () => lack,
    espace: () => [],
  });
  await openAllTheStations(other);
  (other.element("toutes-les-stations").dessous("button").find(({ className }) => className === "ligne") ?? assert.fail("pas de ligne de station")).click();
  await repos();
  button(other.element("station"), "log in").click();
  await repos();
  assert.equal(calls(other, "outilsManquants").length, 0);
  assert.equal(other.element("avis").hidden, true);
});

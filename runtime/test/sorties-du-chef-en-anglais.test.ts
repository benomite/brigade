// Les sorties des commandes du chef sont en anglais (#954), preuve d'ensemble de l'épique #932 : `manager`, `grant`,
// `station`, `guardrails`, `base` et `arbiter`. Chacune est jouée avec chacun de ses gestes, et chacun de ses refus, sur
// l'état d'exemple du bas de `status` ; aucune ligne ne garde un mot de la colonne « français » du glossaire. Le second
// volet monte ce qu'une box d'avant l'épique a laissé — un journal, un drop-in, un fichier d'état écrits en français — et
// vérifie que les commandes le montrent et que son effet s'applique, sans rien éditer.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { principal as base } from "../src/base-cli.ts";
import { ouvrirArbitre, servirArbitre } from "../src/arbitre.ts";
import { principal as gardeFous } from "../src/garde-fous-cli.ts";
import { principal as grant } from "../src/grant-cli.ts";
import { decisionsDansLEnvironnement, decisionsPosees, environnementDecide } from "../src/decisions.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { principal as manager } from "../src/manager-cli.ts";
import { principal as station } from "../src/montrer-station.ts";
import { configSession, lireSession } from "../src/renouvellement.ts";
import { lireStations } from "../src/stations-declarees.ts";
import { exempleDuBas } from "./aides/bas-de-status.ts";
import { sansMotFrancais } from "./aides/glossaire.ts";
import { etatDAvant, STATION } from "./aides/haut-de-status.ts";
import { appeler, DEPOT, fauxGh, horloge, issueGitHub, lancer, repertoireTemporaire } from "./outils.ts";

type Commande = Parameters<typeof appeler>[0];

const ARBITRE = join(import.meta.dirname, "../src/arbitre-cli.ts");

// L'état d'exemple du bas de `status`, et le répertoire où son journal vit.
function etat(t: TestContext) {
  const repertoire = repertoireTemporaire(t);
  const journal = exempleDuBas(t, repertoire);
  const noter = (type: string, payload: object, ticket: number | null = null, author = "manager") =>
    journal.ajouter({ project: "brigade", ticket, author, type, payload } as Parameters<typeof journal.ajouter>[0]);
  return { repertoire, noter, env: { BRIGADE_STATE_DIR: repertoire } as Record<string, string> };
}

async function sortie(commande: Commande, args: string[], env: Record<string, string>) {
  const enfant = appeler(commande, args, env);
  const code = await enfant.fin;
  return { code, lignes: enfant.sortie().trimEnd().split("\n") };
}

// Joue une commande : sa sortie ne porte aucun mot français ; rend son code et ses lignes.
async function jouer(commande: Commande, env: Record<string, string>, ...args: string[]) {
  const lu = await sortie(commande, args, env);
  sansMotFrancais(lu.lignes);
  return lu;
}

async function refuse(commande: Commande, env: Record<string, string>, ...args: string[]) {
  const lu = await jouer(commande, env, ...args);
  assert.notEqual(lu.code, 0, args.join(" "));
  return lu;
}

test("`manager` : on, off, return, backlog, upstream et leurs refus ne portent aucun mot français du glossaire", async (t) => {
  const { env, noter } = etat(t);
  noter("manager.set-aside", { reason: "chef-changed", fired: false }, 10);
  noter("manager.set-aside", { reason: "blocked-on-human", fired: false }, 11);
  for (const args of [[], ["on"], ["on"], [], ["off"], ["off"], ["return", "10"], ["return", "10"], ["return", "11"], ["return", "99"], ["on"]]) await jouer(manager, env, ...args);
  assert.ok((await jouer(manager, env)).lignes.length > 4);

  const gh = fauxGh(t);
  gh.repondre(`repos/${DEPOT}/issues?state=open&per_page=100`, { corps: Array.from({ length: 12 }, (_, rang) => issueGitHub(rang + 1, { labels: rang % 5 === 0 ? ["blocked-on-human"] : [] })) });
  const github = { BRIGADE_GITHUB_REPO: DEPOT, BRIGADE_GH_BIN: gh.bin };
  assert.equal((await jouer(manager, { ...github }, "backlog")).code, 0);
  // `upstream` rend une ligne de JSON pour un programme : ses mots sont ceux d'une liste close, pas une phrase du chef.
  const amont = await sortie(manager, ["upstream"], { ...env, ...github });
  assert.equal(amont.code, 0);
  assert.equal(amont.lignes.length, 1);
  assert.ok(Array.isArray((JSON.parse(amont.lignes[0] ?? "") as { issues: unknown }).issues));

  for (const [args, environnement] of [
    [["start"], env], [["return", "ten"], env], [["return"], env], [["on", "now"], env], [[], {}], [["on"], { BRIGADE_STATE_DIR: repertoireTemporaire(t) }],
    [["backlog"], { BRIGADE_GH_BIN: gh.bin }], [["backlog"], { ...github, BRIGADE_GH_BIN: fauxGh(t).bin }], [["upstream"], { ...env, ...github, BRIGADE_GH_BIN: fauxGh(t).bin }],
  ] as const) {
    // Les lignes de `gh` lui-même (« gh: … ») sont celles d'un outil étranger, citées telles qu'il les a écrites.
    const lu = await sortie(manager, [...args], { ...environnement });
    assert.notEqual(lu.code, 0, args.join(" "));
    sansMotFrancais(lu.lignes.map((ligne) => ligne.replace(/gh: .*? — /, "")));
  }
});

test("`grant` : enable, extend, revoke, l'état et les refus ne portent aucun mot français du glossaire", async (t) => {
  const { env } = etat(t);
  for (const args of [[], ["enable", "merge", "--for", "4h", "--uses", "3"], [], ["extend", "merge", "--for", "2h"], ["extend", "merge", "--uses", "5"], ["extend", "merge", "--no-expiry"], ["enable", "merge", "--until", "2099-01-01T18:00"], ["enable", "merge"], ["revoke", "merge"], ["revoke", "merge"], []]) await jouer(grant, env, ...args);
  // Les gestes qui réussissent d'un bout à l'autre.
  for (const args of [["enable", "merge", "--for", "1h"], ["extend", "merge", "--for", "2h"], ["revoke", "merge"]]) { const lu = await jouer(grant, env, ...args); assert.equal(lu.code, 0, args.join(" ") + "\n" + lu.lignes.join("\n")); }
  for (const [args, environnement] of [
    [["bouger", "merge"], env], [["enable"], env], [["enable", "merge", "--for", "vendredi"], env], [["enable", "merge", "--until", "hier"], env], [["extend", "merge"], env],
    [["enable", "deploy"], env], [["enable", "merge", "--uses", "0"], env], [[], {}], [["enable", "merge"], { BRIGADE_STATE_DIR: repertoireTemporaire(t) }],
  ] as const) await refuse(grant, { ...environnement }, ...args);
});

test("`station` : la vue, cooks, une décision, remove, help et leurs refus ne portent aucun mot français du glossaire", async (t) => {
  const { env } = etat(t);
  assert.ok((await jouer(station, env)).lignes.length > 10);
  for (const args of [["cooks", "3"], ["cooks", "0"], ["seuil-ticket", "300000"], ["manager-modele", "sonnet"], ["stations", `${STATION}:2:code`], [], ["remove", "seuil-ticket"], ["remove", "seuil-ticket"], ["help"], ["--help"]]) {
    assert.equal((await jouer(station, env, ...args)).code, 0, args.join(" "));
  }
  for (const [args, environnement] of [
    [["cooks", "-1"], env], [["bouger"], env], [["seuil-ticket", "beaucoup"], env], [["manager-modele", "gpt"], env], [["stations", "box:2:code"], env],
    [["remove"], env], [["remove", "plat-du-jour"], env], [[], {}], [[], { BRIGADE_STATE_DIR: repertoireTemporaire(t) }],
  ] as const) await refuse(station, { ...environnement }, ...args);
});

test("`guardrails` : l'état, stop, resume et les refus ne portent aucun mot français du glossaire", async (t) => {
  const { env } = etat(t);
  for (const args of [[], ["resume"], ["resume"], ["stop"], ["stop"], [], ["resume"]]) assert.equal((await jouer(gardeFous, env, ...args)).code, 0, args.join(" "));
  for (const [args, environnement] of [[["pause"], env], [["stop", "now"], env], [[], {}], [["stop"], { BRIGADE_STATE_DIR: repertoireTemporaire(t) }]] as const) await refuse(gardeFous, { ...environnement }, ...args);
});

test("`base` : l'état, replay et les refus ne portent aucun mot français du glossaire", async (t) => {
  const { env } = etat(t);
  // L'état d'exemple porte une base rouge : le rejeu est demandé, puis retenu.
  for (const args of [[], ["replay"], ["replay"], []]) assert.equal((await jouer(base, env, ...args)).code, 0, args.join(" "));
  for (const [args, environnement] of [[["rejouer-tout"], env], [["replay", "now"], env], [[], {}], [[], { BRIGADE_STATE_DIR: repertoireTemporaire(t) }]] as const) await refuse(base, { ...environnement }, ...args);
});

test("`arbiter` : l'état, weight, remove et les refus ne portent aucun mot français du glossaire", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const ouvert = ouvrirArbitre({ repertoire, plafond: 8, maintenant: horloge("2026-10-09T08:00:00.000Z") });
  const serveur = await servirArbitre(ouvert, 0);
  t.after(async () => {
    await serveur.fermer();
    ouvert.fermer();
  });
  ouvert.dire("compta", { cooks: 3, demande: true, machine: false, nonArbitres: 1, consommation: { jour: 10, semaine: 20 } });
  const dans = async (env: Record<string, string>, ...args: string[]) => {
    const cli = lancer(t, ARBITRE, args, env);
    const code = await cli.fin;
    const lignes = cli.sortie().trimEnd().split("\n");
    sansMotFrancais(lignes);
    return { code, lignes };
  };
  const env = { BRIGADE_ARBITER_PORT: String(serveur.port), BRIGADE_ARBITER_STATE_DIR: repertoire };
  for (const args of [[], ["weight", "compta", "3"], ["weight", "compta", "3"], ["weight", "atelier", "2"], [], ["remove", "atelier"]]) assert.equal((await dans(env, ...args)).code, 0, args.join(" "));
  for (const [args, environnement] of [
    [["remove", "atelier"], env], [["weight", "compta", "0"], env], [["weight", "Pas Un Nom", "2"], env], [["peser", "compta", "2"], env], [["weight", "compta"], env],
    [[], {}], [[], { BRIGADE_ARBITER_PORT: "pas-un-port" }], [["weight", "compta", "2"], {}], [["weight", "compta", "2"], { BRIGADE_ARBITER_STATE_DIR: repertoireTemporaire(t) }],
  ] as const) assert.notEqual((await dans({ ...environnement }, ...args)).code, 0, args.join(" "));
});

test("une box d'avant l'épique — journal, drop-in et fichier d'état écrits en français — est montrée et appliquée sans édition", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const { journal, noter } = etatDAvant(t, repertoire);
  const env = { BRIGADE_STATE_DIR: repertoire };

  // Le journal : ce que le chef a posé avant, avec ses libellés français, et le jugement du manager en français.
  noter("10:00", { type: "station.announced", payload: { station: STATION, engine: "claude", provides: ["code"], maxCooks: 1 } });
  noter("10:00", { type: "grant.refused", payload: { action: "acces-prod", line: "toute action sur la production d'un projet" } }, null, "chef");
  noter("10:00", { type: "grant.activated", payload: { action: "merge", until: new Date(Date.now() + 3_600_000).toISOString(), uses: 3 } }, null, "chef");
  noter("10:00", { type: "decision.set", payload: { name: "BRIGADE_REVIEWER_MODEL", value: "opus", previous: null } }, null, "chef");
  noter("10:00", { type: "manager.set-aside", payload: { reason: "chef-changed", fired: false } }, 10, "manager");
  noter("10:00", { type: "kitchen.stopped", payload: {} }, null, "chef");

  // Montré : les commandes lisent ce journal, et leur sortie reste anglaise (les libellés du journal sont des données).
  const grants = await sortie(grant, [], env);
  assert.equal(grants.code, 0);
  assert.match(grants.lignes.join("\n"), /grant merge\s+ACTIVE since \S+ \(by chef\)/);
  assert.match(grants.lignes.join("\n"), /acces-prod {2}refused: no grant allows it {2}\(chef\)/);
  sansMotFrancais(grants.lignes);
  assert.match((await jouer(station, env)).lignes.join("\n"), /^  reviewer-modele\s+opus$/m);
  assert.match((await jouer(gardeFous, env)).lignes.join("\n"), /^kitchen\s+STOPPED by the chef/m);
  assert.match((await jouer(manager, env)).lignes.join("\n"), /#10\s+you removed `fire` or a calibration the manager had set/);

  // Appliqué : les anciens mots du chef répondent, disent le nouveau, et font leur effet.
  // La ligne qui nomme l'ancien mot le cite, et c'est son rôle : elle n'est pas lue par le test de glossaire.
  const ancien = async (commande: Commande, ...args: string[]) => {
    const lu = await sortie(commande, [...args], env);
    sansMotFrancais(lu.lignes.filter((ligne) => !/ is now “/.test(ligne)));
    assert.equal(lu.code, 0, args.join(" ") + "\n" + lu.lignes.join("\n"));
    return lu;
  };
  const types = () => journal.tout().map((fait) => fait.type);
  const prolonge = await ancien(grant, "prolonger", "merge", "--pour", "3j");
  assert.equal(prolonge.code, 0);
  assert.match(prolonge.lignes.join("\n"), /“prolonger” is now “extend”/);
  assert.equal(types().at(-1), "grant.extended");
  assert.equal((await ancien(grant, "revoquer", "merge")).code, 0);
  assert.equal(types().at(-1), "grant.revoked");
  assert.equal((await ancien(gardeFous, "reprendre")).code, 0);
  assert.equal(types().at(-1), "kitchen.resumed");
  // Le manager n'a plus d'interrupteur à lui (#1406) : ses anciens mots disent le nouveau, puis le refus
  // qui nomme l'interrupteur du projet — rien n'est écrit.
  for (const [mot, nouveau] of [["eteindre", "off"], ["allumer", "on"]] as const) {
    const avant = types().length;
    const lu = await sortie(manager, [mot], env);
    sansMotFrancais(lu.lignes.filter((ligne) => !/ is now “/.test(ligne)));
    assert.equal(lu.code, 1, mot);
    assert.match(lu.lignes.join("\n"), new RegExp(`“${mot}” is now “${nouveau}”[\\s\\S]*switch ${nouveau}\``));
    assert.equal(types().length, avant, mot);
  }
  assert.equal((await ancien(manager, "rendre", "10")).code, 0);
  assert.equal(types().at(-1), "manager.handed-back");
  assert.equal((await ancien(station, "retirer", "reviewer-modele")).code, 0);
  assert.equal(decisionsPosees(journal.base).BRIGADE_REVIEWER_MODEL, undefined);

  // Le drop-in : la déclaration de l'unité d'avant, avec ses mots `distante` et `ordinaires`, se lit toujours ; ses décisions
  // d'avant n'y sont plus le support (le journal l'est), et la commande dit le geste qui les pose.
  const unite = join(repertoireTemporaire(t), "brigade@brigade.service.d");
  mkdirSync(unite);
  writeFileSync(join(unite, "override.conf"), ["[Service]", "Environment=BRIGADE_STATIONS=box/claude:2:code,poste/claude:1:navigateur-headless:distante+ordinaires", "Environment=BRIGADE_MANAGER_MODEL=opus", ""].join("\n"));
  const dropin = Object.fromEntries(
    readFileSync(join(unite, "override.conf"), "utf8").split("\n").filter((ligne) => ligne.startsWith("Environment=")).map((ligne) => [ligne.slice(12, ligne.indexOf("=", 12)), ligne.slice(ligne.indexOf("=", 12) + 1)]),
  );
  assert.deepEqual(lireStations(dropin).map((s) => [s.nom, s.cooks, s.distante === true, s.ordinaires === true]), [["box/claude", 2, false, false], ["poste/claude", 1, true, true]]);
  assert.deepEqual(decisionsDansLEnvironnement(dropin), ["BRIGADE_STATIONS", "BRIGADE_MANAGER_MODEL"]);
  assert.equal(environnementDecide(dropin, {}).BRIGADE_MANAGER_MODEL, undefined);

  // Le fichier d'état du renouvellement de la session Max, à ses clés françaises : le runtime en lit l'échéance.
  const etatSession = join(repertoireTemporaire(t), "renouvellement");
  writeFileSync(etatSession, ["verifie=2026-10-12T10:00:00Z", "renouvele=2026-10-12T09:00:00Z", ""].join("\n"));
  const observation = lireSession(configSession({ BRIGADE_SESSION_STATE: etatSession }, repertoire), new Date("2026-10-12T10:04:00.000Z"));
  assert.equal(observation.state, etatSession);
  assert.ok(JSON.stringify(observation).includes("2026-10-12T09:00:00.000Z"), JSON.stringify(observation));
});

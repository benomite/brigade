// Le budget d'appels à GitHub : une heure glissante, un plafond que la station
// et ses projets tiennent ensemble, le sondage des issues et le canal du gist
// qui le prennent, et la ligne horaire du journal de service.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import { canalGitHub } from "../src/pairing/channel.ts";
import { ouvrirGitHub } from "../src/github.ts";
import { BUDGET_PAR_HEURE, BudgetGitHubEpuise, FENETRE_MS, journaliserLesAppels, REPERTOIRE_COMPTEUR, limiteDeLaStation, ouvrirLimite, type Limite } from "../src/limite-github.ts";
import { DEPOT, fauxGh, issueGitHub, jusqua, lancer, repertoireTemporaire, temporaireDuFichier } from "./outils.ts";

const rienNeReste = temporaireDuFichier();

const MODULE = join(import.meta.dirname, "../src/limite-github.ts");
const FAUX_GH_GISTS = join(import.meta.dirname, "pairing/fake-gh-gists.ts");
const STATION = join(import.meta.dirname, "../src/station/main.ts");
const MINUTE = 60_000;

// Tente un appel : vrai s'il est compté, faux s'il est refusé.
function tenter(limite: Limite): boolean {
  try {
    limite.prendre();
    return true;
  } catch (erreur) {
    if (erreur instanceof BudgetGitHubEpuise) return false;
    throw erreur;
  }
}

test("sur une heure glissante, le budget n'est jamais dépassé, et chaque appel sorti de la fenêtre le libère", (t) => {
  const repertoire = repertoireTemporaire(t);
  for (const fichier of [undefined, join(repertoire, "compteur.db")]) {
    let instant = 0;
    const limite = ouvrirLimite({ fichier, budget: 5, maintenant: () => instant });
    t.after(() => limite.fermer());

    // Cinq appels passent ; le sixième est refusé, et dit quand le premier se libère.
    for (const minute of [0, 10, 20, 30, 40]) {
      instant = minute * MINUTE;
      limite.prendre();
    }
    instant = 50 * MINUTE;
    assert.throws(() => limite.prendre(), (erreur: unknown) => erreur instanceof BudgetGitHubEpuise && erreur.libreDansMs === 10 * MINUTE && /budget GitHub épuisé : 5 appels sur l'heure glissante/.test(erreur.message));
    assert.equal(limite.appels(), 5, "un appel refusé n'est pas compté");
    // Une heure pile après le premier, il sort de la fenêtre : une place, une seule.
    instant = 60 * MINUTE;
    assert.equal(limite.appels(), 4);
    limite.prendre();
    assert.equal(tenter(limite), false);
    instant = 70 * MINUTE;
    assert.equal(tenter(limite), true);
    assert.equal(tenter(limite), false);

    // Trois heures d'appels serrés : à chaque instant, l'heure écoulée n'en
    // compte jamais plus que le budget, et un appel n'est refusé que si elle
    // l'a déjà atteint.
    const comptes: number[] = [];
    for (let seconde = 0; seconde < 3 * 3600; seconde += 7) {
      instant = 3 * FENETRE_MS + seconde * 1000;
      const dejaDansLHeure = comptes.filter((compte) => compte > instant - FENETRE_MS).length;
      const passe = tenter(limite);
      assert.equal(passe, dejaDansLHeure < 5, `à ${seconde} s`);
      if (passe) comptes.push(instant);
      assert.ok(comptes.filter((compte) => compte > instant - FENETRE_MS).length <= 5);
      assert.equal(limite.appels(), Math.min(5, comptes.filter((compte) => compte > instant - FENETRE_MS).length));
    }
    assert.ok(comptes.length >= 15, "trois heures libèrent trois fois le budget");
  }
});

test("la station et trois projets, chacun dans son process, tiennent ensemble un seul plafond de 2 500 appels par heure", async (t) => {
  assert.ok(BUDGET_PAR_HEURE <= 2500);
  const racine = repertoireTemporaire(t);
  // Quatre process sur le compteur de la station, qui tentent chacun 700
  // appels à la même heure : 2 800 demandés, 2 500 comptés, pas un de plus.
  const script = `
    import { BudgetGitHubEpuise, limiteDeLaStation } from ${JSON.stringify(pathToFileURL(MODULE).href)};
    const limite = limiteDeLaStation(${JSON.stringify(racine)}, { maintenant: () => 1_000_000 });
    let comptes = 0;
    for (let i = 0; i < 700; i++) {
      try { limite.prendre(); comptes++; } catch (erreur) { if (!(erreur instanceof BudgetGitHubEpuise)) throw erreur; }
    }
    limite.fermer();
    console.log(comptes);
  `;
  const unProcess = () =>
    new Promise<number>((resoudre, rejeter) =>
      execFile(process.execPath, ["--input-type=module", "-e", script], { timeout: 110_000 }, (erreur, sortie, erreurs) => (erreur ? rejeter(new Error(erreurs || erreur.message)) : resoudre(Number(sortie.trim())))),
    );
  const parProcess = await Promise.all(["station", "projet 1", "projet 2", "projet 3"].map(unProcess));
  assert.equal(parProcess.reduce((somme, n) => somme + n, 0), 2500, `comptés par process : ${parProcess.join(", ")}`);
  const limite = limiteDeLaStation(racine, { maintenant: () => 1_000_000 + 30 * MINUTE });
  t.after(() => limite.fermer());
  assert.equal(limite.appels(), 2500);
  assert.equal(tenter(limite), false);
});

test("le sondage des issues prend le budget à chaque appel, et ne lance pas `gh` quand il est épuisé", async (t) => {
  const gh = fauxGh(t);
  gh.issues([issueGitHub(14)]);
  const limite = ouvrirLimite({ budget: 2 });
  t.after(() => limite.fermer());
  const github = ouvrirGitHub({ depot: DEPOT, bin: gh.bin, limite });

  assert.equal((await github.tickets()).inchange, false);
  assert.equal((await github.issue(14))?.number, 14);
  assert.equal(limite.appels(), 2);
  await assert.rejects(github.tickets(), BudgetGitHubEpuise);
  assert.equal(gh.appels().length, 2, "l'appel refusé n'est pas parti");
});

test("le canal du gist prend le budget à chaque appel, et ne lance pas `gh` quand il est épuisé", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const avant = process.env.FAUX_GISTS;
  process.env.FAUX_GISTS = repertoire;
  t.after(() => (avant === undefined ? delete process.env.FAUX_GISTS : (process.env.FAUX_GISTS = avant)));
  const limite = ouvrirLimite({ budget: 2 });
  t.after(() => limite.fermer());
  const canal = canalGitHub({ gh: FAUX_GH_GISTS, limite });

  const id = await canal.creer("brigade — station box", { "station.json": "{}" });
  assert.deepEqual(await canal.lire(id), { "station.json": "{}" });
  assert.equal(limite.appels(), 2);
  await assert.rejects(canal.ecrire(id, { "station.json": "{}" }), BudgetGitHubEpuise);
  assert.equal(readFileSync(join(repertoire, "appels"), "utf8").split("\n").filter(Boolean).length, 2, "l'appel refusé n'est pas parti");
});

test("une fois par heure, la ligne « N appels GitHub sur l'heure écoulée » va au journal", (t) => {
  t.mock.timers.enable({ apis: ["setInterval", "Date"], now: 0 });
  const limite = ouvrirLimite();
  t.after(() => limite.fermer());
  const lignes: string[] = [];
  const arreter = journaliserLesAppels(limite, { dire: (ligne) => lignes.push(ligne) });

  t.mock.timers.tick(MINUTE);
  for (let i = 0; i < 3; i++) limite.prendre();
  t.mock.timers.tick(58 * MINUTE);
  assert.deepEqual(lignes, [], "rien avant l'heure");
  t.mock.timers.tick(MINUTE);
  assert.deepEqual(lignes, ["brigade : 3 appels GitHub sur l'heure écoulée"]);

  // Les trois premiers sortent de la fenêtre ; les deux suivants y sont.
  t.mock.timers.tick(10 * MINUTE);
  limite.prendre();
  limite.prendre();
  t.mock.timers.tick(50 * MINUTE);
  assert.deepEqual(lignes.at(-1), "brigade : 2 appels GitHub sur l'heure écoulée");
  t.mock.timers.tick(60 * MINUTE);
  assert.deepEqual(lignes, ["brigade : 3 appels GitHub sur l'heure écoulée", "brigade : 2 appels GitHub sur l'heure écoulée", "brigade : 0 appels GitHub sur l'heure écoulée"]);

  arreter();
  t.mock.timers.tick(60 * MINUTE);
  assert.equal(lignes.length, 3);
});

test("la station réelle compte chacun de ses appels au gist dans le compteur de son répertoire", async (t) => {
  const gists = repertoireTemporaire(t);
  const racine = join(repertoireTemporaire(t), "station");
  mkdirSync(racine);
  const station = lancer(t, STATION, [], { BRIGADE_STATION_DIR: racine, BRIGADE_GH_BIN: FAUX_GH_GISTS, FAUX_GISTS: gists, BRIGADE_STATION_NOM: "box", BRIGADE_STATION_VERSION: "1.4.0" });
  await station.attendre("station à appairer");
  station.process.kill("SIGTERM");
  assert.equal(await station.fin, 0);

  assert.ok(existsSync(join(racine, REPERTOIRE_COMPTEUR)));
  const limite = limiteDeLaStation(racine);
  t.after(() => limite.fermer());
  const lancesParGh = () => (existsSync(join(gists, "appels")) ? readFileSync(join(gists, "appels"), "utf8").split("\n").filter(Boolean).length : 0);
  assert.ok(limite.appels() >= 2, `${limite.appels()} appels comptés`);
  // Un `gh` encore en route à la sortie de la station finit de noter le sien.
  await jusqua(() => lancesParGh() === limite.appels());
});

test("limite-github.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);

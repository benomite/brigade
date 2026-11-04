// Les appels de la box à GitHub, réglés sur le quota réel du compte : ce que
// GitHub dit lui rester, la cuisine qui attend la fin de la fenêtre à la
// réserve des gestes, les gestes du chef qu'aucun
// compte de la box ne retient, le compteur que la station et ses projets
// tiennent ensemble, et la ligne horaire du journal de service. Contre des faux
// `gh` qui disent le quota qu'on leur dicte : jamais le vrai GitHub.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { test, type TestContext } from "node:test";
import { canalGitHub } from "../src/appairage/canal.ts";
import { ouvrirGitHub } from "../src/github.ts";
import {
  appelerGitHub,
  CuisineRalentie,
  ECRITURES_PAR_HEURE,
  ECRITURES_PAR_MINUTE,
  EcritureEspacee,
  estUneEcriture,
  FENETRE_MS,
  journaliserLesAppels,
  LimiteGitHubAtteinte,
  limiteDeLaStation,
  ouvrirLimite,
  prendreUnAppel,
  quotaDesEntetes,
  RAFRAICHIR_MS,
  REPERTOIRE_COMPTEUR,
  REQUETES_EN_VOL,
  reserveDes,
  type Limite,
} from "../src/limite-github.ts";
import { aArreter, DEPOT, jusqua, lancer, repertoireTemporaire, temporaireDuFichier } from "./outils.ts";
import { FAUX_GH_GISTS } from "./appairage/doublure-des-gists.ts";
import { posixOnly } from "./support/plateforme.ts";

const rienNeReste = temporaireDuFichier();

const MODULE = join(import.meta.dirname, "../src/limite-github.ts");
const STATION = join(import.meta.dirname, "../src/station/main.ts");
const DEPART = Date.parse("2026-10-22T12:00:00Z");
const SECONDE = 1000;
const MINUTE = 60_000;
const CHEMIN_TICKETS = `repos/${DEPOT}/issues?labels=fire&state=open&per_page=100`;

function uneHorloge() {
  let instant = DEPART;
  return { maintenant: () => instant, avancer: (ms: number) => void (instant += ms), poser: (ms: number) => void (instant = ms) };
}

// Tente un appel de la cuisine : vrai s'il est compté, faux si la box le retient.
function tenter(limite: Limite): boolean {
  try {
    limite.prendre();
    return true;
  } catch (erreur) {
    if (erreur instanceof CuisineRalentie) return false;
    throw erreur;
  }
}

// Un faux GitHub qui tient son propre quota : chaque appel en dépense un, et le
// dit dans ses en-têtes (`x-ratelimit-*`), comme `gh api -i` les rend. À zéro, il
// refuse d'un 403 « rate limit ». `gh api rate_limit` lui est demandé à part :
// il ne dépense rien, et répond ce qu'on a posé dans `rate_limit` — ou échoue.
function unGitHubQuiCompte(t: TestContext) {
  const repertoire = repertoireTemporaire(t);
  const bin = join(repertoire, "gh");
  writeFileSync(
    bin,
    [
      "#!/bin/sh",
      'D="$(dirname "$0")"',
      'echo "$*" >> "$D/appels"',
      'case "$*" in *rate_limit*) if [ -f "$D/rate_limit" ]; then cat "$D/rate_limit"; exit 0; fi; echo "gh: indisponible" >&2; exit 1;; esac',
      'r="$(cat "$D/restant")"',
      'if [ "$r" -le 0 ]; then printf \'HTTP/2.0 403\\r\\nx-ratelimit-limit: 5000\\r\\nx-ratelimit-remaining: 0\\r\\nx-ratelimit-reset: %s\\r\\n\\r\\n{"message":"API rate limit exceeded"}\' "$(cat "$D/reset")"; echo 403 >> "$D/refus"; exit 1; fi',
      'r=$((r - 1))',
      'echo "$r" > "$D/restant"',
      'printf \'HTTP/2.0 200\\r\\nx-ratelimit-limit: 5000\\r\\nx-ratelimit-remaining: %s\\r\\nx-ratelimit-reset: %s\\r\\nx-ratelimit-resource: core\\r\\n\\r\\n%s\' "$r" "$(cat "$D/reset")" "$(cat "$D/corps")"',
      "",
    ].join("\n"),
  );
  chmodSync(bin, 0o755);
  const lire = (nom: string) => (existsSync(join(repertoire, nom)) ? readFileSync(join(repertoire, nom), "utf8").split("\n").filter(Boolean) : []);
  const gh = {
    bin,
    // Ce qui reste au compte, jusqu'à `reset` (en millisecondes).
    quota(restant: number, reset: number) {
      writeFileSync(join(repertoire, "restant"), String(restant));
      writeFileSync(join(repertoire, "reset"), String(Math.floor(reset / SECONDE)));
    },
    restant: () => Number(readFileSync(join(repertoire, "restant"), "utf8")),
    corps: (corps: unknown) => writeFileSync(join(repertoire, "corps"), JSON.stringify(corps)),
    rateLimit: (core: { limit: number; remaining: number; reset: number }) => writeFileSync(join(repertoire, "rate_limit"), JSON.stringify({ resources: { core: { ...core, reset: Math.floor(core.reset / SECONDE) } } })),
    // Les appels qui ont dépensé le quota, sans `gh api rate_limit`.
    appels: () => lire("appels").filter((ligne) => !ligne.includes("rate_limit")),
    questionsDeQuota: () => lire("appels").filter((ligne) => ligne.includes("rate_limit")).length,
    refus: () => lire("refus").length,
  };
  gh.corps([]);
  return gh;
}

// Une heure chargée côté box : `n` appels comptés dans l'heure glissante, que
// l'ancien budget de la box (2 500) aurait refusés au-delà.
function chargerLHeure(limite: Limite, n: number) {
  for (let i = 0; i < n; i++) limite.prendre("geste");
}

test("le quota se lit dans les en-têtes de l'API REST : un en-tête d'une autre ressource, ou incomplet, ne dit rien", () => {
  const entetes = (paires: Record<string, string>) => new Map(Object.entries(paires));
  assert.deepEqual(quotaDesEntetes(entetes({ "x-ratelimit-limit": "5000", "x-ratelimit-remaining": "3600", "x-ratelimit-reset": "1761134400", "x-ratelimit-resource": "core" })), { restant: 3600, plafond: 5000, reset: 1761134400 * SECONDE });
  assert.deepEqual(quotaDesEntetes(entetes({ "x-ratelimit-limit": "5000", "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1761134400" })), { restant: 0, plafond: 5000, reset: 1761134400 * SECONDE });
  const incomplets: Array<Record<string, string>> = [{}, { "x-ratelimit-limit": "5000", "x-ratelimit-remaining": "3600" }, { "x-ratelimit-limit": "5000", "x-ratelimit-remaining": "beaucoup", "x-ratelimit-reset": "1761134400" }, { "x-ratelimit-limit": "30", "x-ratelimit-remaining": "2", "x-ratelimit-reset": "1761134400", "x-ratelimit-resource": "search" }];
  for (const paires of incomplets) {
    assert.equal(quotaDesEntetes(entetes(paires)), null, JSON.stringify(paires));
  }
});

// Un compteur ouvert dans un répertoire du test se ferme par `aArreter`, avant que
// le répertoire disparaisse : sous Windows, une base ouverte ne s'efface pas.
test("sans quota dit par GitHub, ou avec un quota large, aucun compte de la box ne retient la cuisine — même au-delà de 2 500 appels dans l'heure", (t) => {
  const repertoire = repertoireTemporaire(t);
  for (const fichier of [undefined, join(repertoire, "compteur.db")]) {
    const horloge = uneHorloge();
    const limite = ouvrirLimite({ fichier, maintenant: horloge.maintenant });
    aArreter(t, () => limite.fermer());
    for (let i = 0; i < 3000; i++) assert.equal(tenter(limite), true, `appel ${i + 1}, sans quota dit`);
    limite.noter("gh", { restant: 3600, plafond: 5000, reset: DEPART + 40 * MINUTE });
    for (let i = 0; i < 500; i++) assert.equal(tenter(limite), true, `appel ${i + 1}, 3 600 restants sur 5 000`);
    assert.equal(limite.appels(), 3500);
  }
});

test("au-dessus de la réserve des gestes rien ne retient la cuisine ; à la réserve, elle attend la fin de la fenêtre, puis reprend", (t) => {
  const horloge = uneHorloge();
  const limite = ouvrirLimite({ maintenant: horloge.maintenant });
  t.after(() => limite.fermer());
  assert.equal(reserveDes(5000), 500);

  // Quel que soit le quota au-dessus de la réserve, on s'arrête à 1 000 appels pour le dire.
  for (const restant of [4000, 2400, 1100, 530]) {
    horloge.avancer(10 * MINUTE);
    limite.noter("gh", { restant, plafond: 5000, reset: horloge.maintenant() + 30 * MINUTE });
    let partis = 0;
    while (partis < 1000 && tenter(limite)) partis++;
    assert.equal(partis, 1000, `${restant} restants sur 5 000`);
  }

  // À la réserve, plus rien de la cuisine ne part avant la fin de la fenêtre.
  const reset = limite.quota()?.reset ?? 0;
  horloge.poser(reset - 20 * MINUTE);
  limite.noter("gh", { restant: 500, plafond: 5000, reset });
  assert.throws(
    () => limite.prendre(),
    (erreur: unknown) => erreur instanceof CuisineRalentie && erreur.jusqua === reset && erreur.libreDansMs === 20 * MINUTE && /quota GitHub bas : 500 appels restants sur 5000, gardés pour les gestes du chef — la cuisine attend la fin de la fenêtre, dans 1200 s/.test(erreur.message),
  );
  horloge.poser(reset - SECONDE);
  assert.equal(tenter(limite), false);
  // La fenêtre passée, le quota d'hier ne dit plus rien : la cuisine reprend.
  horloge.poser(reset);
  assert.equal(limite.quota(), null);
  assert.equal(tenter(limite), true);
});

test("deux réponses de la même fenêtre arrivées dans le désordre : la plus basse dit le vrai ; une fenêtre neuve remplace l'ancienne", (t) => {
  const horloge = uneHorloge();
  const limite = ouvrirLimite({ maintenant: horloge.maintenant });
  t.after(() => limite.fermer());
  const reset = DEPART + 30 * MINUTE;
  limite.noter("gh", { restant: 400, plafond: 5000, reset });
  limite.noter("gh", { restant: 420, plafond: 5000, reset });
  assert.equal(limite.quota()?.restant, 400);
  limite.noter("gh", { restant: 4990, plafond: 5000, reset: reset + FENETRE_MS });
  assert.equal(limite.quota()?.restant, 4990);
  // Chaque compte a le sien : l'App d'un rôle ne dépense pas celui de la machine.
  limite.noter("pass", { restant: 10, plafond: 5000, reset });
  assert.equal(limite.quota()?.restant, 4990);
  assert.equal(tenter(limite), true);
  assert.throws(() => limite.prendre("cuisine", "pass"), CuisineRalentie);
});

test("un geste du chef n'est jamais retenu par la box : ni par l'heure chargée, ni par la réserve, ni par une pause — il est compté", (t) => {
  const horloge = uneHorloge();
  const limite = ouvrirLimite({ maintenant: horloge.maintenant });
  t.after(() => limite.fermer());
  chargerLHeure(limite, 2600);
  limite.noter("gh", { restant: 12, plafond: 5000, reset: DEPART + 30 * MINUTE });
  limite.suspendre(DEPART + 10 * MINUTE);
  assert.throws(() => limite.prendre(), LimiteGitHubAtteinte);
  for (let i = 0; i < 20; i++) limite.prendre("geste");
  assert.equal(limite.appels(), 2620);
});

test("la cuisine au sondage, contre un GitHub qui compte : 2 600 appels dans l'heure côté box et 3 600 restants, les sondages partent, sans jamais « budget GitHub épuisé »", async (t) => {
  const gh = unGitHubQuiCompte(t);
  const horloge = uneHorloge();
  gh.quota(3600, DEPART + 40 * MINUTE);
  const limite = ouvrirLimite({ maintenant: horloge.maintenant });
  t.after(() => limite.fermer());
  chargerLHeure(limite, 2600);
  const github = ouvrirGitHub({ depot: DEPOT, bin: gh.bin, limite, maintenant: horloge.maintenant });
  t.after(() => github.fermer());

  const messages: string[] = [];
  for (let tour = 0; tour < 30; tour++) {
    horloge.avancer(10 * SECONDE);
    try {
      assert.equal((await github.tickets()).inchange, false);
    } catch (erreur) {
      messages.push(erreur instanceof Error ? erreur.message : String(erreur));
    }
  }
  assert.deepEqual(messages, []);
  assert.equal(gh.appels().length, 30);
  assert.equal(gh.restant(), 3570);
  assert.deepEqual(limite.quota(), { restant: 3570, plafond: 5000, reset: DEPART + 40 * MINUTE, vu: horloge.maintenant() });
  assert.ok(limite.appels() > 2500);
});

test("contre un GitHub presque épuisé, les sondages partent jusqu'à la réserve puis attendent, avant que GitHub ne refuse, sans lancer `gh` ; la fenêtre passée, ils reprennent", async (t) => {
  const gh = unGitHubQuiCompte(t);
  const horloge = uneHorloge();
  const reset = DEPART + 10 * MINUTE;
  gh.quota(540, reset);
  const limite = ouvrirLimite({ maintenant: horloge.maintenant });
  t.after(() => limite.fermer());
  const github = ouvrirGitHub({ depot: DEPOT, bin: gh.bin, limite, maintenant: horloge.maintenant });
  t.after(() => github.fermer());

  // Un sondage toutes les cinq secondes, jusqu'à la fin de la fenêtre.
  const partis: number[] = [];
  const messages = new Set<string>();
  while (horloge.maintenant() < reset - 5 * SECONDE) {
    horloge.avancer(5 * SECONDE);
    try {
      await github.tickets();
      partis.push(horloge.maintenant());
    } catch (erreur) {
      assert.ok(erreur instanceof CuisineRalentie, String(erreur));
      messages.add(erreur.message.replace(/\d+ s$/, "N s"));
    }
  }
  // GitHub n'a jamais eu à refuser : la box s'est arrêtée à la réserve des gestes.
  assert.equal(gh.refus(), 0);
  assert.equal(gh.restant(), 500);
  assert.equal(partis.length, 40);
  // Aucun sondage retenu avant la réserve : un par tour jusqu'à elle.
  assert.deepEqual(partis, Array.from({ length: 40 }, (_, i) => DEPART + (i + 1) * 5 * SECONDE));
  assert.ok(![...messages].some((message) => message.startsWith("quota GitHub entamé")));
  assert.ok([...messages].some((message) => message.startsWith("quota GitHub bas : 500 appels restants sur 5000")));
  assert.ok(![...messages].some((message) => /budget GitHub épuisé/.test(message)));
  assert.equal(gh.appels().length, 40, "un sondage retenu ne lance pas `gh`");

  // La fenêtre passée, GitHub a rendu son quota : les sondages reprennent seuls.
  horloge.poser(reset);
  gh.quota(4999, reset + FENETRE_MS);
  for (let tour = 0; tour < 5; tour++) {
    horloge.avancer(5 * SECONDE);
    assert.equal((await github.tickets()).inchange, false);
  }
  assert.equal(gh.appels().length, 45);
});

test("un merge du chef part sur un compte au plus bas et une heure chargée côté box, et n'échoue que si GitHub refuse", async (t) => {
  const gh = unGitHubQuiCompte(t);
  const horloge = uneHorloge();
  gh.quota(30, DEPART + 30 * MINUTE);
  gh.corps({ merged: true });
  const limite = ouvrirLimite({ maintenant: horloge.maintenant });
  t.after(() => limite.fermer());
  chargerLHeure(limite, 2600);
  limite.noter("gh", { restant: 30, plafond: 5000, reset: DEPART + 30 * MINUTE });
  const cuisine = ouvrirGitHub({ depot: DEPOT, bin: gh.bin, limite, maintenant: horloge.maintenant });
  const geste = ouvrirGitHub({ depot: DEPOT, bin: gh.bin, limite, maintenant: horloge.maintenant, usage: "geste" });
  t.after(() => cuisine.fermer());
  t.after(() => geste.fermer());

  await assert.rejects(cuisine.merger(7, "abc"), CuisineRalentie);
  assert.equal(gh.appels().length, 0);
  assert.deepEqual(await geste.merger(7, "abc"), { fait: true });
  assert.deepEqual(gh.appels(), [`api -i -X PUT -f sha=abc -f merge_method=merge repos/${DEPOT}/pulls/7/merge`]);

  // GitHub au bout de son quota refuse : le geste échoue sur ce refus, celui de GitHub.
  gh.quota(0, DEPART + 30 * MINUTE);
  await assert.rejects(geste.merger(7, "abc"), (erreur: unknown) => erreur instanceof LimiteGitHubAtteinte && !(erreur instanceof CuisineRalentie) && erreur.jusqua === DEPART + 30 * MINUTE);
  assert.equal(gh.refus(), 1);
});

test("une décision sur un quota bas lu depuis plus d'une minute se confirme auprès de `gh api rate_limit`, au plus une fois par minute", async (t) => {
  const gh = unGitHubQuiCompte(t);
  const horloge = uneHorloge();
  const reset = DEPART + 30 * MINUTE;
  const limite = ouvrirLimite({ maintenant: horloge.maintenant });
  t.after(() => limite.fermer());
  limite.noter("gh", { restant: 480, plafond: 5000, reset });
  const prendre = () => prendreUnAppel(limite, { gh: gh.bin, maintenant: horloge.maintenant });

  // Lu à l'instant : la décision se prend sans rien demander.
  await assert.rejects(prendre(), CuisineRalentie);
  assert.equal(gh.questionsDeQuota(), 0);

  // Lu il y a deux minutes : GitHub est relu — il ne répond pas, la décision reste,
  // et il n'est pas redemandé avant la minute.
  horloge.avancer(2 * MINUTE);
  await assert.rejects(prendre(), CuisineRalentie);
  await assert.rejects(prendre(), CuisineRalentie);
  assert.equal(gh.questionsDeQuota(), 1);

  // Une minute plus tard, il répond : une autre fenêtre a commencé de son côté, la cuisine part.
  horloge.avancer(RAFRAICHIR_MS);
  gh.rateLimit({ limit: 5000, remaining: 4800, reset: reset + FENETRE_MS });
  await prendre();
  assert.equal(gh.questionsDeQuota(), 2);
  assert.deepEqual(limite.quota(), { restant: 4800, plafond: 5000, reset: reset + FENETRE_MS, vu: horloge.maintenant() });
  // Un geste ne demande jamais rien.
  limite.noter("gh", { restant: 10, plafond: 5000, reset: reset + 2 * FENETRE_MS });
  horloge.avancer(10 * MINUTE);
  await prendreUnAppel(limite, { gh: gh.bin, usage: "geste", maintenant: horloge.maintenant });
  assert.equal(gh.questionsDeQuota(), 2);
});

test("la station et trois projets, chacun dans son process, lisent le même quota et tiennent ensemble le même compte", async (t) => {
  const racine = repertoireTemporaire(t);
  const instant = 1_000_000;
  const avant = limiteDeLaStation(racine, { maintenant: () => instant });
  // 2 000 restants, au-dessus de la réserve : rien ne retient, et chaque appel est compté, quel que soit son process.
  avant.noter("gh", { restant: 2000, plafond: 5000, reset: instant + 30 * MINUTE });
  avant.fermer();
  const script = `
    import { CuisineRalentie, limiteDeLaStation } from ${JSON.stringify(pathToFileURL(MODULE).href)};
    const limite = limiteDeLaStation(${JSON.stringify(racine)}, { maintenant: () => ${instant} });
    let comptes = 0;
    for (let i = 0; i < 30; i++) {
      try { limite.prendre(); comptes++; } catch (erreur) { if (!(erreur instanceof CuisineRalentie)) throw erreur; }
    }
    limite.fermer();
    console.log(comptes);
  `;
  const unProcess = () =>
    new Promise<number>((resoudre, rejeter) =>
      execFile(process.execPath, ["--input-type=module", "-e", script], { timeout: 110_000 }, (erreur, sortie, erreurs) => (erreur ? rejeter(new Error(erreurs || erreur.message)) : resoudre(Number(sortie.trim())))),
    );
  const parProcess = await Promise.all(["station", "projet 1", "projet 2", "projet 3"].map(unProcess));
  assert.equal(parProcess.reduce((somme, n) => somme + n, 0), 120, `comptés par process : ${parProcess.join(", ")}`);
  const limite = limiteDeLaStation(racine, { maintenant: () => instant });
  aArreter(t, () => limite.fermer());
  assert.equal(limite.appels(), 120);
  assert.equal(tenter(limite), true);
  // Le quota que l'un a noté retient les autres : à la réserve, plus rien ne part.
  limite.noter("gh", { restant: 500, plafond: 5000, reset: instant + 30 * MINUTE });
  assert.equal(tenter(limite), false);
});

test("le canal du gist se règle sur le même quota : à la réserve des gestes, il ne lance pas `gh`", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const avant = process.env.FAUX_GISTS;
  process.env.FAUX_GISTS = repertoire;
  t.after(() => (avant === undefined ? delete process.env.FAUX_GISTS : (process.env.FAUX_GISTS = avant)));
  const limite = ouvrirLimite();
  t.after(() => limite.fermer());
  chargerLHeure(limite, 2600);
  const canal = canalGitHub({ gh: FAUX_GH_GISTS, limite });

  const id = await canal.creer("brigade — station box", { "station.json": "{}" });
  assert.deepEqual(await canal.lire(id), { "station.json": "{}" });
  limite.noter("gh", { restant: 100, plafond: 5000, reset: Date.now() + 30 * MINUTE });
  await assert.rejects(canal.ecrire(id, { "station.json": "{}" }), CuisineRalentie);
  assert.equal(readFileSync(join(repertoire, "appels"), "utf8").split("\n").filter(Boolean).length, 2, "l'appel retenu n'est pas parti");
});

test("une fois par heure, la ligne « N appels GitHub sur l'heure écoulée » va au journal, avec ce que GitHub dit rester", (t) => {
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
  limite.noter("gh", { restant: 3600, plafond: 5000, reset: 2 * FENETRE_MS + 30 * MINUTE });
  t.mock.timers.tick(50 * MINUTE);
  assert.deepEqual(lignes.at(-1), "brigade : 2 appels GitHub sur l'heure écoulée — GitHub en dit 3600 restants sur 5000");
  t.mock.timers.tick(60 * MINUTE);
  assert.deepEqual(lignes, ["brigade : 3 appels GitHub sur l'heure écoulée", "brigade : 2 appels GitHub sur l'heure écoulée — GitHub en dit 3600 restants sur 5000", "brigade : 0 appels GitHub sur l'heure écoulée"]);

  arreter();
  t.mock.timers.tick(60 * MINUTE);
  assert.equal(lignes.length, 3);
});

test("la station réelle compte chacun de ses appels au gist dans le compteur de son répertoire", { skip: posixOnly("starts the real station on a fake gh that notes its gist calls, stops it on SIGTERM and expects its own call counter to match them; on Windows kill('SIGTERM') ends the station without running its handler, and the station did not even print its pairing code there, a cause not traced yet") }, async (t) => {
  const gists = repertoireTemporaire(t);
  const racine = join(repertoireTemporaire(t), "station");
  mkdirSync(racine);
  const station = lancer(t, STATION, [], { BRIGADE_STATION_DIR: racine, BRIGADE_GH_BIN: FAUX_GH_GISTS, FAUX_GISTS: gists, BRIGADE_STATION_NOM: "box", BRIGADE_STATION_VERSION: "1.4.0" });
  await station.attendre("station à appairer");
  station.process.kill("SIGTERM");
  assert.equal(await station.fin, 0);

  assert.ok(existsSync(join(racine, REPERTOIRE_COMPTEUR)));
  const limite = limiteDeLaStation(racine);
  aArreter(t, () => limite.fermer());
  const lancesParGh = () => (existsSync(join(gists, "appels")) ? readFileSync(join(gists, "appels"), "utf8").split("\n").filter(Boolean).length : 0);
  assert.ok(limite.appels() >= 2, `${limite.appels()} appels comptés`);
  // Un `gh` encore en route à la sortie de la station finit de noter le sien.
  await jusqua(() => lancesParGh() === limite.appels());
});

test("limite-github.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);

// Le rythme des écritures (#2145) : GitHub plafonne les écritures par minute et
// par heure ; la cuisine reste dessous, tous projets du compte ensemble.
test("writes are paced account-wide: two projects firing at once never send more than the per-minute budget, and both get through", async () => {
  let horloge = 1_000_000;
  const limite = ouvrirLimite({ maintenant: () => horloge });
  const parties: string[] = [];
  const attentes: number[] = [];
  const attendre = async (ms: number) => {
    attentes.push(ms);
    horloge += ms;
  };
  // Deux projets, chacun 40 écritures d'un coup, alternées.
  for (let i = 0; i < 40; i += 1) {
    for (const projet of ["a", "b"]) {
      await prendreUnAppel(limite, { etiquette: { projet, lecture: "issues", ecriture: true }, gh: "gh", maintenant: () => horloge, attendre });
      parties.push(`${projet}@${horloge}`);
    }
  }
  const instants = parties.map((p) => Number(p.split("@")[1]));
  // Sur toute minute glissante, pas plus que le budget.
  for (const debut of instants) assert.ok(instants.filter((t) => t >= debut && t < debut + 60_000).length <= ECRITURES_PAR_MINUTE, `more than ${ECRITURES_PAR_MINUTE} writes in the minute from ${debut}`);
  // Les deux projets passent tous, aucun n'est affamé.
  assert.equal(parties.filter((p) => p.startsWith("a@")).length, 40);
  assert.equal(parties.filter((p) => p.startsWith("b@")).length, 40);
  assert.ok(attentes.length > 0, "the pacer made writes wait");
  limite.fermer();
});

test("reads and the chef's gestures are never paced, and a paced write is not counted until it leaves", () => {
  let horloge = 2_000_000;
  const limite = ouvrirLimite({ maintenant: () => horloge });
  for (let i = 0; i < ECRITURES_PAR_MINUTE; i += 1) limite.prendre("cuisine", "gh", { projet: "a", lecture: "issues", ecriture: true });
  assert.throws(() => limite.prendre("cuisine", "gh", { projet: "a", lecture: "issues", ecriture: true }), EcritureEspacee);
  assert.equal(limite.appels(), ECRITURES_PAR_MINUTE);
  // Une lecture part, un geste aussi, une écriture d'un autre compte aussi.
  limite.prendre("cuisine", "gh", { projet: "a", lecture: "issues" });
  limite.prendre("geste", "gh", { projet: "a", lecture: "gesture", ecriture: true });
  limite.prendre("cuisine", "app-pass", { projet: "a", lecture: "issues", ecriture: true });
  // La minute passée, l'écriture repart.
  horloge += 60_001;
  limite.prendre("cuisine", "gh", { projet: "a", lecture: "issues", ecriture: true });
  limite.fermer();
});

test("the hourly write budget holds too, past the minute", () => {
  let horloge = 3_000_000;
  const limite = ouvrirLimite({ maintenant: () => horloge });
  for (let i = 0; i < ECRITURES_PAR_HEURE; i += 1) {
    limite.prendre("cuisine", "gh", { projet: "a", lecture: "issues", ecriture: true });
    horloge += 2_100;
  }
  const erreur = (() => {
    try {
      limite.prendre("cuisine", "gh", { projet: "a", lecture: "issues", ecriture: true });
    } catch (e) {
      return e;
    }
    return null;
  })();
  assert.ok(erreur instanceof EcritureEspacee);
  assert.ok(erreur.jusqua > horloge);
  limite.fermer();
});

test("what counts as a write in a `gh api` call", () => {
  assert.equal(estUneEcriture(["repos/o/r/issues/1/comments", "-f", "body=x"]), true);
  assert.equal(estUneEcriture(["-X", "PATCH", "repos/o/r/issues/1", "--input", "-"]), true);
  assert.equal(estUneEcriture(["--method=DELETE", "repos/o/r/issues/1/labels/taken"]), true);
  assert.equal(estUneEcriture(["-X", "GET", "repos/o/r/issues", "-f", "state=open"]), false);
  assert.equal(estUneEcriture(["-i", "repos/o/r/issues/1/comments"]), false);
});

// La file des appels (#2195) : au plus `REQUETES_EN_VOL` requêtes en vol, et les
// écritures que le rythme retient partent dans l'ordre d'arrivée, tous projets
// ensemble, sur l'unique réveil de la file. Rien n'y lance `gh` ni n'y attend
// l'horloge : le compteur est en mémoire, et chaque pas se règle en vidant les
// promesses en cours.
const laisserPasser = () => new Promise<void>((suite) => setImmediate(suite));

// Une requête que le test tient en vol jusqu'à ce qu'il la termine.
function desRequetesTenues() {
  let enVol = 0;
  let auPlus = 0;
  const parties: string[] = [];
  const fins: Array<() => void> = [];
  const requete = (nom: string) => async () => {
    enVol += 1;
    auPlus = Math.max(auPlus, enVol);
    parties.push(nom);
    await new Promise<void>((fin) => fins.push(fin));
    enVol -= 1;
  };
  return { requete, parties, terminerLaPlusAncienne: () => fins.shift()?.(), enVol: () => enVol, auPlus: () => auPlus };
}

test("never more than REQUETES_EN_VOL requests in flight: ten fired at once from three projects all get through, in arrival order", async () => {
  assert.equal(REQUETES_EN_VOL, 4);
  const limite = ouvrirLimite();
  const tenues = desRequetesTenues();
  const toutes = Array.from({ length: 10 }, (_, i) => {
    const ecriture = i % 2 === 0;
    return appelerGitHub(limite, { gh: "gh", etiquette: { projet: `p${i % 3}`, lecture: "issues", ecriture } }, tenues.requete(`r${i}`));
  });
  await laisserPasser();
  assert.deepEqual(tenues.parties, ["r0", "r1", "r2", "r3"]);
  // Chaque requête qui s'achève laisse partir la première arrivée qui attend, et une seule.
  for (let suivante = 4; suivante < 10; suivante += 1) {
    tenues.terminerLaPlusAncienne();
    await laisserPasser();
    assert.equal(tenues.parties.length, suivante + 1);
    assert.equal(tenues.enVol(), REQUETES_EN_VOL);
  }
  while (tenues.enVol() > 0) {
    tenues.terminerLaPlusAncienne();
    await laisserPasser();
  }
  await Promise.all(toutes);
  assert.deepEqual(tenues.parties, Array.from({ length: 10 }, (_, i) => `r${i}`));
  assert.equal(tenues.auPlus(), REQUETES_EN_VOL);
  assert.equal(limite.appels(), 10);
  limite.fermer();
});

test("a request that fails gives its place back, and a chef's gesture never waits for one", async () => {
  const limite = ouvrirLimite();
  const tenues = desRequetesTenues();
  const premieres = Array.from({ length: REQUETES_EN_VOL }, (_, i) => appelerGitHub(limite, { gh: "gh" }, tenues.requete(`r${i}`)));
  await laisserPasser();
  // Les places sont prises : un appel de la cuisine attend, un geste part tout de suite.
  const enEchec = appelerGitHub(limite, { gh: "gh" }, async () => {
    throw new Error("gh a échoué");
  });
  const apres = appelerGitHub(limite, { gh: "gh" }, tenues.requete("après"));
  let geste = false;
  await appelerGitHub(limite, { gh: "gh", usage: "geste" }, async () => {
    geste = true;
  });
  assert.equal(geste, true);
  await laisserPasser();
  assert.deepEqual(tenues.parties, ["r0", "r1", "r2", "r3"]);
  // Une place se libère : l'appel qui échoue la prend, la rend en échouant, et le suivant part.
  tenues.terminerLaPlusAncienne();
  await assert.rejects(enEchec, /gh a échoué/);
  await laisserPasser();
  assert.deepEqual(tenues.parties, ["r0", "r1", "r2", "r3", "après"]);
  assert.equal(tenues.enVol(), REQUETES_EN_VOL);
  while (tenues.enVol() > 0) {
    tenues.terminerLaPlusAncienne();
    await laisserPasser();
  }
  await Promise.all([...premieres, apres]);
  limite.fermer();
});

test("writes from three projects that saturate the pacer leave in strict arrival order, each on the pacer's single wake-up — never on a timer of their own", async () => {
  let horloge = 5_000_000;
  const limite = ouvrirLimite({ maintenant: () => horloge });
  // La minute pleine en trente secondes, quel que soit son budget : le rythme
  // rend une place à chaque pas, à partir de la soixantième seconde.
  const pas = (30 * SECONDE) / ECRITURES_PAR_MINUTE;
  for (let i = 0; i < ECRITURES_PAR_MINUTE; i += 1) {
    limite.prendre("cuisine", "gh", { projet: "x", lecture: "issues", ecriture: true });
    horloge += pas;
  }
  // Le réveil : enregistré, et ne sonne que quand le test le dit.
  const reveils: Array<{ ms: number; sonner: () => void }> = [];
  const attendre = (ms: number) => new Promise<void>((sonner) => reveils.push({ ms, sonner }));
  const parties: string[] = [];
  const arrivees: string[] = [];
  const ecritures: Promise<unknown>[] = [];
  for (let i = 0; i < 9; i += 1) {
    const projet = ["a", "b", "c"][i % 3] as string;
    arrivees.push(`${projet}${i}`);
    ecritures.push(prendreUnAppel(limite, { gh: "gh", etiquette: { projet, lecture: "issues", ecriture: true }, maintenant: () => horloge, attendre }).then(() => parties.push(`${projet}${i}`)));
  }
  await laisserPasser();
  assert.deepEqual(parties, []);
  assert.equal(reveils.length, 1, "nine waiting writes, a single wake-up: the pacer's");
  // Une lecture n'attend pas derrière les écritures retenues.
  await prendreUnAppel(limite, { gh: "gh", etiquette: { projet: "b", lecture: "issues" }, maintenant: () => horloge, attendre });
  assert.equal(reveils.length, 1);
  // L'horloge passe l'instant où le rythme rend une place : sans le réveil de la
  // file, rien ne part — aucune écriture ne guette l'horloge pour elle-même.
  horloge += (reveils[0] as { ms: number }).ms;
  await laisserPasser();
  assert.deepEqual(parties, []);
  // Chaque réveil de la file laisse partir la première arrivée, et elle seule ;
  // la file arme le suivant.
  for (let partie = 1; partie <= 9; partie += 1) {
    const reveil = reveils.shift() as { ms: number; sonner: () => void };
    reveil.sonner();
    await laisserPasser();
    assert.deepEqual(parties, arrivees.slice(0, partie));
    assert.equal(reveils.length, partie < 9 ? 1 : 0, `a single wake-up armed after write ${partie}`);
    if (partie < 9) horloge += (reveils[0] as { ms: number }).ms;
  }
  await Promise.all(ecritures);
  limite.fermer();
});

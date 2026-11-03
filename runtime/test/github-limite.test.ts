// Quand GitHub dit que sa limite est atteinte, le sondage des issues cesse
// d'appeler, attend la fin de la fenêtre et reprend seul — sur une horloge
// simulée, contre un faux `gh` qui rend la réponse qu'on lui dicte.
import assert from "node:assert/strict";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { principal as faits } from "../src/faits.ts";
import { ouvrirGitHub } from "../src/github.ts";
import { limitesDeLaStation, lireLaLimite, ouvrirLimitesDuCompte, type LimitesDuCompte } from "../src/github-limite.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { ATTENTE_PAR_DEFAUT_MS, LimiteGitHubAtteinte, ouvrirLimite } from "../src/limite-github.ts";
import { principal as status } from "../src/status.ts";
import { appeler, DEPOT, repertoireTemporaire, temporaireDuFichier } from "./outils.ts";

const rienNeReste = temporaireDuFichier();

const DEPART = Date.parse("2026-10-15T12:00:00Z");
const SECONDE = 1000;
const MINUTE = 60_000;

// Un `gh` dicté : il note chaque appel, rend ce qu'on a posé dans `reponse`
// (sortie), `stderr` et `code`, et répond à `gh api rate_limit` par le fichier
// `rate_limit` — ou en échec s'il n'y en a pas.
function unGh(t: TestContext) {
  const repertoire = repertoireTemporaire(t);
  const bin = join(repertoire, "gh");
  writeFileSync(
    bin,
    [
      "#!/bin/sh",
      'D="$(dirname "$0")"',
      'echo "$*" >> "$D/appels"',
      'case "$*" in *rate_limit*) if [ -f "$D/rate_limit" ]; then cat "$D/rate_limit"; exit 0; fi; echo "gh: indisponible" >&2; exit 1;; esac',
      'cat "$D/reponse"',
      '[ -f "$D/stderr" ] && cat "$D/stderr" >&2',
      'exit "$(cat "$D/code")"',
      "",
    ].join("\n"),
  );
  chmodSync(bin, 0o755);
  const poser = (nom: string, contenu: string) => writeFileSync(join(repertoire, nom), contenu);
  const lignes = () => (existsSync(join(repertoire, "appels")) ? readFileSync(join(repertoire, "appels"), "utf8").split("\n").filter(Boolean) : []);
  return {
    bin,
    poser,
    // Les appels qui ont touché une ressource de l'API, sans `gh api rate_limit`.
    appels: () => lignes().filter((ligne) => !ligne.includes("rate_limit")),
    questionsDeLimite: () => lignes().filter((ligne) => ligne.includes("rate_limit")).length,
    // Une réponse HTTP telle que `gh api -i` la rend.
    repondre(statut: number, entetes: Record<string, string>, corps: unknown, sortie = statut < 400 ? 0 : 1) {
      poser("reponse", [`HTTP/2.0 ${statut}`, ...Object.entries(entetes).map(([nom, valeur]) => `${nom}: ${valeur}`), "", JSON.stringify(corps)].join("\r\n"));
      poser("code", String(sortie));
    },
  };
}

function uneHorloge() {
  let instant = DEPART;
  return {
    maintenant: () => instant,
    avancer: (ms: number) => void (instant += ms),
  };
}

const LIMITE_PRIMAIRE = { message: "API rate limit exceeded for user ID 1.", documentation_url: "https://docs.github.com/rest/overview/rate-limits-for-the-rest-api" };

function sondage(t: TestContext, limitesDuCompte?: (maintenant: () => number) => LimitesDuCompte) {
  const gh = unGh(t);
  const horloge = uneHorloge();
  const limite = ouvrirLimite({ maintenant: horloge.maintenant });
  t.after(() => limite.fermer());
  const limites = (limitesDuCompte ?? ((maintenant) => ouvrirLimitesDuCompte({ maintenant })))(horloge.maintenant);
  t.after(() => limites.fermer());
  const github = ouvrirGitHub({ depot: DEPOT, bin: gh.bin, limite, limitesDuCompte: limites, maintenant: horloge.maintenant });
  t.after(() => github.fermer());
  return { gh, horloge, limite, limites, github };
}

test("un 403 « rate limit » ou un 429 au sondage met les appels en attente jusqu'à x-ratelimit-reset, et aucun ne part pendant l'attente", async (t) => {
  for (const [statut, corps] of [
    [403, LIMITE_PRIMAIRE],
    [429, { message: "Too many requests" }],
  ] as const) {
    const { gh, horloge, limite, github } = sondage(t);
    const fin = (DEPART + 10 * MINUTE) / SECONDE;
    gh.repondre(statut, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(fin) }, corps);

    await assert.rejects(github.tickets(), (erreur: unknown) => erreur instanceof LimiteGitHubAtteinte && erreur.jusqua === fin * SECONDE && erreur.libreDansMs === 10 * MINUTE);
    assert.equal(gh.appels().length, 1);
    assert.equal(gh.questionsDeLimite(), 0, "l'en-tête suffit : pas de `gh api rate_limit`");

    // Pendant l'attente, ni le sondage ni un autre appel ne lancent `gh`.
    for (const minute of [1, 5, 9]) {
      horloge.avancer(minute === 1 ? MINUTE : 4 * MINUTE);
      await assert.rejects(github.tickets(), LimiteGitHubAtteinte);
      await assert.rejects(github.issue(3), LimiteGitHubAtteinte);
      assert.throws(() => limite.prendre(), LimiteGitHubAtteinte);
    }
    assert.equal(gh.appels().length, 1, "aucun appel pendant l'attente");

    // La fenêtre passée, les appels reprennent d'eux-mêmes.
    horloge.avancer(MINUTE);
    gh.repondre(200, { etag: '"a"' }, []);
    assert.equal((await github.tickets()).inchange, false);
    assert.equal(gh.appels().length, 2);
  }
});

test("sans en-tête exploitable, la fin de fenêtre vient de `gh api rate_limit`, et à défaut l'attente est de 60 s", async (t) => {
  // Un en-tête déjà échu, ou absent, n'est pas exploitable.
  for (const entetes of [{} as Record<string, string>, { "x-ratelimit-reset": String((DEPART - MINUTE) / SECONDE) }, { "x-ratelimit-reset": "bientôt" }]) {
    const { gh, limite, github } = sondage(t);
    const fin = (DEPART + 7 * MINUTE) / SECONDE;
    gh.repondre(403, entetes, LIMITE_PRIMAIRE);
    gh.poser("rate_limit", JSON.stringify({ resources: { core: { limit: 5000, remaining: 0, reset: fin }, search: { limit: 30, remaining: 12, reset: fin + 3600 } } }));
    await assert.rejects(github.tickets(), (erreur: unknown) => erreur instanceof LimiteGitHubAtteinte && erreur.jusqua === fin * SECONDE);
    assert.equal(gh.questionsDeLimite(), 1);
    assert.throws(() => limite.prendre(), LimiteGitHubAtteinte);
  }

  // `gh api rate_limit` ne répond pas, ou ne dit aucune ressource épuisée : 60 s.
  for (const rate of [null, JSON.stringify({ resources: { core: { limit: 5000, remaining: 4000, reset: DEPART / SECONDE + 3000 } } }), "illisible"]) {
    const { gh, horloge, limite, github } = sondage(t);
    gh.repondre(429, {}, { message: "slow down" });
    if (rate !== null) gh.poser("rate_limit", rate);
    await assert.rejects(github.tickets(), (erreur: unknown) => erreur instanceof LimiteGitHubAtteinte && erreur.libreDansMs === ATTENTE_PAR_DEFAUT_MS);
    assert.equal(ATTENTE_PAR_DEFAUT_MS, 60 * SECONDE);
    horloge.avancer(59 * SECONDE);
    assert.throws(() => limite.prendre(), LimiteGitHubAtteinte);
    horloge.avancer(SECONDE);
    limite.prendre();
    assert.equal(gh.appels().length, 1);
  }
});

test("la limite secondaire (retry-after) fixe aussi la fin de l'attente", async (t) => {
  const { gh, github } = sondage(t);
  gh.repondre(403, { "retry-after": "90" }, { message: "You have exceeded a secondary rate limit." });
  await assert.rejects(github.tickets(), (erreur: unknown) => erreur instanceof LimiteGitHubAtteinte && erreur.libreDansMs === 90 * SECONDE);
});

test("un refus pour limite n'est pas pris pour un refus de merge, et un vrai refus de merge n'est pas pris pour la limite", async (t) => {
  const { gh, horloge, limite, github } = sondage(t);
  // Le 403 d'un merge interdit : une réponse, rien n'est mergé, la limite n'est pas touchée.
  gh.repondre(403, {}, { message: "Resource not accessible by integration" });
  assert.deepEqual(await github.merger(7, "abc"), { fait: false, motif: "HTTP 403 — Resource not accessible by integration" });
  limite.prendre();

  // Le 403 « rate limit » : une erreur de limite — pas un `{ fait: false }` — et la pause.
  gh.repondre(403, { "x-ratelimit-reset": String((DEPART + MINUTE) / SECONDE) }, LIMITE_PRIMAIRE);
  await assert.rejects(github.merger(7, "abc"), LimiteGitHubAtteinte);
  gh.repondre(429, {}, { message: "Too many requests" });
  horloge.avancer(MINUTE);
  await assert.rejects(github.merger(7, "abc"), LimiteGitHubAtteinte);
  assert.equal(gh.appels().length, 3);
});

// Les trois limites, telles que GitHub les dit : la primaire (quota à zéro), la
// secondaire des écritures (« content creation »), celle des requêtes simultanées.
const DATE_DU_REFUS = new Date(DEPART).toUTCString();
const ECRITURES = { message: "You have exceeded a secondary rate limit and have been temporarily blocked from content creation. Please retry your request again later." };
const SIMULTANEES = { message: "You have exceeded a secondary rate limit: too many concurrent requests. Please retry your request again later." };
const iso = (ms: number) => new Date(ms).toISOString();

test("la limite primaire, celle des écritures à la minute et celle des requêtes simultanées se nomment chacune, depuis l'en-tête date jusqu'à retry-after ou x-ratelimit-reset", async (t) => {
  const reset = DEPART + 25 * MINUTE;
  const cas = [
    { statut: 403, entetes: { date: DATE_DU_REFUS, "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(reset / SECONDE) }, corps: LIMITE_PRIMAIRE, limit: "primary", backAt: reset },
    { statut: 403, entetes: { date: DATE_DU_REFUS, "retry-after": "60", "x-ratelimit-remaining": "4653" }, corps: ECRITURES, limit: "secondary-writes", backAt: DEPART + MINUTE },
    { statut: 429, entetes: { date: DATE_DU_REFUS, "retry-after": "120", "x-ratelimit-remaining": "4653" }, corps: SIMULTANEES, limit: "secondary-concurrency", backAt: DEPART + 2 * MINUTE },
  ] as const;
  const vus = new Set<string>();
  for (const { statut, entetes, corps, limit, backAt } of cas) {
    const { gh, horloge, limites, github } = sondage(t);
    // L'horloge de la box a dix secondes d'avance sur GitHub : l'instant est celui de sa réponse.
    horloge.avancer(10 * SECONDE);
    assert.equal(limites.courante(), null);
    gh.repondre(statut, entetes, corps);
    await assert.rejects(github.tickets(), LimiteGitHubAtteinte);
    assert.deepEqual(limites.courante(), { limit, since: iso(DEPART), backAt: iso(backAt) });
    vus.add(limites.courante()?.limit ?? "");
  }
  assert.equal(vus.size, 3);
});

test("une limite secondaire que le message ne précise pas se lit sur la requête, et sans en-tête la reprise est la pause de la box", async (t) => {
  const { gh, limites, github } = sondage(t);
  gh.repondre(403, { "retry-after": "30" }, { message: "You have exceeded a secondary rate limit." });
  await assert.rejects(github.merger(7, "abc"), LimiteGitHubAtteinte);
  assert.deepEqual(limites.courante(), { limit: "secondary-writes", since: iso(DEPART), backAt: iso(DEPART + 30 * SECONDE) });

  const secondaire = { statut: 429, entetes: new Map<string, string>(), corps: "slow down" };
  assert.deepEqual(lireLaLimite(secondaire, { maintenant: DEPART }), { sorte: "secondary-concurrency", depuis: DEPART, reprise: DEPART + ATTENTE_PAR_DEFAUT_MS });
  assert.deepEqual(lireLaLimite(secondaire, { maintenant: DEPART, ecriture: true, repli: DEPART + 7 * MINUTE }), { sorte: "secondary-writes", depuis: DEPART, reprise: DEPART + 7 * MINUTE });
  // `retry-after` en date HTTP.
  const enDate = { statut: 403, entetes: new Map([["retry-after", new Date(DEPART + 3 * MINUTE).toUTCString()]]), corps: JSON.stringify(SIMULTANEES) };
  assert.equal(lireLaLimite(enDate, { maintenant: DEPART }).reprise, DEPART + 3 * MINUTE);
});

test("la limite du compte est dans `faits` et `status` de chaque projet de la station tant qu'elle dure ; la reprise passée, un appel qui aboutit la lève", async (t) => {
  const station = repertoireTemporaire(t);
  const projets = [repertoireTemporaire(t), repertoireTemporaire(t)];
  for (const projet of projets) ouvrirJournal(projet).fermer();
  const { gh, horloge, github } = sondage(t, (maintenant) => limitesDeLaStation(station, { maintenant }));
  const lire = async (commande: typeof status, projet: string) => {
    const rendu = appeler(commande, [], { BRIGADE_STATE_DIR: projet, BRIGADE_STATION_DIR: station });
    assert.equal(await rendu.fin, 0);
    return rendu.sortie();
  };
  const hhmm = (ms: number) => `${String(new Date(ms).getHours()).padStart(2, "0")}:${String(new Date(ms).getMinutes()).padStart(2, "0")}`;

  for (const projet of projets) assert.equal(JSON.parse(await lire(faits, projet)).github, undefined);

  gh.repondre(403, { date: DATE_DU_REFUS, "retry-after": "1920" }, ECRITURES);
  await assert.rejects(github.merger(7, "abc"), LimiteGitHubAtteinte);
  const attendue = { limit: "secondary-writes", since: iso(DEPART), backAt: iso(DEPART + 32 * MINUTE) };
  for (const projet of projets) {
    assert.deepEqual(JSON.parse(await lire(faits, projet)).github, attendue);
    const lignes = (await lire(status, projet)).split("\n").filter((ligne) => ligne.startsWith("github "));
    assert.deepEqual(lignes, [`github     GitHub is rate-limiting calls: secondary limit (writes per minute), since ${hhmm(DEPART)}, back around ${hhmm(DEPART + 32 * MINUTE)}`]);
  }

  // Un geste qui aboutit avant la reprise ne lève rien : GitHub n'a pas rendu les appels.
  const [compteur, limitesDuGeste] = [ouvrirLimite({ maintenant: horloge.maintenant }), limitesDeLaStation(station, { maintenant: horloge.maintenant })];
  const geste = ouvrirGitHub({ depot: DEPOT, bin: gh.bin, usage: "geste", limite: compteur, limitesDuCompte: limitesDuGeste, maintenant: horloge.maintenant });
  t.after(() => [geste.fermer(), compteur.fermer(), limitesDuGeste.fermer()]);
  horloge.avancer(5 * MINUTE);
  gh.repondre(200, { etag: '"a"' }, []);
  await geste.tickets();
  for (const projet of projets) assert.deepEqual(JSON.parse(await lire(faits, projet)).github, attendue);

  // La reprise passée, le premier appel qui aboutit lève la limite, pour tous les projets.
  horloge.avancer(27 * MINUTE);
  gh.repondre(200, { etag: '"b"' }, []);
  await github.tickets();
  for (const projet of projets) {
    assert.equal(JSON.parse(await lire(faits, projet)).github, undefined);
    assert.doesNotMatch(await lire(status, projet), /rate-limiting/);
  }
});

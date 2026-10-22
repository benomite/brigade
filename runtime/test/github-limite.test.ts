// Quand GitHub dit que sa limite est atteinte, le sondage des issues cesse
// d'appeler, attend la fin de la fenêtre et reprend seul — sur une horloge
// simulée, contre un faux `gh` qui rend la réponse qu'on lui dicte.
import assert from "node:assert/strict";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "./support/posix.ts";
import { ouvrirGitHub } from "../src/github.ts";
import { ATTENTE_PAR_DEFAUT_MS, LimiteGitHubAtteinte, ouvrirLimite } from "../src/limite-github.ts";
import { DEPOT, repertoireTemporaire, temporaireDuFichier } from "./outils.ts";

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

function sondage(t: TestContext) {
  const gh = unGh(t);
  const horloge = uneHorloge();
  const limite = ouvrirLimite({ maintenant: horloge.maintenant });
  t.after(() => limite.fermer());
  const github = ouvrirGitHub({ depot: DEPOT, bin: gh.bin, limite, maintenant: horloge.maintenant });
  t.after(() => github.fermer());
  return { gh, horloge, limite, github };
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

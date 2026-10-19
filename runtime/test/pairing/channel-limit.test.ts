// Quand GitHub dit que sa limite est atteinte, le canal du gist et la présence
// de la station cessent d'appeler, attendent la fin de la fenêtre et reprennent
// seuls — sur une horloge simulée, contre un faux `gh` qu'on dicte.
import assert from "node:assert/strict";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { canalGitHub, type Canal } from "../../src/pairing/channel.ts";
import { FICHIER_STATION } from "../../src/pairing/document.ts";
import { REGARD_MS, tenirPresence } from "../../src/pairing/presence.ts";
import { ATTENTE_PAR_DEFAUT_MS, LimiteGitHubAtteinte, ouvrirLimite } from "../../src/limite-github.ts";
import { aArreter, repertoireTemporaire, temporaireDuFichier } from "../outils.ts";

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
    appels: () => lignes().filter((ligne) => !ligne.includes("rate_limit")),
    questionsDeLimite: () => lignes().filter((ligne) => ligne.includes("rate_limit")).length,
    limiteAtteinte(statut: number, entetes: Record<string, string>) {
      poser("reponse", [`HTTP/2.0 ${statut}`, ...Object.entries(entetes).map(([nom, valeur]) => `${nom}: ${valeur}`), "", '{"message":"API rate limit exceeded for user ID 1."}'].join("\r\n"));
      poser("stderr", `gh: API rate limit exceeded for user ID 1. (HTTP ${statut})\n`);
      poser("code", "1");
    },
    succes(corps: unknown) {
      poser("reponse", ["HTTP/2.0 200", "Content-Type: application/json", "", JSON.stringify(corps)].join("\r\n"));
      poser("stderr", "");
      poser("code", "0");
    },
  };
}

function unCanal(t: TestContext) {
  const gh = unGh(t);
  let instant = DEPART;
  const maintenant = () => instant;
  const limite = ouvrirLimite({ maintenant });
  t.after(() => limite.fermer());
  const canal = canalGitHub({ gh: gh.bin, limite, maintenant });
  return { gh, limite, canal, avancer: (ms: number) => void (instant += ms), maintenant };
}

test("un 403 « rate limit » ou un 429 sur le canal met les appels en attente jusqu'à x-ratelimit-reset", async (t) => {
  for (const statut of [403, 429]) {
    const { gh, canal, limite, avancer } = unCanal(t);
    const fin = (DEPART + 10 * MINUTE) / SECONDE;
    gh.limiteAtteinte(statut, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(fin) });
    await assert.rejects(canal.lire("abc"), (erreur: unknown) => erreur instanceof LimiteGitHubAtteinte && erreur.jusqua === fin * SECONDE);
    assert.equal(gh.appels().length, 1);
    assert.equal(gh.questionsDeLimite(), 0);

    // Lecture, écriture, création : rien ne part avant la fin de la fenêtre.
    avancer(9 * MINUTE);
    await assert.rejects(canal.lire("abc"), LimiteGitHubAtteinte);
    await assert.rejects(canal.ecrire("abc", { [FICHIER_STATION]: "{}" }), LimiteGitHubAtteinte);
    await assert.rejects(canal.creer("x", {}), LimiteGitHubAtteinte);
    assert.equal(gh.appels().length, 1);

    avancer(MINUTE);
    gh.succes({ files: { [FICHIER_STATION]: { content: "{}" } } });
    assert.deepEqual(await canal.lire("abc"), { [FICHIER_STATION]: "{}" });
    assert.equal(gh.appels().length, 2);
    limite.prendre();
  }
});

test("sur le canal, sans en-tête exploitable : `gh api rate_limit`, et à défaut 60 s — même quand gh ne dit que le statut", async (t) => {
  const avecRateLimit = unCanal(t);
  const fin = (DEPART + 4 * MINUTE) / SECONDE;
  avecRateLimit.gh.limiteAtteinte(403, {});
  avecRateLimit.gh.poser("rate_limit", JSON.stringify({ resources: { core: { limit: 5000, remaining: 0, reset: fin } } }));
  await assert.rejects(avecRateLimit.canal.lire("abc"), (erreur: unknown) => erreur instanceof LimiteGitHubAtteinte && erreur.jusqua === fin * SECONDE);
  assert.equal(avecRateLimit.gh.questionsDeLimite(), 1);

  const sansRien = unCanal(t);
  sansRien.gh.limiteAtteinte(429, {});
  await assert.rejects(sansRien.canal.lire("abc"), (erreur: unknown) => erreur instanceof LimiteGitHubAtteinte && erreur.libreDansMs === ATTENTE_PAR_DEFAUT_MS);

  // Un `gh` qui ne rend que son message d'erreur, sans réponse HTTP.
  const sansEntetes = unCanal(t);
  sansEntetes.gh.poser("reponse", "");
  sansEntetes.gh.poser("stderr", "gh: API rate limit exceeded for user ID 1. (HTTP 403)\n");
  sansEntetes.gh.poser("code", "1");
  await assert.rejects(sansEntetes.canal.lire("abc"), (erreur: unknown) => erreur instanceof LimiteGitHubAtteinte && erreur.libreDansMs === ATTENTE_PAR_DEFAUT_MS);
});

test("un refus qui n'est pas la limite reste une erreur de gh : le canal n'attend pas", async (t) => {
  const { gh, canal, limite } = unCanal(t);
  gh.poser("reponse", ["HTTP/2.0 403", "", '{"message":"Resource not accessible"}'].join("\r\n"));
  gh.poser("stderr", "gh: Resource not accessible (HTTP 403)\n");
  gh.poser("code", "1");
  await assert.rejects(canal.lire("abc"), (erreur: unknown) => !(erreur instanceof LimiteGitHubAtteinte) && /Resource not accessible/.test((erreur as Error).message));
  limite.prendre();
});

// Un canal qui lève la limite atteinte tant que le temps n'a pas passé la fin
// de la fenêtre, et compte ses appels.
function canalLimite(maintenant: () => number, fin: number) {
  const appels: string[] = [];
  const canal: Canal = {
    async creer() {
      appels.push("creer");
      if (maintenant() < fin) throw new LimiteGitHubAtteinte(fin, fin - maintenant());
      return "g1";
    },
    async ecrire() {
      appels.push("ecrire");
      if (maintenant() < fin) throw new LimiteGitHubAtteinte(fin, fin - maintenant());
      return "ecrit";
    },
    async lire() {
      appels.push("lire");
      if (maintenant() < fin) throw new LimiteGitHubAtteinte(fin, fin - maintenant());
      return {};
    },
  };
  return { canal, appels };
}

test("la présence ne retente pas chaque minute pendant l'attente, le dit une fois, et reprend seule la fenêtre passée", async (t) => {
  let instant = DEPART;
  const minuteurs: { le: number; tache: () => void; annule: boolean }[] = [];
  const apres = (tache: () => void, ms: number) => {
    const minuteur = { le: instant + ms, tache, annule: false };
    minuteurs.push(minuteur);
    return () => void (minuteur.annule = true);
  };
  const avancer = async (ms: number) => {
    const but = instant + ms;
    for (;;) {
      const prochain = minuteurs.filter((m) => !m.annule && m.le <= but).sort((a, b) => a.le - b.le)[0];
      if (prochain === undefined) break;
      prochain.annule = true;
      instant = Math.max(instant, prochain.le);
      prochain.tache();
      await new Promise<void>((fin) => setImmediate(fin));
    }
    instant = but;
    await new Promise<void>((fin) => setImmediate(fin));
  };
  const fin = DEPART + 10 * MINUTE;
  const { canal, appels } = canalLimite(() => instant, fin);
  const lignes: string[] = [];
  const presence = tenirPresence({
    racine: repertoireTemporaire(t),
    canal,
    identite: { nom: "box", machine: "Linux 6.1.0", version: "1.4.0" },
    projets: () => [],
    dire: (ligne) => lignes.push(ligne),
    apres,
    maintenant: () => instant,
  });
  aArreter(t, () => presence.arreter());
  await avancer(0);
  assert.deepEqual(appels, ["creer"], "un premier essai, refusé");

  // Neuf regards pendant l'attente : aucun appel de plus, un publier() forcé non plus.
  await avancer(9 * MINUTE);
  await presence.publier();
  assert.deepEqual(appels, ["creer"]);
  assert.equal(lignes.filter((ligne) => /limite d'appels/.test(ligne)).length, 1, "l'attente se dit une fois");

  // La fenêtre passée, au regard suivant, elle reprend sans geste du chef.
  await avancer(MINUTE + REGARD_MS);
  assert.deepEqual(appels.slice(0, 2), ["creer", "creer"], "le premier appel après la fenêtre est la reprise");
  assert.equal(presence.code() === null, false, "son gist est créé : elle a repris");
  assert.equal(lignes.filter((ligne) => /GitHub répond de nouveau/.test(ligne)).length, 1);
});

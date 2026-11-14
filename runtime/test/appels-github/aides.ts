// Ce que partagent les tests de la couche d'appels à GitHub (#3481) : un `gh`
// dicté pour le canal du gist, et une station GitHub seul sur le faux GitHub
// de `cout-par-ticket`, branchée sur le compteur qu'on lui donne.
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestContext } from "node:test";
import { stationDuDepot, type Lancer, type OptionsDuDepot, type StationGitHub } from "../../src/brigade-github.ts";
import { ouvrirLimitesDuCompte } from "../../src/github-limite.ts";
import { ouvrirGitHub } from "../../src/github.ts";
import type { Limite } from "../../src/limite-github.ts";
import type { FauxGitHub } from "../cout-par-ticket/faux-github.ts";
import { STATION_DU_DEPOT } from "../faux-github.ts";
import { repertoireTemporaire } from "../outils.ts";

export const DEPOT = "faux/appels";
export const CALIBRE = ["fire", "model:sonnet", "effort:medium"];

// Un `gh` pour le canal du gist : il note chaque appel (ses arguments), crée un
// gist sur un POST, et répond à un PATCH par un succès — ou par le 403 de la
// limite secondaire de GitHub tant que `refuser(true)`. `gh api rate_limit`
// échoue : la pause, sans fin dite, dure ce que la box choisit.
export function unGhDeGist(t: TestContext) {
  const repertoire = repertoireTemporaire(t);
  const bin = join(repertoire, "gh");
  writeFileSync(
    bin,
    [
      "#!/bin/sh",
      'D="$(dirname "$0")"',
      'echo "$*" >> "$D/appels"',
      'case "$*" in *rate_limit*) echo "gh: indisponible" >&2; exit 1;; esac',
      'case "$*" in *POST*) printf \'HTTP/2.0 201 Created\\r\\nContent-Type: application/json\\r\\n\\r\\n{"id":"g1"}\'; exit 0;; esac',
      'if [ -f "$D/refuser" ]; then',
      "  printf 'HTTP/2.0 403 Forbidden\\r\\nContent-Type: application/json\\r\\n\\r\\n{\"message\":\"You have exceeded a secondary rate limit. Please wait a few minutes before you try again.\"}'",
      '  echo "gh: You have exceeded a secondary rate limit. (HTTP 403)" >&2',
      "  exit 1",
      "fi",
      "printf 'HTTP/2.0 200 OK\\r\\nContent-Type: application/json\\r\\n\\r\\n{\"id\":\"g1\",\"files\":{}}'",
      "",
    ].join("\n"),
  );
  chmodSync(bin, 0o755);
  const lignes = () => (existsSync(join(repertoire, "appels")) ? readFileSync(join(repertoire, "appels"), "utf8").split("\n").filter(Boolean) : []);
  return {
    bin,
    refuser(oui: boolean) {
      if (oui) writeFileSync(join(repertoire, "refuser"), "");
      else rmSync(join(repertoire, "refuser"), { force: true });
    },
    // Les écritures du gist parties vers GitHub.
    ecritures: () => lignes().filter((ligne) => ligne.includes("PATCH")).length,
  };
}

// Le dépôt d'une station sur le faux GitHub : chaque run a son worktree sous
// `repertoire`, et son cook livre un commit qui touche `a.ts`.
export const depotQuiLivre = (repertoire: string): OptionsDuDepot["depot"] => ({
  preparer: async (run) => ({ worktree: join(repertoire, run), branche: `cook/${run}` }),
  reprendre: async (run) => join(repertoire, run),
  connait: () => false,
  retirer: () => {},
  ranger: async () => null,
  pousser: () => {},
  commits: () => 1,
  changes: () => ["a.ts"],
  diff: () => "diff --git a/a.ts b/a.ts\n+x\n",
});

const fluxQuiConclut = (texte: string) => `${JSON.stringify({ type: "result", is_error: false, result: texte })}\n`;

// La station GitHub seul de ce runtime sur le faux GitHub, ses appels pris au
// compteur `limite` : le vrai client (`github.ts`), seul le transport est faux.
// `lances` : les tickets dont un cook est parti.
export function uneStation(t: TestContext, faux: FauxGitHub, limite: Limite, maintenant?: () => number): { station: StationGitHub; lances: string[] } {
  const repertoire = mkdtempSync(join(tmpdir(), "appels-github-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const lances: string[] = [];
  const lancer: Lancer = ({ args, flux }) => {
    const reviewer = args.includes("--tools");
    if (!reviewer) lances.push(flux);
    // Le cook travaille : il ne conclut pas pendant le test.
    const fin = reviewer ? Promise.resolve().then(() => (writeFileSync(flux, fluxQuiConclut("{}")), { code: 0, signal: null, turns: 1, tokens: 1, durationMs: 1, arret: null, erreur: null })) : new Promise<never>(() => {});
    return { fin };
  };
  const github = ouvrirGitHub({ depot: DEPOT, bin: `faux-gh-${repertoire}`, transport: faux.transport, limite, limitesDuCompte: ouvrirLimitesDuCompte(), ...(maintenant === undefined ? {} : { maintenant }) });
  const ouverte = stationDuDepot({
    graphql: false,
    ...STATION_DU_DEPOT,
    places: 2,
    depotGitHub: DEPOT,
    github,
    depot: depotQuiLivre(repertoire),
    flux: repertoire,
    lancer,
    avertir: (texte) => assert.fail(texte),
  });
  if ("refus" in ouverte) throw new Error(ouverte.refus);
  return { station: ouverte, lances };
}

// Une horloge simulée : les minuteurs ne battent que quand le test avance le temps.
export function fausseHorloge(depart: number) {
  let instant = depart;
  const minuteurs: { le: number; tache: () => void; annule: boolean }[] = [];
  const apres = (tache: () => void, ms: number) => {
    const minuteur = { le: instant + ms, tache, annule: false };
    minuteurs.push(minuteur);
    return () => {
      minuteur.annule = true;
    };
  };
  const laisserFaire = async () => {
    for (let i = 0; i < 5; i += 1) await new Promise<void>((fin) => setImmediate(fin));
  };
  const avancer = async (ms: number) => {
    const but = instant + ms;
    for (;;) {
      await laisserFaire();
      const prochain = minuteurs.filter((m) => !m.annule && m.le <= but).sort((a, b) => a.le - b.le)[0];
      if (prochain === undefined) break;
      prochain.annule = true;
      instant = Math.max(instant, prochain.le);
      prochain.tache();
    }
    instant = but;
    await laisserFaire();
  };
  return { apres, avancer, maintenant: () => instant };
}

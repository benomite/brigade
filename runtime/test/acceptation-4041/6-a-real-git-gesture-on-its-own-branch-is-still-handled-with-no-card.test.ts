// #4041, critère 6 : un vrai geste git (un conflit sur sa propre branche) se traite comme avant, sans carte du chef.
import assert from "node:assert/strict";
import { basename, join } from "node:path";
import { writeFileSync } from "node:fs";
import { test, type TestContext } from "node:test";
import { MARQUE_DE_LA_CONSULTATION } from "../../src/blocage-au-manager.ts";
import { stationDuDepot, type Lancer } from "../../src/brigade-github.ts";
import { ouvrirDepot } from "../../src/depot.ts";
import type { GitHub } from "../../src/github.ts";
import { FauxGitHub, STATION_DU_DEPOT, fauxClient } from "../faux-github.ts";
import { BASE, depotGit, ENV_GIT, repertoireTemporaire } from "../outils.ts";
import { CHEF_TODO } from "../../src/github-etat/etats.ts";

const TICKET = 894;
const CALIBRE = ["fire", "model:opus", "effort:medium"];

// La station d'un projet sur un vrai dépôt : seuls GitHub, `gh` et `claude` sont faux.
// Le cook finit toujours bloqué sur `besoin` ; le manager consulté rend `geste`.
function station(t: TestContext, { besoin, geste }: { besoin: string; geste: string }) {
  const lieux = depotGit(t);
  const faux = new FauxGitHub();
  faux.feu(TICKET, CALIBRE, "## Context\n\nThe import job.");
  const depot = ouvrirDepot({ clone: lieux.clone, base: BASE, worktrees: join(repertoireTemporaire(t), "worktrees"), env: ENV_GIT });
  let cooks = 0;
  const lancer: Lancer = ({ args, entree, cwd, flux }) => {
    const consulte = (entree ?? "").startsWith(MARQUE_DE_LA_CONSULTATION);
    let message = JSON.stringify({ issue: "geste", geste, question_en: besoin });
    if (!consulte && !args.includes("--tools")) {
      const cuisine = basename(cwd) === `${TICKET}-github`;
      message = cuisine ? `I stopped.\n<livrable>\n<bloque>${besoin}</bloque>\n</livrable>` : "Done.\n<livrable>\nNothing.\n</livrable>";
      if (cuisine) cooks += 1;
    }
    writeFileSync(flux, `${JSON.stringify({ type: "result", is_error: false, result: message })}\n`);
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 10, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const avertissements: string[] = [];
  const github: GitHub = { ...fauxClient(faux), creerIssue: faux.pour("box").creerIssue };
  const ouverte = stationDuDepot({
    ...STATION_DU_DEPOT,
    base: BASE,
    github,
    depot,
    manager: () => ({ model: "opus", effort: "high" }),
    flux: repertoireTemporaire(t),
    lancer,
    avertir: (texte) => void avertissements.push(texte),
  });
  if ("refus" in ouverte) throw new Error(ouverte.refus);
  const tour = async () => {
    await ouverte.tour();
    await ouverte.calme();
  };
  const commentaires = () => (faux.commentaires.get(TICKET) ?? []).map((c) => c.body);
  return { faux, tour, cooks: () => cooks, avertissements, commentaires };
}

// Les cartes du chef posées sur l'issue.
const cartes = (commentaires: string[]) => commentaires.filter((c) => /^\*\*(?:Gesture|Question) for the chef\b/.test(c.trimStart()));
const BESOIN = "I need an OpenRouter API key and the preprod database URL in the station's local environment file; only the chef can add them.";
const GESTE_SECRET = "add the OpenRouter API key and the preprod database URL to the station's local environment file";

test("a cook blocked on a real git gesture on its own branch gets no card for the chef", async (t) => {
  const s = station(t, { besoin: "I stopped on a conflict of my branch with the base.", geste: "merge origin/main into the branch and resolve the conflicts" });
  for (let i = 0; i < 2; i++) await s.tour();
  assert.deepEqual(cartes(s.commentaires()), [], s.commentaires().join("\n---\n"));
  assert.equal(s.faux.ticket(TICKET).labels.has(CHEF_TODO), false);
});

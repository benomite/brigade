// La cuisine d'un projet de la station donne son rail, lu dans son journal, tel
// que la station le publie pour l'app d'un ordinateur neuf (#1432) : les tickets
// de `facts`, mot d'état pour mot d'état.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { principal as facts } from "../../src/faits.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { ouvrirCuisine } from "../../src/station/cuisine.ts";
import { appeler, FAUX_CLAUDE, git, repertoireTemporaire, temporaireDuFichier } from "../outils.ts";

const rienNeReste = temporaireDuFichier();

const DECIDE = {
  BRIGADE_STATIONS: "box/claude:30:code",
  BRIGADE_MANAGER_MODEL: "sonnet",
  BRIGADE_MANAGER_EFFORT: "medium",
  BRIGADE_REVIEWER_MODEL: "sonnet",
  BRIGADE_REVIEWER_EFFORT: "medium",
};

test("la cuisine ouverte donne le rail de son journal — celui de `facts` — et n'en donne plus une fois arrêtée", async (t) => {
  const racine = repertoireTemporaire(t);
  const etat = join(racine, "etat");
  const clone = join(racine, "clone");
  mkdirSync(etat);
  mkdirSync(clone);
  git(clone, "init", "-q");
  const journal = ouvrirJournal(etat);
  for (const [name, value] of Object.entries(DECIDE)) journal.ajouter({ project: "brigade", ticket: null, author: "chef", type: "decision.set", payload: { name, value, previous: null } });
  const arriver = (ticket: number, priority: number | null, card?: { waitsFor: number[]; zone: string[]; problems: string[] }) =>
    journal.ajouter({ project: "brigade", ticket, author: "github", type: "ticket.arrived", payload: { title: `Ticket ${ticket}`, priority, createdAt: `2026-10-01T00:00:${ticket}Z`, url: `https://github.com/acme/brigade/issues/${ticket}`, card } });
  arriver(14, 1);
  arriver(15, 2);
  arriver(18, null, { waitsFor: [12], zone: [], problems: [] });
  journal.ajouter({ project: "brigade", ticket: 12, author: "github", type: "ticket.left", payload: { reason: "unfired" } });
  journal.fermer();

  const cuisine = ouvrirCuisine(
    {
      HOME: racine,
      BRIGADE_STATE_DIR: etat,
      BRIGADE_PROJECT: "brigade",
      BRIGADE_GITHUB_REPO: "acme/brigade",
      // Aucun test ne joint GitHub : ce `gh` n'existe pas, le tableau de la cuisine ne se publie nulle part.
      BRIGADE_GH_BIN: join(racine, "gh-absent"),
      BRIGADE_REPO_DIR: clone,
      BRIGADE_BASE_BRANCH: "v2",
      BRIGADE_CLAUDE_BIN: FAUX_CLAUDE,
      BRIGADE_SESSION_DIR: join(racine, ".session"),
    },
    { dire: () => {} },
  );
  let rail;
  try {
    rail = cuisine.rail?.();
  } finally {
    cuisine.arreter("fin du test");
  }
  assert.throws(() => cuisine.rail?.(), /arrêtée/);

  const commande = appeler(facts, [], { BRIGADE_STATE_DIR: etat });
  assert.equal(await commande.fin, 0, commande.sortie());
  const lu = (JSON.parse(commande.sortie()) as { rail: Array<{ ticket: number; etat: string; titre: string; url: string }> }).rail;
  assert.deepEqual(rail, lu.map(({ ticket, etat: mot, titre, url }) => ({ ticket, etat: mot, titre, url })));
  assert.deepEqual(rail?.map(({ ticket, etat: mot }) => [ticket, mot]), [[14, "en attente"], [15, "en attente"], [18, "en attente"]]);
});

test("cuisine-rail.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);

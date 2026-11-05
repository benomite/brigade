// Sous les portes de la station, chaque cuisine sort par la sienne : les vraies portes (`tenirPortes`), la vraie
// station (`ouvrirStation`) et ses vraies cuisines (`ouvrirCuisine`), dans le process du test. Que la station attende
// sa porte avant de rien joindre se prouve sur `attendrePorteDeLaStation` (portes.test.ts) ; son process, tel que son
// unité le lance derrière sa porte, a son test dans paquet/paquet.test.ts.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { ouvrirJournal } from "../../src/journal.ts";
import { accepterSansBacASable } from "../../src/onboarding/attente.ts";
import { lirePortes, tenirPortes } from "../../src/station/portes.ts";
import { ouvrirStation } from "../../src/station/station.ts";
import { relecteur } from "../aides/opt-B-journal.ts";
import { aArreter, BASE, ENV_GIT, FAUX_CLAUDE, fauxGh, git, jusqua, repertoireTemporaire, temporaireDuFichier } from "../outils.ts";

const rienNeReste = temporaireDuFichier();

// Les décisions sans lesquelles un projet ne sert pas : le chef les a posées
// au journal du projet, avant de lui écrire sa ligne.
const DECIDE = {
  BRIGADE_STATIONS: "box/claude:30:code",
  BRIGADE_MANAGER_MODEL: "sonnet",
  BRIGADE_MANAGER_EFFORT: "medium",
  BRIGADE_REVIEWER_MODEL: "sonnet",
  BRIGADE_REVIEWER_EFFORT: "medium",
};

test("sous les portes de la station : chaque projet sort par la sienne — jamais par celle d'un autre", async (t) => {
  const racine = repertoireTemporaire(t);
  const compte = repertoireTemporaire(t);
  const etat = (projet: string) => join(racine, "etat", projet);
  // Ce que le chef a fait de chaque projet avant de l'ajouter : ses décisions au journal, et un clone à sa place.
  for (const projet of ["brigade", "espace"]) {
    mkdirSync(etat(projet), { recursive: true });
    const journal = ouvrirJournal(etat(projet));
    for (const [name, value] of Object.entries(DECIDE)) journal.ajouter({ project: projet, ticket: null, author: "chef", type: "decision.set", payload: { name, value, previous: null } });
    journal.fermer();
    accepterSansBacASable({ repertoireEtat: etat(projet), station: "box" });
    const clone = join(racine, "clones", projet);
    mkdirSync(clone, { recursive: true });
    git(clone, "init", "-q");
  }
  const brigade = fauxGh(t);
  brigade.issues([]);
  const espace = fauxGh(t);
  espace.repondre("repos/acme/espace/issues?labels=fire&state=open&per_page=100", { corps: [] });
  writeFileSync(join(racine, "projets"), `brigade acme/brigade ${BASE} BRIGADE_GH_BIN=${brigade.bin}\nespace acme/espace main BRIGADE_GH_BIN=${espace.bin}\n`);

  // Les portes ouvertes avant la station, comme leur unité, que la sienne précède.
  const fichier = join(racine, "portes.json");
  const portes = await tenirPortes({ racine, fichier, dire: () => {} });
  t.after(() => portes.arreter());
  const station = ouvrirStation({
    racine,
    env: { ...ENV_GIT, HOME: compte, BRIGADE_CLAUDE_BIN: FAUX_CLAUDE, BRIGADE_MAX_LOAD_PER_CORE: "1000000", BRIGADE_MIN_FREE_MEMORY_MB: "0", BRIGADE_MIN_FREE_DISK_MB: "0" },
    dire: () => {},
    relectureMs: 3_600_000,
    portes: fichier,
  });
  aArreter(t, () => station.arreter("fin du test"));
  assert.deepEqual(station.refuses(), {});
  assert.deepEqual(station.projets(), ["brigade", "espace"]);

  const ports = lirePortes(fichier);
  assert.equal(new Set([ports.station, ports.projets.brigade, ports.projets.espace]).size, 3);
  // Chaque cuisine écrit à son journal la porte par où ses cooks sortent : la sienne.
  const lecteur = relecteur();
  aArreter(t, () => lecteur.fermer());
  const proxy = (projet: string) => {
    if (!existsSync(join(etat(projet), "log.db"))) return undefined;
    const fait = lecteur.lire(etat(projet), "isolation", (journal) => journal.duType("isolation.configured", 1)[0]);
    return (fait?.payload as { proxy?: { port: number } | null } | undefined)?.proxy;
  };
  for (const projet of ["brigade", "espace"]) {
    await jusqua(() => proxy(projet) !== undefined);
    assert.equal(proxy(projet)?.port, ports.projets[projet], projet);
  }
});

test("cuisine-portes.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);

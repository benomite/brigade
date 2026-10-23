// gates: base
// Ne tourne que sur la base, où les gates jouent tout (#1004) : deux minutes
// d'attente réelle, que rien ne raccourcit sans toucher la station.
// La recette de l'ajout d'un projet depuis l'app, sur une installation de
// test : une vraie station — un seul process, `station/main.ts` —, appairée,
// dont GitHub est une doublure de `gh` (les gists du compte, et le dépôt à
// cloner). Le test écrit dans le gist ce que l'app y écrit quand le chef
// valide le parcours, et mesure le temps jusqu'à ce que la station publie le
// projet dans sa liste — ce que la home de l'app lit (« 1 project »). Ce temps
// comprend la cadence réelle de la station : rien n'est accéléré. La spec
// demande moins de dix minutes, parcours compris ; la station en met moins
// d'une — sa cadence est de trente secondes.
//
// Ce fichier dure deux minutes, et rien ne les raccourcit sans toucher la
// station : elle n'écrit pas son gist plus d'une fois par minute
// (`ECART_MINIMAL_MS`, appairage/presence.ts), et la recette lit trois de ses
// écritures — la liste vide, le projet ajouté, le projet retiré. C'est pour
// cela qu'il vit dans `0-en-premier/` : `node --test` prend les fichiers dans
// l'ordre de leurs chemins, et celui-ci, lancé le premier, court pendant le
// reste de la suite au lieu de la prolonger de deux minutes.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { FICHIER_APPAIRAGE, FICHIER_STATION } from "../../src/appairage/document.ts";
import { FICHIER_LOCAL } from "../../src/appairage/presence.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { accepterSansBacASable } from "../../src/onboarding/attente.ts";
import { FICHIER_PROJETS, FICHIER_SUIVI } from "../../src/projets/demande.ts";
import { depotGit, ENV_GIT, FAUX_CLAUDE, git, jusqua, lancer, repertoireTemporaire, temporaireDuFichier } from "../outils.ts";

const rienNeReste = temporaireDuFichier();

const STATION = join(import.meta.dirname, "../../src/station/main.ts");
const FAUX_GH = join(import.meta.dirname, "../projets/faux-gh.ts");
const GIST = "g1appairee";
// Le temps que la spec accorde, du parcours ouvert au projet servi.
const DIX_MINUTES = 10 * 60_000;
// Le chef met ce temps à remplir le parcours : il compte dans la mesure.
const PARCOURS_MS = 60_000;

test("ajouté depuis l'app, le projet est dans la liste de la station en moins de dix minutes, parcours compris ; retiré, il quitte sa configuration", { timeout: 300_000 }, async (t) => {
  const machine = repertoireTemporaire(t);
  const racine = join(machine, "station");
  const compte = join(machine, "compte");
  const gists = repertoireTemporaire(t);
  const origines = repertoireTemporaire(t);
  mkdirSync(racine);
  mkdirSync(compte);
  writeFileSync(join(gists, "appels"), "");
  // Le dépôt du projet, sur GitHub.
  const { origine } = depotGit(t);
  mkdirSync(join(origines, "acme"));
  git(origines, "clone", "-q", "--bare", origine, join(origines, "acme/shop.git"));

  // Une station déjà appairée à l'app (appairage/presence.ts) : son gist, et ce qu'elle en garde.
  // La doublure écrit le gist sans le remplacer d'un coup : une lecture tombée
  // au milieu se refait.
  const gist = (): { files: Record<string, { content: string }> } => {
    for (;;) {
      try {
        return JSON.parse(readFileSync(join(gists, `${GIST}.gist.json`), "utf8")) as { files: Record<string, { content: string }> };
      } catch {}
    }
  };
  const fichier = (nom: string) => gist().files[nom]?.content;
  const ecrire = (nom: string, contenu: string) => {
    const lu = gist();
    lu.files[nom] = { content: contenu };
    // Remplacé d'un coup : la doublure, qui le lit pour la station, n'en voit jamais une moitié.
    writeFileSync(join(gists, "ecriture"), JSON.stringify({ ...lu, updated_at: new Date().toISOString() }));
    renameSync(join(gists, "ecriture"), join(gists, `${GIST}.gist.json`));
  };
  writeFileSync(join(gists, `${GIST}.gist.json`), JSON.stringify({ id: GIST, description: "brigade — station box", public: false, updated_at: new Date().toISOString(), files: {} }));
  ecrire(FICHIER_APPAIRAGE, JSON.stringify({ appaireeLe: new Date().toISOString(), empreinte: "deja" }));
  writeFileSync(join(racine, FICHIER_LOCAL), JSON.stringify({ gist: GIST, appairee: true, code: null, expireLe: null, echus: [] }));

  const station = lancer(t, STATION, [], {
    ...ENV_GIT,
    HOME: compte,
    BRIGADE_STATION_DIR: racine,
    BRIGADE_STATION_NOM: "box",
    BRIGADE_GH_BIN: FAUX_GH,
    FAUX_GISTS: gists,
    FAUX_ORIGINES: origines,
    BRIGADE_CLAUDE_BIN: FAUX_CLAUDE,
    BRIGADE_MAX_LOAD_PER_CORE: "1000000",
    BRIGADE_MIN_FREE_MEMORY_MB: "0",
    BRIGADE_MIN_FREE_DISK_MB: "0",
  });
  await station.attendre("aucun projet servi");
  const projetsPublies = () => {
    const brut = fichier(FICHIER_STATION);
    return brut === undefined ? undefined : (JSON.parse(brut) as { projets: string[] }).projets;
  };
  await jusqua(() => projetsPublies() !== undefined, DIX_MINUTES);
  assert.deepEqual(projetsPublies(), []);

  // Le chef ouvre le parcours, le remplit, valide : l'app écrit sa demande dans le gist de la station.
  const ouvert = Date.now() - PARCOURS_MS;
  // La doublure n'a pas de verrou : une écriture de la station en même temps
  // pourrait perdre celle de l'app. Elle se réécrit tant qu'elle n'y est pas.
  let voulu = "";
  const demande = (projets: object[]) => ecrire(FICHIER_PROJETS, (voulu = JSON.stringify({ brigade: "projets", format: 1, projets })));
  const tenue = (condition: () => boolean) => () => {
    if (fichier(FICHIER_PROJETS) !== voulu) ecrire(FICHIER_PROJETS, voulu);
    return condition();
  };
  demande([
    {
      nom: "shop",
      depot: "acme/shop",
      base: "v2",
      principale: true,
      cooks: 2,
      manager: { modele: "sonnet", effort: "medium" },
      reviewer: { modele: "sonnet", effort: "medium" },
      ouvertLe: new Date(ouvert).toISOString(),
      demandeLe: new Date().toISOString(),
    },
  ]);

  await jusqua(tenue(() => projetsPublies()?.includes("shop") === true), DIX_MINUTES);
  const mesure = Date.now() - ouvert;
  t.diagnostic(`du parcours ouvert au projet dans la liste de la station : ${Math.round(mesure / 1000)} s, dont ${PARCOURS_MS / 1000} s de parcours`);
  assert.ok(mesure < DIX_MINUTES, `${Math.round(mesure / 1000)} s`);

  // Ce qui l'a servi : le clone, les décisions du parcours, son premier ticket, sa ligne — et rien qu'il ait fallu taper.
  assert.ok(existsSync(join(racine, "clones/shop/LISEZMOI")));
  assert.match(readFileSync(join(racine, "projets"), "utf8"), /^shop acme\/shop v2$/m);
  // Son premier ticket, ouvert sur GitHub avant sa ligne : préparer le dépôt.
  const [ticket, ...autres] = readFileSync(join(gists, "issues"), "utf8").split("\n").filter(Boolean).map((ligne) => JSON.parse(ligne) as { number: number; title: string; body: string; labels: string[] });
  assert.deepEqual(autres, []);
  assert.equal(ticket?.title, "Préparer le dépôt : gates, setup de worktree, sites autorisés");
  assert.deepEqual(ticket?.labels, ["fire", "model:opus", "effort:high"]);
  assert.match(ticket?.body ?? "", /## Éprouver sur la station, pas en local/);
  assert.deepEqual(JSON.parse(readFileSync(join(racine, "etat/shop/preparation-depot.json"), "utf8")).ticket, 1);
  await station.attendre("brigade [shop] : servi par la station");
  // La machine n'a pas de bac à sable : rien ne part avant que le chef ait choisi — pas même la préparation.
  await station.attendre("brigade [shop] : box cuit sans bac à sable — aucun cook ne part avant que le chef ait choisi");
  accepterSansBacASable({ repertoireEtat: join(racine, "etat/shop"), station: "box" });
  await station.attendre("brigade [shop] : le rail attend #1 (préparer le dépôt) — aucun autre ticket ne part avant son merge");
  const journal = ouvrirJournal(join(racine, "etat/shop"), { lectureSeule: true });
  try {
    assert.ok(journal.tout().some((evenement) => evenement.type === "runtime.started" && evenement.project === "shop"));
  } finally {
    journal.fermer();
  }
  await jusqua(() => (JSON.parse(fichier(FICHIER_SUIVI) ?? '{"projets":[]}') as { projets: Array<{ etat: string }> }).projets[0]?.etat === "servi", DIX_MINUTES);

  // Retiré depuis l'app : sa ligne quitte la configuration, la station ne le sert plus. Le temps
  // est mesuré plus haut : un signal la fait relire sans attendre sa cadence.
  demande([]);
  station.process.kill("SIGHUP");
  await jusqua(tenue(() => projetsPublies()?.includes("shop") === false), DIX_MINUTES);
  assert.doesNotMatch(readFileSync(join(racine, "projets"), "utf8"), /shop/);
  await station.attendre("shop retiré depuis l'app");

  station.process.kill("SIGTERM");
  assert.equal(await station.fin, 0);
});

test("recette.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);

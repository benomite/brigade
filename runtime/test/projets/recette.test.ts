// La recette de l'ajout d'un projet depuis l'app (#2192, d'après celle que
// jouait `0-en-premier/recette.test.ts` sur une vraie station) : ce que l'app
// écrit dans le gist de l'appairage quand le chef valide le parcours, et le temps
// jusqu'à ce que la station publie le projet dans sa liste — ce que la home de
// l'app lit (« 1 project »). La spec demande moins de dix minutes, parcours
// compris. Les deux pièces de la station qui font ce temps se jouent ici, dans
// le process du test, sur une horloge que le test avance : ce qu'elle lit de
// l'app (`projets/tenir.ts`, à sa cadence) et ce qu'elle publie (`appairage/
// presence.ts`, jamais deux écritures à moins de leur écart minimal). Les deux
// délais sont ceux du service, pas raccourcis, et pris au pire : la demande
// arrive juste après une lecture, la lecture juste après une écriture du gist.
// Le gist, l'autorisation et le clone sont doublés en mémoire. Que la vraie
// station, en process, tienne ces deux pièces ensemble se prouve dans
// `../projets-station/station.test.ts`.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import type { Canal, Fichiers } from "../../src/appairage/canal.ts";
import { FICHIER_STATION } from "../../src/appairage/document.ts";
import { ECART_MINIMAL_MS, FICHIER_LOCAL, tenirPresence } from "../../src/appairage/presence.ts";
import { DEBUT, FIN } from "../../src/projets/bloc.ts";
import { FICHIER_PROJETS, FICHIER_SUIVI, type SuiviDuProjet } from "../../src/projets/demande.ts";
import { ENQUETE_MUETTE } from "../../src/projets/echec-du-clone.ts";
import { CADENCE_MS, tenirProjetsDeLApp } from "../../src/projets/tenir.ts";
import { aArreter, repertoireTemporaire, temporaireDuFichier } from "../outils.ts";

const rienNeReste = temporaireDuFichier();

const GIST = "g1appairee";
// Le temps que la spec accorde, du parcours ouvert au projet servi.
const DIX_MINUTES = 10 * 60_000;
// Le chef met ce temps à remplir le parcours : il compte dans la mesure.
const PARCOURS_MS = 60_000;

test("ajouté depuis l'app, le projet est dans la liste de la station en moins de dix minutes, parcours compris ; retiré, il quitte sa configuration", async (t) => {
  const racine = repertoireTemporaire(t);
  writeFileSync(join(racine, FICHIER_LOCAL), JSON.stringify({ gist: GIST, appairee: true, code: null, expireLe: null, echus: [] }));

  // L'horloge du test, et les minuteurs de la présence : chacun se joue à son heure quand le test avance.
  let instant = Date.parse("2026-11-04T10:00:00Z");
  const minuteurs: Array<{ a: number; tache: () => void }> = [];
  const apres = (tache: () => void, ms: number) => {
    const minuteur = { a: instant + ms, tache };
    minuteurs.push(minuteur);
    return () => {
      const rang = minuteurs.indexOf(minuteur);
      if (rang >= 0) minuteurs.splice(rang, 1);
    };
  };
  // Le gist est en mémoire : une écriture se finit en quelques tours de la boucle.
  const tours = async () => {
    for (let i = 0; i < 20; i++) await new Promise((resoudre) => setImmediate(resoudre));
  };
  const avancer = async (ms: number) => {
    const fin = instant + ms;
    for (;;) {
      const prochain = minuteurs.filter((m) => m.a <= fin).sort((a, b) => a.a - b.a)[0];
      if (prochain === undefined) break;
      minuteurs.splice(minuteurs.indexOf(prochain), 1);
      instant = prochain.a;
      prochain.tache();
      await tours();
    }
    instant = fin;
  };

  // Le gist de l'appairage : l'app y écrit sa demande, la station sa liste et son suivi.
  const fichiers: Fichiers = {};
  const canal: Canal = {
    creer: async () => assert.fail("la station appairée ne crée pas de gist"),
    async ecrire(id, ecrits) {
      assert.equal(id, GIST);
      Object.assign(fichiers, ecrits);
      return "ecrit";
    },
    lire: async (id) => (id === GIST ? { ...fichiers } : null),
  };
  const configuration = () => (existsSync(join(racine, "projets")) ? readFileSync(join(racine, "projets"), "utf8") : "");
  // Ce que la station sert : ce que sa configuration nomme.
  const servis = () =>
    configuration()
      .split("\n")
      .filter((ligne) => ligne.trim() !== "" && !ligne.startsWith("#"))
      .map((ligne) => ligne.split(/\s+/)[0] ?? "");
  const lignes: string[] = [];
  const dire = (ligne: string) => void lignes.push(ligne);

  const presence = tenirPresence({ racine, canal, identite: { nom: "box", machine: "Linux", version: "test" }, projets: servis, dire, apres, maintenant: () => instant });
  aArreter(t, () => presence.arreter());
  // Le ticket qui prépare le dépôt, et la configuration au moment où il s'ouvre.
  const preparations: string[] = [];
  const projets = tenirProjetsDeLApp({
    racine,
    canal,
    station: "box",
    env: {},
    servis: { projets: servis, refus: () => null },
    // Comme la station : la ligne écrite, elle relit sa configuration et publie sa liste.
    apresEcriture: () => void presence.publier(),
    dire,
    // Son minuteur ne bat pas pendant le test : le test joue chaque lecture à l'heure de la cadence.
    cadenceMs: 3_600_000,
    maintenant: () => instant,
    autoriser: async () => ({ autorisee: true }),
    cloner: async (_depot, clone) => {
      mkdirSync(join(clone, ".git"), { recursive: true });
      writeFileSync(join(clone, "LISEZMOI"), "shop\n");
    },
    enqueter: async () => ENQUETE_MUETTE,
    verifierAcces: async () => ({ etat: "libre" as const }),
    ouvrirLaPreparation: async () => {
      preparations.push(configuration());
      return { ticket: 1, ouvert: true };
    },
  });
  aArreter(t, () => projets.arreter());

  const publies = () => {
    const brut = fichiers[FICHIER_STATION];
    return brut === undefined ? undefined : (JSON.parse(brut) as { projets: string[] }).projets;
  };
  const suivi = () => (JSON.parse(fichiers[FICHIER_SUIVI] ?? "null") as { projets: SuiviDuProjet[] } | null)?.projets;
  // Le temps passe à pas d'une seconde jusqu'à ce que la liste publiée dise ce qu'on attend — dix minutes au plus.
  const jusquACeQueLaListe = async (voulue: (liste: string[] | undefined) => boolean, depuis: number) => {
    while (!voulue(publies()) && instant - depuis < DIX_MINUTES) await avancer(1000);
    return instant - depuis;
  };

  // Démarrée, elle publie sa liste : aucun projet.
  await tours();
  assert.deepEqual(publies(), []);

  // Le chef ouvre le parcours, le remplit, valide : l'app écrit sa demande dans le gist.
  const ouvert = instant;
  await avancer(PARCOURS_MS);
  const demander = (...demandes: object[]) => void (fichiers[FICHIER_PROJETS] = JSON.stringify({ brigade: "projets", format: 1, projets: demandes }));
  demander({
    nom: "shop",
    depot: "acme/shop",
    base: "v2",
    principale: true,
    cooks: 2,
    manager: { modele: "sonnet", effort: "medium" },
    reviewer: { modele: "sonnet", effort: "medium" },
    ouvertLe: new Date(ouvert).toISOString(),
    demandeLe: new Date(instant).toISOString(),
  });
  // Au pire : la station venait de lire, et elle relit une cadence plus tard ; elle venait aussi d'écrire son gist.
  await avancer(CADENCE_MS);
  await presence.publier();
  await projets.relire();
  const mesure = await jusquACeQueLaListe((liste) => liste?.includes("shop") === true, ouvert);

  t.diagnostic(`du parcours ouvert au projet dans la liste de la station : ${mesure / 1000} s — ${PARCOURS_MS / 1000} s de parcours, ${CADENCE_MS / 1000} s de cadence, ${ECART_MINIMAL_MS / 1000} s d'écart entre deux écritures du gist`);
  assert.deepEqual(publies(), ["shop"]);
  assert.equal(mesure, PARCOURS_MS + CADENCE_MS + ECART_MINIMAL_MS);
  assert.ok(mesure < DIX_MINUTES, `${mesure / 1000} s`);

  // Ce qui l'a servi : le clone, sa ligne, et son premier ticket, ouvert avant sa ligne — rien qu'il ait fallu taper.
  assert.ok(existsSync(join(racine, "clones/shop/LISEZMOI")));
  assert.equal(configuration(), `${DEBUT}\nshop acme/shop v2\n${FIN}\n`);
  assert.deepEqual(preparations, [""]);
  assert.equal(suivi()?.[0]?.etat, "servi");
  assert.ok(lignes.includes("brigade : station — shop ajouté depuis l'app : sa ligne est écrite dans la configuration"));

  // Retiré depuis l'app : à la lecture suivante, sa ligne quitte la configuration, et la liste publiée ne le porte plus.
  demander();
  const retire = instant;
  await avancer(CADENCE_MS);
  await projets.relire();
  assert.equal(configuration(), "");
  assert.ok(lignes.includes("brigade : station — shop retiré depuis l'app : sa ligne quitte la configuration (son état et son clone restent)"));
  assert.ok((await jusquACeQueLaListe((liste) => liste?.includes("shop") === false, retire)) < DIX_MINUTES);
  assert.deepEqual(publies(), []);
});

test("recette.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);

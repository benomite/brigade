// Un ordinateur que le chef ajoute à un projet déjà servi par une autre
// station (#1789) : il en rejoint la cuisine, comme une station de plus, ou il
// refuse en une phrase — il n'en ouvre jamais une seconde. Vu de l'ordinateur
// ajouté : sa vraie préparation, sans doublure — l'autorisation, le clone, le
// ticket qui prépare le dépôt passent par son `gh`, un faux qui note chaque
// appel. Rejoint ou refusé, rien n'en part : ni clone, ni issue, ni commentaire.
// Vu de la principale, qui le déclare au journal du projet : `tenir.test.ts`.
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import type { Canal, Fichiers } from "../../src/appairage/canal.ts";
import { FICHIER_LOCAL } from "../../src/appairage/presence.ts";
import type { StationsDuChef } from "../../src/appairage/stations-du-chef.ts";
import { documentDeDemande, FICHIER_PROJETS, lireDemande, FICHIER_SUIVI, type ProjetDemande, type SuiviDuProjet } from "../../src/projets/demande.ts";
import { refus } from "../../src/projets/refus.ts";
import { FICHIER_REJOINTES, issueDeLAjout, rejointesLues } from "../../src/projets/rejoindre.ts";
import type { LectureDesAppairees } from "../../src/projets/secondaires.ts";
import { tenirProjetsDeLApp } from "../../src/projets/tenir.ts";
import { lectureDesAppairees } from "../aides/appairees.ts";
import { aArreter, fauxGh, repertoireTemporaire, temporaireDuFichier } from "../outils.ts";
import { posixOnly } from "../support/plateforme.ts";

const rienNeReste = temporaireDuFichier();

const MAINTENANT = Date.parse("2026-10-27T08:36:00Z");
const GIST_MAC = "gistmac";
const GIST_BOX = "gistbox";
const BRIGADE: ProjetDemande = { nom: "brigade", depot: "benomite/brigade", base: "v2", principale: true, cooks: 2, manager: { modele: "sonnet", effort: "medium" }, reviewer: { modele: "sonnet", effort: "medium" }, ouvertLe: null, demandeLe: null };
// La box, qui sert brigade : sa présence le publie.
const BOX = { id: GIST_BOX, nom: "parade-box", sert: { brigade: "benomite/brigade" } };
// Le Mac lui-même, tel que la lecture des gists appairés le rend aussi.
const MAC = { id: GIST_MAC, nom: "mac" };
const SANS_GH = { skip: posixOnly("le faux `gh` est un script bash") };

// L'ordinateur ajouté : sa station, appairée par son gist, à qui l'app demande
// brigade en principale — ce qu'une case cochée sur sa page écrit.
function leMac(t: TestContext, lire: () => LectureDesAppairees | Promise<LectureDesAppairees>, options: { appairee?: boolean } = {}) {
  const racine = repertoireTemporaire(t);
  const gh = fauxGh(t);
  writeFileSync(join(racine, FICHIER_LOCAL), JSON.stringify({ gist: GIST_MAC, appairee: options.appairee ?? true, code: null, expireLe: null, echus: [] }));
  const gist: Fichiers = { [FICHIER_PROJETS]: documentDeDemande([BRIGADE]) };
  const canal: Canal = {
    creer: async () => assert.fail("la station ne crée aucun gist"),
    async ecrire(id, ecrits) {
      assert.equal(id, GIST_MAC, "elle n'écrit que dans son propre gist");
      Object.assign(gist, ecrits);
      return "ecrit";
    },
    lire: async (id) => (id === GIST_MAC ? { ...gist } : null),
  };
  // Non appairé, il lit sa demande ailleurs — dans le gist de son
  // enregistrement, où l'app écrit sa sélection : ici, le même gist.
  const source = options.appairee === false ? { source: async () => ({ gist: GIST_MAC, lus: { ...gist }, fichier: FICHIER_PROJETS, brut: gist[FICHIER_PROJETS]!, demande: lireDemande(gist[FICHIER_PROJETS]!) }) } : {};
  const lignes: string[] = [];
  // Ce que la station passe à la boucle qui cuit pour les cuisines rejointes (`tirer-par-github/cuisiner.ts`).
  const tenues: Array<{ rejointes: string[]; gist: string }> = [];
  let relectures = 0;
  const projets = tenirProjetsDeLApp({
    racine,
    canal,
    station: "mac",
    env: { BRIGADE_GH_BIN: gh.bin, HOME: repertoireTemporaire(t) },
    servis: { projets: () => [], refus: () => null },
    apresEcriture: () => void relectures++,
    dire: (ligne) => lignes.push(ligne),
    cadenceMs: 3_600_000,
    maintenant: () => MAINTENANT,
    lireLesAppairees: async () => lire(),
    cadenceDesAppareesMs: 0,
    plateforme: "darwin",
    surLesRejointes: (rejointes, gist) => void tenues.push({ rejointes: rejointes.map(({ depot, principale, cooks }) => `${depot} ${principale} ${cooks}`), gist }),
    ...source,
  });
  aArreter(t, () => projets.arreter());
  const suivi = () => (JSON.parse(gist[FICHIER_SUIVI] ?? "null") as { projets: SuiviDuProjet[] } | null)?.projets ?? [];
  // Rien de la cuisine de brigade n'existe ici : ni état — donc ni journal, ni
  // `project.added`, ni calibrage —, ni clone, ni ligne dans sa configuration.
  const aucuneCuisine = () => {
    assert.equal(existsSync(join(racine, "etat", "brigade")), false, "aucun état du projet");
    assert.equal(existsSync(join(racine, "etat", "brigade", "log.db")), false, "aucun journal");
    assert.equal(existsSync(join(racine, "clones", "brigade")), false, "aucun clone");
    assert.equal(existsSync(join(racine, "projets")) ? readFileSync(join(racine, "projets"), "utf8") : "", "", "aucune ligne");
    assert.equal(relectures, 0, "la configuration n'est pas réécrite");
  };
  return { racine, gh, gist, projets, suivi, lignes, tenues, aucuneCuisine };
}

test("ajouté à brigade, que la box sert déjà : le Mac en rejoint la cuisine — aucun journal, aucun calibrage, aucun clone, aucune ligne, rien sur GitHub —, et le publie pour la box", SANS_GH, async (t) => {
  const mac = leMac(t, () => lectureDesAppairees(MAINTENANT, BOX, MAC));
  await mac.projets.relire();

  mac.aucuneCuisine();
  assert.deepEqual(mac.gh.appels(), [], "aucun appel à GitHub par le gh du Mac");
  // Le suivi le dit à l'app : il cuit sur la box, qui garde le manager et la pass.
  assert.deepEqual(mac.suivi(), [
    {
      nom: "brigade",
      etat: "secondaire",
      dit: "joined the kitchen that parade-box runs: it cooks there as one more station, and parade-box keeps the manager and the pass",
      autoriser: [],
      serviLe: null,
      cuitSur: "parade-box",
      ici: false,
      bascule: null,
      rejoindre: { issue: "rejointe", principale: "parade-box" },
    },
  ]);
  // Ce que la box lit dans le gist du Mac pour le déclarer : ses cooks, et ce
  // qu'il fournit — un Mac, `macos`.
  assert.deepEqual(rejointesLues(mac.gist[FICHIER_REJOINTES]), [{ nom: "brigade", depot: "benomite/brigade", principale: "parade-box", cooks: 2, fournit: ["code", "raisonnement", "macos"] }]);
  assert.ok(mac.lignes.some((ligne) => ligne.startsWith("brigade : station — brigade est déjà servi par parade-box : elle en rejoint la cuisine comme une station de plus")));
  // Et elle y cuit : la cuisine rejointe est passée à sa boucle de réclamation, avec son gist d'appairage.
  assert.deepEqual(mac.tenues.at(-1), { rejointes: ["benomite/brigade parade-box 2"], gist: GIST_MAC });

  // Relu : toujours rien d'ouvert, rien de réécrit.
  const avant = { ...mac.gist };
  await mac.projets.relire();
  mac.aucuneCuisine();
  assert.deepEqual(mac.gist, avant);
  assert.deepEqual(mac.gh.appels(), []);
});

test("la box qui sert brigade ne se lit pas en ligne : l'ajout est refusé en une phrase — rien n'est créé, aucun appel à GitHub", SANS_GH, async (t) => {
  const mac = leMac(t, () => lectureDesAppairees(MAINTENANT, { ...BOX, signe: 30 }, MAC));
  await mac.projets.relire();

  mac.aucuneCuisine();
  assert.deepEqual(mac.gh.appels(), [], "aucun appel à GitHub par le gh du Mac");
  const phrase = "benomite/brigade is already served by parade-box, which is not reached (no sign of life on GitHub since 2026-10-27T08:06:00.000Z), so this computer cannot join its kitchen and starts no second one.";
  const [dit] = mac.suivi();
  assert.deepEqual(dit?.rejoindre, { issue: "refusee", phrase });
  assert.equal(dit?.etat, "refuse");
  assert.equal(dit?.dit, phrase);
  assert.deepEqual(dit?.refus, refus("kitchen-not-joinable"));
  assert.equal(dit?.cuitSur, null);
  // Une phrase : un seul point, à la fin.
  assert.doesNotMatch(phrase.slice(0, -1), /\. [A-Z]/);
  // Rien n'est publié comme rejoint, et rien n'y cuit.
  assert.deepEqual(rejointesLues(mac.gist[FICHIER_REJOINTES]), []);
  assert.deepEqual(mac.tenues.at(-1), { rejointes: [], gist: GIST_MAC });
});

test("GitHub ne dit pas quelles stations servent quoi : l'ajout est refusé en une phrase, rien n'est créé, et il réessaie à la lecture suivante", SANS_GH, async (t) => {
  let lue: () => LectureDesAppairees = () => {
    throw new Error("gh: could not resolve api.github.com.");
  };
  const mac = leMac(t, () => lue());
  await mac.projets.relire();
  mac.aucuneCuisine();
  assert.deepEqual(mac.gh.appels(), []);
  assert.deepEqual(mac.suivi()[0]?.rejoindre, { issue: "refusee", phrase: "GitHub could not tell whether another station already serves benomite/brigade (gh: could not resolve api.github.com), so this computer starts no kitchen for it and asks again at its next reading." });

  // GitHub répond : la box le sert, il la rejoint.
  lue = () => lectureDesAppairees(MAINTENANT, BOX, MAC);
  await mac.projets.relire();
  mac.aucuneCuisine();
  assert.deepEqual(mac.suivi()[0]?.rejoindre, { issue: "rejointe", principale: "parade-box" });
});

test("le Mac n'est pas appairé : la box ne le verrait pas — refusé en une phrase, rien n'est créé", SANS_GH, async (t) => {
  const mac = leMac(t, () => lectureDesAppairees(MAINTENANT, BOX), { appairee: false });
  await mac.projets.relire();
  mac.aucuneCuisine();
  assert.deepEqual(mac.gh.appels(), []);
  assert.deepEqual(mac.suivi()[0]?.rejoindre, { issue: "refusee", phrase: "benomite/brigade is already served by parade-box, and this computer's station is not paired in the app, so that kitchen cannot see it and this computer starts no second one." });
  assert.equal(mac.gist[FICHIER_REJOINTES], undefined);
});

test("aucune autre station ne sert le dépôt : l'ordinateur en devient la principale, comme avant — et son `gh` est bien celui qu'il appelle", SANS_GH, async (t) => {
  const mac = leMac(t, () => lectureDesAppairees(MAINTENANT, { ...BOX, sert: { autre: "benomite/autre" } }, MAC));
  await mac.projets.relire();
  // Le faux `gh` ne sait rien cloner : la préparation s'arrête là, mais elle a commencé.
  assert.ok(mac.gh.appels().some((args) => args[0] === "repo" && args[1] === "clone"), JSON.stringify(mac.gh.appels()));
  assert.equal(mac.suivi()[0]?.rejoindre, undefined);
  assert.equal(mac.gist[FICHIER_REJOINTES], undefined, "rien de rejoint, rien de publié");
});

test("l'issue d'un ajout : seule, rejointe, ou refusée en une phrase — l'ordinateur lui-même, un téléphone, un autre dépôt ne comptent pas", () => {
  const soi = { nom: "mac", gist: GIST_MAC };
  const depot = "benomite/brigade";
  assert.deepEqual(issueDeLAjout(null, depot, soi), { issue: "seule" });
  assert.deepEqual(issueDeLAjout(lectureDesAppairees(MAINTENANT), depot, soi), { issue: "seule" });
  // Lui-même, sous son gist ou sous un gist plus ancien de la même machine.
  assert.deepEqual(issueDeLAjout(lectureDesAppairees(MAINTENANT, { id: GIST_MAC, nom: "mac", sert: { brigade: depot } }, { id: "ancien", nom: "Mac", sert: { brigade: depot }, signe: 60 }), depot, soi), { issue: "seule" });
  // Un téléphone ne cuit pas, il ne tient pas de cuisine.
  assert.deepEqual(issueDeLAjout(lectureDesAppairees(MAINTENANT, { id: "tel", nom: "telephone", sorte: "telephone", sert: { brigade: depot } }), depot, soi), { issue: "seule" });
  // Le dépôt se compare sans la casse.
  assert.deepEqual(issueDeLAjout(lectureDesAppairees(MAINTENANT, { ...BOX, sert: { brigade: "Benomite/Brigade" } }), depot, soi), { issue: "rejointe", principale: { nom: "parade-box", gist: GIST_BOX } });
  // Arrêtée proprement : refusé, et la phrase dit quand.
  const arretee = issueDeLAjout(lectureDesAppairees(MAINTENANT, { ...BOX, arretee: true }), depot, soi);
  assert.deepEqual(arretee, { issue: "refusee", phrase: "benomite/brigade is already served by parade-box, which is not reached (it stopped at 2026-10-27T08:35:00.000Z), so this computer cannot join its kitchen and starts no second one." });
  // Deux stations le disent servi, l'une arrêtée : celle en ligne est la cuisine.
  assert.deepEqual(issueDeLAjout(lectureDesAppairees(MAINTENANT, { id: "vieille", nom: "old-box", sert: { brigade: depot }, arretee: true }, BOX), depot, soi), { issue: "rejointe", principale: { nom: "parade-box", gist: GIST_BOX } });
  // GitHub demande une connexion : refusé, avec sa raison.
  const deconnecte: StationsDuChef = { state: "sign-in-required", reason: "This computer is not signed in to GitHub, so brigade cannot read the stations you have paired.", action: { id: "github-sign-in", label: "Sign in to GitHub", command: ["gh"] } };
  assert.deepEqual(issueDeLAjout({ etat: deconnecte, gists: new Map() }, depot, soi), {
    issue: "refusee",
    phrase: "GitHub could not tell whether another station already serves benomite/brigade (This computer is not signed in to GitHub, so brigade cannot read the stations you have paired), so this computer starts no kitchen for it and asks again at its next reading.",
  });
});

test("ce qu'une station publie des cuisines qu'elle a rejointes se relit ; illisible, d'un format plus récent ou mal formé, rien n'en est lu", () => {
  const une = { nom: "brigade", depot: "benomite/brigade", principale: "parade-box", cooks: 2, fournit: ["code", "raisonnement", "macos"] };
  assert.deepEqual(rejointesLues(JSON.stringify({ brigade: "cuisines-rejointes", format: 1, projets: [une, { ...une, cooks: 0 }, null] })), [une]);
  assert.deepEqual(rejointesLues(undefined), []);
  assert.deepEqual(rejointesLues("{"), []);
  assert.deepEqual(rejointesLues(JSON.stringify({ brigade: "cuisines-rejointes", format: 2, projets: [une] })), []);
  assert.deepEqual(rejointesLues(JSON.stringify({ brigade: "projets", format: 1, projets: [une] })), []);
});

test("rejoindre.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);

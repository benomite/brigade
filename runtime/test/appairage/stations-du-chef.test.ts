// Les stations du chef, lues sur un ordinateur neuf (#1428) : rien d'installé
// que l'app, aucun projet local, et le `gh` de la machine — ici une doublure
// qui tient les gists du compte dans un répertoire. Les stations y sont
// publiées par leur vraie présence (`presence.ts`), sur le vrai canal.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { canalGitHub } from "../../src/appairage/canal.ts";
import { FICHIER_APPAIRAGE } from "../../src/appairage/document.ts";
import { FICHIER_LOCAL, tenirPresence, type Identite } from "../../src/appairage/presence.ts";
import { echecDeGh, lireLesStationsDuChef, principal, type StationsDuChef } from "../../src/appairage/stations-du-chef.ts";
import { documentDeDemande } from "../../src/projets/demande.ts";
import { appeler, lancer, repertoireTemporaire, temporaireDuFichier } from "../outils.ts";

const rienNeReste = temporaireDuFichier();

const FAUX_GH = join(import.meta.dirname, "faux-gh-gists.ts");
const COMMANDE = join(import.meta.dirname, "../../src/appairage/stations-du-chef.ts");

type Gist = { id: string; files: Record<string, { filename: string; content: string }> };

// GitHub : un répertoire, où la doublure range les gists du compte.
function unGitHub(t: TestContext) {
  const repertoire = repertoireTemporaire(t);
  const avant = process.env.FAUX_GISTS;
  process.env.FAUX_GISTS = repertoire;
  t.after(() => (avant === undefined ? delete process.env.FAUX_GISTS : (process.env.FAUX_GISTS = avant)));
  const fichier = (id: string) => join(repertoire, `${id}.gist.json`);
  // Ajoute ces fichiers au gist, comme l'app les y écrit.
  const ajouter = (id: string, fichiers: Record<string, string>) => {
    const gist = JSON.parse(readFileSync(fichier(id), "utf8")) as Gist;
    for (const [nom, content] of Object.entries(fichiers)) gist.files[nom] = { filename: nom, content };
    writeFileSync(fichier(id), JSON.stringify(gist));
  };
  return {
    repertoire,
    ajouter,
    // Ce que l'app écrit quand le chef a tapé le bon code.
    appairer: (id: string) => ajouter(id, { [FICHIER_APPAIRAGE]: JSON.stringify({ appaireeLe: new Date().toISOString(), empreinte: "e" }) }),
    // Un gist du compte qui n'a rien d'une station.
    autre: (id: string) => writeFileSync(fichier(id), JSON.stringify({ id, description: "notes", public: false, updated_at: new Date().toISOString(), files: { "notes.md": { filename: "notes.md", content: "#" } } })),
    tomber: (comment: "panne" | "deconnecte" | "jeton-refuse" | "limite") => writeFileSync(join(repertoire, comment), ""),
    env: () => ({ PATH: process.env.PATH ?? "", FAUX_GISTS: repertoire }),
  };
}

// Une station qui publie son état sur ce GitHub, par sa vraie présence. Rend son gist.
async function uneStation(t: TestContext, identite: Identite, projets: string[], depots?: Record<string, string>) {
  const racine = join(repertoireTemporaire(t), identite.nom);
  mkdirSync(racine);
  const presence = tenirPresence({
    racine,
    canal: canalGitHub({ gh: FAUX_GH }),
    identite,
    projets: () => projets,
    ...(depots === undefined ? {} : { depots: () => depots }),
    dire: () => {},
    // Aucun minuteur : le test publie lui-même.
    apres: () => () => {},
  });
  await presence.publier();
  const { gist } = JSON.parse(readFileSync(join(racine, FICHIER_LOCAL), "utf8")) as { gist: string };
  return { gist, presence };
}

const lire = (github: ReturnType<typeof unGitHub>, gh = FAUX_GH) => lireLesStationsDuChef({ gh, env: github.env() });

test("sur un ordinateur neuf connecté à GitHub, les stations déjà appairées — un Mac et parade-box — sont listées avec les projets que chacune porte", async (t) => {
  const github = unGitHub(t);
  const mac = await uneStation(t, { nom: "mac", machine: "macOS 25.0.0", version: "1.4.0", coeurs: 10 }, ["brigade"], { brigade: "benomite/brigade" });
  // Une station d'avant `depots` : le dépôt d'un projet ajouté depuis l'app se lit dans sa demande ; celui d'une ligne écrite à la main reste inconnu.
  const box = await uneStation(t, { nom: "parade-box", machine: "Linux 6.1.0", version: "1.3.9" }, ["parade", "cantine"]);
  github.ajouter(box.gist, { "brigade-projets.json": documentDeDemande([{ nom: "parade", depot: "benomite/parade", base: "main", principale: true, cooks: 2, manager: null, reviewer: null, ouvertLe: null, demandeLe: null }]) });
  // Une station qui attend encore son code, et un gist qui n'est pas une station : ni l'une ni l'autre n'est listée.
  await uneStation(t, { nom: "neuve", machine: "Linux 6.1.0", version: "1.4.0" }, []);
  github.autre("notes");
  github.appairer(mac.gist);
  github.appairer(box.gist);
  // Le Mac s'est arrêté proprement : il reste listé, hors ligne.
  await mac.presence.arreter();

  // La commande, dans un process neuf : ni HOME, ni état, ni variable de brigade — rien que son `gh`.
  const commande = lancer(t, COMMANDE, [], { ...github.env(), HOME: repertoireTemporaire(t), BRIGADE_GH_BIN: FAUX_GH });
  assert.equal(await commande.fin, 0, commande.sortie());
  const lu = JSON.parse(commande.sortie()) as StationsDuChef;
  assert.equal(lu.state, "listed");
  assert.ok(lu.state === "listed");
  assert.equal(lu.reason, undefined);
  assert.deepEqual(lu.unreadable, []);
  assert.deepEqual(
    lu.stations.map(({ id, name, machine, kind, cooks, version, online, projects }) => ({ id, name, machine, kind, cooks, version, online, projects })),
    [
      { id: mac.gist, name: "mac", machine: "macOS 25.0.0", kind: "ordinateur", cooks: true, version: "1.4.0", online: false, projects: [{ name: "brigade", repository: "benomite/brigade" }] },
      {
        id: box.gist,
        name: "parade-box",
        machine: "Linux 6.1.0",
        kind: "ordinateur",
        cooks: true,
        version: "1.3.9",
        online: true,
        projects: [
          { name: "parade", repository: "benomite/parade" },
          { name: "cantine", repository: null },
        ],
      },
    ],
  );
  const [leMac, laBox] = lu.stations;
  assert.ok(leMac?.stoppedAt !== null && leMac !== undefined && Date.parse(leMac.stoppedAt) >= Date.parse(leMac.lastSeen));
  assert.equal(laBox?.stoppedAt, null);
});

test("connecté, mais aucune station appairée : la liste est vide, et dit pourquoi en une phrase", async (t) => {
  const github = unGitHub(t);
  const vide = await lire(github);
  assert.equal(vide.state, "listed");
  assert.ok(vide.state === "listed");
  assert.deepEqual(vide.stations, []);
  assert.equal(vide.reason, "No station is paired with this GitHub account yet: start brigade on a machine, then type the code it shows.");

  await uneStation(t, { nom: "neuve", machine: "Linux 6.1.0", version: "1.4.0" }, []);
  const enAttente = await lire(github);
  assert.ok(enAttente.state === "listed");
  assert.deepEqual(enAttente.stations, []);
  assert.equal(enAttente.reason, "No station is paired with this GitHub account yet: 1 station waits for you to type the code it shows in its log.");
});

test("un gist de station appairée illisible est dit, sans faire tomber les autres ; seul, la liste vide dit pourquoi", async (t) => {
  const github = unGitHub(t);
  const casse = await uneStation(t, { nom: "casse", machine: "Linux", version: "1" }, []);
  github.ajouter(casse.gist, { "brigade-station.json": "pas du json" });
  github.appairer(casse.gist);
  const seule = await lire(github);
  assert.ok(seule.state === "listed");
  assert.deepEqual(seule.unreadable, [{ id: casse.gist, reason: "its state on GitHub is not JSON" }]);
  assert.equal(seule.reason, "1 station paired with this GitHub account publishes a state brigade cannot read, so no station can be listed.");

  const bonne = await uneStation(t, { nom: "box", machine: "Linux", version: "1" }, ["parade"]);
  github.appairer(bonne.gist);
  const deux = await lire(github);
  assert.ok(deux.state === "listed");
  assert.deepEqual(deux.stations.map(({ name }) => name), ["box"]);
  assert.equal(deux.unreadable.length, 1);
  assert.equal(deux.reason, undefined);
});

test("non connecté à GitHub : l'état « sign-in-required », une phrase, et le geste que l'app déclenche — jamais une liste vide", async (t) => {
  const github = unGitHub(t);
  github.tomber("deconnecte");
  const commande = appeler(principal, [], { ...github.env(), BRIGADE_GH_BIN: FAUX_GH });
  assert.equal(await commande.fin, 1);
  const lu = JSON.parse(commande.sortie()) as StationsDuChef;
  assert.deepEqual(lu, {
    state: "sign-in-required",
    reason: "This computer is not signed in to GitHub, so brigade cannot read the stations you have paired.",
    action: { id: "github-sign-in", label: "Sign in to GitHub", command: [FAUX_GH, "auth", "login", "--hostname", "github.com", "--web", "--git-protocol", "https"] },
  });
  assert.ok(!("stations" in lu));
});

test("un jeton que GitHub refuse demande aussi de se connecter", async (t) => {
  const github = unGitHub(t);
  github.tomber("jeton-refuse");
  const lu = await lire(github);
  assert.equal(lu.state, "sign-in-required");
});

test("sans réseau, sans `gh`, ou sous la limite de GitHub : la réponse dit pourquoi en une phrase, jamais une liste vide sans raison", async (t) => {
  const github = unGitHub(t);
  const phrase = (etat: StationsDuChef) => {
    assert.equal(etat.state, "unavailable");
    assert.ok(etat.state === "unavailable");
    assert.ok(!("stations" in etat));
    // Une phrase : une seule fin de phrase, la dernière.
    assert.match(etat.reason, /^[A-Z][^\n]*\.$/);
    assert.equal(etat.reason.split(/[.!?](\s|$)/).filter((morceau) => morceau.trim() !== "").length, 1, etat.reason);
    return etat;
  };

  const sansGh = phrase(await lire(github, join(github.repertoire, "pas-de-gh")));
  assert.equal(sansGh.cause, "gh-missing");
  assert.equal(sansGh.link, "https://cli.github.com");
  assert.match(sansGh.reason, /is not installed on this computer/);

  github.tomber("limite");
  const limite = phrase(await lire(github));
  assert.equal(limite.cause, "rate-limit");

  github.tomber("panne");
  const sansReseau = phrase(await lire(github));
  assert.equal(sansReseau.cause, "network");
  assert.equal(sansReseau.reason, "GitHub cannot be reached from this computer, so your stations could not be read: check its network connection.");
  assert.match(sansReseau.detail ?? "", /error connecting to api\.github\.com/);

  const commande = lancer(t, COMMANDE, [], { ...github.env(), HOME: repertoireTemporaire(t), BRIGADE_GH_BIN: FAUX_GH });
  assert.equal(await commande.fin, 1);
  assert.equal((JSON.parse(commande.sortie()) as StationsDuChef).state, "unavailable");
});

test("ce qu'un `gh` en échec veut dire : une attente trop longue, et un refus que rien d'autre n'explique, chacun en une phrase", () => {
  assert.deepEqual(echecDeGh("gh", 30_000, { code: undefined, killed: true, message: "Command failed" }, ""), {
    state: "unavailable",
    cause: "timeout",
    reason: "GitHub gave no answer within 30 s, so your stations could not be read.",
    detail: "Command failed",
  });
  assert.deepEqual(echecDeGh("gh", 30_000, { code: 1, killed: false, message: "Command failed" }, "gh: Server Error (HTTP 502)\n"), {
    state: "unavailable",
    cause: "github",
    reason: "GitHub refused to list your stations: gh: Server Error (HTTP 502).",
    detail: "gh: Server Error (HTTP 502)",
  });
});

test("stations-du-chef.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);

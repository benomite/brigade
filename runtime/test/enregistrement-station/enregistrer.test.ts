// L'enregistrement de la station sous le compte GitHub de sa machine (#1705),
// contre un GitHub en mémoire et une horloge simulée : ce qu'elle publie, son
// signe de vie, l'attente de la connexion, l'arrêt, le redémarrage. Le vrai
// `gh` et la lecture de l'app se prouvent dans `stations-du-compte.test.ts`,
// la vraie station dans `station.test.ts`.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import type { Canal, Fichiers } from "../../src/appairage/canal.ts";
import { disponible, enregistrementLu, FICHIER_ENREGISTREMENT, FICHIER_SELECTION, indisponibleApres, NOUVEL_ESSAI_MS, plateformeDe, RAFRAICHI_MS, selectionLue, type Enregistrement } from "../../src/enregistrement-station/contrat.ts";
import { FICHIER_LOCAL, tenirEnregistrement } from "../../src/enregistrement-station/enregistrer.ts";
import { LimiteGitHubAtteinte } from "../../src/limite-github.ts";
import { aArreter, repertoireTemporaire, temporaireDuFichier } from "../outils.ts";

const rienNeReste = temporaireDuFichier();

const DEPART = Date.parse("2026-10-26T09:00:00Z");

// Les gists du compte, en mémoire. `panne` : ce que chaque appel lève, tant qu'elle est posée.
function fauxGists() {
  const gists = new Map<string, { description: string; fichiers: Fichiers }>();
  let rang = 0;
  const etat = { panne: null as Error | null, appels: 0 };
  const tomber = () => {
    etat.appels += 1;
    if (etat.panne !== null) throw etat.panne;
  };
  const canal: Canal = {
    async creer(description, fichiers) {
      tomber();
      const id = `gist${++rang}`;
      gists.set(id, { description, fichiers: { ...fichiers } });
      return id;
    },
    async ecrire(id, fichiers) {
      tomber();
      const gist = gists.get(id);
      if (gist === undefined) return "absent";
      Object.assign(gist.fichiers, fichiers);
      return "ecrit";
    },
    async lire(id) {
      tomber();
      const gist = gists.get(id);
      return gist === undefined ? null : { ...gist.fichiers };
    },
  };
  const enregistrement = (id: string) => JSON.parse(gists.get(id)?.fichiers[FICHIER_ENREGISTREMENT] ?? "null") as Enregistrement;
  return { canal, gists, etat, enregistrement };
}

// Une horloge simulée : les minuteurs ne battent que quand le test avance le temps.
function fausseHorloge() {
  let instant = DEPART;
  const minuteurs: { le: number; tache: () => void; annule: boolean }[] = [];
  const apres = (tache: () => void, ms: number) => {
    const minuteur = { le: instant + ms, tache, annule: false };
    minuteurs.push(minuteur);
    return () => {
      minuteur.annule = true;
    };
  };
  const laisserFaire = () => new Promise<void>((fin) => setImmediate(fin));
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
  const armes = () => minuteurs.filter((m) => !m.annule).length;
  return { apres, avancer, armes, maintenant: () => instant };
}

function unEnregistrement(t: TestContext, options: { racine?: string; github?: ReturnType<typeof fauxGists>; horloge?: ReturnType<typeof fausseHorloge>; version?: string } = {}) {
  const racine = options.racine ?? repertoireTemporaire(t);
  const github = options.github ?? fauxGists();
  const horloge = options.horloge ?? fausseHorloge();
  const lignes: string[] = [];
  const tenue = tenirEnregistrement({
    racine,
    canal: github.canal,
    identite: { nom: "box", machine: "Linux 6.1.0", version: options.version ?? "1.4.0" },
    plateforme: "linux",
    dire: (ligne) => lignes.push(ligne),
    apres: horloge.apres,
    maintenant: horloge.maintenant,
  });
  aArreter(t, () => tenue.arreter());
  return { racine, github, horloge, lignes, tenue };
}

const iso = (instant: number) => new Date(instant).toISOString();

test("à son démarrage, la station crée un gist secret du compte qui porte son enregistrement, sans code à taper", async (t) => {
  const { github, horloge, lignes, tenue, racine } = unEnregistrement(t);
  await horloge.avancer(0);
  assert.equal(github.gists.size, 1);
  const [id, gist] = [...github.gists][0] ?? assert.fail("aucun gist");
  assert.equal(tenue.gist(), id);
  assert.equal(gist.description, "brigade — station box (registration)");
  assert.deepEqual(Object.keys(gist.fichiers), [FICHIER_ENREGISTREMENT]);
  assert.deepEqual(github.enregistrement(id), {
    brigade: "station-registration",
    format: 1,
    name: "box",
    platform: "linux",
    machine: "Linux 6.1.0",
    version: "1.4.0",
    registeredAt: iso(DEPART),
    lastSeen: iso(DEPART),
    refreshMs: RAFRAICHI_MS,
    stoppedAt: null,
  });
  assert.ok(disponible(github.enregistrement(id), DEPART));
  assert.deepEqual(lignes, [`brigade : station enregistrée sous le compte GitHub de sa machine — l'app connectée au même compte la voit (gist ${id})`]);
  assert.deepEqual(JSON.parse(readFileSync(join(racine, FICHIER_LOCAL), "utf8")), { gist: id, registeredAt: iso(DEPART) });
});

test("toutes les deux minutes, elle réécrit son signe de vie dans le même gist, et reste disponible entre deux", async (t) => {
  const { github, horloge, lignes } = unEnregistrement(t);
  await horloge.avancer(0);
  const [id] = [...github.gists.keys()];
  assert.ok(id);
  const appels = github.etat.appels;
  // Une minute plus tard : rien n'est écrit.
  await horloge.avancer(60_000);
  assert.equal(github.etat.appels, appels);
  await horloge.avancer(RAFRAICHI_MS - 60_000);
  assert.equal(github.etat.appels, appels + 1);
  assert.equal(github.gists.size, 1);
  const rafraichi = github.enregistrement(id);
  assert.equal(rafraichi.lastSeen, iso(DEPART + RAFRAICHI_MS));
  assert.equal(rafraichi.registeredAt, iso(DEPART));
  assert.equal(rafraichi.stoppedAt, null);
  // Dix rafraîchissements de plus : à tout instant, elle est disponible.
  for (let i = 0; i < 10; i++) {
    await horloge.avancer(RAFRAICHI_MS - 1);
    assert.ok(disponible(github.enregistrement(id), horloge.maintenant()), `rafraîchissement ${i}`);
    await horloge.avancer(1);
  }
  assert.equal(github.etat.appels, appels + 11);
  assert.equal(lignes.length, 1, lignes.join("\n"));
});

test("pas encore connectée à GitHub : elle le dit une fois, réessaie chaque minute, et s'enregistre dès la connexion faite", async (t) => {
  const github = fauxGists();
  github.etat.panne = new Error("gh api /gists : To get started with GitHub CLI, please run:  gh auth login");
  const { horloge, lignes, tenue } = unEnregistrement(t, { github });
  await horloge.avancer(0);
  await horloge.avancer(3 * NOUVEL_ESSAI_MS);
  assert.equal(github.gists.size, 0);
  assert.equal(tenue.gist(), null);
  assert.equal(github.etat.appels, 4, "un essai par minute");
  assert.deepEqual(lignes, ["brigade : station — pas encore enregistrée sous un compte GitHub, elle réessaie à chaque minute : gh api /gists : To get started with GitHub CLI, please run:  gh auth login"]);
  // Le chef finit la connexion GitHub de l'installation.
  github.etat.panne = null;
  await horloge.avancer(NOUVEL_ESSAI_MS);
  assert.equal(github.gists.size, 1);
  const id = tenue.gist();
  assert.ok(id);
  assert.ok(disponible(github.enregistrement(id), horloge.maintenant()));
  assert.equal(lignes.length, 3, lignes.join("\n"));
  assert.match(lignes[1] ?? "", /^brigade : station enregistrée sous le compte GitHub de sa machine/);
  assert.equal(lignes[2], "brigade : station — GitHub répond de nouveau : son enregistrement y est à jour");
});

test("GitHub muet après l'enregistrement : le signe de vie se retente chaque minute, et l'app la dit indisponible s'il manque trop longtemps", async (t) => {
  const { github, horloge, lignes, tenue } = unEnregistrement(t);
  await horloge.avancer(0);
  const id = tenue.gist() ?? assert.fail("pas de gist");
  github.etat.panne = new Error("gh api /gists/gist1 : error connecting to api.github.com");
  await horloge.avancer(RAFRAICHI_MS + 2 * NOUVEL_ESSAI_MS);
  assert.equal(lignes.filter((ligne) => ligne.includes("n'est pas rafraîchi")).length, 1, lignes.join("\n"));
  assert.match(lignes.at(-1) ?? "", /^brigade : station — son enregistrement n'est pas rafraîchi sur GitHub, elle réessaie à chaque minute : /);
  // Son dernier signe de vie est celui du départ : passé 270 s, l'app la dit indisponible.
  assert.ok(!disponible(github.enregistrement(id), horloge.maintenant() + 60_000));
  github.etat.panne = null;
  await horloge.avancer(NOUVEL_ESSAI_MS);
  assert.equal(github.enregistrement(id).lastSeen, iso(horloge.maintenant()));
  assert.ok(disponible(github.enregistrement(id), horloge.maintenant()));
});

test("arrêtée proprement, elle écrit tout de suite l'heure de son arrêt : indisponible à la lecture suivante, et plus rien n'est écrit", async (t) => {
  const { github, horloge, tenue } = unEnregistrement(t);
  await horloge.avancer(0);
  const id = tenue.gist() ?? assert.fail("pas de gist");
  await horloge.avancer(30_000);
  await tenue.arreter();
  const arretee = github.enregistrement(id);
  assert.equal(arretee.stoppedAt, iso(DEPART + 30_000));
  assert.equal(arretee.lastSeen, iso(DEPART + 30_000));
  assert.ok(!disponible(arretee, DEPART + 30_000));
  assert.equal(horloge.armes(), 0, "aucun minuteur ne reste armé");
  const appels = github.etat.appels;
  await horloge.avancer(10 * RAFRAICHI_MS);
  assert.equal(github.etat.appels, appels);
  // Un second arrêt n'écrit rien de plus.
  await tenue.arreter();
  assert.equal(github.etat.appels, appels);
});

test("éteinte d'un coup, elle n'écrit rien : l'app la dit indisponible 2 × refreshMs + 30 s après son dernier signe de vie", async (t) => {
  const { github, horloge, tenue } = unEnregistrement(t);
  await horloge.avancer(0);
  const id = tenue.gist() ?? assert.fail("pas de gist");
  const dernier = github.enregistrement(id);
  assert.equal(indisponibleApres(RAFRAICHI_MS), 270_000);
  assert.ok(disponible(dernier, DEPART + 270_000));
  assert.ok(!disponible(dernier, DEPART + 270_001));
});

test("redémarrée, elle reprend le même gist : de nouveau disponible, son premier enregistrement gardé", async (t) => {
  const github = fauxGists();
  const horloge = fausseHorloge();
  const racine = repertoireTemporaire(t);
  const premiere = unEnregistrement(t, { racine, github, horloge });
  await horloge.avancer(0);
  const id = premiere.tenue.gist() ?? assert.fail("pas de gist");
  await horloge.avancer(60_000);
  await premiere.tenue.arreter();
  assert.ok(!disponible(github.enregistrement(id), horloge.maintenant()));
  await horloge.avancer(3_600_000);

  const seconde = unEnregistrement(t, { racine, github, horloge, version: "1.5.0" });
  await horloge.avancer(0);
  assert.equal(github.gists.size, 1);
  assert.equal(seconde.tenue.gist(), id);
  const reprise = github.enregistrement(id);
  assert.equal(reprise.stoppedAt, null);
  assert.equal(reprise.registeredAt, iso(DEPART));
  assert.equal(reprise.lastSeen, iso(horloge.maintenant()));
  assert.equal(reprise.version, "1.5.0");
  assert.ok(disponible(reprise, horloge.maintenant()));
  assert.deepEqual(seconde.lignes, [], "rien à dire : elle était déjà enregistrée");
});

test("son gist supprimé sur GitHub, elle s'enregistre dans un autre à l'écriture suivante", async (t) => {
  const { github, horloge, lignes, tenue, racine } = unEnregistrement(t);
  await horloge.avancer(0);
  const ancien = tenue.gist() ?? assert.fail("pas de gist");
  github.gists.delete(ancien);
  await horloge.avancer(RAFRAICHI_MS);
  const neuf = tenue.gist() ?? assert.fail("pas de gist");
  assert.notEqual(neuf, ancien);
  assert.deepEqual([...github.gists.keys()], [neuf]);
  assert.equal(github.enregistrement(neuf).registeredAt, iso(DEPART + RAFRAICHI_MS));
  assert.equal(lignes[1], "brigade : station — son enregistrement a disparu de GitHub : elle s'enregistre de nouveau");
  assert.match(lignes[2] ?? "", new RegExp(`\\(gist ${neuf}\\)$`));
  assert.equal(JSON.parse(readFileSync(join(racine, FICHIER_LOCAL), "utf8")).gist, neuf);
});

test("la sélection que l'app écrit dans le gist n'est jamais réécrite par la station", async (t) => {
  const { github, horloge, tenue } = unEnregistrement(t);
  await horloge.avancer(0);
  const id = tenue.gist() ?? assert.fail("pas de gist");
  const selection = JSON.stringify({ brigade: "station-selection", format: 1, repositories: ["acme/shop"], updatedAt: iso(DEPART) });
  const gist = github.gists.get(id) ?? assert.fail("pas de gist");
  gist.fichiers[FICHIER_SELECTION] = selection;
  await horloge.avancer(3 * RAFRAICHI_MS);
  await tenue.arreter();
  assert.equal(github.gists.get(id)?.fichiers[FICHIER_SELECTION], selection);
  assert.equal(github.enregistrement(id).stoppedAt, iso(horloge.maintenant()));
});

test("GitHub a atteint sa limite : elle n'appelle plus avant la fin de la fenêtre, puis reprend seule", async (t) => {
  const github = fauxGists();
  github.etat.panne = new LimiteGitHubAtteinte(DEPART + 10 * 60_000, 10 * 60_000);
  const { horloge, lignes, tenue } = unEnregistrement(t, { github });
  await horloge.avancer(0);
  assert.equal(github.etat.appels, 1);
  github.etat.panne = null;
  await horloge.avancer(10 * 60_000 - 1);
  assert.equal(github.etat.appels, 1, "aucun appel pendant la fenêtre");
  await horloge.avancer(1);
  assert.ok(tenue.gist());
  assert.equal(lignes[0], "brigade : station — GitHub a atteint sa limite d'appels : plus aucun appel ne part avant la fin de la fenêtre, puis ils reprennent seuls");
});

test("arrêtée avant d'avoir jamais été enregistrée, elle n'a rien à écrire", async (t) => {
  const github = fauxGists();
  github.etat.panne = new Error("gh api /gists : not logged in");
  const { horloge, tenue } = unEnregistrement(t, { github });
  await horloge.avancer(0);
  github.etat.panne = null;
  const appels = github.etat.appels;
  await tenue.arreter();
  assert.equal(github.etat.appels, appels);
  assert.equal(github.gists.size, 0);
});

test("le contrat : la plateforme dite, un enregistrement ou une sélection illisibles écartés", () => {
  assert.equal(plateformeDe("linux"), "linux");
  assert.equal(plateformeDe("darwin"), "macos");
  assert.equal(plateformeDe("win32"), "windows");
  assert.equal(plateformeDe("freebsd"), "freebsd");

  const bon: Enregistrement = { brigade: "station-registration", format: 1, name: "box", platform: "linux", machine: "Linux 6.1.0", version: "1.4.0", registeredAt: iso(DEPART), lastSeen: iso(DEPART), refreshMs: RAFRAICHI_MS, stoppedAt: null };
  assert.deepEqual(enregistrementLu(JSON.stringify(bon)), bon);
  assert.deepEqual(enregistrementLu("{"), { illisible: "its registration is not JSON" });
  assert.deepEqual(enregistrementLu(JSON.stringify({ ...bon, brigade: "station" })), { illisible: "its registration is not a brigade station's" });
  assert.deepEqual(enregistrementLu(JSON.stringify({ ...bon, format: 2 })), { illisible: "its registration has a format this brigade does not read (2)" });
  assert.deepEqual(enregistrementLu(JSON.stringify({ ...bon, lastSeen: "hier" })), { illisible: "its registration lacks its name, platform, version or last sign of life" });
  assert.deepEqual(enregistrementLu(JSON.stringify({ ...bon, refreshMs: 0 })), { illisible: "its registration lacks its refresh period" });
  // Un arrêt plus ancien que son dernier signe de vie : elle a redémarré depuis.
  assert.ok(disponible({ ...bon, stoppedAt: iso(DEPART - 1) }, DEPART));
  assert.ok(!disponible({ ...bon, stoppedAt: iso(DEPART) }, DEPART));

  const selection = { brigade: "station-selection", format: 1, repositories: ["acme/shop", "acme/site", "acme/shop"], updatedAt: iso(DEPART) };
  assert.deepEqual(selectionLue(JSON.stringify(selection)), { ...selection, repositories: ["acme/shop", "acme/site"] });
  assert.deepEqual(selectionLue(JSON.stringify({ ...selection, repositories: [] }))?.repositories, []);
  assert.equal(selectionLue("{"), null);
  assert.equal(selectionLue(JSON.stringify({ ...selection, repositories: ["shop"] })), null);
  assert.equal(selectionLue(JSON.stringify({ ...selection, format: 2 })), null);
  assert.equal(selectionLue(JSON.stringify({ ...selection, updatedAt: null })), null);
});

test("enregistrer.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);

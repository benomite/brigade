// La présence de la station sur GitHub et son appairage, contre un GitHub en
// mémoire : ce qu'elle publie, le code qu'elle affiche, ce qu'elle fait de
// l'appairage que l'app écrit. Le vrai `gh` se prouve dans `canal.test.ts`.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import type { Canal, Fichiers } from "../../src/appairage/canal.ts";
import { empreinte, FICHIER_APPAIRAGE, FICHIER_STATION, normaliser, tirerCode, type DocumentStation, type EtatsPublies } from "../../src/appairage/document.ts";
import { etatsPublies } from "../../src/appairage/etats.ts";
import { FICHIER_RAIL, type RailsPublies } from "../../src/appairage/rail-publie.ts";
import { BATTEMENT_MS, CADENCE_MS, codeAffiche, ECART_MINIMAL_MS, FICHIER_LOCAL, identiteDeLaStation, REGARD_MS, tenirPresence } from "../../src/appairage/presence.ts";
import type { ConnexionMax } from "../../src/connexion-max/connexion.ts";
import { sorteLue } from "../../src/stations-globales/sorte.ts";
import type { EtatMiseAJour } from "../../src/mise-a-jour/etat.ts";
import { aArreter, repertoireTemporaire, temporaireDuFichier } from "../outils.ts";

const rienNeReste = temporaireDuFichier();

// Les gists du compte, en mémoire. `panne` : ce que le prochain appel lève.
function fauxGists() {
  const gists = new Map<string, { description: string; fichiers: Fichiers }>();
  let rang = 0;
  const etat = { panne: null as string | null };
  const tomber = () => {
    if (etat.panne !== null) throw new Error(etat.panne);
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
  const document = (id: string) => JSON.parse(gists.get(id)?.fichiers[FICHIER_STATION] ?? "null") as DocumentStation;
  // Ce que l'app écrit quand le chef a tapé le bon code.
  const appairer = (id: string, code: string) => {
    const gist = gists.get(id);
    assert.ok(gist);
    gist.fichiers[FICHIER_APPAIRAGE] = JSON.stringify({ appaireeLe: new Date().toISOString(), empreinte: empreinte(code) });
  };
  return { canal, gists, etat, document, appairer };
}

// Une horloge simulée : les minuteurs ne battent que quand le test avance le temps.
function faussesHorloges(depart: number) {
  let instant = depart;
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
      const prochain = minuteurs.filter((m) => !m.annule && m.le <= but).sort((a, b) => a.le - b.le)[0];
      if (prochain === undefined) break;
      prochain.annule = true;
      instant = Math.max(instant, prochain.le);
      prochain.tache();
      await laisserFaire();
    }
    instant = but;
    await laisserFaire();
  };
  return { apres, avancer, maintenant: () => instant };
}

function unePresence(t: TestContext, options: { racine?: string; projets?: string[]; dureeDuCodeMs?: number; etats?: () => EtatsPublies } = {}) {
  const racine = options.racine ?? repertoireTemporaire(t);
  const github = fauxGists();
  const lignes: string[] = [];
  const depart = Date.parse("2026-10-15T12:00:00Z");
  const horloge = faussesHorloges(depart);
  const presence = tenirPresence({
    racine,
    canal: github.canal,
    identite: { nom: "box", machine: "Linux 6.1.0", version: "1.4.0" },
    projets: () => options.projets ?? [],
    ...(options.etats === undefined ? {} : { etats: options.etats }),
    dire: (ligne) => lignes.push(ligne),
    dureeDuCodeMs: options.dureeDuCodeMs ?? 15 * 60_000,
    apres: horloge.apres,
    maintenant: horloge.maintenant,
  });
  aArreter(t, () => presence.arreter());
  return { racine, github, lignes, presence, avancer: horloge.avancer, ecoule: () => horloge.maintenant() - depart };
}

test("le code a huit signes lisibles, et se compare tel que le chef le tape", () => {
  const code = tirerCode();
  assert.match(code, /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
  assert.equal(normaliser(code.toLowerCase().replace("-", " ")), code.replace("-", ""));
  assert.equal(normaliser("abcd-efgo"), "ABCDEFG0");
  assert.equal(normaliser("ABCD-EFGL"), "ABCDEFG1");
  assert.equal(normaliser("ABCD-EFG"), null);
  assert.equal(normaliser("ABCD-EFGU"), null);
  assert.equal(empreinte("abcd efgh"), empreinte("ABCD-EFGH"));
});

test("une station neuve crée son gist, y publie son état et l'empreinte de son code, et affiche le code", async (t) => {
  const { github, lignes, presence, racine, avancer } = unePresence(t);
  await presence.publier();
  assert.equal(github.gists.size, 1);
  const [id, gist] = [...github.gists][0] ?? assert.fail("aucun gist");
  assert.equal(gist?.description, "brigade — station box");
  const doc = github.document(id ?? "");
  const code = presence.code();
  assert.ok(code);
  assert.deepEqual(
    { ...doc, signeDeVie: "", appairage: { ...doc.appairage, expireLe: "" } },
    { brigade: "station", format: 1, nom: "box", machine: "Linux 6.1.0", sorte: "ordinateur", cuisine: true, version: "1.4.0", projets: [], signeDeVie: "", cadenceMs: CADENCE_MS, arreteeLe: null, appairage: { empreinte: empreinte(code), expireLe: "" }, echus: [], miseAJour: null, connexionMax: null },
  );
  assert.equal(doc.appairage?.expireLe, "2026-10-15T12:15:00.000Z");
  // Le code ne se publie que par son empreinte.
  assert.ok(!JSON.stringify([...github.gists.values()]).includes(code.replace("-", "")));
  assert.ok(!JSON.stringify([...github.gists.values()]).includes(code));
  assert.equal(lignes.filter((ligne) => ligne.includes(code)).length, 1, lignes.join("\n"));
  assert.match(lignes.find((ligne) => ligne.includes(code)) ?? "", /^brigade : station à appairer — tape ce code dans l'app : [0-9A-Z]{4}-[0-9A-Z]{4} \(valable jusqu'à /);
  assert.equal(codeAffiche(racine), code);
  // Un signe de vie de plus, une minute après, ne crée rien, et ne redit pas le code.
  await avancer(60_000);
  assert.equal(github.gists.size, 1);
  assert.equal(lignes.filter((ligne) => ligne.includes(code)).length, 1);
});

test("la station dit les cœurs de sa machine : l'app en tire le nombre de cooks qu'elle propose (#1107)", async (t) => {
  const identite = identiteDeLaStation({ BRIGADE_STATION_NOM: "box", BRIGADE_STATION_VERSION: "1.4.0" });
  assert.equal(identite.coeurs, availableParallelism());
  const github = fauxGists();
  const horloge = faussesHorloges(Date.parse("2026-10-15T12:00:00Z"));
  const presence = tenirPresence({ racine: repertoireTemporaire(t), canal: github.canal, identite: { ...identite, coeurs: 8 }, projets: () => [], dire: () => {}, apres: horloge.apres, maintenant: horloge.maintenant });
  aArreter(t, () => presence.arreter());
  await presence.publier();
  const [id] = [...github.gists.keys()];
  assert.equal(github.document(id ?? "").coeurs, 8);
});

test("la station publie le dépôt de chacun de ses projets : l'app d'un ordinateur neuf en tire de quoi le cloner (#1428)", async (t) => {
  const github = fauxGists();
  const horloge = faussesHorloges(Date.parse("2026-10-15T12:00:00Z"));
  const identite = { nom: "box", machine: "Linux 6.1.0", version: "1.4.0" };
  const presence = tenirPresence({ racine: repertoireTemporaire(t), canal: github.canal, identite, projets: () => ["parade"], depots: () => ({ parade: "benomite/parade" }), dire: () => {}, apres: horloge.apres, maintenant: horloge.maintenant });
  aArreter(t, () => presence.arreter());
  await presence.publier();
  const [id] = [...github.gists.keys()];
  assert.deepEqual(github.document(id ?? "").depots, { parade: "benomite/parade" });
});

test("la station publie le rail de chacun de ses projets, et le republie au regard qui suit un changement du rail seul (#1432)", async (t) => {
  const github = fauxGists();
  const horloge = faussesHorloges(Date.parse("2026-10-15T12:00:00Z"));
  const identite = { nom: "box", machine: "Linux 6.1.0", version: "1.4.0" };
  let rails: RailsPublies = { parade: [{ ticket: 14, etat: "en attente", titre: "Ticket 14", url: "https://github.com/benomite/parade/issues/14" }] };
  let illisible = false;
  const presence = tenirPresence({
    racine: repertoireTemporaire(t),
    canal: github.canal,
    identite,
    projets: () => ["parade"],
    rails: () => {
      if (illisible) throw new Error("journal fermé");
      return rails;
    },
    dire: () => {},
    apres: horloge.apres,
    maintenant: horloge.maintenant,
  });
  aArreter(t, () => presence.arreter());
  await presence.publier();
  const [id = ""] = [...github.gists.keys()];
  const publie = () => JSON.parse(github.gists.get(id)?.fichiers[FICHIER_RAIL] ?? "null") as unknown;
  assert.deepEqual(publie(), { brigade: "rail", format: 1, projets: rails });

  // Le ticket est pris : rien d'autre ne change, le regard suivant l'écrit.
  rails = { parade: [{ ticket: 14, etat: "pris", titre: "Ticket 14", url: "https://github.com/benomite/parade/issues/14" }] };
  await horloge.avancer(REGARD_MS);
  assert.deepEqual(publie(), { brigade: "rail", format: 1, projets: rails });

  // Un rail qui ne se lit pas ne prive pas la station de son signe de vie, ni le gist du rail d'avant.
  illisible = true;
  const avant = github.document(id).signeDeVie;
  await horloge.avancer(BATTEMENT_MS);
  assert.notEqual(github.document(id).signeDeVie, avant);
  assert.deepEqual(publie(), { brigade: "rail", format: 1, projets: rails });
});

test("un téléphone publie sa sorte et qu'il ne cuisine pas : l'app le montre dans ses stations, sans cuisine (#1158)", async (t) => {
  const github = fauxGists();
  const horloge = faussesHorloges(Date.parse("2026-10-15T12:00:00Z"));
  const identite = { nom: "pixel", machine: "Android 16", version: "1.4.0", sorte: "telephone" as const };
  const presence = tenirPresence({ racine: repertoireTemporaire(t), canal: github.canal, identite, projets: () => [], dire: () => {}, apres: horloge.apres, maintenant: horloge.maintenant });
  aArreter(t, () => presence.arreter());
  await presence.publier();
  const [id] = [...github.gists.keys()];
  const { sorte, cuisine } = github.document(id ?? "");
  assert.deepEqual({ sorte, cuisine }, { sorte: "telephone", cuisine: false });
  // Et lue par qui choisit où cuire : elle ne cuisine pas.
  assert.deepEqual(sorteLue(github.document(id ?? "")), { sorte: "telephone", cuisine: false });
});

test("un document de station se lit avec sa sorte : sans elle, un ordinateur qui cuisine ; un téléphone ne cuisine jamais ; une sorte inconnue ne cuisine que si elle le dit", () => {
  assert.deepEqual(sorteLue({}), { sorte: "ordinateur", cuisine: true });
  assert.deepEqual(sorteLue({ sorte: "ordinateur", cuisine: true }), { sorte: "ordinateur", cuisine: true });
  assert.deepEqual(sorteLue({ sorte: "ordinateur", cuisine: false }), { sorte: "ordinateur", cuisine: false });
  assert.deepEqual(sorteLue({ sorte: "telephone" }), { sorte: "telephone", cuisine: false });
  assert.deepEqual(sorteLue({ sorte: "telephone", cuisine: true }), { sorte: "telephone", cuisine: false });
  assert.deepEqual(sorteLue({ cuisine: false }), { sorte: "ordinateur", cuisine: false });
  assert.deepEqual(sorteLue({ sorte: "montre" }), { sorte: null, cuisine: false });
  assert.deepEqual(sorteLue({ sorte: "montre", cuisine: true }), { sorte: null, cuisine: true });
});

test("l'état publié dit les projets servis et rafraîchit le signe de vie à chaque publication", async (t) => {
  const { github, presence, avancer } = unePresence(t, { projets: ["brigade", "espace"] });
  await presence.publier();
  const id = [...github.gists.keys()][0] ?? "";
  assert.deepEqual(github.document(id).projets, ["brigade", "espace"]);
  const avant = github.document(id).signeDeVie;
  await avancer(60_000);
  await presence.publier();
  assert.equal(Date.parse(github.document(id).signeDeVie) - Date.parse(avant), 60_000);
});

test("l'état publié porte ses pannes : la mise à jour revenue en arrière et la connexion Max, à chaque signe de vie", async (t) => {
  let etats: EtatsPublies = { miseAJour: null, connexionMax: { etat: "connectee", depuis: "2026-10-15T08:00:00.000Z" } };
  const { github, presence, avancer } = unePresence(t, { etats: () => etats });
  await presence.publier();
  const id = [...github.gists.keys()][0] ?? "";
  assert.deepEqual({ miseAJour: github.document(id).miseAJour, connexionMax: github.document(id).connexionMax }, etats);
  etats = { miseAJour: { visee: "1.5.0", restauree: "1.4.0", le: "2026-10-15T11:58:00.000Z", retourRate: false }, connexionMax: { etat: "perdue", depuis: "2026-10-15T11:50:00.000Z" } };
  await avancer(60_000);
  await presence.publier();
  assert.deepEqual({ miseAJour: github.document(id).miseAJour, connexionMax: github.document(id).connexionMax }, etats);
});

test("une lecture de ses pannes qui lève ne prive pas la station de son signe de vie", async (t) => {
  const { github, presence } = unePresence(t, {
    etats: () => {
      throw new Error("etat.json illisible");
    },
  });
  await presence.publier();
  const doc = github.document([...github.gists.keys()][0] ?? "");
  assert.equal(doc.nom, "box");
  assert.deepEqual({ miseAJour: doc.miseAJour, connexionMax: doc.connexionMax }, { miseAJour: null, connexionMax: null });
});

test("ce qui est publié d'une mise à jour : la version visée et la restaurée, jamais le motif ; d'une connexion, son état et depuis quand", () => {
  const etat: EtatMiseAJour = {
    installee: "1.4.0",
    disponible: "1.5.0",
    gelee: false,
    verifieeLe: "2026-10-15T12:00:00.000Z",
    verification: null,
    retenue: "1.5.0 n'a pas démarré",
    ratees: ["1.5.0"],
    derniere: { quoi: "revenue", visee: "1.5.0", restauree: "1.4.0", motif: "sudo systemctl restart brigade-station a échoué", le: "2026-10-15T11:58:00.000Z", retour: null },
  };
  const connexion: ConnexionMax = { etat: "perdue", depuis: "2026-10-15T11:50:00.000Z", raison: "session-refusee", detail: "claude auth login", verifiee: null, reecrite: null, renouvellement: { vivant: true, echec: null }, geste: "claude auth login" };
  const publies = etatsPublies(etat, connexion);
  assert.deepEqual(publies, { miseAJour: { visee: "1.5.0", restauree: "1.4.0", le: "2026-10-15T11:58:00.000Z", retourRate: false }, connexionMax: { etat: "perdue", depuis: "2026-10-15T11:50:00.000Z" } });
  assert.doesNotMatch(JSON.stringify(publies), /systemctl|sudo|claude/);
  // Un passage réussi efface la panne ; un retour raté se publie raté.
  assert.equal(etatsPublies({ ...etat, derniere: { quoi: "passee", version: "1.6.0", depuis: "1.4.0", le: "2026-10-15T13:00:00.000Z" } }, null).miseAJour, null);
  assert.equal(etatsPublies({ ...etat, derniere: { ...etat.derniere, retour: "dpkg en échec" } as EtatMiseAJour["derniere"] }, null).miseAJour?.retourRate, true);
  assert.deepEqual(etatsPublies(null, null), { miseAJour: null, connexionMax: null });
});

test("appairée par l'app, la station n'affiche plus de code et ne publie plus d'empreinte", async (t) => {
  const { github, lignes, presence, racine, avancer } = unePresence(t);
  await presence.publier();
  const id = [...github.gists.keys()][0] ?? "";
  github.appairer(id, presence.code() ?? "");
  await avancer(REGARD_MS);
  assert.equal(presence.code(), null);
  assert.equal(codeAffiche(racine), null);
  assert.equal(github.document(id).appairage, null);
  assert.deepEqual(github.document(id).echus, []);
  assert.ok(lignes.some((ligne) => ligne.startsWith("brigade : station appairée à l'app")), lignes.join("\n"));
  assert.equal(JSON.parse(readFileSync(join(racine, FICHIER_LOCAL), "utf8")).appairee, true);
});

test("un appairage écrit pour un code que la station n'a jamais tiré n'est pas pris", async (t) => {
  const { github, presence, avancer } = unePresence(t);
  await presence.publier();
  const id = [...github.gists.keys()][0] ?? "";
  const code = presence.code();
  github.appairer(id, code === "AAAA-AAAA" ? "BBBB-BBBB" : "AAAA-AAAA");
  await avancer(REGARD_MS);
  assert.equal(presence.code(), code);
});

test("un code échu en tire un autre, et l'empreinte de l'ancien reste publiée comme échue", async (t) => {
  const { github, lignes, presence, avancer } = unePresence(t, { dureeDuCodeMs: 60_000 });
  await presence.publier();
  const id = [...github.gists.keys()][0] ?? "";
  const premier = presence.code() ?? "";
  await avancer(60_000);
  const second = presence.code() ?? "";
  assert.notEqual(second, premier);
  assert.deepEqual(github.document(id).echus, [empreinte(premier)]);
  assert.equal(github.document(id).appairage?.empreinte, empreinte(second));
  assert.ok(lignes.some((ligne) => ligne.includes(second)));
  // L'app qui a lu le premier juste avant qu'il n'échoie appaire quand même.
  github.appairer(id, premier);
  await avancer(REGARD_MS);
  assert.equal(presence.code(), null);
});

test("redémarrée, la station garde son gist, son code et son appairage", async (t) => {
  const racine = repertoireTemporaire(t);
  const premiere = unePresence(t, { racine });
  await premiere.presence.publier();
  const code = premiere.presence.code();
  const arret = premiere.presence.arreter();
  await premiere.avancer(ECART_MINIMAL_MS);
  await arret;
  const id = [...premiere.github.gists.keys()][0] ?? "";
  assert.ok(premiere.github.document(id).arreteeLe);

  // Le même GitHub, une station relancée.
  const lignes: string[] = [];
  const relue = faussesHorloges(Date.parse("2026-10-15T12:01:00Z"));
  const relancee = tenirPresence({ racine, canal: premiere.github.canal, identite: { nom: "box", machine: "Linux 6.1.0", version: "1.4.1" }, projets: () => [], dire: (ligne) => lignes.push(ligne), apres: relue.apres, maintenant: relue.maintenant });
  aArreter(t, async () => {
    const arret = relancee.arreter();
    await relue.avancer(ECART_MINIMAL_MS);
    await arret;
  });
  await relancee.publier();
  assert.equal(premiere.github.gists.size, 1);
  assert.equal(relancee.code(), code);
  assert.equal(premiere.github.document(id).arreteeLe, null);
  assert.equal(premiere.github.document(id).version, "1.4.1");
  // Redémarrée, elle redit son code : c'est peut-être ce qu'on attend d'elle.
  assert.ok(lignes.some((ligne) => code !== null && ligne.includes(code)));
});

test("arrêtée, la station écrit l'heure de son arrêt, puis ne publie plus rien", async (t) => {
  const { github, presence, avancer } = unePresence(t);
  await presence.publier();
  const id = [...github.gists.keys()][0] ?? "";
  await avancer(5_000);
  const arret = presence.arreter();
  await avancer(ECART_MINIMAL_MS);
  await arret;
  const doc = github.document(id);
  assert.equal(doc.arreteeLe, doc.signeDeVie);
  await avancer(60_000);
  await presence.publier();
  await avancer(BATTEMENT_MS);
  assert.equal(github.document(id).signeDeVie, doc.signeDeVie);
});

test("son gist supprimé, la station en crée un autre et se fait appairer de nouveau", async (t) => {
  const { github, lignes, presence, avancer } = unePresence(t);
  await presence.publier();
  const id = [...github.gists.keys()][0] ?? "";
  github.appairer(id, presence.code() ?? "");
  await avancer(REGARD_MS);
  assert.equal(presence.code(), null);
  github.gists.delete(id);
  await avancer(BATTEMENT_MS);
  assert.equal(github.gists.size, 1);
  assert.notEqual([...github.gists.keys()][0], id);
  assert.ok(presence.code());
  assert.ok(lignes.some((ligne) => ligne.includes("son gist a disparu de GitHub")), lignes.join("\n"));
});

test("GitHub injoignable : la panne est dite une fois, le retour aussi, et rien n'est perdu", async (t) => {
  const { github, lignes, presence, avancer } = unePresence(t);
  github.etat.panne = "gh: error connecting to api.github.com";
  await presence.publier();
  await avancer(REGARD_MS);
  assert.equal(lignes.filter((ligne) => ligne.includes("n'est pas publié sur GitHub")).length, 1, lignes.join("\n"));
  // Tant que rien n'est publié, aucun code n'est affiché : l'app ne le trouverait pas.
  assert.equal(presence.code(), null);
  assert.ok(!lignes.some((ligne) => ligne.includes("à appairer")));
  github.etat.panne = null;
  await avancer(REGARD_MS);
  assert.equal(github.gists.size, 1);
  assert.ok(lignes.some((ligne) => ligne.includes("GitHub répond de nouveau")));
  assert.ok(lignes.some((ligne) => ligne.includes("à appairer")));
});

// Les écritures dans le gist de la station, comptées par un canal qui les voit passer.
function compterLesEcritures(github: ReturnType<typeof fauxGists>, instant: () => number) {
  const instants: number[] = [];
  const { creer, ecrire } = github.canal;
  github.canal.creer = async (...args) => (instants.push(instant()), creer(...args));
  github.canal.ecrire = async (...args) => (instants.push(instant()), ecrire(...args));
  return instants;
}

test("sans changement et en moins de cinq minutes, rien n'est écrit dans le gist", async (t) => {
  const { github, presence, avancer } = unePresence(t);
  await presence.publier();
  const ecritures = compterLesEcritures(github, () => 0);
  await avancer(BATTEMENT_MS - REGARD_MS);
  assert.equal(ecritures.length, 0);
});

test("l'écart minimal se règle : deux écritures demandées ne se rapprochent pas plus que lui, et la retenue passe dès qu'il est écoulé (#1658)", async (t) => {
  const github = fauxGists();
  const horloge = faussesHorloges(Date.parse("2026-10-15T12:00:00Z"));
  const presence = tenirPresence({ racine: repertoireTemporaire(t), canal: github.canal, identite: { nom: "box", machine: "Linux", version: "1" }, projets: () => [], dire: () => {}, apres: horloge.apres, maintenant: horloge.maintenant, ecartMinimalMs: 5_000 });
  aArreter(t, async () => {
    const arret = presence.arreter();
    await horloge.avancer(5_000);
    await arret;
  });
  await presence.publier();
  const ecritures = compterLesEcritures(github, horloge.maintenant);
  const depart = horloge.maintenant();
  await presence.publier();
  await horloge.avancer(4_999);
  assert.deepEqual(ecritures, []);
  await horloge.avancer(1);
  assert.deepEqual(ecritures, [depart + 5_000]);
});

test("un changement d'état est écrit au regard suivant", async (t) => {
  let projets = ["brigade"];
  const github = fauxGists();
  const horloge = faussesHorloges(Date.parse("2026-10-15T12:00:00Z"));
  const presence = tenirPresence({ racine: repertoireTemporaire(t), canal: github.canal, identite: { nom: "box", machine: "Linux", version: "1" }, projets: () => projets, dire: () => {}, apres: horloge.apres, maintenant: horloge.maintenant });
  aArreter(t, async () => {
    const arret = presence.arreter();
    await horloge.avancer(ECART_MINIMAL_MS);
    await arret;
  });
  await horloge.avancer(0);
  const id = [...github.gists.keys()][0] ?? "";
  projets = ["brigade", "espace"];
  assert.deepEqual(github.document(id).projets, ["brigade"]);
  await horloge.avancer(REGARD_MS - 1);
  assert.deepEqual(github.document(id).projets, ["brigade"]);
  await horloge.avancer(1);
  assert.deepEqual(github.document(id).projets, ["brigade", "espace"]);
});

test("sans changement, la station écrit un battement toutes les cinq minutes", async (t) => {
  const { github, presence, avancer } = unePresence(t);
  await presence.publier();
  const id = [...github.gists.keys()][0] ?? "";
  const premier = github.document(id).signeDeVie;
  await avancer(BATTEMENT_MS - 1);
  assert.equal(github.document(id).signeDeVie, premier);
  await avancer(1);
  assert.equal(Date.parse(github.document(id).signeDeVie) - Date.parse(premier), BATTEMENT_MS);
});

test("deux demandes d'écriture, y compris par publier(), ne font pas deux écritures dans la même minute", async (t) => {
  const { github, presence, avancer, ecoule } = unePresence(t);
  const ecritures = compterLesEcritures(github, ecoule);
  await presence.publier();
  for (let i = 0; i < 5; i++) {
    await avancer(10_000);
    await presence.publier();
  }
  // Une seule écriture dans la première minute ; la demande retenue part à 60 s.
  assert.deepEqual(ecritures, [0]);
  await avancer(10_000);
  assert.deepEqual(ecritures, [0, 60_000]);
  const id = [...github.gists.keys()][0] ?? "";
  assert.equal(github.document(id).signeDeVie, "2026-10-15T12:01:00.000Z");
});

test("l'arrêt propre s'écrit tout de suite, même dans la minute d'une écriture : l'état final ne se perd pas", async (t) => {
  const { github, presence, avancer } = unePresence(t);
  await presence.publier();
  const id = [...github.gists.keys()][0] ?? "";
  await avancer(10_000);
  await presence.arreter();
  assert.equal(github.document(id).arreteeLe, "2026-10-15T12:00:10.000Z");
});

test("le cadenceMs publié tient la détection d'un arrêt brutal en dix minutes : 2 × cadence + 30 s ≤ 600 s", () => {
  assert.ok(2 * CADENCE_MS + 30_000 <= 600_000);
  // Le battement, lui, ne dépasse pas la cadence annoncée à un regard près.
  assert.ok(BATTEMENT_MS <= CADENCE_MS + REGARD_MS);
});

test("presence.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);

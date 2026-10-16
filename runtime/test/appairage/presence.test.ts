// La présence de la station sur GitHub et son appairage, contre un GitHub en
// mémoire : ce qu'elle publie, le code qu'elle affiche, ce qu'elle fait de
// l'appairage que l'app écrit. Le vrai `gh` se prouve dans `canal.test.ts`.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import type { Canal, Fichiers } from "../../src/appairage/canal.ts";
import { empreinte, FICHIER_APPAIRAGE, FICHIER_STATION, normaliser, tirerCode, type DocumentStation, type EtatsPublies } from "../../src/appairage/document.ts";
import { etatsPublies } from "../../src/appairage/etats.ts";
import { codeAffiche, FICHIER_LOCAL, tenirPresence } from "../../src/appairage/presence.ts";
import type { ConnexionMax } from "../../src/connexion-max/connexion.ts";
import type { EtatMiseAJour } from "../../src/mise-a-jour/etat.ts";
import { LimiteAtteinte } from "../../src/limite-github.ts";
import { aArreter, jusqua, repertoireTemporaire, temporaireDuFichier } from "../outils.ts";

const rienNeReste = temporaireDuFichier();

// Les gists du compte, en mémoire. `panne` : ce que le prochain appel lève.
function fauxGists() {
  const gists = new Map<string, { description: string; fichiers: Fichiers }>();
  let rang = 0;
  const etat = { panne: null as string | null, limite: null as string | null };
  const tomber = () => {
    if (etat.limite !== null) throw new LimiteAtteinte(etat.limite);
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

function unePresence(t: TestContext, options: { regardMs?: number; cadenceMs?: number; racine?: string; projets?: string[]; dureeDuCodeMs?: number; etats?: () => EtatsPublies } = {}) {
  const racine = options.racine ?? repertoireTemporaire(t);
  const github = fauxGists();
  const lignes: string[] = [];
  let instant = Date.parse("2026-10-15T12:00:00Z");
  const presence = tenirPresence({
    racine,
    canal: github.canal,
    identite: { nom: "box", machine: "Linux 6.1.0", version: "1.4.0" },
    projets: () => options.projets ?? [],
    ...(options.etats === undefined ? {} : { etats: options.etats }),
    dire: (ligne) => lignes.push(ligne),
    // Le minuteur ne bat pas pendant un test : c'est lui qui bat la mesure.
    cadenceMs: options.cadenceMs ?? 3_600_000,
    ...(options.regardMs === undefined ? {} : { regardMs: options.regardMs }),
    dureeDuCodeMs: options.dureeDuCodeMs ?? 15 * 60_000,
    maintenant: () => instant,
  });
  aArreter(t, () => presence.arreter());
  return { racine, github, lignes, presence, avancer: (ms: number) => (instant += ms) };
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
  const { github, lignes, presence, racine } = unePresence(t);
  await presence.publier();
  assert.equal(github.gists.size, 1);
  const [id, gist] = [...github.gists][0] ?? assert.fail("aucun gist");
  assert.equal(gist?.description, "brigade — station box");
  const doc = github.document(id ?? "");
  const code = presence.code();
  assert.ok(code);
  assert.deepEqual(
    { ...doc, signeDeVie: "", appairage: { ...doc.appairage, expireLe: "" } },
    { brigade: "station", format: 1, nom: "box", machine: "Linux 6.1.0", version: "1.4.0", projets: [], signeDeVie: "", cadenceMs: 3_600_000, arreteeLe: null, appairage: { empreinte: empreinte(code), expireLe: "" }, echus: [], miseAJour: null, connexionMax: null },
  );
  assert.equal(doc.appairage?.expireLe, "2026-10-15T12:15:00.000Z");
  // Le code ne se publie que par son empreinte.
  assert.ok(!JSON.stringify([...github.gists.values()]).includes(code.replace("-", "")));
  assert.ok(!JSON.stringify([...github.gists.values()]).includes(code));
  assert.equal(lignes.filter((ligne) => ligne.includes(code)).length, 1, lignes.join("\n"));
  assert.match(lignes.find((ligne) => ligne.includes(code)) ?? "", /^brigade : station à appairer — tape ce code dans l'app : [0-9A-Z]{4}-[0-9A-Z]{4} \(valable jusqu'à /);
  assert.equal(codeAffiche(racine), code);
  // Un signe de vie de plus ne crée rien, et ne redit pas le code.
  await presence.publier();
  assert.equal(github.gists.size, 1);
  assert.equal(lignes.filter((ligne) => ligne.includes(code)).length, 1);
});

test("l'état publié dit les projets servis et rafraîchit le signe de vie à chaque publication", async (t) => {
  const { github, presence, avancer } = unePresence(t, { projets: ["brigade", "espace"] });
  await presence.publier();
  const id = [...github.gists.keys()][0] ?? "";
  assert.deepEqual(github.document(id).projets, ["brigade", "espace"]);
  const avant = github.document(id).signeDeVie;
  avancer(60_000);
  await presence.publier();
  assert.equal(Date.parse(github.document(id).signeDeVie) - Date.parse(avant), 60_000);
});

test("l'état publié porte ses pannes : la mise à jour revenue en arrière et la connexion Max, à chaque signe de vie", async (t) => {
  let etats: EtatsPublies = { miseAJour: null, connexionMax: { etat: "connectee", depuis: "2026-10-15T08:00:00.000Z" } };
  const { github, presence } = unePresence(t, { etats: () => etats });
  await presence.publier();
  const id = [...github.gists.keys()][0] ?? "";
  assert.deepEqual({ miseAJour: github.document(id).miseAJour, connexionMax: github.document(id).connexionMax }, etats);
  etats = { miseAJour: { visee: "1.5.0", restauree: "1.4.0", le: "2026-10-15T11:58:00.000Z", retourRate: false }, connexionMax: { etat: "perdue", depuis: "2026-10-15T11:50:00.000Z" } };
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
  const { github, lignes, presence, racine } = unePresence(t);
  await presence.publier();
  const id = [...github.gists.keys()][0] ?? "";
  github.appairer(id, presence.code() ?? "");
  await presence.publier();
  assert.equal(presence.code(), null);
  assert.equal(codeAffiche(racine), null);
  assert.equal(github.document(id).appairage, null);
  assert.deepEqual(github.document(id).echus, []);
  assert.ok(lignes.some((ligne) => ligne.startsWith("brigade : station appairée à l'app")), lignes.join("\n"));
  assert.equal(JSON.parse(readFileSync(join(racine, FICHIER_LOCAL), "utf8")).appairee, true);
});

test("un appairage écrit pour un code que la station n'a jamais tiré n'est pas pris", async (t) => {
  const { github, presence } = unePresence(t);
  await presence.publier();
  const id = [...github.gists.keys()][0] ?? "";
  const code = presence.code();
  github.appairer(id, code === "AAAA-AAAA" ? "BBBB-BBBB" : "AAAA-AAAA");
  await presence.publier();
  assert.equal(presence.code(), code);
});

test("un code échu en tire un autre, et l'empreinte de l'ancien reste publiée comme échue", async (t) => {
  const { github, lignes, presence, avancer } = unePresence(t, { dureeDuCodeMs: 60_000 });
  await presence.publier();
  const id = [...github.gists.keys()][0] ?? "";
  const premier = presence.code() ?? "";
  avancer(60_000);
  await presence.publier();
  const second = presence.code() ?? "";
  assert.notEqual(second, premier);
  assert.deepEqual(github.document(id).echus, [empreinte(premier)]);
  assert.equal(github.document(id).appairage?.empreinte, empreinte(second));
  assert.ok(lignes.some((ligne) => ligne.includes(second)));
  // L'app qui a lu le premier juste avant qu'il n'échoie appaire quand même.
  github.appairer(id, premier);
  await presence.publier();
  assert.equal(presence.code(), null);
});

test("redémarrée, la station garde son gist, son code et son appairage", async (t) => {
  const racine = repertoireTemporaire(t);
  const premiere = unePresence(t, { racine });
  await premiere.presence.publier();
  const code = premiere.presence.code();
  await premiere.presence.arreter();
  const id = [...premiere.github.gists.keys()][0] ?? "";
  assert.ok(premiere.github.document(id).arreteeLe);

  // Le même GitHub, une station relancée.
  const lignes: string[] = [];
  const relancee = tenirPresence({ racine, canal: premiere.github.canal, identite: { nom: "box", machine: "Linux 6.1.0", version: "1.4.1" }, projets: () => [], dire: (ligne) => lignes.push(ligne), cadenceMs: 3_600_000, maintenant: () => Date.parse("2026-10-15T12:01:00Z") });
  aArreter(t, () => relancee.arreter());
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
  avancer(5_000);
  await presence.arreter();
  const doc = github.document(id);
  assert.equal(doc.arreteeLe, doc.signeDeVie);
  avancer(60_000);
  await presence.publier();
  assert.equal(github.document(id).signeDeVie, doc.signeDeVie);
});

test("son gist supprimé, la station en crée un autre et se fait appairer de nouveau", async (t) => {
  const { github, lignes, presence } = unePresence(t);
  await presence.publier();
  const id = [...github.gists.keys()][0] ?? "";
  github.appairer(id, presence.code() ?? "");
  await presence.publier();
  assert.equal(presence.code(), null);
  github.gists.delete(id);
  await presence.publier();
  assert.equal(github.gists.size, 1);
  assert.notEqual([...github.gists.keys()][0], id);
  assert.ok(presence.code());
  assert.ok(lignes.some((ligne) => ligne.includes("son gist a disparu de GitHub")), lignes.join("\n"));
});

test("GitHub injoignable : la panne est dite une fois, le retour aussi, et rien n'est perdu", async (t) => {
  const { github, lignes, presence } = unePresence(t);
  github.etat.panne = "gh: error connecting to api.github.com";
  await presence.publier();
  await presence.publier();
  assert.equal(lignes.filter((ligne) => ligne.includes("n'est pas publié sur GitHub")).length, 1, lignes.join("\n"));
  // Tant que rien n'est publié, aucun code n'est affiché : l'app ne le trouverait pas.
  assert.equal(presence.code(), null);
  assert.ok(!lignes.some((ligne) => ligne.includes("à appairer")));
  github.etat.panne = null;
  await presence.publier();
  assert.equal(github.gists.size, 1);
  assert.ok(lignes.some((ligne) => ligne.includes("GitHub répond de nouveau")));
  assert.ok(lignes.some((ligne) => ligne.includes("à appairer")));
});

test("la station ne republie son état que s'il change, et au moins une fois par battement", async (t) => {
  const projets = ["brigade"];
  const { github, presence, avancer } = unePresence(t, { projets, regardMs: 20, cadenceMs: 300_000 });
  await presence.publier();
  // Appairée : plus rien d'autre que les projets ne bouge.
  const id = [...github.gists.keys()][0] ?? "";
  github.appairer(id, presence.code() ?? "");
  const ecritures = { n: 0 };
  const ecrire = github.canal.ecrire.bind(github.canal);
  github.canal.ecrire = async (...args) => (ecritures.n++, ecrire(...args));
  await jusqua(() => presence.code() === null);
  await presence.publier();
  const base = ecritures.n;
  // Plusieurs regards, rien n'a changé : aucune écriture.
  await new Promise((resoudre) => setTimeout(resoudre, 150));
  assert.equal(ecritures.n, base);
  // Un projet de plus : écrit au regard suivant, sans attendre le battement.
  projets.push("espace");
  await jusqua(() => github.document(id).projets.length === 2);
  assert.equal(ecritures.n, base + 1);
  // Le battement passé : le signe de vie est rafraîchi, rien n'ayant changé.
  const avant = github.document(id).signeDeVie;
  avancer(300_000);
  await jusqua(() => github.document(id).signeDeVie !== avant);
  assert.equal(ecritures.n, base + 2);
});

test("GitHub limite les appels : la station le dit une fois, avec l'heure de reprise, puis reprend", async (t) => {
  const { github, lignes, presence } = unePresence(t);
  await presence.publier();
  const id = [...github.gists.keys()][0] ?? "";
  github.etat.limite = "GitHub limite les appels, reprise vers 13:00";
  await presence.publier();
  await presence.publier();
  assert.equal(lignes.filter((ligne) => ligne.includes("reprise vers 13:00")).length, 1, lignes.join("\n"));
  github.etat.limite = null;
  await presence.publier();
  assert.ok(lignes.some((ligne) => ligne.includes("GitHub répond de nouveau")));
  assert.ok(github.document(id));
});

test("presence.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);

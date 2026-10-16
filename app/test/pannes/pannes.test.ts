// Les pannes d'une station, dites sur sa ligne de la home : chacune en une ligne, avec un bouton,
// lues dans ce que la station publie sur GitHub — et jamais une commande à taper.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { jouerPanne, type RenduDePanne } from "../../src/pannes/gestes.ts";
import { lireEtatsPublies } from "../../src/pannes/etats.ts";
import { INJOIGNABLE_APRES_MS, pannesDe, type Panne } from "../../src/pannes/pannes.ts";
import { FICHIER_APPAIRAGE, FICHIER_STATION, lireDocument, type DocumentStation } from "../../src/stations/document.ts";
import { githubDesStations } from "../../src/stations/github.ts";
import { tenirStations } from "../../src/stations/stations.ts";

const MAINTENANT = Date.parse("2026-10-15T12:00:00Z");
const il_y_a = (ms: number) => new Date(MAINTENANT - ms).toISOString();
const MIN = 60_000;

// Ce que la station publie (runtime/src/appairage/presence.ts), en ligne et sans panne.
const document = (champs: Partial<DocumentStation> = {}): DocumentStation => ({
  nom: "box",
  machine: "Linux 6.1.0",
  version: "1.4.0",
  projets: ["brigade"],
  signeDeVie: il_y_a(10_000),
  cadenceMs: 60_000,
  arreteeLe: null,
  appairage: null,
  echus: [],
  miseAJour: null,
  connexionMax: { etat: "connectee", depuis: il_y_a(3 * 3_600_000) },
  ...champs,
});

const ETEINTE = document({ signeDeVie: il_y_a(INJOIGNABLE_APRES_MS) });
const REVENUE = document({ miseAJour: { visee: "1.5.0", restauree: "1.4.0", le: il_y_a(4 * MIN), retourRate: false } });
const PERDUE = document({ connexionMax: { etat: "perdue", depuis: il_y_a(12 * MIN) } });

// Ce qui, dans une ligne de l'app, serait une commande à taper dans un terminal.
const COMMANDES = [
  /`/,
  /\$ /,
  /(^|\s)(sudo|systemctl|journalctl|apt|apt-get|dpkg|ssh|gh|npm|node|git|curl|bash|sh|runuser|brigade)\s/i,
  /\bclaude\s+(auth|\/login|login|-p)\b/i,
  /\/login\b/,
  /(^|\s)--?[a-z]/,
  /\/(usr|var|etc|opt|home)\//,
  /\|\s*\w/,
];
const sansCommande = (texte: string) => {
  for (const motif of COMMANDES) assert.doesNotMatch(texte, motif, `« ${texte} » montre une commande`);
};
const textesDe = (pannes: Panne[]) => pannes.flatMap(({ ligne, bouton }) => [ligne, bouton.libelle]);

test("une station éteinte depuis 10 minutes : « box has given no sign of life for 10 min », avec un bouton qui relit GitHub", () => {
  assert.deepEqual(pannesDe(ETEINTE, MAINTENANT), [{ cle: "injoignable", sujet: "injoignable", ligne: "box has given no sign of life for 10 min", bouton: { libelle: "check again", geste: "relire" } }]);
  // Arrêtée proprement il y a dix minutes : la même panne, comptée depuis son arrêt.
  assert.equal(pannesDe(document({ signeDeVie: il_y_a(11 * MIN), arreteeLe: il_y_a(10 * MIN) }), MAINTENANT)[0]?.ligne, "box has given no sign of life for 10 min");
  assert.equal(pannesDe(document({ signeDeVie: il_y_a(3 * 3_600_000 + 5 * MIN) }), MAINTENANT)[0]?.ligne, "box has given no sign of life for 3 h 05");
});

test("hors ligne depuis moins de dix minutes — un redémarrage, une mise à jour —, ce n'est pas une panne", () => {
  assert.deepEqual(pannesDe(document({ signeDeVie: il_y_a(INJOIGNABLE_APRES_MS - 1_000) }), MAINTENANT), []);
  assert.deepEqual(pannesDe(document({ arreteeLe: il_y_a(5_000) }), MAINTENANT), []);
  // Une station qui ne donne signe de vie que toutes les heures n'est pas en retard à dix minutes.
  assert.deepEqual(pannesDe(document({ cadenceMs: 3_600_000, signeDeVie: il_y_a(20 * MIN) }), MAINTENANT), []);
  assert.deepEqual(pannesDe(document(), MAINTENANT), []);
});

test("une mise à jour ratée et revenue en arrière : « update to version X failed — stayed on version Y », que le bouton écarte", () => {
  assert.deepEqual(pannesDe(REVENUE, MAINTENANT), [{ cle: `mise-a-jour:${il_y_a(4 * MIN)}`, sujet: "mise-a-jour", ligne: "update to version 1.5.0 failed — stayed on version 1.4.0", bouton: { libelle: "dismiss", geste: "ecarter" } }]);
  const rate = document({ miseAJour: { visee: "1.5.0", restauree: "1.4.0", le: il_y_a(4 * MIN), retourRate: true } });
  assert.equal(pannesDe(rate, MAINTENANT)[0]?.ligne, "update to version 1.5.0 failed, and going back to version 1.4.0 failed too");
});

test("la connexion Max perdue : une ligne, et un bouton qui lance le login ; hors ligne, la station ne dit plus sa connexion", () => {
  assert.deepEqual(pannesDe(PERDUE, MAINTENANT), [{ cle: `connexion-max:${il_y_a(12 * MIN)}`, sujet: "connexion-max", ligne: "Max connection lost 12 min ago — nothing cooks on box until you log in", bouton: { libelle: "log in", geste: "login" } }]);
  assert.equal(pannesDe(document({ connexionMax: { etat: "perdue", depuis: null } }), MAINTENANT)[0]?.ligne, "Max connection lost — nothing cooks on box until you log in");
  assert.deepEqual(pannesDe(document({ connexionMax: { etat: "inconnue", depuis: null } }), MAINTENANT), []);
  assert.deepEqual(
    pannesDe({ ...PERDUE, signeDeVie: il_y_a(INJOIGNABLE_APRES_MS) }, MAINTENANT).map(({ sujet }) => sujet),
    ["injoignable"],
  );
});

test("ce que la station publie de ses pannes se lit ; d'avant ces champs, ou mal écrit, il n'en est rien dit", () => {
  const brut = { brigade: "station", nom: "box", machine: "Linux 6.1.0", version: "1.4.0", projets: [], signeDeVie: il_y_a(0), cadenceMs: 60_000 };
  const lu = lireDocument(JSON.stringify({ ...brut, miseAJour: { visee: "1.5.0", restauree: "1.4.0", le: il_y_a(0), retourRate: false }, connexionMax: { etat: "perdue", depuis: il_y_a(0) } }));
  assert.ok(!("illisible" in lu));
  assert.deepEqual({ miseAJour: lu.miseAJour, connexionMax: lu.connexionMax }, { miseAJour: { visee: "1.5.0", restauree: "1.4.0", le: il_y_a(0), retourRate: false }, connexionMax: { etat: "perdue", depuis: il_y_a(0) } });
  assert.deepEqual(lireEtatsPublies(brut), { miseAJour: null, connexionMax: null });
  // Une « version » qui n'en est pas une ne se pose dans aucune ligne.
  assert.equal(lireEtatsPublies({ miseAJour: { visee: "1.5.0; sudo apt install", restauree: "1.4.0", le: il_y_a(0) } }).miseAJour, null);
  assert.equal(lireEtatsPublies({ connexionMax: { etat: "fermee", depuis: il_y_a(0) } }).connexionMax, null);
  assert.deepEqual(lireEtatsPublies({ connexionMax: { etat: "perdue", depuis: "hier" } }).connexionMax, { etat: "perdue", depuis: null });
});

// Les gists du compte, tels que la doublure de `gh` les tient : une station appairée qui publie `doc`.
function unGitHub(t: TestContext, doc: DocumentStation) {
  const repertoire = mkdtempSync(join(tmpdir(), "brigade-app-pannes-"));
  writeFileSync(join(repertoire, "appels"), "");
  const avant = process.env.FAUX_GISTS;
  process.env.FAUX_GISTS = repertoire;
  t.after(() => {
    if (avant === undefined) delete process.env.FAUX_GISTS;
    else process.env.FAUX_GISTS = avant;
    rmSync(repertoire, { recursive: true, force: true });
  });
  const files = { [FICHIER_STATION]: { filename: FICHIER_STATION, content: JSON.stringify({ brigade: "station", format: 1, ...doc }) }, [FICHIER_APPAIRAGE]: { filename: FICHIER_APPAIRAGE, content: "{}" } };
  writeFileSync(join(repertoire, "box1.gist.json"), JSON.stringify({ id: "box1", description: "brigade — station box", public: false, updated_at: "2026-10-15T11:59:00Z", files }));
  const stations = tenirStations({ github: githubDesStations({ gh: join(import.meta.dirname, "../stations/faux-gh-gists.ts"), delaiMs: 30_000 }), surLecture: () => {}, cadenceMs: 3_600_000, maintenant: () => MAINTENANT });
  t.after(() => stations.fermer());
  return stations;
}

test("lue sur GitHub, chaque panne est sur la ligne de sa station ; écartée, elle n'y revient pas", async (t) => {
  const stations = unGitHub(t, { ...REVENUE, connexionMax: PERDUE.connexionMax });
  const [box] = (await stations.relire()).stations;
  assert.deepEqual(box?.pannes.map(({ sujet }) => sujet), ["mise-a-jour", "connexion-max"]);
  stations.ecarter("box1", box?.pannes[0]?.cle ?? "");
  assert.deepEqual(stations.vu()?.stations[0]?.pannes.map(({ sujet }) => sujet), ["connexion-max"]);
  assert.deepEqual((await stations.relire()).stations[0]?.pannes.map(({ sujet }) => sujet), ["connexion-max"]);
});

test("aucun message de panne n'affiche une commande de terminal : les trois cas, leurs boutons et ce que chacun rend", async () => {
  const cas = [ETEINTE, REVENUE, PERDUE, document({ miseAJour: { visee: "1.5.0", restauree: "1.4.0", le: il_y_a(0), retourRate: true } }), document({ connexionMax: { etat: "perdue", depuis: null } })];
  const pannes = cas.flatMap((doc) => pannesDe(doc, MAINTENANT));
  assert.deepEqual([...new Set(pannes.map(({ sujet }) => sujet))].sort(), ["connexion-max", "injoignable", "mise-a-jour"]);
  for (const texte of textesDe(pannes)) sansCommande(texte);

  // Et ce que chaque bouton rend, sur chaque station : fait ou refusé, une ligne sans commande.
  const rendus: RenduDePanne[] = [];
  for (const doc of cas) {
    for (const locale of [true, false]) {
      for (const relu of [doc, document()]) {
        const vue = { id: "g1", nom: doc.nom, machine: doc.machine, etat: "en-ligne" as const, ligne: "", pannes: pannesDe(doc, MAINTENANT), dit: "online", version: doc.version, projets: doc.projets, max: null };
        const options = {
          stations: {
            vu: () => ({ a: "", stations: [vue] }),
            relire: async () => ({ a: "", stations: [{ ...vue, pannes: pannesDe(relu, MAINTENANT) }] }),
            ecarter: () => undefined,
          },
          stationLocale: () => (locale ? "g1" : null),
          login: async () => {
            const { LANCE } = await import("../../src/pannes/login.ts");
            return { fait: LANCE };
          },
        };
        for (const panne of vue.pannes) rendus.push(await jouerPanne(options, "g1", panne.cle));
      }
    }
  }
  rendus.push(await jouerPanne({ stations: { vu: () => undefined, relire: async () => ({ a: "", stations: [] }), ecarter: () => undefined }, stationLocale: () => null, login: async () => ({ fait: "" }) }, "g1", "injoignable"));
  assert.ok(rendus.length > 10);
  for (const rendu of rendus) sansCommande("fait" in rendu ? rendu.fait : rendu.refus);
});

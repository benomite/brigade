// Un passage de la mise à jour, sur une machine tenue en mémoire : ce qu'elle
// installe, ce qu'elle garde, ce qui la retient, et ce qu'elle dit. La machine
// d'essai complète — vrais paquets, vrai postinst — est dans machine.test.ts.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { annoncerEnService } from "../../src/mise-a-jour/en-service.ts";
import { ecrireEtatMiseAJour, lireEtatMiseAJour, lireIssues } from "../../src/mise-a-jour/etat.ts";
import { passer } from "../../src/mise-a-jour/mettre-a-jour.ts";
import type { Publication, Publications } from "../../src/mise-a-jour/publications.ts";
import type { Systeme } from "../../src/mise-a-jour/systeme.ts";
import { repertoireTemporaire } from "../outils.ts";

// Ce que fait la station relancée sur une version : elle se dit en service en
// servant ces projets — ou elle tombe.
type Demarrage = { servis: string[]; refuses?: Record<string, string> } | "tombe" | "muette";

// Une machine où le paquet installé est noté, et où la station « démarre »
// selon `demarrage` : elle écrit ce qu'elle dit d'elle-même, comme la vraie.
function machine(t: TestContext, version: string, demarrage: (version: string) => Demarrage = () => ({ servis: [] })) {
  let installee: string | null = version;
  const racine = repertoireTemporaire(t);
  const dossier = join(repertoireTemporaire(t), "mise-a-jour");
  const installations: string[] = [];
  let pid = 100;
  let actif = "active";
  let refus: string | null = null;
  const demarrer = (version: string) => {
    pid++;
    const quoi = demarrage(version);
    if (quoi === "tombe") return void (actif = "failed");
    actif = "active";
    if (quoi === "muette") return;
    const arreter = annoncerEnService(racine, () => ({ servis: quoi.servis, refuses: quoi.refuses ?? {} }), { version, pid });
    arreter();
  };
  demarrer(version);
  const systeme: Systeme = {
    installee: () => installee,
    lirePaquet: (fichier) => {
      const [paquet = "", version = ""] = readFileSync(fichier, "utf8").split(" ");
      return { paquet, version };
    },
    installer: (fichier) => {
      const { version } = systeme.lirePaquet(fichier) ?? { version: "" };
      installations.push(version);
      if (refus !== null) return { ok: false, motif: refus };
      installee = version;
      demarrer(version);
      return { ok: true };
    },
    service: () => ({ actif, pid: actif === "active" ? pid : 0, redemarrages: 0 }),
  };
  return {
    racine,
    dossier,
    systeme,
    installations,
    refuserLesInstallations: (motif: string | null) => void (refus = motif),
    // Ce que dpkg dit du paquet, sans rien installer : nul s'il est à moitié posé.
    dpkg: (version: string | null) => void (installee = version),
    reglages: (texte: string) => writeFileSync(join(racine, "reglages"), texte),
    configurer: (texte: string) => writeFileSync(join(racine, "projets"), texte),
  };
}

// Des versions publiées, chacune avec son paquet : un fichier qui dit ce qu'il est.
function publiees(versions: string[], options: { illisibles?: string; autrePaquet?: string } = {}): Publications & { telecharges: string[] } {
  const telecharges: string[] = [];
  return {
    nom: "les publications d'essai",
    telecharges,
    async lister(): Promise<Publication[]> {
      if (options.illisibles) throw new Error(options.illisibles);
      return versions.map((version) => ({ version, paquet: `essai:${version}`, empreinte: null }));
    },
    async telecharger(publication, fichier) {
      telecharges.push(publication.version);
      writeFileSync(fichier, options.autrePaquet === publication.version ? `autre-chose ${publication.version}` : `brigade-station ${publication.version}`);
    },
  };
}

function passage(m: ReturnType<typeof machine>, publications: Publications, dites: string[] = []) {
  return passer({ racine: m.racine, dossier: m.dossier, systeme: m.systeme, publications, dire: (ligne) => dites.push(ligne), gardeMs: 2000, pasMs: 5 });
}

test("une version plus récente publiée est installée, et gardée quand la station s'y dit en service ; le paquet d'avant reste de côté", async (t) => {
  const m = machine(t, "1.0.0");
  const dites: string[] = [];
  const { etat, issue } = await passage(m, publiees(["0.9.0", "1.0.0", "1.1.0~rc1", "1.1.0"]), dites);
  assert.deepEqual(m.installations, ["1.1.0"]);
  assert.equal(issue?.quoi, "passee");
  assert.deepEqual(issue?.quoi === "passee" && [issue.version, issue.depuis], ["1.1.0", "1.0.0"]);
  assert.deepEqual([etat.installee, etat.disponible, etat.gelee, etat.retenue, etat.verification], ["1.1.0", "1.1.0", false, null, null]);
  assert.deepEqual(lireIssues(m.dossier), [issue]);
  assert.deepEqual(lireEtatMiseAJour(m.dossier), etat);
  assert.ok(dites.includes("brigade : mise à jour — passée en version 1.1.0"), dites.join("\n"));
  // Le paquet de 1.0.0, pour revenir en arrière la prochaine fois, et celui de 1.1.0.
  assert.equal(readFileSync(join(m.dossier, "paquets/1.0.0.deb"), "utf8"), "brigade-station 1.0.0");
  assert.equal(readFileSync(join(m.dossier, "paquets/1.1.0.deb"), "utf8"), "brigade-station 1.1.0");
});

test("à jour, rien n'est installé ni téléchargé", async (t) => {
  const m = machine(t, "1.1.0");
  const publications = publiees(["1.0.0", "1.1.0"]);
  const { etat, issue } = await passage(m, publications);
  assert.deepEqual([m.installations, publications.telecharges, issue], [[], [], null]);
  assert.deepEqual([etat.installee, etat.disponible], ["1.1.0", "1.1.0"]);
});

test("gelée, une version plus récente n'est pas installée, et l'état le dit ; le gel levé, elle l'est", async (t) => {
  const m = machine(t, "1.0.0");
  m.reglages("gel=oui\n");
  const { etat } = await passage(m, publiees(["1.0.0", "1.1.0"]));
  assert.deepEqual(m.installations, []);
  assert.deepEqual([etat.gelee, etat.disponible, etat.retenue], [true, "1.1.0", "version gelée en 1.0.0 : 1.1.0 attend que le gel soit levé"]);
  m.reglages("gel=non\n");
  assert.equal((await passage(m, publiees(["1.0.0", "1.1.0"]))).issue?.quoi, "passee");
  assert.deepEqual(m.installations, ["1.1.0"]);
});

test("un gel mal écrit gèle : dans le doute, rien n'est installé, et la ligne est dite", async (t) => {
  const m = machine(t, "1.0.0");
  m.reglages("gel=peut-être\n");
  const dites: string[] = [];
  const { etat } = await passage(m, publiees(["1.0.0", "1.1.0"]), dites);
  assert.deepEqual([m.installations, etat.gelee], [[], true]);
  assert.ok(dites.some((ligne) => ligne.includes("gel=peut-être — attendu oui ou non ; dans le doute, la version reste gelée")), dites.join("\n"));
});

test("une version qui ne démarre pas : le paquet d'avant est réinstallé, la station revient dessus, et l'issue le dit ; elle n'est pas réessayée, la suivante l'est", async (t) => {
  const m = machine(t, "1.0.0", (version) => (version === "1.1.0" ? "tombe" : { servis: [] }));
  const { etat, issue } = await passage(m, publiees(["1.0.0", "1.1.0"]));
  assert.deepEqual(m.installations, ["1.1.0", "1.0.0"]);
  assert.deepEqual(issue && { ...issue, le: "" }, { quoi: "revenue", visee: "1.1.0", restauree: "1.0.0", motif: "la station s'est arrêtée en échec en 1.1.0 (systemd : failed)", le: "", retour: null });
  assert.deepEqual([etat.installee, etat.ratees], ["1.0.0", ["1.1.0"]]);

  const encore = await passage(m, publiees(["1.0.0", "1.1.0"]));
  assert.deepEqual(m.installations, ["1.1.0", "1.0.0"]);
  assert.equal(encore.etat.retenue, "1.1.0 n'a pas démarré à son essai : elle n'est pas réessayée, la version publiée après elle le sera — 1.0.0 reste en service");

  assert.equal((await passage(m, publiees(["1.0.0", "1.1.0", "1.2.0"]))).issue?.quoi, "passee");
  assert.deepEqual(m.installations, ["1.1.0", "1.0.0", "1.2.0"]);
});

test("une station qui tourne sans se dire en service dans la garde n'est pas gardée", async (t) => {
  const m = machine(t, "1.0.0", (version) => (version === "1.1.0" ? "muette" : { servis: [] }));
  const { issue } = await passage(m, publiees(["1.0.0", "1.1.0"]));
  assert.equal(issue?.quoi === "revenue" && issue.motif, "la station ne s'est pas dite en service en 1.1.0 en 2 s (systemd : active)");
});

test("une version qui ne sert plus un projet que la précédente servait n'est pas gardée : le motif nomme le projet et son refus", async (t) => {
  const m = machine(t, "1.0.0", (version) => (version === "1.1.0" ? { servis: ["espace"], refuses: { brigade: "BRIGADE_X n'est pas défini" } } : { servis: ["brigade", "espace"] }));
  m.configurer("brigade acme/brigade v2\nespace acme/espace main\n");
  const { issue } = await passage(m, publiees(["1.0.0", "1.1.0"]));
  assert.equal(issue?.quoi === "revenue" && issue.motif, "le projet brigade n'est plus servi en 1.1.0 : BRIGADE_X n'est pas défini en 2 s (systemd : active)");
  assert.equal(issue?.quoi === "revenue" && issue.retour, null);
});

test("un projet retiré de la configuration entre-temps ne retient pas la nouvelle version", async (t) => {
  const m = machine(t, "1.0.0", (version) => (version === "1.1.0" ? { servis: ["espace"] } : { servis: ["brigade", "espace"] }));
  m.configurer("espace acme/espace main\n");
  assert.equal((await passage(m, publiees(["1.0.0", "1.1.0"]))).issue?.quoi, "passee");
});

test("une installation refusée par apt revient à la version d'avant ; si le retour échoue aussi, l'issue le dit", async (t) => {
  const m = machine(t, "1.0.0");
  m.refuserLesInstallations("apt-get a rendu 100 — « E: Sub-process /usr/bin/dpkg returned an error code (1) »");
  const { issue } = await passage(m, publiees(["1.0.0", "1.1.0"]));
  assert.deepEqual(m.installations, ["1.1.0", "1.0.0"]);
  assert.equal(issue?.quoi === "revenue" && issue.motif, "son installation a échoué : apt-get a rendu 100 — « E: Sub-process /usr/bin/dpkg returned an error code (1) »");
  assert.equal(issue?.quoi === "revenue" && issue.retour, "son installation a échoué : apt-get a rendu 100 — « E: Sub-process /usr/bin/dpkg returned an error code (1) »");
});

test("sans paquet de la version installée pour en revenir, rien n'est installé : l'état dit pourquoi", async (t) => {
  const m = machine(t, "1.0.0");
  const { etat } = await passage(m, publiees(["1.1.0"]));
  assert.deepEqual(m.installations, []);
  assert.equal(etat.retenue, "1.1.0 n'est pas installée : rien ne permettrait de revenir à 1.0.0 si elle ne démarrait pas — aucune publication de 1.0.0, et aucun paquet de côté");
});

test("le paquet d'avant gardé de côté suffit au retour, même dépublié", async (t) => {
  const m = machine(t, "1.0.0", (version) => (version === "1.2.0" ? "tombe" : { servis: [] }));
  await passage(m, publiees(["1.0.0", "1.1.0"]));
  const { issue } = await passage(m, publiees(["1.2.0"]));
  assert.deepEqual(m.installations, ["1.1.0", "1.2.0", "1.1.0"]);
  assert.deepEqual(issue?.quoi === "revenue" && [issue.restauree, issue.retour], ["1.1.0", null]);
});

test("des versions publiées illisibles, ou un paquet publié qui n'est pas le bon : rien n'est installé, l'état dit pourquoi", async (t) => {
  const m = machine(t, "1.0.0");
  const illisibles = await passage(m, publiees([], { illisibles: "GitHub a répondu 503 à la liste des releases de acme/brigade" }));
  assert.equal(illisibles.etat.verification, "les versions publiées ne se lisent pas (les publications d'essai) : GitHub a répondu 503 à la liste des releases de acme/brigade");
  const mauvais = await passage(m, publiees(["1.0.0", "1.1.0"], { autrePaquet: "1.1.0" }));
  assert.equal(mauvais.etat.verification, "le paquet de 1.1.0 ne s'obtient pas : le paquet publié pour 1.1.0 n'est pas celui de brigade-station en 1.1.0 (autre-chose 1.1.0)");
  assert.deepEqual(m.installations, []);
});

test("un paquet qui n'est pas installé tout à fait n'est pas mis à jour", async (t) => {
  const m = machine(t, "1.0.0");
  m.dpkg(null);
  const { etat } = await passage(m, publiees(["1.0.0", "1.1.0"]));
  assert.deepEqual([m.installations, etat.verification], [[], "le paquet brigade-station n'est pas installé tout à fait (dpkg) : rien n'est mis à jour"]);
});

// L'essai que le passage d'avant a noté sans le conclure — la machine a
// redémarré au milieu, la mise à jour a été tuée.
const essaiNote = (dossier: string, essai: { visee: string; depuis: string; servis: string[] }) => {
  mkdirSync(join(dossier, "paquets"), { recursive: true });
  writeFileSync(join(dossier, "paquets", `${essai.depuis}.deb`), `brigade-station ${essai.depuis}`);
  ecrireEtatMiseAJour(dossier, { installee: essai.depuis, disponible: essai.visee, gelee: false, verifieeLe: "2026-10-15T14:00:00.000Z", verification: null, retenue: null, ratees: [], derniere: null, essai });
};

test("un essai interrompu dont la version tourne est conclu au passage suivant : elle est gardée, et l'issue le dit", async (t) => {
  const m = machine(t, "1.1.0", () => ({ servis: ["brigade"] }));
  m.configurer("brigade acme/brigade v2\n");
  essaiNote(m.dossier, { visee: "1.1.0", depuis: "1.0.0", servis: ["brigade"] });
  const publications = publiees(["1.0.0", "1.1.0"]);
  const { etat, issue } = await passage(m, publications);
  assert.deepEqual(issue?.quoi === "passee" && [issue.version, issue.depuis], ["1.1.0", "1.0.0"]);
  assert.deepEqual([m.installations, publications.telecharges, etat.essai], [[], [], null]);
  assert.deepEqual(lireIssues(m.dossier), [issue]);
});

test("un essai interrompu au milieu de l'installation revient à la version d'avant, par le paquet gardé de côté", async (t) => {
  const m = machine(t, "1.0.0");
  essaiNote(m.dossier, { visee: "1.1.0", depuis: "1.0.0", servis: [] });
  m.dpkg(null);
  const { etat, issue } = await passage(m, publiees([], { illisibles: "le réseau n'est pas encore là" }));
  assert.deepEqual(m.installations, ["1.0.0"]);
  assert.deepEqual(issue && { ...issue, le: "" }, { quoi: "revenue", visee: "1.1.0", restauree: "1.0.0", motif: "l'installation de 1.1.0 a été interrompue (dpkg : le paquet n'est pas installé tout à fait)", le: "", retour: null });
  assert.deepEqual([etat.installee, etat.ratees, etat.essai], ["1.0.0", ["1.1.0"], null]);
});

test("un essai noté sans que rien ait été installé est oublié : le passage continue", async (t) => {
  const m = machine(t, "1.0.0");
  essaiNote(m.dossier, { visee: "1.1.0", depuis: "1.0.0", servis: [] });
  const { etat, issue } = await passage(m, publiees(["1.0.0", "1.1.0"]));
  assert.deepEqual([m.installations, issue?.quoi, etat.essai, etat.ratees], [["1.1.0"], "passee", null, []]);
});

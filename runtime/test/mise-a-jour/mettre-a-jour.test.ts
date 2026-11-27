// Un passage de la mise à jour, sur une machine d'essai : de vraies archives
// défaites par le vrai `tar` sous un faux /opt/brigade-station, le vrai lien
// `current`, et un faux gestionnaire de services qui « relance » la station
// sur la version que `current` désigne. Ce qu'elle installe, ce qu'elle garde,
// ce qui la retient, et ce qu'elle dit.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { annoncerEnService } from "../../src/mise-a-jour/en-service.ts";
import { ecrireEtatMiseAJour, lireEtatMiseAJour, lireIssues } from "../../src/mise-a-jour/etat.ts";
import { passer, check } from "../../src/mise-a-jour/mettre-a-jour.ts";
import type { Publication, Publications } from "../../src/mise-a-jour/publications.ts";
import { systemeDeLaMachine, type Gestionnaire } from "../../src/mise-a-jour/systeme.ts";
import { repertoireTemporaire } from "../outils.ts";

// Ce que fait la station relancée sur une version : elle se dit en service en
// servant ces projets — ou elle tombe.
type Demarrage = { servis: string[]; refuses?: Record<string, string> } | "tombe" | "muette";

// Une version posée sous /opt, comme une installation l'a laissée.
function poserVersion(opt: string, version: string) {
  mkdirSync(join(opt, version), { recursive: true });
  writeFileSync(join(opt, version, "install.sh"), "#!/bin/sh\n");
}

// Une machine où `current` désigne `version`, et où la station « démarre »
// selon `demarrage` à chaque relance : elle écrit ce qu'elle dit d'elle-même,
// comme la vraie.
function machine(t: TestContext, version: string, demarrage: (version: string) => Demarrage = () => ({ servis: [] })) {
  const racine = repertoireTemporaire(t);
  const dossier = join(repertoireTemporaire(t), "mise-a-jour");
  const opt = join(repertoireTemporaire(t), "opt");
  const relances: string[] = [];
  let pid = 100;
  let actif = "active";
  let refus: string | null = null;
  const demarrer = () => {
    const courante = readlinkSync(join(opt, "current"));
    relances.push(courante);
    pid++;
    const quoi = demarrage(courante);
    if (quoi === "tombe") return void (actif = "failed");
    actif = "active";
    if (quoi === "muette") return;
    annoncerEnService(racine, () => ({ servis: quoi.servis, refuses: quoi.refuses ?? {} }), { version: courante, pid })();
  };
  const gestionnaire: Gestionnaire = {
    redemarrer: () => {
      if (refus !== null) return { ok: false, motif: refus };
      demarrer();
      return { ok: true };
    },
    etat: () => ({ actif, pid: actif === "active" ? pid : 0, redemarrages: 0 }),
  };
  poserVersion(opt, version);
  symlinkSync(version, join(opt, "current"));
  demarrer();
  relances.length = 0;
  return {
    racine,
    dossier,
    opt,
    systeme: systemeDeLaMachine({ opt, gestionnaire }),
    // Les versions sur lesquelles la station a été relancée, dans l'ordre.
    relances,
    courante: () => readlinkSync(join(opt, "current")),
    posees: () => readdirSync(opt).filter((nom) => nom !== "current" && nom !== "install.log").sort(),
    refuserLesRelances: (motif: string | null) => void (refus = motif),
    reglages: (texte: string) => writeFileSync(join(racine, "reglages"), texte),
    configurer: (texte: string) => writeFileSync(join(racine, "projets"), texte),
  };
}

// Des versions publiées, chacune avec son archive : un vrai tar.gz qui porte
// son `install.sh`, lequel note qu'il a joué en mode mise à jour.
function publiees(t: TestContext, versions: string[], options: { illisibles?: string; sansInstall?: string; installCasse?: string } = {}): Publications & { telecharges: string[] } {
  const telecharges: string[] = [];
  return {
    nom: "les publications d'essai",
    telecharges,
    async lister(): Promise<Publication[]> {
      if (options.illisibles) throw new Error(options.illisibles);
      return versions.map((version) => ({ version, archive: `essai:${version}`, empreinte: null }));
    },
    async telecharger(publication, fichier) {
      telecharges.push(publication.version);
      const contenu = join(repertoireTemporaire(t), publication.version);
      mkdirSync(join(contenu, "runtime"), { recursive: true });
      if (options.sansInstall !== publication.version) {
        writeFileSync(join(contenu, "install.sh"), options.installCasse === publication.version ? "#!/bin/sh\necho disque plein >&2\nexit 3\n" : `#!/bin/sh\necho "${publication.version} $1" >> "$BRIGADE_OPT/install.log"\n`);
      }
      writeFileSync(join(contenu, "runtime", "version"), publication.version);
      const rendu = spawnSync("tar", ["-czf", fichier, "-C", contenu, "."]);
      assert.equal(rendu.status, 0, String(rendu.stderr));
    },
  };
}

function passage(m: ReturnType<typeof machine>, publications: Publications, dites: string[] = [], options: { maintenant?: () => Date } = {}) {
  return passer({ racine: m.racine, dossier: m.dossier, systeme: m.systeme, publications, dire: (ligne) => dites.push(ligne), gardeMs: 2000, pasMs: 5, ...options });
}

test("une version publiée s'installe au passage suivant, quel que soit le temps écoulé depuis la dernière installation (#4420)", async (t) => {
  const m = machine(t, "1.0.0");
  let heure = Date.now();
  const maintenant = () => new Date(heure);
  const passee = Date.parse((await passage(m, publiees(t, ["1.0.0", "1.1.0"]), [], { maintenant })).issue?.le ?? "");
  heure = passee + 60_000;
  const { etat, issue } = await passage(m, publiees(t, ["1.0.0", "1.1.0", "1.2.0"]), [], { maintenant });
  assert.equal(issue?.quoi, "passee");
  assert.equal(etat.retenue, null);
  assert.deepEqual(m.relances, ["1.1.0", "1.2.0"]);
});

test("une version plus récente publiée est défaite sous /opt, son install.sh joué en mise à jour, `current` basculé et la station relancée ; la version d'avant reste posée", async (t) => {
  const m = machine(t, "1.0.0");
  const dites: string[] = [];
  const { etat, issue } = await passage(m, publiees(t, ["0.9.0", "1.0.0", "1.1.0~rc1", "1.1.0"]), dites);
  assert.equal(issue?.quoi, "passee");
  assert.deepEqual(issue?.quoi === "passee" && [issue.version, issue.depuis], ["1.1.0", "1.0.0"]);
  // Défaite, et rafraîchie par l'install.sh de la version, en mode mise à jour.
  assert.equal(readFileSync(join(m.opt, "1.1.0/runtime/version"), "utf8"), "1.1.0");
  assert.equal(readFileSync(join(m.opt, "install.log"), "utf8"), "1.1.0 --update\n");
  // Basculée, et relancée une fois, sur la nouvelle version.
  assert.equal(m.courante(), "1.1.0");
  assert.deepEqual(m.relances, ["1.1.0"]);
  assert.deepEqual([etat.installee, etat.disponible, etat.gelee, etat.retenue, etat.verification], ["1.1.0", "1.1.0", false, null, null]);
  assert.deepEqual(lireIssues(m.dossier), [issue]);
  assert.deepEqual(lireEtatMiseAJour(m.dossier), etat);
  assert.ok(dites.includes("brigade : mise à jour — passée en version 1.1.0"), dites.join("\n"));
  assert.deepEqual(m.posees(), ["1.0.0", "1.1.0"]);
  // L'archive téléchargée n'est pas gardée.
  assert.deepEqual(readdirSync(join(m.dossier, "archives")), []);
});

test("les deux dernières versions sont gardées, les plus anciennes effacées", async (t) => {
  const m = machine(t, "1.0.0");
  await passage(m, publiees(t, ["1.1.0"]));
  await passage(m, publiees(t, ["1.2.0"]));
  assert.deepEqual([m.courante(), m.posees()], ["1.2.0", ["1.1.0", "1.2.0"]]);
});

test("à jour, rien n'est installé ni téléchargé", async (t) => {
  const m = machine(t, "1.1.0");
  const publications = publiees(t, ["1.0.0", "1.1.0"]);
  const { etat, issue } = await passage(m, publications);
  assert.deepEqual([m.relances, publications.telecharges, issue], [[], [], null]);
  assert.deepEqual([etat.installee, etat.disponible], ["1.1.0", "1.1.0"]);
});

test("`--check` dit la version qu'un passage installerait, sans rien changer", async (t) => {
  const m = machine(t, "1.0.0");
  const publications = publiees(t, ["1.0.0", "1.1.0"]);
  const dit = await check({ racine: m.racine, dossier: m.dossier, systeme: m.systeme, publications });
  assert.equal(dit, "installerait la version 1.1.0 (installée : 1.0.0)");
  assert.deepEqual([m.courante(), m.posees(), m.relances, publications.telecharges, existsSync(m.dossier)], ["1.0.0", ["1.0.0"], [], [], false]);
  m.reglages("gel=oui\n");
  assert.equal(await check({ racine: m.racine, dossier: m.dossier, systeme: m.systeme, publications }), "version gelée en 1.0.0 : 1.1.0 attend que le gel soit levé");
  assert.equal(await check({ racine: m.racine, dossier: m.dossier, systeme: m.systeme, publications: publiees(t, ["1.0.0"]) }), "à jour en 1.0.0");
});

test("gelée, une version plus récente n'est pas installée, et l'état le dit ; le gel levé, elle l'est", async (t) => {
  const m = machine(t, "1.0.0");
  m.reglages("gel=oui\n");
  const { etat } = await passage(m, publiees(t, ["1.0.0", "1.1.0"]));
  assert.deepEqual(m.relances, []);
  assert.deepEqual([etat.gelee, etat.disponible, etat.retenue], [true, "1.1.0", "version gelée en 1.0.0 : 1.1.0 attend que le gel soit levé"]);
  m.reglages("gel=non\n");
  assert.equal((await passage(m, publiees(t, ["1.0.0", "1.1.0"]))).issue?.quoi, "passee");
  assert.deepEqual(m.relances, ["1.1.0"]);
});

test("un gel mal écrit gèle : dans le doute, rien n'est installé, et la ligne est dite", async (t) => {
  const m = machine(t, "1.0.0");
  m.reglages("gel=peut-être\n");
  const dites: string[] = [];
  const { etat } = await passage(m, publiees(t, ["1.0.0", "1.1.0"]), dites);
  assert.deepEqual([m.relances, etat.gelee], [[], true]);
  assert.ok(dites.some((ligne) => ligne.includes("gel=peut-être — attendu oui ou non ; dans le doute, la version reste gelée")), dites.join("\n"));
});

test("une version qui ne démarre pas : `current` revient sur la version d'avant, la station est relancée dessus, et l'issue le dit ; elle n'est pas réessayée, la suivante l'est", async (t) => {
  const m = machine(t, "1.0.0", (version) => (version === "1.1.0" ? "tombe" : { servis: [] }));
  const { etat, issue } = await passage(m, publiees(t, ["1.0.0", "1.1.0"]));
  assert.deepEqual(m.relances, ["1.1.0", "1.0.0"]);
  assert.equal(m.courante(), "1.0.0");
  assert.deepEqual(issue && { ...issue, le: "" }, { quoi: "revenue", visee: "1.1.0", restauree: "1.0.0", motif: "la station s'est arrêtée en échec en 1.1.0 (service : failed)", le: "", retour: null });
  assert.deepEqual([etat.installee, etat.ratees], ["1.0.0", ["1.1.0"]]);
  assert.deepEqual(lireIssues(m.dossier), [issue]);
  assert.deepEqual(lireEtatMiseAJour(m.dossier)?.derniere, issue);

  const encore = await passage(m, publiees(t, ["1.0.0", "1.1.0"]));
  assert.deepEqual(m.relances, ["1.1.0", "1.0.0"]);
  assert.equal(encore.etat.retenue, "1.1.0 n'a pas démarré à son essai : elle n'est pas réessayée, la version publiée après elle le sera — 1.0.0 reste en service");

  assert.equal((await passage(m, publiees(t, ["1.0.0", "1.1.0", "1.2.0"]))).issue?.quoi, "passee");
  assert.deepEqual(m.relances, ["1.1.0", "1.0.0", "1.2.0"]);
});

// Un passage dont la station ne se dira jamais en service à temps : il n'a rien d'autre à attendre que la fin
// de sa garde de 2 s, qui passe sur l'horloge du test, un pas de 5 ms après l'autre (#2464).
async function passageJusquAuBoutDeLaGarde(t: TestContext, m: ReturnType<typeof machine>, publications: Publications) {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: Date.now() });
  let fini = false;
  const rendu = passage(m, publications).finally(() => void (fini = true));
  while (!fini) {
    await new Promise((resoudre) => setImmediate(resoudre));
    t.mock.timers.tick(5);
  }
  return rendu;
}

test("une station qui tourne sans se dire en service dans la garde n'est pas gardée", async (t) => {
  const m = machine(t, "1.0.0", (version) => (version === "1.1.0" ? "muette" : { servis: [] }));
  const { issue } = await passageJusquAuBoutDeLaGarde(t, m, publiees(t, ["1.0.0", "1.1.0"]));
  assert.equal(issue?.quoi === "revenue" && issue.motif, "la station ne s'est pas dite en service en 1.1.0 en 2 s (service : active)");
  assert.equal(m.courante(), "1.0.0");
});

test("une version qui ne sert plus un projet que la précédente servait n'est pas gardée : le motif nomme le projet et son refus", async (t) => {
  const m = machine(t, "1.0.0", (version) => (version === "1.1.0" ? { servis: ["espace"], refuses: { brigade: "BRIGADE_X n'est pas défini" } } : { servis: ["brigade", "espace"] }));
  m.configurer("brigade acme/brigade v2\nespace acme/espace main\n");
  const { issue } = await passageJusquAuBoutDeLaGarde(t, m, publiees(t, ["1.0.0", "1.1.0"]));
  assert.equal(issue?.quoi === "revenue" && issue.motif, "le projet brigade n'est plus servi en 1.1.0 : BRIGADE_X n'est pas défini en 2 s (service : active)");
  assert.equal(issue?.quoi === "revenue" && issue.retour, null);
});

test("un projet retiré de la configuration entre-temps ne retient pas la nouvelle version", async (t) => {
  const m = machine(t, "1.0.0", (version) => (version === "1.1.0" ? { servis: ["espace"] } : { servis: ["brigade", "espace"] }));
  m.configurer("espace acme/espace main\n");
  assert.equal((await passage(m, publiees(t, ["1.0.0", "1.1.0"]))).issue?.quoi, "passee");
});

test("une relance refusée par le gestionnaire revient à la version d'avant ; si le retour échoue aussi, l'issue le dit", async (t) => {
  const m = machine(t, "1.0.0");
  m.refuserLesRelances("systemctl restart a rendu 1");
  const { issue } = await passage(m, publiees(t, ["1.0.0", "1.1.0"]));
  assert.equal(m.courante(), "1.0.0");
  assert.equal(issue?.quoi === "revenue" && issue.motif, "le passage à 1.1.0 a échoué : systemctl restart a rendu 1");
  assert.equal(issue?.quoi === "revenue" && issue.retour, "le passage à 1.0.0 a échoué : systemctl restart a rendu 1");
});

test("une archive dont l'install.sh échoue, ou qui n'en porte pas, n'est pas posée : `current` ne bouge pas, rien n'est relancé, l'issue le dit", async (t) => {
  const m = machine(t, "1.0.0");
  const casse = await passage(m, publiees(t, ["1.0.0", "1.1.0"], { installCasse: "1.1.0" }));
  assert.equal(casse.issue?.quoi === "revenue" && casse.issue.motif, "sa pose a échoué : l'install.sh de 1.1.0 a échoué : install.sh a rendu 3 — « disque plein »");
  assert.equal(casse.issue?.quoi === "revenue" && casse.issue.retour, null);
  const sans = await passage(m, publiees(t, ["1.0.0", "1.2.0"], { sansInstall: "1.2.0" }));
  assert.equal(sans.issue?.quoi === "revenue" && sans.issue.motif, "sa pose a échoué : l'archive de 1.2.0 ne porte pas d'install.sh");
  assert.deepEqual([m.courante(), m.relances, m.posees()], ["1.0.0", [], ["1.0.0"]]);
  assert.deepEqual(casse.etat.ratees, ["1.1.0"]);
});

test("une archive qui ne se télécharge pas : rien n'est installé, l'état dit pourquoi", async (t) => {
  const m = machine(t, "1.0.0");
  const publications = publiees(t, ["1.0.0", "1.1.0"]);
  publications.telecharger = async () => {
    throw new Error("l'archive de 1.1.0 ne se télécharge pas (404, essai:1.1.0)");
  };
  const { etat } = await passage(m, publications);
  assert.equal(etat.verification, "l'archive de 1.1.0 ne s'obtient pas : l'archive de 1.1.0 ne se télécharge pas (404, essai:1.1.0)");
  assert.deepEqual([m.relances, m.courante()], [[], "1.0.0"]);
});

test("des versions publiées illisibles : rien n'est installé, l'état dit pourquoi", async (t) => {
  const m = machine(t, "1.0.0");
  const illisibles = await passage(m, publiees(t, [], { illisibles: "GitHub a répondu 503 à la liste des releases de acme/brigade" }));
  assert.equal(illisibles.etat.verification, "les versions publiées ne se lisent pas (les publications d'essai) : GitHub a répondu 503 à la liste des releases de acme/brigade");
  assert.deepEqual(m.relances, []);
});

test("sans version courante, rien n'est mis à jour", async (t) => {
  const m = machine(t, "1.0.0");
  rmSync(join(m.opt, "current"));
  const { etat } = await passage(m, publiees(t, ["1.0.0", "1.1.0"]));
  assert.deepEqual([m.relances, etat.verification], [[], "aucune version n'est installée (le lien current ne désigne rien de posé) : rien n'est mis à jour"]);
});

// L'essai que le passage d'avant a noté sans le conclure — la machine a
// redémarré au milieu, la mise à jour a été tuée.
const essaiNote = (dossier: string, essai: { visee: string; depuis: string; servis: string[] }) => {
  ecrireEtatMiseAJour(dossier, { installee: essai.depuis, disponible: essai.visee, gelee: false, verifieeLe: "2026-10-15T14:00:00.000Z", verification: null, retenue: null, ratees: [], derniere: null, essai });
};

test("un essai interrompu dont la version tourne est conclu au passage suivant : elle est gardée, et l'issue le dit", async (t) => {
  const m = machine(t, "1.0.0", () => ({ servis: ["brigade"] }));
  poserVersion(m.opt, "1.1.0");
  rmSync(join(m.opt, "current"));
  symlinkSync("1.1.0", join(m.opt, "current"));
  m.systeme.basculer("1.1.0");
  m.relances.length = 0;
  m.configurer("brigade acme/brigade v2\n");
  essaiNote(m.dossier, { visee: "1.1.0", depuis: "1.0.0", servis: ["brigade"] });
  const publications = publiees(t, ["1.0.0", "1.1.0"]);
  const { etat, issue } = await passage(m, publications);
  assert.deepEqual(issue?.quoi === "passee" && [issue.version, issue.depuis], ["1.1.0", "1.0.0"]);
  assert.deepEqual([m.relances, publications.telecharges, etat.essai], [[], [], null]);
  assert.deepEqual(lireIssues(m.dossier), [issue]);
});

test("un essai interrompu au milieu de la bascule revient à la version d'avant, laissée posée", async (t) => {
  const m = machine(t, "1.0.0");
  rmSync(join(m.opt, "current"));
  essaiNote(m.dossier, { visee: "1.1.0", depuis: "1.0.0", servis: [] });
  const { etat, issue } = await passage(m, publiees(t, [], { illisibles: "le réseau n'est pas encore là" }));
  assert.deepEqual(m.relances, ["1.0.0"]);
  assert.deepEqual(issue && { ...issue, le: "" }, { quoi: "revenue", visee: "1.1.0", restauree: "1.0.0", motif: "le passage à 1.1.0 a été interrompu (current : aucune version posée)", le: "", retour: null });
  assert.deepEqual([etat.installee, etat.ratees, etat.essai], ["1.0.0", ["1.1.0"], null]);
});

test("un essai noté sans que rien ait été basculé est oublié : le passage continue", async (t) => {
  const m = machine(t, "1.0.0");
  essaiNote(m.dossier, { visee: "1.1.0", depuis: "1.0.0", servis: [] });
  const { etat, issue } = await passage(m, publiees(t, ["1.0.0", "1.1.0"]));
  assert.deepEqual([m.relances, issue?.quoi, etat.essai, etat.ratees], [["1.1.0"], "passee", null, []]);
});

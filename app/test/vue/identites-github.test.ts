// Les GitHub Apps de la station, dans Settings (#2317) : une ligne par rôle — cook, pass, manager —, chacune avec son
// état (`not configured`, `configured`), son App ID, sa clé et « save » ; la ligne d'en-tête dit que les clés restent
// sur la station. Rangée, une clé quitte l'écran : son champ se vide et rien ne la redit. Un App ID vide ou une clé qui
// n'est pas PEM se disent sous leur champ, et rien ne part. L'écran est joué devant un faux document ; derrière son
// pont, la station range pour de bon, par `rangerApp` du runtime, dans un répertoire du test.
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";
import { AppRefusee, appsRangees, rangerApp } from "../../../runtime/src/identites-stations.ts";
import {
  CONFIGURE,
  GARDE,
  ILLISIBLE,
  PAS_CONFIGURE,
  PAS_UN_ID,
  PAS_UNE_CLE,
  poserLesIdentites,
  RANGEE,
  ROLES,
  SANS_ID,
  tenirLesIdentites,
  type PontDesIdentites,
  type Role,
} from "../../src/vue/identites-github.js";
import { Faux, repos } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) };
const CLE = generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const AUTRE_CLE = generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" }).toString();

const stations: string[] = [];
after(() => {
  for (const station of stations) rmSync(station, { recursive: true, force: true });
});

// Une station dans un répertoire neuf, et le pont du process principal devant elle : ce qu'il lit et ce qu'il range,
// par le runtime — chaque appel retenu, pour voir ce qui est parti.
function joue(options: { pont?: PontDesIdentites } = {}) {
  const station = mkdtempSync(join(tmpdir(), "identites-github-"));
  stations.push(station);
  const appels: { role: string; id: string; cle: string }[] = [];
  const pont: PontDesIdentites = options.pont ?? {
    appsDeLaStation: () => Promise.resolve({ apps: appsRangees(station) }),
    rangerUneApp: (role, id, cle) => {
      appels.push({ role, id, cle });
      try {
        const rangee = rangerApp({ station, role, id, cle, env: {} });
        return Promise.resolve({ rangee: { role: rangee.role, id: rangee.id } });
      } catch (erreur) {
        if (erreur instanceof AppRefusee) return Promise.resolve({ refus: erreur.message });
        throw erreur;
      }
    },
  };
  let rendus = 0;
  const tenue = tenirLesIdentites({ pont, rendre: () => rendus++ });
  const ecran = (): Faux => poserLesIdentites(doc, tenue.etat ?? assert.fail("l'écran n'est pas posé"), tenue.gestes);
  return { station, appels, tenue, ecran, rendus: () => rendus };
}

const ligne = (ecran: Faux, role: Role) => ecran.children.find((enfant) => enfant.dataset.role === role) ?? assert.fail(`pas de ligne pour ${role}`);
const classe = (racine: Faux, nom: string) => [...racine.descendants()].filter((element) => element.className.split(" ").includes(nom));
const champId = (racine: Faux) => classe(racine, "app-id")[0] ?? assert.fail("pas de champ App ID");
const champCle = (racine: Faux) => classe(racine, "cle")[0] ?? assert.fail("pas de champ de clé");
const etatDe = (racine: Faux) => [...racine.descendants()].find((element) => element.dataset.etat !== undefined)?.textContent;
const bouton = (racine: Faux, texte: string) => racine.dessous("button").find((candidat) => candidat.textContent === texte) ?? assert.fail(`pas de bouton « ${texte} »`);
const erreurs = (racine: Faux) => [...racine.descendants()].filter((element) => element.className === "dit refus").map((element) => element.textContent);
// Taper dans un champ, comme le chef : sa valeur change, puis son écoute l'apprend.
const taper = (champ: Faux, texte: string) => {
  champ.value = texte;
  champ.declencher("input");
};
// Tout ce que l'écran donne à lire : ses textes, ses survols, ses noms accessibles, la valeur de ses champs.
function toutCeQuiSeLit(racine: Faux): string {
  const survols = racine.dessous("button").filter((element) => element.className === "aide");
  for (const declencheur of survols) declencheur.declencher("mouseenter");
  const lu = [racine, ...racine.descendants()].flatMap((element) => [element.textContent, element.title, element.ariaLabel, element.value, element.placeholder]).join("\n");
  for (const declencheur of survols) declencheur.declencher("mouseleave");
  return lu;
}

describe("l'écran des GitHub Apps", () => {
  test("une ligne par rôle, cook, pass et manager, chacune avec un App ID, une clé et « save » — et la ligne qui dit que les clés restent sur la station", async () => {
    const jeu = joue();
    await jeu.tenue.lire();
    const ecran = jeu.ecran();
    assert.ok(ecran.textContent.includes(GARDE));
    assert.match(GARDE, /stay on this station/);
    assert.match(GARDE, /never sent to the repository/);
    for (const role of ROLES) {
      const sienne = ligne(ecran, role);
      assert.equal(champId(sienne).balise, "input");
      assert.equal(champCle(sienne).balise, "textarea");
      assert.ok(bouton(sienne, "save"));
      assert.ok(bouton(sienne, "choose the .pem file"));
      const fichier = sienne.dessous("input").find((champ) => champ.type === "file") as unknown as { accept: string } | undefined;
      assert.equal(fichier?.accept, ".pem,application/x-pem-file");
    }
  });
});

describe("not configured", () => {
  test("une station qui n'a aucune App : chaque rôle dit `not configured`, sans App ID", async () => {
    const jeu = joue();
    await jeu.tenue.lire();
    const ecran = jeu.ecran();
    for (const role of ROLES) {
      assert.equal(etatDe(ligne(ecran, role)), PAS_CONFIGURE);
      assert.equal(champId(ligne(ecran, role)).value, "");
    }
  });

  test("une App rangée sans sa clé n'est pas configurée : la ligne dit ce qui manque", async () => {
    const jeu = joue({ pont: { appsDeLaStation: () => Promise.resolve({ apps: [{ role: "cook", id: "1203456", cle: false }, { role: "pass", id: null, cle: false }, { role: "manager", id: null, cle: false }] }) } });
    await jeu.tenue.lire();
    const cook = ligne(jeu.ecran(), "cook");
    assert.equal(etatDe(cook), PAS_CONFIGURE);
    assert.ok(cook.textContent.includes("App 1203456 · no key stored"));
  });
});

describe("configured", () => {
  test("« save » range l'App du rôle sur la station : sa ligne dit `configured` et son ID, et le champ de la clé est vide", async () => {
    const jeu = joue();
    await jeu.tenue.lire();
    let pass = ligne(jeu.ecran(), "pass");
    taper(champId(pass), " 1203457 ");
    taper(champCle(pass), CLE);
    bouton(pass, "save").click();
    assert.ok(ligne(jeu.ecran(), "pass").textContent.includes("saving…"), "le geste en route se dit");
    await repos();
    assert.deepEqual(jeu.appels, [{ role: "pass", id: "1203457", cle: CLE }]);
    // La station l'a pour de bon : son ID et sa clé, dans son répertoire des Apps.
    assert.equal(readFileSync(join(jeu.station, "apps-github", "pass.pem"), "utf8"), CLE);
    assert.equal(readFileSync(join(jeu.station, "apps-github", "pass.id"), "utf8"), "1203457\n");
    pass = ligne(jeu.ecran(), "pass");
    assert.equal(etatDe(pass), CONFIGURE);
    assert.ok(pass.textContent.includes("App 1203457"));
    assert.ok(pass.textContent.includes(RANGEE));
    assert.equal(champCle(pass).value, "", "la clé rangée ne se relit plus");
    assert.equal(champId(pass).value, "1203457");
    // Les autres rôles n'ont pas bougé.
    assert.equal(etatDe(ligne(jeu.ecran(), "cook")), PAS_CONFIGURE);
    assert.equal(etatDe(ligne(jeu.ecran(), "manager")), PAS_CONFIGURE);
  });

  test("la clé n'est jamais redite : ni après « save », ni relue, ni rouverte — l'écran n'en garde rien", async () => {
    const jeu = joue();
    await jeu.tenue.lire();
    const cook = ligne(jeu.ecran(), "cook");
    taper(champId(cook), "1203456");
    taper(champCle(cook), CLE);
    bouton(cook, "save").click();
    await repos();
    const corps = CLE.split("\n")[1] ?? assert.fail("une clé sans corps");
    assert.ok(!toutCeQuiSeLit(jeu.ecran()).includes(corps));
    assert.ok(!JSON.stringify(jeu.tenue.etat).includes(corps), "l'état de l'écran ne la retient pas");
    // Relue de la station, elle ne revient pas : la station ne dit que si elle l'a.
    await jeu.tenue.lire();
    const relu = jeu.ecran();
    assert.equal(etatDe(ligne(relu, "cook")), CONFIGURE);
    assert.ok(!toutCeQuiSeLit(relu).includes(corps));
    assert.equal(champCle(ligne(relu, "cook")).value, "");
  });

  test("une station qui a déjà ses Apps les dit configurées, leur ID dans son champ — et « save » n'y est plus le geste recommandé", async () => {
    const jeu = joue();
    rangerApp({ station: jeu.station, role: "manager", id: "1203458", cle: CLE, env: {} });
    await jeu.tenue.lire();
    const ecran = jeu.ecran();
    const manager = ligne(ecran, "manager");
    assert.equal(etatDe(manager), CONFIGURE);
    assert.equal(champId(manager).value, "1203458");
    assert.equal(champCle(manager).value, "");
    assert.equal(bouton(manager, "save").className, "");
    assert.equal(bouton(ligne(ecran, "cook"), "save").className, "recommande");
  });

  test("la clé choisie dans un fichier .pem : son nom se lit, pas son contenu, et « save » la range", async () => {
    const jeu = joue();
    await jeu.tenue.lire();
    let cook = ligne(jeu.ecran(), "cook");
    const fichier = cook.dessous("input").find((champ) => champ.type === "file") ?? assert.fail("pas de choix de fichier");
    let ouvert = 0;
    fichier.addEventListener("click", () => void ouvert++);
    bouton(cook, "choose the .pem file").click();
    assert.equal(ouvert, 1, "le bouton ouvre le choix du fichier");
    Object.assign(fichier, { files: [{ name: "parade-cook.2026-11-04.private-key.pem", text: () => Promise.resolve(CLE) }] });
    fichier.declencher("change");
    await repos();
    cook = ligne(jeu.ecran(), "cook");
    assert.ok(cook.textContent.includes("parade-cook.2026-11-04.private-key.pem chosen"));
    assert.equal(champCle(cook).value, "", "la clé lue n'est pas écrite dans le champ");
    taper(champId(cook), "1203456");
    bouton(cook, "save").click();
    await repos();
    assert.deepEqual(jeu.appels, [{ role: "cook", id: "1203456", cle: CLE }]);
    cook = ligne(jeu.ecran(), "cook");
    assert.equal(etatDe(cook), CONFIGURE);
    assert.ok(!cook.textContent.includes("chosen"));
  });

  test("« save » sur un rôle déjà configuré remplace son App", async () => {
    const jeu = joue();
    rangerApp({ station: jeu.station, role: "pass", id: "1203457", cle: CLE, env: {} });
    await jeu.tenue.lire();
    const pass = ligne(jeu.ecran(), "pass");
    taper(champId(pass), "1203459");
    taper(champCle(pass), AUTRE_CLE);
    bouton(pass, "save").click();
    await repos();
    assert.equal(readFileSync(join(jeu.station, "apps-github", "pass.pem"), "utf8"), AUTRE_CLE);
    assert.ok(ligne(jeu.ecran(), "pass").textContent.includes("App 1203459"));
  });
});

describe("error", () => {
  test("« save » sans App ID : l'erreur se dit sous le champ, et rien n'est écrit", async () => {
    const jeu = joue();
    await jeu.tenue.lire();
    let pass = ligne(jeu.ecran(), "pass");
    taper(champId(pass), "   ");
    taper(champCle(pass), CLE);
    bouton(pass, "save").click();
    await repos();
    assert.deepEqual(jeu.appels, [], "rien n'est parti vers la station");
    assert.deepEqual(readdirSync(jeu.station), []);
    pass = ligne(jeu.ecran(), "pass");
    const sous = classe(pass, "champ-id")[0] ?? assert.fail("pas de ligne de l'App ID");
    assert.deepEqual(erreurs(sous), [SANS_ID]);
    assert.equal(etatDe(pass), PAS_CONFIGURE);
  });

  test("« save » avec un texte qui n'est pas une clé privée PEM : l'erreur se dit sous le champ de la clé, et rien n'est écrit", async () => {
    const jeu = joue();
    await jeu.tenue.lire();
    for (const texte of ["", "my key", "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEA\n-----END PUBLIC KEY-----\n", CLE.replace("-----END PRIVATE KEY-----", "")]) {
      let cook = ligne(jeu.ecran(), "cook");
      taper(champId(cook), "1203456");
      taper(champCle(cook), texte);
      bouton(cook, "save").click();
      await repos();
      cook = ligne(jeu.ecran(), "cook");
      assert.deepEqual(erreurs(classe(cook, "champ-cle")[0] ?? assert.fail("pas de ligne de la clé")), [PAS_UNE_CLE], JSON.stringify(texte));
      assert.deepEqual(erreurs(classe(cook, "champ-id")[0] ?? assert.fail("pas de ligne de l'App ID")), []);
    }
    assert.deepEqual(jeu.appels, []);
    assert.deepEqual(readdirSync(jeu.station), []);
  });

  test("les deux à la fois : une erreur sous chaque champ ; corrigé, le champ perd la sienne", async () => {
    const jeu = joue();
    await jeu.tenue.lire();
    let manager = ligne(jeu.ecran(), "manager");
    bouton(manager, "save").click();
    manager = ligne(jeu.ecran(), "manager");
    assert.deepEqual(erreurs(manager), [SANS_ID, PAS_UNE_CLE]);
    taper(champId(manager), "1203458");
    bouton(manager, "save").click();
    assert.deepEqual(erreurs(ligne(jeu.ecran(), "manager")), [PAS_UNE_CLE]);
    assert.deepEqual(jeu.appels, []);
  });

  test("un App ID qui n'en a pas la forme — une clé collée à sa place — ne part pas", async () => {
    const jeu = joue();
    await jeu.tenue.lire();
    const cook = ligne(jeu.ecran(), "cook");
    taper(champId(cook), "-----BEGIN PRIVATE KEY-----");
    taper(champCle(cook), CLE);
    bouton(cook, "save").click();
    assert.deepEqual(erreurs(ligne(jeu.ecran(), "cook")), [PAS_UN_ID]);
    assert.deepEqual(jeu.appels, []);
  });

  test("ce que la station refuse se dit en une ligne sous le rôle, sa suite au survol, sans la clé ; rien n'est écrit, et le rôle reste ce qu'il était", async () => {
    const jeu = joue();
    rangerApp({ station: jeu.station, role: "cook", id: "1203456", cle: CLE, env: {} });
    await jeu.tenue.lire();
    const pass = ligne(jeu.ecran(), "pass");
    taper(champId(pass), "1203456");
    taper(champCle(pass), AUTRE_CLE);
    bouton(pass, "save").click();
    await repos();
    assert.equal(jeu.appels.length, 1);
    assert.deepEqual(readdirSync(join(jeu.station, "apps-github")).sort(), ["cook.id", "cook.pem"]);
    const refusee = ligne(jeu.ecran(), "pass");
    // La ligne, puis le « ? » de son survol.
    assert.deepEqual(erreurs(refusee), ["nothing was written: the cook role already has the App 1203456?"]);
    assert.ok(toutCeQuiSeLit(refusee).includes("one identity per role, so one App per role"));
    assert.equal(etatDe(refusee), PAS_CONFIGURE);
    assert.ok(!refusee.textContent.includes(RANGEE));
    // Le refus ne cite pas la clé ; elle reste dans son champ, que le chef corrige l'App ID sans la recoller.
    const refus = [...refusee.descendants()].find((element) => element.className === "dit refus") ?? assert.fail("pas de refus");
    assert.ok(!toutCeQuiSeLit(refus).includes(AUTRE_CLE.split("\n")[1] ?? assert.fail("une clé sans corps")));
    assert.equal(champCle(refusee).value, AUTRE_CLE);
  });

  test("une station qui ne se lit pas le dit en une ligne, son détail au survol — jamais `not configured`", async () => {
    const jeu = joue({ pont: { appsDeLaStation: () => Promise.resolve({ refus: "this station's Apps directory cannot be read (EACCES)" }) } });
    await jeu.tenue.lire();
    const ecran = jeu.ecran();
    assert.ok(ecran.textContent.includes(ILLISIBLE));
    assert.ok(toutCeQuiSeLit(ecran).includes("EACCES"));
    assert.ok(!ecran.textContent.includes(PAS_CONFIGURE));
    assert.ok(!ecran.textContent.includes(CONFIGURE));
  });
});

describe("un appareil sans station", () => {
  test("un pont qui n'a pas ces gestes, ou qui ne rend rien — le téléphone — : l'écran ne se pose pas", async () => {
    for (const pont of [{}, { appsDeLaStation: () => Promise.resolve(undefined) }] satisfies PontDesIdentites[]) {
      const jeu = joue({ pont });
      await jeu.tenue.lire();
      assert.equal(jeu.tenue.etat, undefined);
      assert.ok(jeu.rendus() > 0);
    }
  });
});

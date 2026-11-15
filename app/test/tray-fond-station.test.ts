// L'icône de la station de fond (#3631), sur la station et le système : les `facts` de chaque projet lus par son geste,
// les gestes joués projet par projet, l'inscription à l'ouverture de session, et ce que « Quit the station » arrête.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import type { ExecFileException } from "node:child_process";
import type { Rendu } from "../src/box.ts";
import type { Faits } from "../src/faits.ts";
import { jouerLeGeste, lireLesProjets, type Lancer } from "../src/tray-fond/lecture.ts";
import { inscrireLeFond, quitterLaStation, stationDeFondInstallee } from "../src/tray-fond/systeme.ts";

type Systeme = Parameters<typeof inscrireLeFond>[0];
type Executer = Systeme["executer"];
import { ligneDuFond, etatDeLaStation } from "../src/tray-fond/tray-fond.ts";

const A = "2026-11-15T10:00:00.000Z";
const faits = (cooks: number, questions: number, etat = "ouverte"): Faits => ({
  etat,
  lu: A,
  dernierTick: A,
  compteurs: { rail: 0, auTravail: cooks, aLaPass: 0, attend: questions, livres24h: 0 },
  dernierEvenement: null,
  rail: [],
  cooks: Array.from({ length: cooks }, (_, i) => ({ ticket: i + 1, titre: `ticket ${i + 1}`, station: "mac/claude" })),
  attend: Array.from({ length: questions }, (_, i) => ({ ticket: 100 + i, titre: `question ${i}`, url: null })),
  livres: [],
  urgence: null,
  stations: [{ station: "mac/claude", distante: false, plafond: null, ordinaires: false, bacASable: null, prendOrdinaires: true, cuisson: "cooking" }],
});
const ok = (sortie: string): Rendu => ({ lance: "$ node geste.ts", erreur: null, sortie, erreurs: "" });
const rate = (code: number, erreurs: string): Rendu => ({ lance: "$ node geste.ts", erreur: Object.assign(new Error("failed"), { code }) as ExecFileException, sortie: "", erreurs });

describe("les faits de chaque projet, lus par le geste de la station", () => {
  test("chaque projet lu compte, et la ligne suit ce que la station rend d'une lecture à l'autre", async () => {
    const rendus = new Map<string, Faits>([["brigade", faits(2, 1)], ["parade", faits(1, 0)]]);
    const lances: string[] = [];
    const lancer: Lancer = async (projet, commande) => {
      lances.push(`${projet} ${commande}`);
      return ok(JSON.stringify(rendus.get(projet)));
    };
    let lus = await lireLesProjets(["brigade", "parade"], lancer);
    assert.deepEqual(lances, ["brigade facts", "parade facts"]);
    assert.equal(ligneDuFond(lus, etatDeLaStation(lus)), "3 cooking · 1 for you");
    rendus.set("parade", faits(0, 2));
    lus = await lireLesProjets(["brigade", "parade"], lancer);
    assert.equal(ligneDuFond(lus, etatDeLaStation(lus)), "2 cooking · 3 for you");
  });

  test("une station qui ne répond pas, ou une sortie qui n'est pas la forme des faits : le projet n'est pas lu, jamais « 0 »", async () => {
    const lancer: Lancer = async (projet) => (projet === "brigade" ? rate(65, "projet inconnu") : ok("pas du JSON"));
    const lus = await lireLesProjets(["brigade", "parade"], lancer);
    assert.deepEqual(lus, [{ nom: "brigade", faits: undefined }, { nom: "parade", faits: undefined }]);
    assert.equal(ligneDuFond(lus, etatDeLaStation(lus)), "not read yet");
  });
});

describe("un geste joué sur la station", () => {
  test("chaque commande part, projet par projet, et celles qui échouent sont dites", async () => {
    const lances: string[] = [];
    const lancer: Lancer = async (projet, commande) => {
      lances.push(`${projet} ${commande}`);
      return projet === "parade" ? rate(1, "no log") : ok("");
    };
    const projets = [{ nom: "brigade", faits: faits(0, 0) }, { nom: "parade", faits: faits(0, 0) }];
    const echecs = await jouerLeGeste("pause", projets, lancer, 30_000);
    assert.deepEqual(lances, ["brigade switch off", "parade switch off"]);
    assert.equal(echecs.length, 1);
    assert.match(echecs[0] ?? "", /^parade: switch off failed — \$ node geste\.ts\nno log\n→ exit code 1$/);
    assert.deepEqual(await jouerLeGeste("arret", projets.slice(0, 1), lancer, 30_000), []);
    assert.equal(lances.at(-1), "brigade station stop mac/claude");
  });

  test("rien de lu : rien n'est envoyé, et c'est dit", async () => {
    const echecs = await jouerLeGeste("arret", [{ nom: "brigade", faits: undefined }], async () => assert.fail("rien ne part"), 30_000);
    assert.deepEqual(echecs, ["no project of this station could be read: nothing was sent"]);
  });
});

function maison(t: TestContext): string {
  const dossier = mkdtempSync(join(tmpdir(), "tray-fond-"));
  t.after(() => rmSync(dossier, { recursive: true, force: true }));
  return dossier;
}
function systeme(t: TestContext, plateforme: NodeJS.Platform, repondre: (commande: string, args: readonly string[]) => number = () => 0) {
  const lancees: string[] = [];
  const executer: Executer = async (commande, args) => {
    lancees.push([commande, ...args].join(" "));
    return { code: repondre(commande, args), sortie: "" };
  };
  const ici = maison(t);
  const s: Systeme = { plateforme, maison: ici, localAppData: join(ici, "AppData", "Local"), uid: 501, binaire: "/Applications/Brigade.app/Contents/MacOS/Brigade", executer };
  return { s, lancees };
}

describe("l'icône à l'ouverture de session", () => {
  test("seulement là où la station de fond est installée — son agent launchd, ou son lanceur Windows", (t) => {
    const mac = systeme(t, "darwin").s;
    assert.equal(stationDeFondInstallee(mac), false);
    mkdirSync(join(mac.maison, "Library", "LaunchAgents"), { recursive: true });
    writeFileSync(join(mac.maison, "Library", "LaunchAgents", "brigade.station.plist"), "");
    assert.equal(stationDeFondInstallee(mac), true);
    const windows = systeme(t, "win32").s;
    assert.equal(stationDeFondInstallee(windows), false);
    mkdirSync(join(windows.localAppData ?? "", "brigade-station"), { recursive: true });
    writeFileSync(join(windows.localAppData ?? "", "brigade-station", "lancer-station.ps1"), "");
    assert.equal(stationDeFondInstallee(windows), true);
    assert.equal(stationDeFondInstallee({ ...windows, localAppData: undefined }), false);
    assert.equal(stationDeFondInstallee({ ...mac, plateforme: "linux" }), false);
  });

  test("sur un Mac : son agent launchd, chargé une fois, rechargé seulement quand il change", async (t) => {
    const { s, lancees } = systeme(t, "darwin", (_, args) => (args[0] === "print" && lancees.length > 2 ? 0 : args[0] === "print" ? 113 : 0));
    assert.equal(await inscrireLeFond(s), undefined);
    const plist = join(s.maison, "Library", "LaunchAgents", "brigade.tray-fond.plist");
    assert.match(readFileSync(plist, "utf8"), /<key>Label<\/key>\n  <string>brigade\.tray-fond<\/string>/);
    assert.match(readFileSync(plist, "utf8"), /<key>RunAtLoad<\/key>\n  <true\/>/);
    assert.ok(readFileSync(plist, "utf8").includes(`<string>${join(s.maison, "Library", "Logs", "brigade-tray.log")}</string>`));
    assert.match(readFileSync(plist, "utf8"), /<string>\/Applications\/Brigade\.app\/Contents\/MacOS\/Brigade<\/string>\n    <string>--tray-fond<\/string>/);
    assert.deepEqual(lancees, ["launchctl print gui/501/brigade.tray-fond", `launchctl bootstrap gui/501 ${plist}`]);
    // Chargé, et le même : rien n'est relancé.
    assert.equal(await inscrireLeFond(s), undefined);
    assert.deepEqual(lancees.slice(2), ["launchctl print gui/501/brigade.tray-fond"]);
    // L'app a bougé : l'agent est rechargé sur le nouveau binaire.
    assert.equal(await inscrireLeFond({ ...s, binaire: "/Applications/Autre.app/Contents/MacOS/Brigade" }), undefined);
    assert.deepEqual(lancees.slice(3), ["launchctl print gui/501/brigade.tray-fond", "launchctl bootout gui/501/brigade.tray-fond", `launchctl bootstrap gui/501 ${plist}`]);
  });

  test("launchd qui refuse l'agent : c'est dit", async (t) => {
    const { s } = systeme(t, "darwin", (_, args) => (args[0] === "bootstrap" ? 5 : 113));
    assert.match((await inscrireLeFond(s)) ?? "", /^launchd refused the menu bar icon's agent .*brigade\.tray-fond\.plist \(exit code 5\)$/);
  });

  test("sous Windows : la valeur `brigade-tray` de la clé Run", async (t) => {
    const { s, lancees } = systeme(t, "win32");
    assert.equal(await inscrireLeFond({ ...s, binaire: "C:\\Brigade\\Brigade.exe" }), undefined);
    assert.deepEqual(lancees, ['reg add HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run /v brigade-tray /t REG_SZ /d "C:\\Brigade\\Brigade.exe" --tray-fond /f']);
    const refuse = systeme(t, "win32", () => 1).s;
    assert.match((await inscrireLeFond(refuse)) ?? "", /^the notification area icon's logon start could not be written/);
  });
});

describe("quitter la station, une fois confirmé", () => {
  test("sur un Mac : l'agent de la station, puis celui de l'icône, déchargés", async (t) => {
    const { s, lancees } = systeme(t, "darwin");
    assert.deepEqual(await quitterLaStation(s), []);
    assert.deepEqual(lancees, ["launchctl bootout gui/501/brigade.station", "launchctl bootout gui/501/brigade.tray-fond"]);
    const refuse = systeme(t, "darwin", (_, args) => (args[1]?.endsWith("brigade.station") ? 3 : 0));
    assert.deepEqual(await quitterLaStation(refuse.s), ["launchd did not stop the station (gui/501/brigade.station) (exit code 3)"]);
    assert.equal(refuse.lancees.length, 2, "l'icône part quand même");
  });

  test("sous Windows : le lanceur d'abord, puis la station et ses cooks", async (t) => {
    const { s, lancees } = systeme(t, "win32");
    const dossier = join(s.localAppData ?? "", "brigade-station");
    mkdirSync(dossier, { recursive: true });
    writeFileSync(join(dossier, "lanceur.pid"), "4100\n");
    writeFileSync(join(dossier, "station.pid"), "4200\n");
    assert.deepEqual(await quitterLaStation(s), []);
    assert.deepEqual(lancees, ['taskkill /PID 4100 /FI IMAGENAME eq node.exe /F', 'taskkill /PID 4200 /FI IMAGENAME eq node.exe /T /F']);
    // Une station déjà arrêtée n'a plus de `station.pid` : seul le lanceur est visé.
    rmSync(join(dossier, "station.pid"));
    const echoue = systeme(t, "win32", () => 128);
    mkdirSync(join(echoue.s.localAppData ?? "", "brigade-station"), { recursive: true });
    writeFileSync(join(echoue.s.localAppData ?? "", "brigade-station", "lanceur.pid"), "4100\n");
    assert.deepEqual(await quitterLaStation(echoue.s), ["the station's launcher (pid 4100) did not stop (exit code 128)"]);
    assert.deepEqual(await quitterLaStation({ ...s, localAppData: undefined }), ["LOCALAPPDATA is not set: the station's launcher cannot be found"]);
  });
});

describe("le binaire de l'app, branché sur l'icône de fond", () => {
  const lire = (chemin: string) => readFileSync(join(import.meta.dirname, "..", chemin), "utf8");

  test("son entrée lance l'icône avec `--tray-fond`, l'app sans — et l'app inscrit l'icône quand la station de fond est là", () => {
    assert.equal(JSON.parse(lire("package.json")).main, "src/tray-fond/entree.ts");
    const entree = lire("src/tray-fond/entree.ts");
    assert.match(entree, /if \(process\.argv\.includes\(ARGUMENT\)\) \{\n  await import\("\.\/processus\.ts"\);\n\} else \{/);
    assert.ok(entree.includes('await import("../main.ts");'));
    assert.ok(entree.includes("if (installee && stationDeFondInstallee(systeme))"));
    assert.ok(entree.includes("await inscrireLeFond("));
  });

  test("l'app ne pose pas sa propre icône quand celle de fond la tient", () => {
    const principal = lire("src/main.ts");
    assert.ok(principal.includes('const iconeAuFond = emplacements.facon === "installee" && stationDeFondInstallee('));
    assert.ok(principal.includes("barreDeMenus.poser(suivi.configuration().barreDeMenus !== false && !iconeAuFond,"));
  });

  test("le process de l'icône lit les projets de la station, et joue ses gestes et la confirmation de quitter", () => {
    const processus = lire("src/tray-fond/processus.ts");
    assert.ok(processus.includes("await lireLesProjets(servisPar(racine), lancer)"));
    assert.ok(processus.includes("await jouerLeGeste(geste, projets, lancer, DELAI_MS)"));
    assert.ok(processus.includes("const texte = confirmationDeQuitter(projets);"));
    assert.match(processus, /if \(response !== 0\) return;\n\s+await dire\(await quitterLaStation\(/);
  });
});

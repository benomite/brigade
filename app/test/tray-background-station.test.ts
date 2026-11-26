// L'icône de la station de fond (#3631), sur la station et le système : les `facts` de chaque projet lus par son geste,
// les gestes joués projet par projet, l'inscription à l'ouverture de session, et ce que « Quit the station » arrête.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import type { ExecFileException } from "node:child_process";
import type { Rendu } from "../src/box.ts";
import type { Facts } from "../src/facts.ts";
import { demarrerLaStationDuProject, jouerLeAction, lireLesProjects, type Lancer } from "../src/tray-background/read.ts";
import { garderLIcone, inscrireLeBackground, quitterLaStation, stationDeBackgroundInstallee } from "../src/tray-background/systeme.ts";

type Systeme = Parameters<typeof inscrireLeBackground>[0];
type Executer = Systeme["executer"];
import { stateDeLaStation } from "../src/tray-background/tray-background.ts";
import { lineDuBackground } from "../src/tray/line.ts";

const A = "2026-11-15T10:00:00.000Z";
const facts = (cooks: number, questions: number, state = "ouverte"): Facts => ({
  etat: state,
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
    const rendus = new Map<string, Facts>([["brigade", facts(2, 1)], ["parade", facts(1, 0)]]);
    const lances: string[] = [];
    const lancer: Lancer = async (project, command) => {
      lances.push(`${project} ${command}`);
      return ok(JSON.stringify(rendus.get(project)));
    };
    let lus = await lireLesProjects(["brigade", "parade"], lancer);
    assert.deepEqual(lances, ["brigade facts", "parade facts"]);
    assert.equal(lineDuBackground(lus, stateDeLaStation(lus)), "3 cooking · 1 for you");
    rendus.set("parade", facts(0, 2));
    lus = await lireLesProjects(["brigade", "parade"], lancer);
    assert.equal(lineDuBackground(lus, stateDeLaStation(lus)), "2 cooking · 3 for you");
  });

  test("une station qui ne répond pas, ou une sortie qui n'est pas la forme des faits : le projet n'est pas lu, jamais « 0 »", async () => {
    const lancer: Lancer = async (project) => (project === "brigade" ? rate(65, "projet inconnu") : ok("pas du JSON"));
    const lus = await lireLesProjects(["brigade", "parade"], lancer);
    assert.deepEqual(lus, [{ nom: "brigade", faits: undefined }, { nom: "parade", faits: undefined }]);
    assert.equal(lineDuBackground(lus, stateDeLaStation(lus)), "not read yet");
  });
});

describe("un geste joué sur la station", () => {
  test("chaque commande part, projet par projet, et celles qui échouent sont dites", async () => {
    const lances: string[] = [];
    const lancer: Lancer = async (project, command) => {
      lances.push(`${project} ${command}`);
      return project === "parade" ? rate(1, "no log") : ok("");
    };
    const projects = [{ nom: "brigade", faits: facts(0, 0) }, { nom: "parade", faits: facts(0, 0) }];
    const failures = await jouerLeAction("pause", projects, lancer, 30_000);
    assert.deepEqual(lances, ["brigade switch off", "parade switch off"]);
    assert.equal(failures.length, 1);
    assert.match(failures[0] ?? "", /^parade: switch off failed — \$ node geste\.ts\nno log\n→ exit code 1$/);
    assert.deepEqual(await jouerLeAction("arret", projects.slice(0, 1), lancer, 30_000), []);
    assert.equal(lances.at(-1), "brigade station stop mac/claude");
  });

  test("rien de lu : rien n'est envoyé, et c'est dit", async () => {
    const failures = await jouerLeAction("arret", [{ nom: "brigade", faits: undefined }], async () => assert.fail("rien ne part"), 30_000);
    assert.deepEqual(failures, ["no project of this station could be read: nothing was sent"]);
  });
});

function maison(t: TestContext): string {
  const dossier = mkdtempSync(join(tmpdir(), "tray-fond-"));
  t.after(() => rmSync(dossier, { recursive: true, force: true }));
  return dossier;
}
function systeme(t: TestContext, plateforme: NodeJS.Platform, repondre: (command: string, args: readonly string[]) => number = () => 0) {
  const lancees: string[] = [];
  const executer: Executer = async (command, args) => {
    lancees.push([command, ...args].join(" "));
    return { code: repondre(command, args), sortie: "" };
  };
  const ici = maison(t);
  const s: Systeme = { plateforme, maison: ici, localAppData: join(ici, "AppData", "Local"), uid: 501, binaire: "/Applications/Brigade.app/Contents/MacOS/Brigade", executer };
  return { s, lancees };
}

describe("l'icône à l'ouverture de session", () => {
  test("seulement là où la station de fond est installée — son agent launchd, ou son lanceur Windows", (t) => {
    const mac = systeme(t, "darwin").s;
    assert.equal(stationDeBackgroundInstallee(mac), false);
    mkdirSync(join(mac.maison, "Library", "LaunchAgents"), { recursive: true });
    writeFileSync(join(mac.maison, "Library", "LaunchAgents", "brigade.station.plist"), "");
    assert.equal(stationDeBackgroundInstallee(mac), true);
    const windows = systeme(t, "win32").s;
    assert.equal(stationDeBackgroundInstallee(windows), false);
    mkdirSync(join(windows.localAppData ?? "", "brigade-station"), { recursive: true });
    writeFileSync(join(windows.localAppData ?? "", "brigade-station", "lancer-station.ps1"), "");
    assert.equal(stationDeBackgroundInstallee(windows), true);
    assert.equal(stationDeBackgroundInstallee({ ...windows, localAppData: undefined }), false);
    assert.equal(stationDeBackgroundInstallee({ ...mac, plateforme: "linux" }), false);
  });

  test("sur un Mac : son agent launchd, chargé une fois, rechargé seulement quand il change", async (t) => {
    const { s, lancees } = systeme(t, "darwin", (_, args) => (args[0] === "print" && lancees.length > 2 ? 0 : args[0] === "print" ? 113 : 0));
    assert.equal(await inscrireLeBackground(s), undefined);
    const plist = join(s.maison, "Library", "LaunchAgents", "brigade.tray-fond.plist");
    assert.match(readFileSync(plist, "utf8"), /<key>Label<\/key>\n  <string>brigade\.tray-fond<\/string>/);
    assert.match(readFileSync(plist, "utf8"), /<key>RunAtLoad<\/key>\n  <true\/>/);
    assert.ok(readFileSync(plist, "utf8").includes(`<string>${join(s.maison, "Library", "Logs", "brigade-tray.log")}</string>`));
    assert.match(readFileSync(plist, "utf8"), /<string>\/Applications\/Brigade\.app\/Contents\/MacOS\/Brigade<\/string>\n    <string>--tray-fond<\/string>/);
    assert.deepEqual(lancees, ["launchctl print gui/501/brigade.tray-fond", `launchctl bootstrap gui/501 ${plist}`]);
    // Chargé, et le même : rien n'est relancé.
    assert.equal(await inscrireLeBackground(s), undefined);
    assert.deepEqual(lancees.slice(2), ["launchctl print gui/501/brigade.tray-fond"]);
    // L'app a bougé : l'agent est rechargé sur le nouveau binaire.
    assert.equal(await inscrireLeBackground({ ...s, binaire: "/Applications/Autre.app/Contents/MacOS/Brigade" }), undefined);
    assert.deepEqual(lancees.slice(3), ["launchctl print gui/501/brigade.tray-fond", "launchctl bootout gui/501/brigade.tray-fond", `launchctl bootstrap gui/501 ${plist}`]);
  });

  test("son agent est relancé quelle que soit sa sortie, un 0 compris (#3711)", async (t) => {
    const { s } = systeme(t, "darwin", (_, args) => (args[0] === "print" ? 113 : 0));
    await inscrireLeBackground(s);
    const plist = readFileSync(join(s.maison, "Library", "LaunchAgents", "brigade.tray-fond.plist"), "utf8");
    assert.match(plist, /<key>KeepAlive<\/key>\n  <true\/>/);
    assert.doesNotMatch(plist, /SuccessfulExit/);
  });

  describe("garderLIcone : l'agent tourne, sinon il est relancé, sinon la raison est dite", () => {
    const agent = (t: TestContext, answers: Array<{ code: number; sortie: string }>, lancees: string[]) => {
      const { s } = systeme(t, "darwin");
      let lectures = 0;
      const executer: Executer = async (command, args) => {
        lancees.push([command, ...args].join(" "));
        if (args[0] !== "print") return { code: 0, sortie: "" };
        return answers[Math.min(lectures++, answers.length - 1)] ?? { code: 1, sortie: "" };
      };
      return { ...s, executer };
    };
    const tourne = { code: 0, sortie: "brigade.tray-fond = {\n\tstate = running\n}" };
    const arrete = { code: 0, sortie: "brigade.tray-fond = {\n\tstate = not running\n\tlast exit code = 0\n}" };
    const pas = async () => {};

    test("qui tourne : rien n'est relancé", async (t) => {
      const lancees: string[] = [];
      assert.equal(await garderLIcone(agent(t, [tourne], lancees), pas), undefined);
      assert.ok(!lancees.some((l) => l.includes("kickstart")));
    });

    test("sorti avec 0 : il est relancé, et il tourne", async (t) => {
      const lancees: string[] = [];
      // inscrireLeFond lit l'agent chargé (code 0), puis l'état : arrêté, puis en marche après le kickstart.
      assert.equal(await garderLIcone(agent(t, [arrete, arrete, tourne], lancees), pas), undefined);
      assert.ok(lancees.includes("launchctl kickstart gui/501/brigade.tray-fond"));
    });

    test("relancé mais retombé, ou refusé : la raison est dite", async (t) => {
      const retombe = await garderLIcone(agent(t, [arrete], []), pas);
      assert.match(retombe ?? "", /^the menu bar icon is not running: launchd started it .*brigade-tray\.log$/);
      const { s } = systeme(t, "darwin", (_, args) => (args[0] === "kickstart" ? 113 : 0));
      assert.match((await garderLIcone(s, pas)) ?? "", /^the menu bar icon is not running and launchd would not start it .* \(exit code 113\)$/);
    });

    test("hors d'un Mac : rien à garder", async (t) => {
      assert.equal(await garderLIcone(systeme(t, "win32").s, pas), undefined);
    });
  });

  test("launchd qui refuse l'agent : c'est dit", async (t) => {
    const { s } = systeme(t, "darwin", (_, args) => (args[0] === "bootstrap" ? 5 : 113));
    assert.match((await inscrireLeBackground(s)) ?? "", /^launchd refused the menu bar icon's agent .*brigade\.tray-fond\.plist \(exit code 5\)$/);
  });

  test("sous Windows : la valeur `brigade-tray` de la clé Run", async (t) => {
    const { s, lancees } = systeme(t, "win32");
    assert.equal(await inscrireLeBackground({ ...s, binaire: "C:\\Brigade\\Brigade.exe" }), undefined);
    assert.deepEqual(lancees, ['reg add HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run /v brigade-tray /t REG_SZ /d "C:\\Brigade\\Brigade.exe" --tray-fond /f']);
    const refuse = systeme(t, "win32", () => 1).s;
    assert.match((await inscrireLeBackground(refuse)) ?? "", /^the notification area icon's logon start could not be written/);
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
    assert.equal(JSON.parse(lire("package.json")).main, "src/tray-background/entree.ts");
    const entree = lire("src/tray-background/entree.ts");
    assert.match(entree, /if \(process\.argv\.includes\(ARGUMENT\)\) \{\n  await import\("\.\/processus\.ts"\);\n\} else \{/);
    assert.ok(entree.includes('await import(' + '"../main.ts");'));
    assert.ok(entree.includes("if (installee && stationDeFondInstallee(systeme))"));
    assert.ok(entree.includes("await inscrireLeFond("));
  });

  test("l'app ne pose pas sa propre icône quand celle de fond la tient", () => {
    const principal = lire("src/main.ts");
    assert.ok(principal.includes('const iconeAuFond = emplacements.facon === "installee" && stationDeFondInstallee('));
    assert.ok(principal.includes("barreDeMenus.poser(suivi.configuration().barreDeMenus !== false && !iconeAuFond,"));
  });

  test("le process de l'icône lit les projets de la station, et joue ses gestes et la confirmation de quitter", () => {
    const processus = lire("src/tray-background/processus.ts");
    assert.ok(processus.includes("await lireLesProjets(servisPar(racine), lancer)"));
    assert.ok(processus.includes("await jouerLeGeste(geste, projets, lancer, DELAI_MS)"));
    assert.ok(processus.includes("const texte = confirmationDeQuitter(projets);"));
    assert.match(processus, /if \(response !== 0\) return;\n\s+await dire\(await quitterLaStation\(/);
  });
});

describe("« Start this computer's station » sur l'alerte d'un projet (#3637)", () => {
  test("c'est le `station start <station>` du geste `demarrage` de l'icône, pour ce projet", async () => {
    const lances: string[] = [];
    const rendu = await demarrerLaStationDuProject({ nom: "parade", faits: facts(0, 0) }, async (project, command) => (lances.push(`${project} ${command}`), ok("")), 30_000);
    assert.deepEqual(lances, ["parade station start mac/claude"]);
    assert.deepEqual(rendu, {});
  });

  test("la station qui ne démarre pas rend sa raison ; un projet dont rien ne se lit n'envoie rien", async () => {
    const refusal = await demarrerLaStationDuProject({ nom: "parade", faits: facts(0, 0) }, async () => rate(1, "no node"), 30_000);
    assert.match(refusal.refus ?? "", /^parade: station start mac\/claude failed — .*→ exit code 1$/s);
    assert.deepEqual(await demarrerLaStationDuProject({ nom: "parade", faits: undefined }, async () => assert.fail("rien ne part"), 30_000), { refus: "no project of this station could be read: nothing was sent" });
  });
});

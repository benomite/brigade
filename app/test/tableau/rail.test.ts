// La vue du rail d'un projet, nourrie de GitHub seul (app/src/tableau/rail.ts, #1694) : le tableau de la cuisine que la
// box publie donne ce que le rail lisait par `ssh` — ses tickets et leur état, les cooks en cours, les cartes, ce qui
// attend le chef —, sous la forme que ce qui le dessine reçoit déjà (faits.ts, attend.ts, bon.ts, manager.ts, amont.ts).
// GitHub est une doublure ; tout lancement de processus — un `ssh` d'abord — fait échouer le test.
import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { readFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { test, type TestContext } from "node:test";
import { mettreAPart } from "../../src/attend.ts";
import { lancerGeste } from "../../src/box.ts";
import { lignesDuRail } from "../../src/bon.ts";
import { comprendre, rail, tenirFaits, titreDEchec, type Dessinable } from "../../src/faits.ts";
import { voir as voirAmont } from "../../src/amont.ts";
import { voir as voirManager } from "../../src/manager.ts";
import { lireLeTableauDuDepot, type LectureDuTableauDuDepot, type TableauLu } from "../../src/tableau/lecture.ts";
import { lectureDuTableau, ouvrirVeilleDuTableau, statusDuTableau, tenirLecturesDuTableau, type LectureDuRail } from "../../src/tableau/rail.ts";
import { DEPOT, githubDuTableau, LU_LE, projetPublie } from "./projet-publie.ts";

const LU_PAR_L_APP = new Date("2026-10-12T10:05:00.000Z");
const PROJET = { nom: "brigade" };

// Aucun processus ne part pendant le test : `ssh` ni rien d'autre. Chaque tentative est notée, et échoue.
function sansProcessus(t: TestContext): string[] {
  const lances: string[] = [];
  const module = childProcess as unknown as Record<string, (...args: unknown[]) => unknown>;
  for (const nom of ["execFile", "execFileSync", "spawn", "spawnSync", "exec", "execSync", "fork"]) {
    t.mock.method(module, nom, (commande: unknown, args: unknown) => {
      lances.push([String(commande), ...(Array.isArray(args) ? args.map(String) : [])].join(" "));
      throw new Error(`no process may be launched to draw the rail: ${String(commande)}`);
    });
  }
  // Les imports nommés de `node:child_process` (box.ts, `execFile`) suivent la doublure.
  syncBuiltinESMExports();
  t.after(() => syncBuiltinESMExports());
  return lances;
}

async function lu(corps: string): Promise<TableauLu> {
  const lecture = await lireLeTableauDuDepot({ depot: DEPOT, appeler: githubDuTableau(corps).appeler, maintenant: () => LU_PAR_L_APP });
  assert.ok(lecture.lu, lecture.lu ? "" : lecture.raison);
  return lecture;
}

const sortie = (lecture: LectureDuRail, commande: string) => ("erreur" in lecture ? assert.fail(lecture.erreur) : (lecture.sorties.find((s) => s.commande === commande)?.texte ?? assert.fail(`no ${commande}`)));

// Les lectures que les veilles du rail et des faits rendent, une fois chacune.
async function lireParLesVeilles(appeler: Parameters<typeof lireLeTableauDuDepot>[0]["appeler"]) {
  const tableaux = tenirLecturesDuTableau<typeof PROJET>({ lire: () => lireLeTableauDuDepot({ depot: DEPOT, appeler, maintenant: () => LU_PAR_L_APP }), fraicheurMs: 60_000 });
  const lectures = new Map<string, LectureDuRail>();
  const { promise: lues, resolve: toutLu } = Promise.withResolvers<void>();
  const recevoir = (commande: string) => (lecture: LectureDuRail) => {
    lectures.set(commande, lecture);
    if (lectures.size === 2) toutLu();
  };
  const veille = ouvrirVeilleDuTableau({ lire: tableaux.lire, intervalleMs: 3_600_000, surLecture: recevoir("status") });
  const veilleDesFaits = ouvrirVeilleDuTableau({ lire: tableaux.lire, intervalleMs: 3_600_000, surLecture: recevoir("facts") });
  veille.regarder([PROJET], ["status"], 1);
  veilleDesFaits.regarder([PROJET], ["facts"], 2);
  await lues;
  veille.fermer();
  veilleDesFaits.fermer();
  return { status: lectures.get("status") as LectureDuRail, facts: lectures.get("facts") as LectureDuRail, tableaux };
}

test("la garde prend un `ssh` lancé par le chemin des box : c'est elle qui ferait échouer le rail s'il en lançait un", async (t) => {
  const lances = sansProcessus(t);
  await assert.rejects(lancerGeste({ ssh: "ssh", delaiMs: 1_000, connexionS: 1 }, { nom: "brigade", box: { hote: "box" } }, "facts"), /no process may be launched to draw the rail: ssh/);
  assert.equal(lances.length, 1);
  assert.match(lances[0] ?? "", /^ssh .* box brigade brigade facts$/);
});

test("GitHub seul, aucune box jointe : la couche de données du rail rend les tickets et leur état, les cooks en cours, les cartes et ce qui attend le chef", async (t) => {
  const lances = sansProcessus(t);
  const { corps } = projetPublie(t);
  const { appeler, chemins } = githubDuTableau(corps);
  const { status, facts } = await lireParLesVeilles(appeler);
  // Les deux veilles ont lu le même tableau : une seule demande à GitHub.
  assert.equal(chemins.length, 1);
  assert.deepEqual([status.projet, status.demande, facts.projet, facts.demande], ["brigade", 1, "brigade", 2]);

  // Ce que le process principal en fait, tel quel : `status` mis à part, puis les faits reçus.
  const tenus = tenirFaits();
  tenus.attendre(mettreAPart(status));
  const recue: Dessinable = tenus.recevoir(facts);
  assert.ok("tableau" in recue, JSON.stringify(recue).slice(0, 400));
  const { tableau } = recue;
  const colonne = (nom: string) => tableau.rail.colonnes.find((c) => c.nom === nom)?.cartes.map(({ ticket, etat }) => [ticket, etat]);

  // Les tickets et leur état, chacun dans sa colonne.
  assert.deepEqual(tableau.rail.colonnes.map(({ nom }) => nom), ["On the rail", "Taken", "Pass", "TODO", "WAITING", "Served"]);
  assert.deepEqual(colonne("Taken"), [
    [23, "pris"],
    [31, "pris"],
    [39, "pris"],
  ]);
  assert.deepEqual(colonne("Pass"), [
    [17, "en pass"],
    [20, "en pass"],
  ]);
  assert.deepEqual(colonne("On the rail")?.slice(0, 2), [
    [30, "en attente"],
    [25, "86"],
  ]);
  assert.deepEqual(colonne("WAITING"), [[35, "WAITING"]]);
  assert.deepEqual(colonne("Served")?.map(([ticket]) => ticket), [40, 41]);
  // Ce qu'une carte tire de la ligne `status` de son ticket : la priorité, et qui la tient.
  const carte30 = tableau.rail.colonnes.flatMap(({ cartes }) => cartes).find(({ ticket }) => ticket === 30);
  assert.equal(carte30?.prio, "prio:0");
  assert.ok(tableau.rail.railLu !== undefined, "les lignes du rail ont été lues");

  // Les cooks en cours : quel ticket, sur quelle station.
  assert.deepEqual(tableau.cooks.enCours.map(({ ticket, station }) => [ticket, station]), [
    [31, "box/claude"],
    [23, "box/claude"],
  ]);

  // Ce qui attend le chef : TODO, dans l'ordre du bloc `awaiting`, la carte de #24 avec sa question et ses choix.
  const todo = tableau.rail.colonnes.find((c) => c.nom === "TODO")?.cartes ?? [];
  assert.deepEqual(todo.map(({ ticket }) => ticket), [18, 19, 24]);
  assert.ok(todo.every(({ attendu }) => attendu));
  assert.ok(tableau.rail.attendLu !== undefined, "le bloc `awaiting` a été pris");
  const carte24 = todo.find(({ ticket }) => ticket === 24);
  assert.equal(carte24?.todo?.question, "One list per project, or one for all?");
  assert.deepEqual(carte24?.todo?.choix.map(({ texte }) => texte), ["One per project.", "One for all."]);
  // Ce que le bloc dit de #18, mot pour mot, est sur sa carte.
  assert.ok((todo.find(({ ticket }) => ticket === 18)?.attend ?? []).length > 0);

  assert.deepEqual(lances, [], "aucun processus n'est parti");
});

test("le rail tiré du tableau est celui que la box rendait par `ssh`, du même état au même instant", async (t) => {
  sansProcessus(t);
  const { corps, facts, status } = projetPublie(t);
  const publie = await lu(corps);
  const parLeTableau = lectureDuTableau(publie, "brigade", 1, ["facts", "status"]);
  const montree = mettreAPart({ projet: "brigade", demande: 1, a: LU_LE.toISOString(), sorties: [{ commande: "status", texte: sortie(parLeTableau, "status") }] });
  const parSsh = mettreAPart({ projet: "brigade", demande: 1, a: LU_LE.toISOString(), sorties: [{ commande: "status", texte: status }] });
  assert.ok(!("erreur" in montree) && !("erreur" in parSsh));
  // Le bloc `awaiting`, mot pour mot.
  assert.equal(montree.attend, parSsh.attend);
  // Les lignes du rail, mot pour mot.
  assert.deepEqual(lignesDuRail(montree.sorties[0]?.texte ?? ""), lignesDuRail(parSsh.sorties[0]?.texte ?? ""));
  // Le rail entier — colonnes, cartes, ce qu'elles disent.
  const deux = (faits: string, m: typeof montree) => {
    const lus = comprendre(faits);
    assert.ok(!("informe" in lus), "informe" in lus ? lus.informe : "");
    return rail(lus, { bloc: m.attend ?? "", a: m.a }, { texte: m.sorties[0]?.texte ?? "", a: m.a });
  };
  assert.deepEqual(deux(sortie(parLeTableau, "facts"), montree), deux(facts, parSsh));
});

test("la sortie de `status` refaite du tableau : ses rubriques, le bloc `awaiting` de la file juste avant la ligne `rail`, et sous elle la ligne de chaque ticket", async (t) => {
  const { corps } = projetPublie(t);
  const publie = await lu(corps);
  const texte = statusDuTableau(publie);
  const lignes = texte.split("\n");
  const rangRail = lignes.findIndex((l) => /^rail\s/.test(l));
  const finAwaiting = lignes.indexOf("end awaiting");
  assert.ok(lignes.findIndex((l) => l.startsWith("awaiting   ")) < finAwaiting && finAwaiting < rangRail);
  assert.deepEqual(lignes.slice(rangRail + 1, rangRail + 1 + (publie.lignesDuRail?.length ?? 0)), publie.lignesDuRail?.map(({ ligne }) => ligne));
  assert.match(texte, /^project {4}/m);
  // Ce que seule la box lit n'y est pas : les derniers événements.
  assert.doesNotMatch(texte, /^latest events$/m);
  // Une file vide : le bloc le dit, comme `status`.
  assert.match(statusDuTableau({ ...publie, file: [], bilans: [] }), /^awaiting {3}nothing awaits the chef\nend awaiting$/m);
});

test("le manager suit l'interrupteur du projet, que le tableau porte : sa ligne se lit comme celle de `manager`", async (t) => {
  const { corps } = projetPublie(t);
  const publie = await lu(corps);
  const interrupteur = publie.cuisine.rubriques.find(({ titre }) => titre === "switch")?.lignes[0];
  const avec: TableauLu = interrupteur === undefined ? { ...publie, cuisine: { ...publie.cuisine, rubriques: [...publie.cuisine.rubriques, { titre: "switch", lignes: ["ON since 2026-10-12T08:00:00.000Z (by chef) — the manager judges and splits"] }] } } : publie;
  const vu = voirManager(lectureDuTableau(avec, "brigade", 1, ["manager"]));
  assert.ok(!("sans" in vu), JSON.stringify(vu));
  assert.equal(vu.interrupteur.allume, true);
  // Sans la ligne, le manager n'est pas dit : jamais « éteint ».
  const sans = { ...avec, cuisine: { ...avec.cuisine, rubriques: avec.cuisine.rubriques.filter(({ titre }) => titre !== "switch") } };
  const lecture = lectureDuTableau(sans, "brigade", 1, ["manager"]);
  assert.ok("erreur" in lecture && lecture.duTableau === true);
  assert.match(lecture.erreur, /^The project switch is not on the Kitchen board of acme\/brigade \(issue 7\)/);
});

test("ce que le tableau ne porte pas — ce qui est en amont du rail — se dit en une phrase, jamais « rien à venir », et rien d'autre n'est lu", async (t) => {
  const lances = sansProcessus(t);
  const { corps } = projetPublie(t);
  const lecture = lectureDuTableau(await lu(corps), "brigade", 1, ["manager upstream"]);
  assert.ok("erreur" in lecture && lecture.duTableau === true);
  const vu = voirAmont(lecture);
  assert.ok("sans" in vu);
  assert.equal(vu.sans, "what is upcoming was not read: `manager upstream` is not on the Kitchen board of acme/brigade (issue 7): the box does not publish it there. This is not “nothing upcoming”");
  assert.deepEqual(lances, []);
});

test("un tableau qui ne se lit pas, ou qui ne porte pas le rail : un échec en une phrase, dit comme tel — ni « station injoignable », ni un rail vide", async (t) => {
  const { corps } = projetPublie(t);
  const non: LectureDuTableauDuDepot = { lu: false, depot: DEPOT, luLe: LU_PAR_L_APP.toISOString(), raison: "GitHub could not be reached to read the Kitchen board of acme/brigade: getaddrinfo ENOTFOUND api.github.com." };
  const rate = lectureDuTableau(non, "brigade", 3, ["facts"]);
  assert.deepEqual(rate, { projet: "brigade", demande: 3, a: LU_PAR_L_APP.toISOString(), erreur: non.raison, atteinte: true, cas: null, duTableau: true });
  assert.ok("erreur" in rate);
  assert.equal(titreDEchec(rate), "NOT READ FROM THE KITCHEN BOARD");
  const recue = tenirFaits().recevoir(rate);
  assert.ok("titre" in recue && "erreur" in recue);
  assert.equal(recue.titre, "NOT READ FROM THE KITCHEN BOARD");

  const publie = await lu(corps);
  const { faits: _faits, ...davant } = publie;
  const ancien = lectureDuTableau(davant, "brigade", 1, ["facts"]);
  assert.match("erreur" in ancien ? ancien.erreur : "", /^The rail is not on the Kitchen board of acme\/brigade \(issue 7\): the box that serves it publishes a board from before the rail was on it — update brigade on the box\.$/);
  const resserre = lectureDuTableau({ ...davant, resserre: ["faits.livres.relecture", "faits.attend.livraison", "faits.corrections.diff", "faits", "lignesDuRail"] }, "brigade", 1, ["facts"]);
  assert.match("erreur" in resserre ? resserre.erreur : "", /the board was too long for GitHub, and the box had to leave the rail out of it/);
});

test("les lectures du tableau : une seule à la fois par projet, reprise tant qu'elle est fraîche ; « read again » la refait ; la dernière réussie est gardée", async (t) => {
  const { corps } = projetPublie(t);
  let instant = 0;
  let appels = 0;
  const tableaux = tenirLecturesDuTableau<typeof PROJET>({
    lire: () => {
      appels += 1;
      return lireLeTableauDuDepot({ depot: DEPOT, appeler: githubDuTableau(appels === 3 ? { status: 503, data: { message: "Unavailable" } } : corps).appeler, maintenant: () => LU_PAR_L_APP });
    },
    fraicheurMs: 15_000,
    maintenant: () => instant,
  });
  assert.equal(tableaux.dernier("brigade"), undefined);
  await Promise.all([tableaux.lire(PROJET), tableaux.lire(PROJET)]);
  assert.equal(appels, 1);
  instant = 14_999;
  await tableaux.lire(PROJET);
  assert.equal(appels, 1);
  instant = 15_000;
  await tableaux.lire(PROJET);
  assert.equal(appels, 2);
  assert.equal(tableaux.dernier("brigade")?.numero, 7);
  // Relue tout de suite, sans attendre : GitHub refuse — la dernière réussie reste celle que visent les gestes.
  tableaux.oublier();
  const ratee = await tableaux.lire(PROJET);
  assert.equal(appels, 3);
  assert.equal(ratee.lu, false);
  assert.equal(tableaux.dernier("brigade")?.numero, 7);
});

test("la veille du tableau ne lit que les projets dont la vue lit le rail, puis se tait quand on la ferme", async () => {
  const lus: string[] = [];
  const recues: LectureDuRail[] = [];
  const { promise: lue, resolve } = Promise.withResolvers<void>();
  const veille = ouvrirVeilleDuTableau<{ nom: string; ici: boolean }>({
    lire: async (projet) => {
      lus.push(projet.nom);
      return { lu: false, depot: projet.nom, luLe: LU_PAR_L_APP.toISOString(), raison: "no board." };
    },
    intervalleMs: 3_600_000,
    lisible: ({ ici }) => ici,
    surLecture: (lecture) => {
      recues.push(lecture);
      resolve();
    },
  });
  veille.regarder([{ nom: "loin", ici: false }, { nom: "brigade", ici: true }], ["facts"], 4);
  await lue;
  veille.fermer();
  assert.deepEqual(lus, ["brigade"]);
  assert.deepEqual(recues.map(({ projet, demande }) => [projet, demande]), [["brigade", 4]]);
});

// Le graphe des imports d'un module, de proche en proche, en chemins relatifs à la racine du dépôt — types compris.
const RACINE = resolve(import.meta.dirname, "..", "..", "..");
function graphe(entree: string): string[] {
  const vus = new Set<string>();
  const pile = [resolve(RACINE, entree)];
  while (pile.length > 0) {
    const fichier = pile.pop() as string;
    if (vus.has(fichier)) continue;
    vus.add(fichier);
    for (const [, specificateur = ""] of readFileSync(fichier, "utf8").matchAll(/\b(?:import|export)\b[^"'`;]*?\bfrom\s*"([^"]+)"/g)) {
      if (specificateur.startsWith(".")) pile.push(resolve(dirname(fichier), specificateur));
      else vus.add(specificateur);
    }
  }
  return [...vus].map((chemin) => (chemin.startsWith(RACINE) ? relative(RACINE, chemin).split("\\").join("/") : chemin)).sort();
}

test("aucun chemin qui dessine le rail n'ouvre `ssh` : ses veilles lisent le tableau, et `ssh` reste au terminal vivant d'un cook", () => {
  // La couche de données du rail et ses gestes n'importent rien qui lance un processus.
  for (const module of ["app/src/tableau/rail.ts", "app/src/tableau-gestes/rail.ts"]) {
    const importes = graphe(module);
    assert.ok(!importes.includes("node:child_process"), `${module} : ${importes.join(", ")}`);
    assert.ok(!importes.some((chemin) => /app\/src\/(box|terminaux|pty)\.ts$/.test(chemin)), `${module} : ${importes.join(", ")}`);
    assert.doesNotMatch(readFileSync(join(RACINE, module), "utf8").replace(/^\s*\/\/.*$/gm, ""), /BRIGADE_SSH_BIN|\bssh\b/, `${module} n'appelle aucun code ssh`);
  }
  // Dans le process principal, les quatre veilles qui dessinent le rail — `status`, les faits, le manager, l'amont —
  // sont celles du tableau : aucune ne reçoit de `ssh`.
  const main = readFileSync(join(RACINE, "app/src/main.ts"), "utf8");
  for (const veille of ["veille", "veilleDesFaits", "veilleDuManager", "veilleDeLAmont"]) {
    const declaration = new RegExp(`^const ${veille} = (\\w+)\\(\\{([\\s\\S]*?)^\\}\\);`, "m").exec(main);
    assert.equal(declaration?.[1], "ouvrirVeilleDuTableau", veille);
    assert.doesNotMatch(declaration?.[2] ?? "", /\bssh\b/, veille);
  }
  // Les gestes du rail que le tableau porte — merger, retirer, répondre à une carte — partent sur le tableau.
  assert.match(main, /ipcMain\.handle\("gesteDeFiche"[\s\S]*?gesteDeFicheAuTableau\(tableaux\.dernier/);
  assert.match(main, /ipcMain\.handle\("repondreCarte"[\s\S]*?reponseDeCarteAuTableau\(tableaux\.dernier[\s\S]*?\}\);/);
  assert.doesNotMatch(/ipcMain\.handle\("repondreCarte"[\s\S]*?\n\}\);/.exec(main)?.[0] ?? "", /\bssh\b|passage/);
  // Le terminal vivant d'un cook, lui, garde son `ssh` : un geste explicite, à part.
  assert.match(main, /const terminaux = ouvrirTerminaux\(\{[\s\S]*?ssh: process\.env\.BRIGADE_SSH_BIN \|\| "ssh"/);
});

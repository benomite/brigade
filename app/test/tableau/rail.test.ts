// La vue du rail d'un projet, nourrie de GitHub seul (app/src/tableau/rail.ts, #1694, #2061) : la lecture des issues, de
// leurs labels et des PR du dépôt donne ce que le rail lisait de la station — ses tickets et leur état, les cooks en
// cours, ce qui attend le chef —, sous la forme que ce qui le dessine reçoit déjà (faits.ts, attend.ts, bon.ts,
// amont.ts). GitHub est une doublure ; tout lancement de processus — le geste de la station d'abord — fait échouer le
// test.
import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { readFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { test, type TestContext } from "node:test";
import { mettreAPart, ticketsDe } from "../../src/attend.ts";
import { GESTE, lancerLa } from "../../src/box.ts";
import { voir as voirAmont } from "../../src/amont.ts";
import { tenirFaits, titreDEchec, type Dessinable } from "../../src/faits.ts";
import { avecCeQuiAttendLeChef } from "../../src/tableau/attente-du-chef.ts";
import type { AppelGitHub, ReponseGitHub } from "../../src/tableau/client.ts";
import { lireLeTableauDuDepot, type LectureDuTableauDuDepot, type LigneDeLaFile, type TableauLu } from "../../src/tableau/lecture.ts";
import {
  amontDuTableau,
  lectureDuTableau,
  ouvrirVeilleDuTableau,
  sortieDuTableau,
  statusDuTableau,
  tenirLecturesDuTableau,
  type LectureDuRail,
} from "../../src/tableau/rail.ts";

const DEPOT = "acme/brigade";
const LU_PAR_L_APP = new Date("2026-10-12T10:05:00.000Z");
const PROJET = { nom: "brigade" };

// Aucun processus ne part pendant le test. Chaque tentative est notée, et échoue.
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

const ok = (data: unknown): ReponseGitHub => ({ status: 200, data });
const issue = (number: number, labels: string[], extra: object = {}) => ({
  number,
  title: `Ticket ${number}`,
  html_url: `https://github.com/${DEPOT}/issues/${number}`,
  created_at: "2026-10-12T08:00:00Z",
  labels: labels.map((name) => ({ name })),
  ...extra,
});
const prise = (id: number, station: string, le: string) => ({ id, body: `<!-- brigade:prise station=${station} -->`, author_association: "OWNER", created_at: le });

// Le projet sur GitHub : #30 en attente (prio:0), #23 pris par box/claude, #17 en pass (PR #50) cuisiné par mac/claude,
// #35 en WAITING ; #60, une épique, avant le rail ; #24, une carte du chef (`chef-todo`) qui pose une question.
// `chemins` : ce qui a été demandé.
function github(chemins: string[] = []): AppelGitHub {
  const auFeu = [issue(30, ["fire", "prio:0"]), issue(23, ["fire", "taken"]), issue(17, ["fire", "in-pass"]), issue(35, ["fire", "waiting", "taken"])];
  return async (chemin) => {
    chemins.push(chemin);
    if (chemin.includes("/issues?") && chemin.includes("labels=fire")) return ok(auFeu);
    if (chemin.includes("/issues?") && chemin.includes("labels=chef-todo")) return ok([issue(24, ["chef-todo"])]);
    if (chemin.includes("/issues?")) return ok([...auFeu, issue(60, ["epic"]), issue(24, ["chef-todo"])]);
    if (chemin.includes("/pulls?")) return ok([{ number: 50, html_url: `https://github.com/${DEPOT}/pull/50`, created_at: "2026-10-12T09:30:00Z", head: { ref: "cook/17-rail" }, body: "" }]);
    if (chemin === `/repos/${DEPOT}`) return ok({ default_branch: "main" });
    if (chemin.includes("/commits/main/check-runs")) return ok({ check_runs: [{ conclusion: "success" }] });
    if (chemin.includes("/issues/23/comments")) return ok([prise(1, "box/claude", "2026-10-12T09:00:00Z")]);
    if (chemin.includes("/issues/17/comments")) return ok([prise(2, "mac/claude", "2026-10-12T08:30:00Z")]);
    if (chemin.includes("/issues/24/comments")) return ok([{ body: "<!-- brigade:todo kind=product-question -->\nOne list per project, or one for all?" }]);
    if (/\/issues\/\d+\/(comments|events)/.test(chemin)) return ok([]);
    return { status: 404, data: {} };
  };
}

// La lecture d'un projet, comme le process principal la fait (main.ts) : le rail, puis ce qui attend le chef.
async function lireLeProjet(appeler: AppelGitHub): Promise<LectureDuTableauDuDepot> {
  return avecCeQuiAttendLeChef(await lireLeTableauDuDepot({ depot: DEPOT, appeler, maintenant: () => LU_PAR_L_APP }), appeler);
}
async function lu(appeler: AppelGitHub = github()): Promise<TableauLu> {
  const lecture = await lireLeProjet(appeler);
  assert.ok(lecture.lu, lecture.lu ? "" : lecture.raison);
  return lecture;
}

// Une lecture faite à la main : ce que `status` en tire seulement. `file` : ce qui attend le chef (attente-du-chef.ts).
const ecrite = (file: LigneDeLaFile[], bilans: string[] = []): Pick<TableauLu, "file" | "bilans" | "luLe" | "cuisine" | "lignesDuRail"> => ({
  file,
  bilans,
  luLe: LU_PAR_L_APP.toISOString(),
  cuisine: { rubriques: [{ titre: "kitchen", lignes: ["open"] }, { titre: "rail", lignes: ["1 queued"] }, { titre: "cooks", lignes: ["none running"] }] },
  lignesDuRail: [{ ticket: 30, priorite: 0, ligne: "  #30  queued  prio:0  since 2026-10-12 08:00 UTC  Ticket 30" }],
});

// Les lectures que les veilles du rail et des faits rendent, une fois chacune.
async function lireParLesVeilles(appeler: AppelGitHub) {
  const tableaux = tenirLecturesDuTableau<typeof PROJET>({ lire: () => lireLeProjet(appeler), fraicheurMs: 60_000 });
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

test("la garde prend le geste de la station lancé par le chemin des veilles : c'est elle qui ferait échouer le rail s'il en lançait un", async (t) => {
  const lances = sansProcessus(t);
  const locale = { node: "/usr/bin/fausse-node", runtime: "/tmp/runtime", racine: "/tmp/station", env: {} };
  await assert.rejects(lancerLa({ delaiMs: 1_000 }, { nom: "brigade", cuisine: { locale } }, "facts"), /no process may be launched to draw the rail: \/usr\/bin\/fausse-node/);
  assert.equal(lances.length, 1);
  assert.match(lances[0] ?? "", new RegExp(`^/usr/bin/fausse-node ${join("/tmp/runtime", GESTE).replace(/[\\/.]/g, "\\$&")} brigade facts$`));
});

test("GitHub seul, aucune box jointe : la couche de données du rail rend les tickets et leur état, les cooks en cours, et les cartes du chef", async (t) => {
  const lances = sansProcessus(t);
  const chemins: string[] = [];
  const { status, facts } = await lireParLesVeilles(github(chemins));
  // Les deux veilles ont lu le même rail : une seule lecture de GitHub — le rail, puis ce qui attend le chef, qui relit
  // les tickets `fire` mis de côté (attente-du-chef.ts).
  assert.equal(chemins.filter((chemin) => chemin.includes("labels=fire")).length, 2);
  assert.equal(chemins.filter((chemin) => chemin.includes("labels=chef-todo")).length, 1);
  assert.deepEqual([status.projet, status.demande, facts.projet, facts.demande], ["brigade", 1, "brigade", 2]);
  // L'âge du rail : l'heure de sa lecture sur GitHub.
  assert.ok(!("erreur" in facts));
  assert.equal(facts.publieLe, LU_PAR_L_APP.toISOString());

  // Ce que le process principal en fait, tel quel : `status` mis à part, puis les faits reçus.
  const tenus = tenirFaits();
  tenus.attendre(mettreAPart(status));
  const recue: Dessinable = tenus.recevoir(facts);
  assert.ok("tableau" in recue, JSON.stringify(recue).slice(0, 400));
  const { tableau } = recue;
  const colonne = (nom: string) => tableau.rail.colonnes.find((c) => c.nom === nom)?.cartes.map(({ ticket, etat }) => [ticket, etat]);

  // Les tickets et leur état, chacun dans sa colonne.
  assert.deepEqual(tableau.rail.colonnes.map(({ nom }) => nom), ["On the rail", "Taken", "Pass", "Awaiting you", "Waiting", "Served"]);
  assert.deepEqual(colonne("On the rail"), [[30, "en attente"]]);
  assert.deepEqual(colonne("Taken"), [[23, "pris"]]);
  assert.deepEqual(colonne("Pass"), [[17, "en pass"]]);
  assert.deepEqual(colonne("Waiting"), [[35, "WAITING"]]);
  // Ce qu'une carte tire de la ligne `status` de son ticket : la priorité, et qui la tient.
  const carte30 = tableau.rail.colonnes.flatMap(({ cartes }) => cartes).find(({ ticket }) => ticket === 30);
  assert.equal(carte30?.prio, "prio:0");
  assert.ok(tableau.rail.railLu !== undefined, "les lignes du rail ont été lues");

  // Les cooks en cours : quel ticket, sur quelle station.
  assert.deepEqual(tableau.cooks.enCours.map(({ ticket, station }) => [ticket, station]).sort(), [
    [17, "mac/claude"],
    [23, "box/claude"],
  ]);

  // Ce qui attend le chef : TODO, la carte de #24 avec sa sorte et son texte.
  const todo = tableau.rail.colonnes.find((c) => c.nom === "Awaiting you")?.cartes ?? [];
  assert.deepEqual(todo.map(({ ticket }) => ticket), [24]);
  assert.ok(todo.every(({ attendu }) => attendu));
  assert.ok(tableau.rail.attendLu !== undefined, "le bloc `awaiting` a été pris");
  assert.deepEqual(todo[0]?.chef, { sorte: "product-question", texte: "One list per project, or one for all?" });

  assert.deepEqual(lances, [], "aucun processus n'est parti");
});

test("la sortie de `status` refaite de la lecture : ses rubriques, le bloc `awaiting` juste avant la ligne `rail`, et sous elle la ligne de chaque ticket", async () => {
  const publie = await lu();
  const texte = statusDuTableau(publie);
  const lignes = texte.split("\n");
  const rangRail = lignes.findIndex((l) => /^rail\s/.test(l));
  const finAwaiting = lignes.indexOf("end awaiting");
  assert.ok(lignes.findIndex((l) => l.startsWith("awaiting   ")) < finAwaiting && finAwaiting < rangRail);
  assert.equal(lignes[rangRail], "rail       1 taken · 1 in pass · 1 WAITING · 1 queued");
  assert.deepEqual(lignes.slice(rangRail + 1, rangRail + 1 + publie.lignesDuRail.length), publie.lignesDuRail.map(({ ligne }) => ligne));
  assert.match(texte, /^cooks {6}2 running$/m);
  // Ce que seule la box lit n'y est pas : les derniers événements.
  assert.doesNotMatch(texte, /^latest events$/m);
  // Les rubriques d'avant `rail` restent avant le bloc, celles d'après après lui.
  const main = statusDuTableau(ecrite([])).split("\n");
  assert.deepEqual(main, ["kitchen    open", "", "awaiting   nothing awaits the chef", "end awaiting", "", "rail       1 queued", "  #30  queued  prio:0  since 2026-10-12 08:00 UTC  Ticket 30", "", "cooks      none running", ""]);
});

test("le bloc `awaiting` de `status` : ce qui attend le chef, une ligne par entrée, datée jusqu'à la lecture, puis ce qui n'en est pas une", async () => {
  const entree = (ticket: number, depuis: string): LigneDeLaFile => ({ nom: `#${ticket}`, ticket, titre: `Ticket ${ticket}`, quoi: "carte", depuis, ligne: "Which plan? — answer on its Todo card, in your own words" });
  const bloc = (file: LigneDeLaFile[], bilans: string[] = []) => mettreAPart({ projet: "brigade", demande: 1, a: LU_PAR_L_APP.toISOString(), sorties: [{ commande: "status", texte: statusDuTableau(ecrite(file, bilans)) }] });
  const aucune = bloc([]);
  const deux = bloc([entree(24, "2026-10-12T09:05:00.000Z"), entree(25, "2026-10-12T10:00:00.000Z")], ["#26 carries `chef-todo` but is not shown in Todo"]);
  assert.ok(!("erreur" in aucune) && !("erreur" in deux));
  assert.match(aucune.attend ?? "", /^awaiting {3}nothing awaits the chef\nend awaiting/);
  assert.equal(
    deux.attend,
    ["awaiting   2 decisions await the chef — the oldest for 1 h 00", "  #24  for 1 h 00  Which plan? — answer on its Todo card, in your own words  Ticket 24", "  #25  for 5 min  Which plan? — answer on its Todo card, in your own words  Ticket 25", "  #26 carries `chef-todo` but is not shown in Todo", "end awaiting", ""].join("\n"),
  );
  assert.deepEqual(ticketsDe(deux.attend ?? "").map(({ ticket }) => ticket), [24, 25]);
  // Lue de GitHub : la carte du chef #24, sa question et son geste.
  assert.match(statusDuTableau(await lu()), /^awaiting {3}1 decision awaits the chef — for .*\n {2}#24 {2}for .* {2}One list per project, or one for all\? — answer on its Todo card, in your own words {2}Ticket 24\nend awaiting$/m);
});

test("ce qui est avant le rail : la sortie de `manager upstream`, chaque issue avec l'adresse de son issue", async () => {
  const publie = await lu();
  const lecture = lectureDuTableau(publie, "brigade", 1, ["manager upstream"]);
  const vu = voirAmont(lecture);
  assert.ok("compte" in vu, JSON.stringify(vu));
  assert.deepEqual(vu.groupes.map(({ etat, issues }) => [etat, issues.map(({ ticket }) => ticket)]), [
    ["non-lue", [24]],
    ["epique", [60]],
  ]);
  assert.deepEqual(JSON.parse(amontDuTableau(publie) ?? "null").issues[1], { ticket: 60, titre: "Ticket 60", priorite: null, etat: "epique", dit: "it carries `epic`: not split yet", url: `https://github.com/${DEPOT}/issues/60` });
});

test("ce qui est avant le rail qui n'a pas été lu n'est ni compté ni dit « pas lu » (#1770), et rien d'autre n'est lu", async (t) => {
  const lances = sansProcessus(t);
  const { avantLeRail: _avant, ...sansAmont } = await lu();
  assert.equal(amontDuTableau(sansAmont), undefined);
  const lecture = lectureDuTableau(sansAmont, "brigade", 1, ["manager upstream"]);
  assert.ok("erreur" in lecture && lecture.duTableau === true && lecture.pasPublie === true);
  const vu = voirAmont(lecture);
  assert.ok("nonPublie" in vu);
  assert.ok(!("sans" in vu) && !("compte" in vu));
  assert.equal(vu.vide, "nothing on the rail");
  assert.deepEqual(lances, []);
});

test("une commande que GitHub ne porte pas : elle n'est pas lue, et la phrase dit que seul le journal de la station la porte", async () => {
  const publie = await lu();
  assert.deepEqual(sortieDuTableau(publie, "manager"), { raison: "`manager` is not read from GitHub for acme/brigade: only the station's log carries it.", pasPublie: true });
  assert.deepEqual(sortieDuTableau(publie, () => "composée"), { raison: "This reading is not read from GitHub for acme/brigade: only the station's log carries it.", pasPublie: true });
  // La première qui ne se lit pas fait l'échec de la lecture entière.
  const lecture = lectureDuTableau(publie, "brigade", 2, ["facts", "manager", "status"]);
  assert.deepEqual(lecture, { projet: "brigade", demande: 2, a: LU_PAR_L_APP.toISOString(), erreur: "`manager` is not read from GitHub for acme/brigade: only the station's log carries it.", atteinte: true, cas: null, duTableau: true, pasPublie: true });
});

test("une lecture réussie : chaque sortie dans l'ordre demandé, et l'heure de la lecture de GitHub", async () => {
  const publie = await lu();
  const lecture = lectureDuTableau(publie, "brigade", 4, ["facts", "status"]);
  assert.ok(!("erreur" in lecture));
  assert.deepEqual(lecture.sorties.map(({ commande }) => commande), ["facts", "status"]);
  assert.deepEqual(JSON.parse(lecture.sorties[0]?.texte ?? ""), publie.faits);
  assert.equal(lecture.sorties[1]?.texte, statusDuTableau(publie));
  assert.equal(lecture.a, LU_PAR_L_APP.toISOString());
  assert.equal(lecture.publieLe, LU_PAR_L_APP.toISOString());
});

test("GitHub qui ne se lit pas : un échec en une phrase, dit comme tel — ni « station injoignable », ni un rail vide ; hors ligne, il le reste", () => {
  const non: LectureDuTableauDuDepot = { lu: false, depot: DEPOT, luLe: LU_PAR_L_APP.toISOString(), raison: "GitHub refused to read the rail of acme/brigade (HTTP 403)." };
  const rate = lectureDuTableau(non, "brigade", 3, ["facts"]);
  assert.deepEqual(rate, { projet: "brigade", demande: 3, a: LU_PAR_L_APP.toISOString(), erreur: non.raison, atteinte: true, cas: null, duTableau: true });
  assert.ok("erreur" in rate);
  assert.equal(titreDEchec(rate), "NOT READ FROM GITHUB");
  const recue = tenirFaits().recevoir(rate);
  assert.ok("titre" in recue && "erreur" in recue);
  assert.equal(recue.titre, "NOT READ FROM GITHUB");
  // GitHub pas joint du tout (#1818) : l'échec le porte jusqu'à ce qui le dessine.
  const injoint: LectureDuTableauDuDepot = { ...non, raison: "GitHub could not be reached to read the rail of acme/brigade: getaddrinfo ENOTFOUND api.github.com.", horsLigne: true };
  assert.deepEqual(lectureDuTableau(injoint, "brigade", 3, ["facts"]), { projet: "brigade", demande: 3, a: LU_PAR_L_APP.toISOString(), erreur: injoint.raison, atteinte: true, cas: null, duTableau: true, horsLigne: true });
});

test("les lectures du rail : une seule à la fois par projet, reprise tant qu'elle est fraîche ; « read again » la refait ; la dernière réussie est gardée", async () => {
  let instant = 0;
  let appels = 0;
  const tableaux = tenirLecturesDuTableau<typeof PROJET>({
    lire: () => {
      appels += 1;
      const appeler: AppelGitHub = appels === 3 ? async () => ({ status: 503, data: { message: "Unavailable" } }) : github();
      return lireLeTableauDuDepot({ depot: DEPOT, appeler, maintenant: () => new Date(LU_PAR_L_APP.getTime() + appels) });
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
  const deuxieme = new Date(LU_PAR_L_APP.getTime() + 2).toISOString();
  assert.equal(tableaux.dernier("brigade")?.luLe, deuxieme);
  // Relue tout de suite, sans attendre : GitHub refuse — la dernière réussie reste celle que visent les gestes.
  tableaux.oublier();
  const ratee = await tableaux.lire(PROJET);
  assert.equal(appels, 3);
  assert.equal(ratee.lu, false);
  assert.equal(tableaux.dernier("brigade")?.luLe, deuxieme);
  assert.equal(tableaux.dernier(undefined), undefined);
});

test("la veille du rail ne lit que les projets dont la vue lit le rail, puis se tait quand on la ferme", async () => {
  const lus: string[] = [];
  const recues: LectureDuRail[] = [];
  const { promise: lue, resolve } = Promise.withResolvers<void>();
  const veille = ouvrirVeilleDuTableau<{ nom: string; ici: boolean }>({
    lire: async (projet) => {
      lus.push(projet.nom);
      return { lu: false, depot: projet.nom, luLe: LU_PAR_L_APP.toISOString(), raison: "no rail." };
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

// Le graphe des imports d'un module qui restent à l'exécution — ceux de types seuls sont effacés —, de proche en
// proche, en chemins relatifs à la racine du dépôt.
const RACINE = resolve(import.meta.dirname, "..", "..", "..");
function graphe(entree: string): string[] {
  const vus = new Set<string>();
  const pile = [resolve(RACINE, entree)];
  while (pile.length > 0) {
    const fichier = pile.pop() as string;
    if (vus.has(fichier)) continue;
    vus.add(fichier);
    for (const [, specificateur = ""] of readFileSync(fichier, "utf8").matchAll(/^\s*(?:import|export)(?!\s+type\b)\b[^"'`;]*?\bfrom\s*"([^"]+)"/gm)) {
      if (specificateur.startsWith(".")) pile.push(resolve(dirname(fichier), specificateur));
      else vus.add(specificateur);
    }
  }
  return [...vus].map((chemin) => (chemin.startsWith(RACINE) ? relative(RACINE, chemin).split("\\").join("/") : chemin)).sort();
}

test("aucun chemin qui dessine le rail ne lance de processus : ses veilles lisent GitHub", () => {
  // La couche de données du rail, sa lecture et ses gestes n'importent rien qui lance un processus.
  for (const module of ["app/src/tableau/rail.ts", "app/src/tableau/lecture.ts", "app/src/tableau/todo-github.ts", "app/src/gestes-github.ts"]) {
    const importes = graphe(module);
    assert.ok(!importes.includes("node:child_process"), `${module} : ${importes.join(", ")}`);
    assert.ok(!importes.some((chemin) => /app\/src\/(box|terminaux|pty)\.ts$/.test(chemin)), `${module} : ${importes.join(", ")}`);
  }
  // Dans le process principal, les trois veilles qui dessinent le rail — `status`, les faits, l'amont — sont celles de
  // GitHub : aucune ne lance de processus.
  const main = readFileSync(join(RACINE, "app/src/main.ts"), "utf8");
  for (const veille of ["veille", "veilleDesFaits", "veilleDeLAmont"]) {
    const declaration = new RegExp(`^const ${veille} = (\\w+)\\(\\{([\\s\\S]*?)^\\}\\);`, "m").exec(main);
    assert.equal(declaration?.[1], "ouvrirVeilleDuTableau", veille);
  }
  // Les gestes du rail qui ont un fait sur GitHub visent la dernière lecture réussie ; seule la carte du chef lue de GitHub
  // se répond, sur son issue (#2434) — toute autre carte ne part pas.
  assert.match(main, /ipcMain\.handle\("gesteDeFiche"[\s\S]*?retirerLeLabel\(tableaux\.dernier/);
  assert.match(main, /ipcMain\.handle\("repondreCarte"[\s\S]*?if \(chef === undefined\) return \{ refus: SANS_FAIT\.carte[\s\S]*?repondreSurGithub\(/);
});

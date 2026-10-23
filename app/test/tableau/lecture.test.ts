// Le tableau de la cuisine d'un projet, lu de GitHub par les apps (app/src/tableau/lecture.ts) : la file et l'état que
// la box a publiés, avec l'âge de la lecture ; et, quand il ne se lit pas, un échec qui dit pourquoi en une phrase —
// jamais une file vide. Rien ne passe par le réseau : l'appel à GitHub est une doublure.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { test } from "node:test";
import { ecrireLeBloc, VERSION_DU_TABLEAU } from "../../../runtime/src/tableau/rendu/bloc.ts";
import type { AppelGitHub, ReponseGitHub } from "../../src/tableau/client.ts";
import { LABEL_DU_TABLEAU, lireLeTableauDuDepot, type LectureDuTableauDuDepot, type TableauNonLu } from "../../src/tableau/lecture.ts";
import { CORPS, GENERE_LE, ISSUE, TABLEAU } from "./fixture.ts";

const DEPOT = "chef/parade";
// L'app lit le tableau 95 secondes après que la box l'a écrit.
const LU_LE = new Date(GENERE_LE.getTime() + 95_000);

// Un GitHub qui rend cette réponse, et retient les chemins demandés.
function github(reponse: ReponseGitHub | (() => Promise<ReponseGitHub>)): { appeler: AppelGitHub; chemins: string[] } {
  const chemins: string[] = [];
  return {
    chemins,
    appeler: async (chemin) => {
      chemins.push(chemin);
      return typeof reponse === "function" ? reponse() : reponse;
    },
  };
}

const lire = (appeler: AppelGitHub, depot = DEPOT) => lireLeTableauDuDepot({ depot, appeler, maintenant: () => LU_LE });

// Un échec, et sa raison : une seule phrase, qui commence par une majuscule et finit par son point.
function echec(lecture: LectureDuTableauDuDepot): TableauNonLu {
  assert.equal(lecture.lu, false, "la lecture échoue");
  if (lecture.lu) throw new Error("lu");
  assert.match(lecture.raison, /^[A-Z0-9`"].*\.$/s, `une phrase : ${lecture.raison}`);
  assert.doesNotMatch(lecture.raison.slice(0, -1), /[.!?]\s/, `une seule phrase : ${lecture.raison}`);
  assert.doesNotMatch(lecture.raison, /\n/);
  assert.equal(lecture.depot, DEPOT);
  assert.equal(lecture.luLe, LU_LE.toISOString());
  return lecture;
}

test("le tableau publié se lit : la même file et le même état que la box a écrits, et l'âge de la lecture en secondes", async () => {
  const { appeler, chemins } = github({ status: 200, data: [ISSUE] });
  const lecture = await lire(appeler);
  assert.ok(lecture.lu, lecture.lu ? "" : lecture.raison);
  assert.deepEqual(lecture.file, TABLEAU.file);
  assert.deepEqual(lecture.bilans, TABLEAU.bilans);
  assert.deepEqual(lecture.cuisine, TABLEAU.cuisine);
  assert.equal(lecture.projet, TABLEAU.projet);
  assert.equal(lecture.age, 95);
  assert.equal(lecture.genereLe, GENERE_LE.toISOString());
  assert.equal(lecture.luLe, LU_LE.toISOString());
  assert.equal(lecture.numero, 7);
  assert.equal(lecture.adresse, "https://github.com/chef/parade/issues/7");
  // Une seule demande : les issues ouvertes au label du tableau, dans le dépôt du projet.
  assert.equal(chemins.length, 1);
  const demande = new URL(`https://api.github.com${chemins[0]}`);
  assert.equal(demande.pathname, `/repos/${DEPOT}/issues`);
  assert.equal(demande.searchParams.get("labels"), LABEL_DU_TABLEAU);
  assert.equal(demande.searchParams.get("state"), "open");
});

test("l'âge se compte jusqu'à l'heure où la réponse est arrivée, pas celle où la demande est partie", async () => {
  let maintenant = GENERE_LE.getTime() + 10_000;
  const lecture = await lireLeTableauDuDepot({
    depot: DEPOT,
    appeler: async () => {
      maintenant += 30_000;
      return { status: 200, data: [ISSUE] };
    },
    maintenant: () => new Date(maintenant),
  });
  assert.ok(lecture.lu);
  assert.equal(lecture.age, 40);
});

test("une box dont l'horloge avance ne donne pas un âge négatif", async () => {
  const lecture = await lireLeTableauDuDepot({ depot: DEPOT, appeler: github({ status: 200, data: [ISSUE] }).appeler, maintenant: () => new Date(GENERE_LE.getTime() - 5_000) });
  assert.ok(lecture.lu);
  assert.equal(lecture.age, 0);
});

test("parmi les issues au label, c'est le tableau de la box qui se lit : ni une PR, ni une issue sans bloc, le plus ancien des ouverts", async () => {
  const autre = { ...ISSUE, number: 3, title: "Something else", body: "labelled by mistake" };
  const pr = { ...ISSUE, number: 2, pull_request: { url: "https://api.github.com/repos/chef/parade/pulls/2" } };
  const recent = { ...ISSUE, number: 12, body: CORPS.replace(`"projet":"parade"`, `"projet":"autre"`) };
  const lecture = await lire(github({ status: 200, data: [recent, autre, pr, ISSUE] }).appeler);
  assert.ok(lecture.lu);
  assert.equal(lecture.numero, 7);
  assert.equal(lecture.projet, "parade");
});

test("GitHub injoignable : un échec qui dit que GitHub n'a pas répondu, et ce que le réseau en a dit", async () => {
  const lecture = echec(await lire(github(() => Promise.reject(new Error("getaddrinfo ENOTFOUND api.github.com\n    at stack"))).appeler));
  assert.equal(lecture.raison, "GitHub could not be reached to read the Kitchen board of chef/parade: getaddrinfo ENOTFOUND api.github.com.");
});

test("GitHub qui refuse : un échec par code, avec ce que GitHub en dit", async () => {
  const nonConnecte = echec(await lire(github({ status: 401, data: { message: "Bad credentials", documentation_url: "https://docs.github.com/rest" } }).appeler));
  assert.match(nonConnecte.raison, /HTTP 401\): Bad credentials — sign in to GitHub again\.$/);
  const prive = echec(await lire(github({ status: 404, data: { message: "Not Found" } }).appeler));
  assert.match(prive.raison, /^GitHub does not show chef\/parade \(HTTP 404\)/);
  const limite = echec(await lire(github({ status: 403, data: { message: "API rate limit exceeded for 1.2.3.4. (But here's the good news: authenticated requests get a higher rate limit.)" } }).appeler));
  assert.equal(limite.raison, "GitHub refused to list the issues of chef/parade (HTTP 403): API rate limit exceeded for 1.2.3.4.");
  const panne = echec(await lire(github({ status: 502, data: "<html><body>Bad gateway</body></html>" }).appeler));
  assert.equal(panne.raison, "GitHub refused to list the issues of chef/parade (HTTP 502).");
});

test("une réponse qui n'est pas une liste d'issues : un échec", async () => {
  const lecture = echec(await lire(github({ status: 200, data: { message: "odd" } }).appeler));
  assert.match(lecture.raison, /is not a list of issues\.$/);
});

test("pas de tableau dans le dépôt : un échec qui le dit, pas une file vide", async () => {
  const vide = echec(await lire(github({ status: 200, data: [] }).appeler));
  assert.equal(vide.raison, "There is no open Kitchen board in chef/parade: the box serving it has not published one yet, or it was closed.");
  const sansLeBloc = echec(await lire(github({ status: 200, data: [{ ...ISSUE, title: "Labelled", body: "no block here" }] }).appeler));
  assert.equal(sansLeBloc.raison, vide.raison);
});

test("le tableau sans bloc machine — retouché à la main —, ou au bloc coupé : un échec qui le dit", async () => {
  const retouche = echec(await lire(github({ status: 200, data: [{ ...ISSUE, body: "# Kitchen board\n\nEdited by hand." }] }).appeler));
  assert.equal(retouche.raison, "The Kitchen board of chef/parade (issue 7) cannot be read: the board carries no machine block: it was not written by the box, or was edited by hand.");
  const coupe = echec(await lire(github({ status: 200, data: [{ ...ISSUE, body: CORPS.slice(0, CORPS.lastIndexOf("-->")) }] }).appeler));
  assert.match(coupe.raison, /cannot be read: the board's machine block is cut off: it has no end\.$/);
  const illisible = echec(await lire(github({ status: 200, data: [{ ...ISSUE, body: "<!-- brigade:kitchen-board\n{not json\n-->" }] }).appeler));
  assert.match(illisible.raison, /is not readable JSON\.$/);
});

test("un tableau d'une version que l'app ne lit pas : un échec qui dit de mettre l'app à jour", async () => {
  const suivante = ecrireLeBloc(TABLEAU, GENERE_LE).replace(`"version":${VERSION_DU_TABLEAU}`, `"version":${VERSION_DU_TABLEAU + 1}`);
  const lecture = echec(await lire(github({ status: 200, data: [{ ...ISSUE, body: `# Kitchen board\n\n${suivante}\n` }] }).appeler));
  assert.equal(lecture.raison, `The Kitchen board of chef/parade (issue 7) cannot be read: the board is in version ${VERSION_DU_TABLEAU + 1}, newer than this app reads (${VERSION_DU_TABLEAU}): update the app.`);
});

test("un dépôt qui n'est pas `<owner>/<repo>` : un échec, et rien ne part vers GitHub", async () => {
  const { appeler, chemins } = github({ status: 200, data: [ISSUE] });
  const lecture = await lireLeTableauDuDepot({ depot: "../evil", appeler, maintenant: () => LU_LE });
  assert.equal(lecture.lu, false);
  assert.match(lecture.lu ? "" : lecture.raison, /is not an owner\/name GitHub repository/);
  assert.deepEqual(chemins, []);
});

// Le graphe des imports d'un module, de proche en proche, en chemins relatifs à la racine du dépôt.
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

test("la lecture du tableau ne joint ni box ni station : ses modules n'importent que le lecteur du runtime, et aucun ne lance `ssh`", () => {
  assert.deepEqual(graphe("app/src/tableau/lecture.ts"), ["app/src/tableau/client.ts", "app/src/tableau/lecture.ts", "runtime/src/tableau/rendu/bloc.ts"]);
  // Le jeton du desktop : `gh auth token`, et rien d'autre.
  assert.deepEqual(graphe("app/src/tableau/jeton-gh.ts"), ["app/src/tableau/jeton-gh.ts", "node:child_process"]);
  for (const module of ["app/src/tableau/lecture.ts", "app/src/tableau/client.ts", "app/src/tableau/jeton-gh.ts", "runtime/src/tableau/rendu/bloc.ts"]) {
    const code = readFileSync(join(RACINE, module), "utf8").replace(/^\s*\/\/.*$/gm, "");
    assert.doesNotMatch(code, /ssh|BRIGADE_SSH_BIN|box\.ts|stations\//i, `${module} n'appelle aucun code ssh`);
  }
});

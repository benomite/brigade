// La lecture des projets sur le téléphone, de GitHub seul (#2501, épique #2498) : connecté à GitHub, le téléphone liste les
// projets du chef — ceux que ses stations servent, écrits dans leurs gists — et lit le rail et TODO de chacun comme le
// desktop, par ses modules. Joué sur un faux GitHub qui rend ce que l'API REST rend, derrière l'envoi même du téléphone :
// aucune station n'existe ici, et chaque adresse demandée est notée — toutes sont celles de l'API de GitHub.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { pathToFileURL } from "node:url";
import { APP } from "../packaging/construire.ts";
import { poserLesModules } from "../packaging/android.ts";
import type { Accueil } from "../src/accueil.ts";
import { mettreAPart } from "../src/attend.ts";
import { tenirFaits, type Dessinable, type Tableau } from "../src/faits.ts";
import { INTERVALLE_MS, lireLesProjetsDuCompte, ouvrirLaLectureGitHub, parCapacitor, type ProjetDuCompte, type TelephoneGitHub } from "../src/lecture-github-telephone.ts";
import { avecCeQuiAttendLeChef } from "../src/tableau/attente-du-chef.ts";
import { API_GITHUB, clientGitHub, type Envoi, type ReponseGitHub } from "../src/tableau/client.ts";
import { lireLeTableauDuDepot } from "../src/tableau/lecture.ts";
import { FAITS, lectureDuTableau, STATUS } from "../src/tableau/rail.ts";

const LU = "2026-11-06T09:00:00.000Z";
const maintenant = () => new Date(LU);
const JETON = "gho_du_coffre";

type Issue = { labels: string[]; commentaires?: unknown[] };
type Monde = { gists: Record<string, Record<string, string>>; depots: Record<string, Record<number, Issue>> };
const dit = (body: string, created_at: string) => ({ id: Date.parse(created_at), body, created_at, author_association: "OWNER" });
const enregistrement = JSON.stringify({ brigade: "station-registration", format: 1, name: "atelier", platform: "linux", machine: "Linux 6.1.0", version: "1.0.0", registeredAt: "2026-11-01T00:00:00Z", lastSeen: LU, refreshMs: 120_000, stoppedAt: null });
const selection = (depots: string[]) => JSON.stringify({ brigade: "station-selection", format: 1, repositories: depots, updatedAt: "2026-11-02T00:00:00Z" });
const demande = (projets: { nom: string; depot: string }[]) => JSON.stringify({ brigade: "projets", format: 1, projets: projets.map((projet) => ({ ...projet, base: "main", principale: true, cooks: 2, manager: { modele: "opus", effort: "high" }, reviewer: { modele: "opus", effort: "high" }, ouvertLe: null, demandeLe: null })) });

// Le compte du chef : `atelier`, une station enregistrée à qui l'app a choisi `chef/parade` et `chef/cantine` ; une
// station appairée à qui elle a demandé `chef/parade` sous le nom `parade` ; et un gist sans rapport.
// `parade` : #1 sur le rail, #12 mis de côté sur une question de produit, #20 une carte du chef, #6 avant le rail.
// `cantine` : rien du tout — ni issue, ni attente.
const MONDE: Monde = {
  gists: {
    a1: { "brigade-enregistrement.json": enregistrement, "brigade-selection.json": selection(["chef/parade", "chef/cantine"]) },
    b2: { "brigade-station.json": "{}", "brigade-projets.json": demande([{ nom: "parade", depot: "chef/parade" }]) },
    c3: { "notes.md": "# rien de brigade" },
  },
  depots: {
    "chef/parade": {
      1: { labels: ["fire", "prio:2"] },
      6: { labels: [] },
      12: { labels: ["fire", "hors-cuisine"], commentaires: [dit("<!-- brigade:todo kind=product-question -->\nDoes the export keep the old column order?\n- [merge] Yes, merge PR #40 as delivered\n- [close] No, we drop the export", "2026-11-06T07:00:00Z")] },
      20: { labels: ["chef-todo"], commentaires: [dit("<!-- brigade:todo kind=blocked -->\nWhich token does the box use for the registry?", "2026-11-06T08:00:00Z")] },
    },
    "chef/cantine": {},
  },
};

// GitHub, faux : ce que l'API REST rend à chaque adresse — ou, pour une adresse que `refuser` nomme, sa réponse à la
// place. Chaque demande est notée, son adresse entière et ses en-têtes. Ce qui n'est pas l'API de GitHub ne répond pas,
// comme une station qui n'existe pas.
function github(monde: Monde = MONDE, refuser: (chemin: string) => ReponseGitHub | Error | undefined = () => undefined) {
  const demandes: { adresse: string; entetes: Record<string, string> }[] = [];
  const ok = (data: unknown): ReponseGitHub => ({ status: 200, data });
  const envoyer: Envoi = async (adresse, entetes) => {
    demandes.push({ adresse, entetes });
    if (!adresse.startsWith(`${API_GITHUB}/`)) throw new Error(`failed to connect to ${adresse}`);
    const chemin = adresse.slice(API_GITHUB.length);
    const refus = refuser(chemin);
    if (refus instanceof Error) throw refus;
    if (refus !== undefined) return refus;
    if (chemin.startsWith("/gists?")) return ok(/[?&]page=1(&|$)/.test(chemin) ? Object.entries(monde.gists).map(([id, fichiers]) => ({ id, files: Object.fromEntries(Object.keys(fichiers).map((filename) => [filename, { filename }])) })) : []);
    const gist = /^\/gists\/([^/?]+)$/.exec(chemin)?.[1];
    if (gist !== undefined) {
      const fichiers = monde.gists[gist];
      return fichiers === undefined ? { status: 404, data: { message: "Not Found" } } : ok({ id: gist, owner: { login: "chef" }, files: Object.fromEntries(Object.entries(fichiers).map(([filename, content]) => [filename, { filename, content }])) });
    }
    const [, depot = "", reste = ""] = /^\/repos\/([^/]+\/[^/?]+)(.*)$/.exec(chemin) ?? [];
    const issues = monde.depots[depot];
    if (issues === undefined) return { status: 404, data: { message: "Not Found" } };
    const page = Number(/[?&]page=(\d+)/.exec(reste)?.[1] ?? "1");
    const json = (numero: number, issue: Issue) => ({ number: numero, title: `Ticket ${numero}`, html_url: `https://github.com/${depot}/issues/${numero}`, created_at: "2026-11-05T00:00:00Z", labels: issue.labels.map((name) => ({ name })) });
    if (reste.startsWith("/issues?")) {
      const label = /[?&]labels=([^&]+)/.exec(reste)?.[1];
      return ok(page > 1 ? [] : Object.entries(issues).filter(([, issue]) => label === undefined || issue.labels.includes(label)).map(([numero, issue]) => json(Number(numero), issue)));
    }
    if (reste.startsWith("/pulls?")) return ok([]);
    const [, numero, quoi] = /^\/issues\/(\d+)\/(comments|events)/.exec(reste) ?? [];
    if (numero !== undefined) return ok(page > 1 || quoi === "events" ? [] : (issues[Number(numero)]?.commentaires ?? []));
    return { status: 404, data: { message: "Not Found" } };
  };
  return { envoyer, demandes };
}

// Le téléphone connecté à GitHub : sa lecture ouverte sur ce GitHub, et chaque envoi à la vue noté par canal. Rien n'est
// replanifié : la lecture suivante part quand le test la demande.
function telephone({ envoyer, connus = [] }: { envoyer: Envoi; connus?: ProjetDuCompte[] }) {
  const recus: Record<string, unknown[][]> = {};
  const gardes: ProjetDuCompte[][] = [];
  const planifiees: number[] = [];
  const lecture = ouvrirLaLectureGitHub({
    jeton: async () => JETON,
    envoyer,
    compte: "chef",
    connus,
    garder: (projets) => gardes.push(projets),
    maintenant,
    planifier: (_faire, ms) => (planifiees.push(ms), () => undefined),
    dire: ((canal: string, ...args: unknown[]) => void (recus[canal] ??= []).push(args)) as Parameters<typeof ouvrirLaLectureGitHub>[0]["dire"],
  });
  const derniers = (canal: string) => (recus[canal] ?? []).map(([premier]) => premier);
  // Le dernier dessin du rail de ce projet.
  const rail = (projet: string) => derniers("surFaits").filter((recue): recue is Dessinable => (recue as Dessinable).projet === projet).at(-1);
  const tel = () => derniers("surTelephone").at(-1) as TelephoneGitHub | undefined;
  const accueil = () => derniers("surAccueil").at(-1) as Accueil | undefined;
  return { lecture, recus, gardes, planifiees, rail, tel, accueil };
}

const tableauDe = (recue: Dessinable | undefined): Tableau => {
  assert.ok(recue !== undefined && "tableau" in recue, `the rail is drawn: ${JSON.stringify(recue)}`);
  return recue.tableau;
};
const colonnes = (vu: Tableau) => Object.fromEntries(vu.rail.colonnes.map(({ nom, cartes }) => [nom, cartes.map(({ ticket }) => ticket)]));

// Ce que le desktop dessine du même projet, sur le même GitHub (main.ts : `lireLeTableau`, puis la veille des faits et
// celle de `status`) : la lecture du rail, ce qui attend le chef, `facts`, puis `status` mis à part.
async function commeLeDesktop(nom: string, depot: string, demandeFaits: number, demandeVue: number): Promise<Dessinable | undefined> {
  const appeler = clientGitHub({ jeton: async () => JETON, envoyer: github().envoyer });
  const lu = await avecCeQuiAttendLeChef(await lireLeTableauDuDepot({ depot, appeler, maintenant }), appeler);
  const faits = tenirFaits();
  faits.recevoir(lectureDuTableau(lu, nom, demandeFaits, [FAITS]));
  return faits.attendre(mettreAPart(lectureDuTableau(lu, nom, demandeVue, [STATUS])));
}

describe("le téléphone connecté à GitHub lit ses projets, leur rail et leur TODO, sans station", () => {
  test("les projets du chef, lus dans les gists de ses stations : un dépôt, un projet, sous le nom que l'app lui a donné", async () => {
    const { envoyer, demandes } = github();
    const { lecture, recus, gardes } = telephone({ envoyer });
    await lecture.faits(1);
    const [configuration] = recus.surConfiguration?.at(-1) ?? [];
    assert.deepEqual((configuration as { projets: { nom: string; depot?: string; servi?: true }[] }).projets.map(({ nom, depot, servi }) => ({ nom, depot, servi })), [
      { nom: "cantine", depot: "chef/cantine", servi: true },
      { nom: "parade", depot: "chef/parade", servi: true },
    ]);
    assert.deepEqual(gardes.at(-1), [{ nom: "cantine", depot: "chef/cantine" }, { nom: "parade", depot: "chef/parade" }]);
    assert.deepEqual(lecture.configuration().projets.map(({ nom }) => nom), ["cantine", "parade"]);
    // Le gist sans rapport n'est pas lu.
    assert.ok(!demandes.some(({ adresse }) => adresse.endsWith("/gists/c3")));
  });

  test("chaque projet a son rail et son TODO, les mêmes que ceux que le desktop dessine du même projet", async () => {
    const { envoyer } = github();
    const { lecture, rail } = telephone({ envoyer });
    await lecture.faits(1);
    await lecture.regarder("parade", 2);
    const vu = tableauDe(rail("parade"));
    assert.deepEqual(colonnes(vu)["On the rail"], [1]);
    assert.deepEqual(colonnes(vu)["Todo"], [12, 20]);
    assert.deepEqual(rail("parade"), await commeLeDesktop("parade", "chef/parade", 1, 2));
    // Dans « All projects », le `status` de chacun est lu : le TODO de chacun aussi.
    await lecture.tous(3);
    assert.deepEqual(rail("parade"), await commeLeDesktop("parade", "chef/parade", 1, 3));
    assert.deepEqual(rail("cantine"), await commeLeDesktop("cantine", "chef/cantine", 1, 3));
  });

  test("dans l'espace d'un projet, ce qui est avant son rail se lit aussi, comme sur le desktop", async () => {
    const { envoyer } = github();
    const { lecture, recus } = telephone({ envoyer });
    await lecture.faits(1);
    await lecture.regarder("parade", 2);
    const amont = recus.surAmont?.at(-1)?.[0] as { projet: string } & Record<string, unknown>;
    assert.equal(amont.projet, "parade");
    assert.match(JSON.stringify(amont), /Ticket 6/);
  });

  test("aucune demande ne part à une station : toutes vont à l'API de GitHub, avec le jeton du chef", async () => {
    const { envoyer, demandes } = github();
    const { lecture, rail } = telephone({ envoyer });
    await lecture.faits(1);
    await lecture.tous(2);
    assert.ok(demandes.length > 0);
    assert.deepEqual(demandes.filter(({ adresse }) => !adresse.startsWith(`${API_GITHUB}/`)), []);
    assert.ok(demandes.every(({ entetes }) => entetes.Authorization === `Bearer ${JETON}`));
    assert.ok("tableau" in (rail("parade") ?? {}) && "tableau" in (rail("cantine") ?? {}));
  });

  test("un projet vide : un rail lu sans carte, un TODO lu qui dit « nothing awaits you », et sa ligne dans « All projects » — jamais un écran vide", async () => {
    const { envoyer } = github();
    const { lecture, rail, accueil } = telephone({ envoyer });
    await lecture.faits(1);
    await lecture.tous(2);
    const vu = tableauDe(rail("cantine"));
    assert.deepEqual(vu.rail.colonnes.flatMap(({ cartes }) => cartes), []);
    assert.equal(vu.rail.aucunTicket, true);
    // TODO est lu, et vide : il le dit.
    assert.equal(vu.rail.attendLu, LU);
    assert.equal(vu.rail.colonnes.find(({ nom }) => nom === "Todo")?.vide, "nothing awaits you");
    const ligne = accueil()?.projets.find(({ nom }) => nom === "cantine");
    assert.ok(ligne !== undefined && ligne.dit !== "", JSON.stringify(accueil()));
  });

  test("un compte dont aucune station ne sert de projet : la liste est lue, vide — la vue le dit, rien n'est inventé", async () => {
    const { envoyer } = github({ gists: { c3: MONDE.gists.c3! }, depots: {} });
    const { lecture, tel } = telephone({ envoyer });
    await lecture.faits(1);
    assert.deepEqual(lecture.configuration().projets, []);
    assert.deepEqual(tel(), { appaire: false, github: { compte: "chef" }, liste: { a: LU, lue: true } });
  });

  test("le rail d'un projet que GitHub refuse : l'échec que le desktop montre, sa raison en une phrase", async () => {
    const { envoyer } = github(MONDE, (chemin) => (chemin.startsWith("/repos/chef/parade/issues?") ? { status: 403, data: { message: "Resource not accessible by integration." } } : undefined));
    const { lecture, rail, accueil } = telephone({ envoyer });
    await lecture.faits(1);
    await lecture.tous(2);
    const recue = rail("parade");
    assert.ok(recue !== undefined && "erreur" in recue, JSON.stringify(recue));
    assert.equal(recue.erreur, "GitHub refused to read the rail of chef/parade (HTTP 403): Resource not accessible by integration.");
    assert.ok(recue.titre !== "");
    // Les autres projets se lisent toujours.
    tableauDe(rail("cantine"));
    assert.match(accueil()?.projets.find(({ nom }) => nom === "parade")?.dit ?? "", /\S/);
  });

  test("la liste que GitHub refuse : les projets connus restent, lus, et la liste dit pourquoi — se reconnecter sur un 401", async () => {
    const connus = [{ nom: "parade", depot: "chef/parade" }];
    const { envoyer } = github(MONDE, (chemin) => (chemin.startsWith("/gists?") ? { status: 401, data: { message: "Bad credentials" } } : undefined));
    const { lecture, rail, tel, recus } = telephone({ envoyer, connus });
    await lecture.faits(1);
    assert.deepEqual(tel()?.liste, { a: LU, lue: false, reason: "oublie", said: "GitHub refused the app's GitHub sign-in (HTTP 401): Bad credentials — sign in to GitHub again" });
    assert.equal(recus.surConfiguration, undefined);
    assert.deepEqual(lecture.configuration().projets.map(({ nom }) => nom), ["parade"]);
    tableauDe(rail("parade"));
  });

  test("GitHub qui ne répond pas : la liste le dit, et le rail de chaque projet connu est un échec hors ligne — jamais un écran vide", async () => {
    const connus = [{ nom: "parade", depot: "chef/parade" }];
    const { envoyer } = github(MONDE, () => new Error("Unable to resolve host \"api.github.com\""));
    const { lecture, rail, tel, accueil } = telephone({ envoyer, connus });
    await lecture.faits(1);
    await lecture.tous(2);
    assert.deepEqual(tel()?.liste, { a: LU, lue: false, reason: "injoignable", said: 'GitHub could not be reached to list your projects: Unable to resolve host "api.github.com"' });
    const recue = rail("parade");
    assert.ok(recue !== undefined && "erreur" in recue, JSON.stringify(recue));
    assert.match(recue.erreur, /^GitHub could not be reached to read the rail of chef\/parade/);
    assert.ok(accueil()?.projets.some(({ nom }) => nom === "parade"));
  });

  test("un autre refus de la liste se dit tel que GitHub le donne", async () => {
    const { envoyer } = github(MONDE, (chemin) => (chemin.startsWith("/gists?") ? { status: 500, data: "<html>oops</html>" } : undefined));
    const { lecture, tel } = telephone({ envoyer });
    await lecture.faits(1);
    assert.deepEqual(tel()?.liste, { a: LU, lue: false, reason: "inattendu", said: "GitHub refused the list of your gists, where your stations keep your projects (HTTP 500)" });
  });

  test("une lecture à la fois, la suivante trente secondes après", async () => {
    const { envoyer, demandes } = github();
    const { lecture, planifiees } = telephone({ envoyer });
    await Promise.all([lecture.faits(1), lecture.relire(), lecture.relire()]);
    // La première, puis une seule de plus pour les deux demandes venues pendant elle.
    assert.equal(demandes.filter(({ adresse }) => adresse.includes("/gists?")).length, 2);
    assert.deepEqual(planifiees, [INTERVALLE_MS]);
  });
});

describe("ce que le téléphone envoie et lit de GitHub", () => {
  test("le HTTP natif de Capacitor : un GET, ses en-têtes, le corps lu en JSON et l'ETag, quel que soit son nom", async () => {
    const options: unknown[] = [];
    const envoyer = parCapacitor(async (demande) => (options.push(demande), { status: 200, data: '{"ok":true}', headers: { ETag: 'W/"abc"' } }));
    assert.deepEqual(await envoyer(`${API_GITHUB}/gists`, { Accept: "application/vnd.github+json" }), { status: 200, data: { ok: true }, etag: 'W/"abc"' });
    assert.deepEqual(options, [{ url: `${API_GITHUB}/gists`, method: "GET", headers: { Accept: "application/vnd.github+json" } }]);
  });

  test("un gist supprimé entre la liste et sa lecture ne porte plus rien", async () => {
    const appeler = clientGitHub({ jeton: async () => JETON, envoyer: github(MONDE, (chemin) => (chemin === "/gists/b2" ? { status: 404, data: { message: "Not Found" } } : undefined)).envoyer });
    assert.deepEqual(await lireLesProjetsDuCompte(appeler), [{ nom: "cantine", depot: "chef/cantine" }, { nom: "parade", depot: "chef/parade" }]);
  });

  // La WebView n'a rien de Node : la lecture posée par la construction de l'APK, et tout ce qu'elle importe, se charge
  // dans un Node privé de `process` (packaging/android.ts, `poserLesModules`).
  test("la lecture posée se charge sans rien de Node, comme dans la WebView", (t) => {
    const www = mkdtempSync(join(tmpdir(), "lecture-github-telephone-"));
    t.after(() => rmSync(www, { recursive: true, force: true }));
    poserLesModules(www, APP, join(APP, "src", "lecture-github-telephone.ts"));
    const charge = spawnSync(process.execPath, ["--input-type=module", "-e", 'const lu = process.argv[1]; delete globalThis.process; import(lu).then((module) => console.log(Object.keys(module).sort().join(" ")), (erreur) => console.log(`KO ${erreur.message}`))', pathToFileURL(join(www, "src", "lecture-github-telephone.js")).href], { encoding: "utf8" });
    assert.equal(charge.stdout.trim(), "INTERVALLE_MS lireLesProjetsDuCompte ouvrirLaLectureGitHub parCapacitor", charge.stderr);
  });
});

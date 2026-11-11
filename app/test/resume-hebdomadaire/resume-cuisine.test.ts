// Ce que le process principal lit et fait pour la page des résumés hebdomadaires (#3263) : le jour du résumé lu dans
// `projet.json` et changé par une pull request, devant un faux GitHub ; les résumés lus par `report --week` et publiés
// par `release-notes`, devant une fausse commande du runtime qui rend ce que le vrai écrit.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { resumeDeLaSemaine } from "../../../runtime/src/resume-hebdomadaire/resume.ts";
import { mots, type Lu, type Rendu } from "../../src/box.ts";
import type { ClientDeLaPriorite } from "../../src/priorite.ts";
import { changerLeJour, lireLeJour, lireLesResumes, publierLeResume, semainesALire } from "../../src/vue/resume-hebdomadaire/resume-cuisine.ts";

const LU: Lu = { nom: "parade", cuisine: { locale: { node: "node", runtime: "/runtime", racine: "/station", env: {} } } };
const RESUME = resumeDeLaSemaine({
  project: "parade",
  weekStart: "2026-11-02",
  weekEnd: "2026-11-08",
  servis: [{ number: 12, title: "Show the rail age on the tile", url: "https://github.com/chef/parade/issues/12", labels: [], epic: null }],
  attentes: [],
});
const rendu = (sortie: string, erreur: { code: number } | null = null, erreurs = ""): Rendu => ({ lance: "$ node geste.ts parade …", erreur: erreur as Rendu["erreur"], sortie, erreurs });
const base64 = (objet: unknown) => Buffer.from(JSON.stringify(objet), "utf8").toString("base64");

// Un faux GitHub : `projet.json` tel que `fichier` le dit (null : absent), et chaque écriture retenue.
function github(fichier: unknown, { lecture = 200 }: { lecture?: number } = {}) {
  const ecrits: { methode: string; chemin: string; corps: unknown }[] = [];
  const client: ClientDeLaPriorite = {
    lire: async (chemin) => {
      if (chemin.includes("/contents/")) return fichier === null ? { status: 404, data: {} } : lecture !== 200 ? { status: lecture, data: { message: "Server Error" } } : { status: 200, data: { content: base64(fichier), sha: "abc" } };
      if (chemin.includes("/git/ref/heads/")) return { status: 200, data: { object: { sha: "tete" } } };
      return { status: 404, data: {} };
    },
    ecrire: async (methode, chemin, corps) => {
      ecrits.push({ methode, chemin, corps });
      if (chemin.endsWith("/git/refs")) return { status: 201, data: {} };
      if (chemin.includes("/contents/")) return { status: 200, data: {} };
      if (chemin.endsWith("/pulls")) return { status: 201, data: { number: 40, html_url: "https://github.com/chef/parade/pull/40" } };
      return { status: 204, data: {} };
    },
  };
  return { client, ecrits };
}

describe("le jour du résumé (#3263)", () => {
  test("les semaines lues commencent au jour réglé, la plus récente d'abord, dont le résumé a pu s'écrire", () => {
    // Le mercredi 11 novembre 2026 : le résumé du lundi 9 couvre la semaine du 2.
    assert.deepEqual(semainesALire("monday", new Date("2026-11-11T12:00:00Z"), 3), ["2026-11-02", "2026-10-26", "2026-10-19"]);
    // Le jeudi 12, jour réglé : celui du jour couvre la semaine du jeudi 5.
    assert.deepEqual(semainesALire("thursday", new Date("2026-11-12T00:30:00Z"), 2), ["2026-11-05", "2026-10-29"]);
  });

  test("absent du fichier, ou sans fichier : lundi, dit non réglé ; réglé : le sien", async () => {
    assert.deepEqual(await lireLeJour({ depot: "chef/parade", branche: "main", client: github({ version: 1 }).client }), { jour: "monday", pose: false });
    assert.deepEqual(await lireLeJour({ depot: "chef/parade", branche: "main", client: github(null).client }), { jour: "monday", pose: false });
    assert.deepEqual(await lireLeJour({ depot: "chef/parade", branche: "main", client: github({ version: 1, weeklySummaryDay: "friday" }).client }), { jour: "friday", pose: true });
  });

  test("un jour qui n'en est pas un, ou un fichier illisible, ne vaut pas lundi : il ne se lit pas", async () => {
    const faux = await lireLeJour({ depot: "chef/parade", branche: "main", client: github({ version: 1, weeklySummaryDay: "someday" }).client });
    assert.ok("sans" in faux);
    assert.match(faux.detail ?? "", /not a day of the week/);
    const refuse = await lireLeJour({ depot: "chef/parade", branche: "main", client: github({}, { lecture: 500 }).client });
    assert.ok("sans" in refuse);
    assert.match(refuse.detail ?? "", /HTTP 500/);
  });

  test("jeudi choisi : weeklySummaryDay = thursday s'écrit dans projet.json, le reste gardé, proposé par une PR", async () => {
    const { client, ecrits } = github({ version: 1, integrationBranch: "main", chef: "benomite" });
    const rendu = await changerLeJour({ depot: "chef/parade", branche: "main", jour: "thursday", client });
    assert.deepEqual(rendu, { pr: "https://github.com/chef/parade/pull/40", numero: 40, jour: "thursday" });
    const fichier = ecrits.find(({ methode, chemin }) => methode === "PUT" && chemin.endsWith(".claude/brigade/projet.json"));
    const corps = fichier?.corps as { content: string; sha: string };
    assert.deepEqual(JSON.parse(Buffer.from(corps.content, "base64").toString("utf8")), { version: 1, integrationBranch: "main", chef: "benomite", weeklySummaryDay: "thursday" });
    assert.equal(corps.sha, "abc");
  });

  test("le jour déjà là ne propose rien ; un mot qui n'est pas un jour n'écrit rien", async () => {
    const deja = github({ version: 1, weeklySummaryDay: "thursday" });
    assert.ok("fait" in (await changerLeJour({ depot: "chef/parade", branche: "main", jour: "thursday", client: deja.client })));
    assert.equal(deja.ecrits.length, 0);
    const faux = github({ version: 1 });
    assert.ok("refus" in (await changerLeJour({ depot: "chef/parade", branche: "main", jour: "someday", client: faux.client })));
    assert.equal(faux.ecrits.length, 0);
  });
});

describe("les résumés, lus là où la cuisine tourne (#3263)", () => {
  const MAINTENANT = new Date("2026-11-11T12:00:00Z");

  test("une lecture par semaine ; une semaine sans résumé n'est pas une erreur, un résumé illisible est nommé", async () => {
    const commandes: string[] = [];
    const lu = await lireLesResumes({
      projet: "parade",
      lu: LU,
      jour: "monday",
      maintenant: MAINTENANT,
      lancer: async (_, commande) => {
        commandes.push(commande);
        if (commande === "report --week 2026-11-02") return rendu(JSON.stringify(RESUME, null, 2));
        if (commande === "report --week 2026-10-26") return rendu("", { code: 1 }, "brigade: the weekly summary of 2026-10-26 does not read: Unexpected token");
        return rendu("", { code: 1 }, "brigade: no weekly summary of parade for the week starting 2026-10-19");
      },
    });
    assert.deepEqual(commandes.slice(0, 2), ["report --week 2026-11-02", "report --week 2026-10-26"]);
    assert.equal(commandes.length, 6);
    assert.ok("resumes" in lu);
    assert.deepEqual(lu.resumes, [RESUME]);
    assert.deepEqual(
      lu.illisibles.map(({ weekStart }) => weekStart),
      ["2026-10-26"],
    );
  });

  test("un runtime sans `report --week` le dit, et demande sa mise à jour ; un projet qui ne cuit pas ici le dit", async () => {
    const vieux = await lireLesResumes({ projet: "parade", lu: LU, jour: "monday", maintenant: MAINTENANT, lancer: async () => rendu("", { code: 2 }, "brigade: usage: … npm --prefix runtime run report") });
    assert.ok("sans" in vieux);
    assert.match(vieux.sans, /update it/);
    const ailleurs = await lireLesResumes({ projet: "parade", lu: undefined, jour: "monday", maintenant: MAINTENANT, lancer: async () => assert.fail("rien ne se lance") });
    assert.ok("sans" in ailleurs);
  });

  test("une sortie qui n'a pas la forme d'un résumé est illisible, rien n'y est complété", async () => {
    const lu = await lireLesResumes({ projet: "parade", lu: LU, jour: "monday", maintenant: MAINTENANT, lancer: async () => rendu(JSON.stringify({ ...RESUME, waiting: "none" })) });
    assert.ok("resumes" in lu);
    assert.equal(lu.resumes.length, 0);
    assert.equal(lu.illisibles.length, 6);
  });
});

describe("la publication comme notes de version (#3263)", () => {
  // La commande lancée, et le markdown du fichier qu'elle reçoit, lu pendant l'appel.
  async function publier(reponse: Rendu, tag: unknown = "v1.4.0") {
    const appels: { commande: string; markdown: unknown }[] = [];
    const rendu = await publierLeResume({
      projet: "parade",
      lu: LU,
      resume: RESUME,
      tag,
      lancer: async (_, commande) => {
        const fichier = mots(commande)[2] as string;
        appels.push({ commande, markdown: (JSON.parse(readFileSync(fichier, "utf8")) as { markdown: unknown }).markdown });
        return reponse;
      },
    });
    return { rendu, appels };
  }

  test("une seule commande, `release-notes <tag> <fichier>`, le fichier portant le markdown du résumé ; publiée, la release se dit", async () => {
    const { rendu: publie, appels } = await publier(rendu("release v1.4.0 published: https://github.com/chef/parade/releases/tag/v1.4.0\n"));
    assert.equal(appels.length, 1);
    const [commande, tag, fichier, ...reste] = mots(appels[0]?.commande ?? "");
    assert.deepEqual([commande, tag, reste], ["release-notes", "v1.4.0", []]);
    assert.match(fichier ?? "", /2026-11-02\.json$/);
    assert.throws(() => readFileSync(fichier as string), /ENOENT/, "le fichier provisoire est retiré après l'appel");
    assert.equal(appels[0]?.markdown, RESUME.markdown);
    assert.deepEqual(publie, { publiee: "published as the release notes of v1.4.0", url: "https://github.com/chef/parade/releases/tag/v1.4.0" });
  });

  test("déjà publiée : la phrase le dit ; refusée : la ligne du runtime ; sans la commande : la mise à jour", async () => {
    const deja = (await publier(rendu("release v1.4.0 already published: https://github.com/chef/parade/releases/tag/v1.4.0 — nothing was changed\n"))).rendu;
    assert.ok("dejaPubliee" in deja);
    const refus = (await publier(rendu("", { code: 1 }, "brigade : The tag v1.4.0 does not exist on the repository: nothing was published.\n"))).rendu;
    assert.deepEqual("refus" in refus && refus.refus, "The tag v1.4.0 does not exist on the repository: nothing was published.");
    const vieux = (await publier(rendu("", { code: 66 }, "brigade : « release-notes » n'est pas une commande du runtime"))).rendu;
    assert.match("refus" in vieux ? vieux.refus : "", /update it/);
  });

  test("un tag qui ne s'écrit pas en un mot ne lance rien", async () => {
    for (const tag of ["", "  ", "v1 2", "v1';rm", 12]) {
      const { rendu: refuse, appels } = await publier(rendu(""), tag);
      assert.ok("refus" in refuse);
      assert.equal(appels.length, 0);
    }
  });
});

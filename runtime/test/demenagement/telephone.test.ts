// Un téléphone parmi les stations du chef (#1158) : il pilote, il ne cuisine
// pas. Le déménagement ne lui confie jamais la cuisine d'un projet, et sa
// présence ne change rien à la station où un projet cuit. Contre des gists en
// mémoire : le déménagement mené jusqu'au bout se prouve dans
// `demenagement.test.ts`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { Sortie } from "../../src/appel.ts";
import type { Canal, Fichiers } from "../../src/appairage/canal.ts";
import { FICHIER_STATION } from "../../src/appairage/document.ts";
import { demenager, principal, type StationLue } from "../../src/demenagement/demenager.ts";
import { FICHIER_PROJETS, type ProjetDemande } from "../../src/projets/demande.ts";

const AUJOURDHUI = "2026-10-21T08:00:00.000Z";
const PARADE: ProjetDemande = {
  nom: "parade",
  depot: "acme/parade",
  base: "main",
  principale: true,
  cooks: 2,
  manager: { modele: "sonnet", effort: "medium" },
  reviewer: { modele: "opus", effort: "high" },
  ouvertLe: "2026-10-20T07:00:00.000Z",
  demandeLe: "2026-10-20T07:01:00.000Z",
};

const station = (nom: string, demande: ProjetDemande[] = [], cuisine = true): StationLue => ({ gist: `gist${nom}`, nom, cuisine, demande, suivi: undefined });

test("vers un téléphone, le déménagement est refusé en une phrase : il ne fait tourner aucun cook — même quand c'est la seule autre station", () => {
  const stations = [station("box", [PARADE]), station("pixel", [], false)];
  assert.deepEqual(demenager(stations, "parade", "gistpixel", AUJOURDHUI), { refus: "pixel does not cook: no project's cooks run there" });
  // Même s'il porte déjà une ligne du projet.
  const avecLigne = [station("box", [PARADE]), station("pixel", [{ ...PARADE, principale: false }], false)];
  assert.deepEqual(demenager(avecLigne, "parade", "gistpixel", AUJOURDHUI), { refus: "pixel does not cook: no project's cooks run there" });
});

test("un téléphone parmi les stations ne change pas celle où le projet cuit : le même déménagement, avec ou sans lui", () => {
  const sans = demenager([station("box", [PARADE]), station("mac")], "parade", "gistmac", AUJOURDHUI);
  const avec = demenager([station("box", [PARADE]), station("pixel", [], false), station("mac")], "parade", "gistmac", AUJOURDHUI);
  assert.ok(!("refus" in sans));
  assert.deepEqual(avec, sans);
  assert.deepEqual(avec, { ecrire: (sans as { ecrire: unknown }).ecrire, de: "box", vers: "mac", demandeLe: AUJOURDHUI });
});

test("un téléphone marqué principal d'un projet n'est pas la station où il cuit : elle reste celle qui cuisine", () => {
  const stations = [station("box", [PARADE]), station("pixel", [PARADE], false), station("mac")];
  const rendu = demenager(stations, "parade", "gistmac", AUJOURDHUI);
  assert.ok(!("refus" in rendu), JSON.stringify(rendu));
  assert.equal(rendu.de, "box");
  // Seul, il ne fait cuire le projet nulle part.
  assert.deepEqual(demenager([station("pixel", [PARADE], false), station("mac")], "parade", "gistmac", AUJOURDHUI), {
    refus: "parade cooks on none of your stations: add it rather than move it",
  });
});

// Les gists du compte du chef, en mémoire.
function compte(gists: Record<string, Fichiers>) {
  const ecrits: string[] = [];
  const canal: Canal = {
    creer: async () => assert.fail("aucun gist ne se crée pendant un déménagement"),
    async ecrire(id, fichiers) {
      const gist = gists[id];
      if (gist === undefined) return "absent";
      ecrits.push(id);
      Object.assign(gist, fichiers);
      return "ecrit";
    },
    lire: async (id) => (gists[id] === undefined ? null : { ...gists[id] }),
  };
  return { canal, ecrits };
}

async function deplacer(canal: Canal, vers: string, gists: string[]) {
  const dit: string[] = [];
  let code = 0;
  try {
    await principal(
      { args: ["parade", vers, ...gists], env: {}, dire: (ligne) => dit.push(ligne), redire: (ligne) => dit.push(ligne) },
      { canal, maintenant: () => new Date(AUJOURDHUI), gistLocal: null, verifierBacASable: () => ({ ok: true, version: "2.1.300" }) },
    );
  } catch (erreur) {
    if (!(erreur instanceof Sortie)) throw erreur;
    code = erreur.code;
  }
  return { code, rendu: JSON.parse(dit.at(-1) ?? "null") as Record<string, unknown> | null };
}

test("la commande lit qu'une station ne cuisine pas dans ce qu'elle publie, refuse d'y déménager, et n'écrit rien", async () => {
  const demande = (projets: ProjetDemande[]) => JSON.stringify({ brigade: "projets", format: 1, projets });
  const gists: Record<string, Fichiers> = {
    gistbox: { [FICHIER_STATION]: JSON.stringify({ brigade: "station", format: 1, nom: "box", sorte: "ordinateur", cuisine: true }), [FICHIER_PROJETS]: demande([PARADE]) },
    gistpixel: { [FICHIER_STATION]: JSON.stringify({ brigade: "station", format: 1, nom: "pixel", sorte: "telephone", cuisine: false }) },
    // Une station plus ancienne que les sortes : un ordinateur, qui cuisine.
    gistmac: { [FICHIER_STATION]: JSON.stringify({ brigade: "station", format: 1, nom: "mac" }) },
  };
  const { canal, ecrits } = compte(gists);
  assert.deepEqual(await deplacer(canal, "gistpixel", ["gistbox", "gistmac"]), { code: 1, rendu: { moved: false, said: "pixel does not cook: no project's cooks run there" } });
  assert.deepEqual(ecrits, []);

  // Vers l'ordinateur, le téléphone parmi les stations lues ne change rien à celle que la cuisine quitte.
  const parti = await deplacer(canal, "gistmac", ["gistbox", "gistpixel"]);
  assert.deepEqual(parti, { code: 0, rendu: { moved: true, project: "parade", from: "box", to: "mac", askedAt: AUJOURDHUI } });
  assert.deepEqual(ecrits.sort(), ["gistbox", "gistmac"]);
  assert.equal(gists.gistpixel?.[FICHIER_PROJETS], undefined);
});

// Un projet servi par deux stations (#2713, #2714) : aucune n'en est la
// maîtresse, chacune tient sa cuisine. Le déménagement passe celle de l'une à
// une station qui ne le sert pas — la commande demande laquelle s'il y a un
// doute — et l'autre continue de le servir, sans qu'aucune ligne écrite ne
// porte de drapeau principal ou secondaire.
import assert from "node:assert/strict";
import { test } from "node:test";
import { Sortie } from "../../src/appel.ts";
import type { Canal, Fichiers } from "../../src/appairage/canal.ts";
import { FICHIER_STATION } from "../../src/appairage/document.ts";
import { demenager, principal, type StationLue } from "../../src/demenagement/demenager.ts";
import { FICHIER_PROJETS, lireDemande, type ProjetDemande } from "../../src/projets/demande.ts";

const AUJOURDHUI = "2026-11-07T08:00:00.000Z";
const SHOP: ProjetDemande = {
  nom: "shop",
  depot: "acme/shop",
  base: "main",
  cooks: 2,
  manager: { modele: "sonnet", effort: "medium" },
  reviewer: { modele: "opus", effort: "high" },
  ouvertLe: "2026-11-06T07:00:00.000Z",
  demandeLe: "2026-11-06T07:01:00.000Z",
};

const station = (nom: string, demande: ProjetDemande[] = []): StationLue => ({ gist: `gist${nom}`, nom, cuisine: true, demande, suivi: undefined });

test("deux stations servent le projet : vers une troisième, la commande demande laquelle remet sa cuisine, puis ne touche qu'à elle et à la visée", () => {
  const stations = [station("box", [SHOP]), station("mac", [SHOP]), station("pi")];
  assert.deepEqual(demenager(stations, "shop", "gistpi", AUJOURDHUI), { refus: "shop cooks on several of your stations (box, mac): say which one hands its kitchen over to pi" });

  const rendu = demenager(stations, "shop", "gistpi", AUJOURDHUI, "gistbox");
  assert.ok(!("refus" in rendu), JSON.stringify(rendu));
  assert.deepEqual([rendu.de, rendu.vers], ["box", "pi"]);
  assert.deepEqual(rendu.ecrire, [
    { gist: "gistbox", projets: [{ ...SHOP, remise: { vers: "pi", gist: "gistpi", demandeLe: AUJOURDHUI } }] },
    { gist: "gistpi", projets: [{ ...SHOP, demandeLe: AUJOURDHUI, reprise: { de: "box", gist: "gistbox", demandeLe: AUJOURDHUI } }] },
  ]);
  // Le mac continue de le servir : sa demande n'est pas réécrite.
  assert.ok(!rendu.ecrire.some(({ gist }) => gist === "gistmac"));
  assert.ok(!JSON.stringify(rendu.ecrire).includes("principal"));
});

test("deux stations servent le projet : vers l'une d'elles, il y cuit déjà ; une source qui ne le sert pas n'a pas de cuisine à remettre", () => {
  const stations = [station("box", [SHOP]), station("mac", [SHOP]), station("pi")];
  assert.deepEqual(demenager(stations, "shop", "gistmac", AUJOURDHUI), { refus: "shop already cooks on mac" });
  assert.deepEqual(demenager(stations, "shop", "gistpi", AUJOURDHUI, "gistpi"), { refus: "pi does not serve shop: it has no kitchen of it to hand over" });
  // Une station qui l'a déjà remis ne le sert plus : l'autre est la seule source, sans qu'il faille la nommer.
  const remis = [station("box", [{ ...SHOP, remise: { vers: "mac", gist: "gistmac", demandeLe: AUJOURDHUI } }]), station("mac", [SHOP]), station("pi")];
  const rendu = demenager(remis, "shop", "gistpi", AUJOURDHUI);
  assert.ok(!("refus" in rendu), JSON.stringify(rendu));
  assert.equal(rendu.de, "mac");
});

test("la commande nomme la station qui remet sa cuisine par `--de`, et la demande écrite se relit sans drapeau principal", async () => {
  const demande = (projets: ProjetDemande[]) => JSON.stringify({ brigade: "projets", format: 1, projets });
  const publie = (nom: string) => JSON.stringify({ brigade: "station", format: 1, nom, sorte: "ordinateur", cuisine: true });
  const gists: Record<string, Fichiers> = {
    gistbox: { [FICHIER_STATION]: publie("box"), [FICHIER_PROJETS]: demande([SHOP]) },
    gistmac: { [FICHIER_STATION]: publie("mac"), [FICHIER_PROJETS]: demande([SHOP]) },
    gistpi: { [FICHIER_STATION]: publie("pi") },
  };
  const ecrits: string[] = [];
  const canal: Canal = {
    creer: async () => assert.fail("aucun gist ne se crée pendant un déménagement"),
    async ecrire(id, fichiers) {
      ecrits.push(id);
      Object.assign(gists[id] as Fichiers, fichiers);
      return "ecrit";
    },
    lire: async (id) => (gists[id] === undefined ? null : { ...gists[id] }),
  };
  const dit: string[] = [];
  let code = 0;
  try {
    await principal(
      { args: ["shop", "gistpi", "gistbox", "--de", "gistmac"], env: {}, dire: (ligne) => dit.push(ligne), redire: (ligne) => dit.push(ligne) },
      { canal, maintenant: () => new Date(AUJOURDHUI), gistLocal: null, verifierBacASable: () => ({ ok: true, version: "2.1.300" }) },
    );
  } catch (erreur) {
    if (!(erreur instanceof Sortie)) throw erreur;
    code = erreur.code;
  }
  assert.equal(code, 0, dit.join("\n"));
  assert.deepEqual(JSON.parse(dit.at(-1) ?? "null"), { moved: true, project: "shop", from: "mac", to: "pi", askedAt: AUJOURDHUI });
  // La visée d'abord, puis celle qui remet ; la box n'est pas touchée.
  assert.deepEqual(ecrits, ["gistpi", "gistmac"]);
  const relue = (gist: string) => lireDemande(gists[gist]?.[FICHIER_PROJETS] ?? "")?.projets ?? [];
  assert.deepEqual(relue("gistbox"), [SHOP]);
  assert.deepEqual(relue("gistmac"), [{ ...SHOP, remise: { vers: "pi", gist: "gistpi", demandeLe: AUJOURDHUI } }]);
  assert.deepEqual(relue("gistpi"), [{ ...SHOP, demandeLe: AUJOURDHUI, reprise: { de: "mac", gist: "gistmac", demandeLe: AUJOURDHUI } }]);
  for (const gist of Object.keys(gists)) assert.ok(!(gists[gist]?.[FICHIER_PROJETS] ?? "").includes("principal"));
});

test("`--de` sans gist est mal appelé : rien n'est lu", async () => {
  for (const args of [["shop", "gistpi", "gistbox", "--de"], ["shop", "gistpi", "--de", "--de"]]) {
    const dit: string[] = [];
    let code = 0;
    try {
      await principal(
        { args, env: {}, dire: (ligne) => dit.push(ligne), redire: (ligne) => dit.push(ligne) },
        { canal: { creer: async () => assert.fail(), ecrire: async () => assert.fail(), lire: async () => assert.fail("rien ne se lit") }, maintenant: () => new Date(AUJOURDHUI), gistLocal: null, verifierBacASable: () => ({ ok: true, version: "2.1.300" }) },
      );
    } catch (erreur) {
      if (!(erreur instanceof Sortie)) throw erreur;
      code = erreur.code;
    }
    assert.equal(code, 2, args.join(" "));
    assert.match(dit.join("\n"), /--de attend le gist/);
  }
});

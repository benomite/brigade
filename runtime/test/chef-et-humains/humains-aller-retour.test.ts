// Les humains du projet (#2931) : le tour d'un humain par les réglages — ajouter,
// lister, changer ses rôles, retirer — et les deux refus d'un login, joués par
// le vrai service (`ouvrirHumains`) sur un GitHub local. Les PR s'ouvrent sur le
// faux partagé (`faux-github.ts`, tel quel) ; le fichier, les comptes et les
// branches sont ceux de ce test, que le faux partagé ne tient pas. Une PR
// « mergée » ici porte son texte sur `main`, comme le ferait un humain.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ouvrirHumains, type GitHubDesHumains } from "../../src/humains/service.ts";
import { FICHIER } from "../../src/reglages-projet/reglages.ts";
import { FauxGitHub } from "../faux-github.ts";

const DEPOT = "acme/projet";
const texte = (contenu: object) => `${JSON.stringify(contenu, null, 2)}\n`;
const AVANT = texte({ version: 1, integrationBranch: "main", closer: { calibration: { model: "opus", effort: "high" } } });

function cuisine(comptes: { acces: string[]; sansAcces?: string[] }) {
  const faux = new FauxGitHub();
  const pr = faux.pour("box");
  let main = { texte: AVANT, sha: "blob0" };
  const branches = new Map<string, string>();
  const github: GitHubDesHumains = {
    ouvrirPR: pr.ouvrirPR,
    compteExiste: async (login) => [...comptes.acces, ...(comptes.sansAcces ?? [])].includes(login),
    aAccesAuDepot: async (login) => comptes.acces.includes(login),
    fichier: async (chemin, ref) => {
      assert.equal(chemin, FICHIER);
      assert.equal(ref, "main");
      return { ...main };
    },
    ecrireSurBranche: async ({ base, branche, chemin, texte: voulu, sha }) => {
      assert.equal(base, "main");
      assert.equal(chemin, FICHIER);
      assert.equal(sha, main.sha);
      branches.set(branche, voulu);
    },
  };
  const service = ouvrirHumains({ github, depot: DEPOT, base: "main" });
  // Merge la dernière PR ouverte : son texte devient celui de `main`.
  const merger = () => {
    const derniere = faux.prs.at(-1);
    assert.ok(derniere);
    const voulu = branches.get(derniere.branche);
    assert.ok(voulu !== undefined);
    main = { texte: voulu, sha: `blob${faux.prs.length}` };
  };
  return { faux, service, merger, main: () => main.texte, branches };
}

// Le diff de projet.json entre deux textes : les entrées de premier niveau qui changent, avec leur valeur d'après.
function diff(avant: string, apres: string) {
  const a = JSON.parse(avant) as Record<string, unknown>;
  const b = JSON.parse(apres) as Record<string, unknown>;
  const cles = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  return Object.fromEntries(cles.filter((cle) => JSON.stringify(a[cle]) !== JSON.stringify(b[cle])).map((cle) => [cle, b[cle]]));
}

test("tour d'un humain : ajouter, lister, changer ses rôles, retirer — chaque écriture est une PR dont le diff ne touche que `humans`", async () => {
  const { faux, service, merger, main } = cuisine({ acces: ["lea"] });
  assert.deepEqual(await service.list(), []);

  const ajout = await service.save({ login: "lea", roles: ["product"] });
  assert.ok(ajout.ok);
  assert.equal(faux.prs.length, 1);
  assert.equal(ajout.pr, `https://github.com/faux/depot/pull/${faux.prs[0]?.number}`);
  assert.equal(faux.prs[0]?.state, "open");
  // Rien ne change sur `main` tant que la PR n'est pas mergée.
  assert.deepEqual(await service.list(), []);
  const avantAjout = main();
  merger();
  assert.deepEqual(diff(avantAjout, main()), { humans: [{ login: "lea", roles: ["product"] }] });
  assert.equal(JSON.parse(main()).closer.calibration.model, "opus");
  assert.deepEqual(await service.list(), [{ login: "lea", roles: ["product"] }]);

  const avantRoles = main();
  const roles = await service.save({ login: "lea", roles: ["product", "review"] });
  assert.ok(roles.ok);
  assert.equal(faux.prs.length, 2);
  merger();
  assert.deepEqual(diff(avantRoles, main()), { humans: [{ login: "lea", roles: ["product", "review"] }] });
  assert.deepEqual(await service.list(), [{ login: "lea", roles: ["product", "review"] }]);

  const retrait = await service.remove("lea");
  assert.ok(retrait.ok);
  assert.equal(faux.prs.length, 3);
  merger();
  assert.deepEqual(diff(avantRoles, main()), { humans: undefined });
  assert.equal(main(), AVANT);
  assert.deepEqual(await service.list(), []);
});

test("login qui n'existe pas sur GitHub : refusé en une ligne, aucune PR", async () => {
  const { faux, service, branches } = cuisine({ acces: ["lea"] });
  const refus = await service.save({ login: "fantome", roles: ["product"] });
  assert.deepEqual(refus, { ok: false, message: "fantome is not a GitHub account: check the login" });
  assert.equal(refus.ok === false && refus.message.includes("\n"), false);
  assert.equal(faux.prs.length, 0);
  assert.equal(branches.size, 0);
});

test("login sans accès au dépôt : refusé en une ligne, aucune PR", async () => {
  const { faux, service, branches } = cuisine({ acces: ["lea"], sansAcces: ["marc"] });
  const refus = await service.save({ login: "marc", roles: ["product"] });
  assert.deepEqual(refus, { ok: false, message: `marc exists on GitHub but has no access to ${DEPOT}: invite them to the repository first` });
  assert.equal(refus.ok === false && refus.message.includes("\n"), false);
  assert.equal(faux.prs.length, 0);
  assert.equal(branches.size, 0);
});

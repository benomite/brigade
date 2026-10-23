// L'arbitre entre projets dans son propre process (`tenir-arbitre`), et la
// commande par laquelle le chef le lit et le règle (`npm run arbiter`).
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { ouvrirArbitre, ouvrirReglages, servirArbitre, type Mot } from "../src/arbitre.ts";
import { joindreArbitre } from "../src/arbitrage.ts";
import { sansMotFrancais } from "./aides/glossaire.ts";
import { horloge, lancer, lancerSurPortPose, repertoireTemporaire, SANS_RESEAU } from "./outils.ts";
import { posixOnly } from "./support/plateforme.ts";

const CLI = join(import.meta.dirname, "../src/arbitre-cli.ts");
const TENIR = join(import.meta.dirname, "../src/tenir-arbitre.ts");
const mot = (cooks: number, autres: Partial<Mot> = {}): Mot => ({ cooks, demande: true, machine: false, nonArbitres: 0, consommation: { jour: 0, semaine: 0 }, ...autres });

async function servi(t: TestContext, plafond = 10) {
  const repertoire = repertoireTemporaire(t);
  const ouvert = ouvrirArbitre({ repertoire, plafond, maintenant: horloge("2026-10-09T08:00:00.000Z") });
  const serveur = await servirArbitre(ouvert, 0);
  t.after(async () => {
    await serveur.fermer();
    ouvert.fermer();
  });
  const commande = async (...args: string[]) => {
    const cli = lancer(t, CLI, args, { BRIGADE_ARBITER_PORT: String(serveur.port), BRIGADE_ARBITER_STATE_DIR: repertoire });
    return { code: await cli.fin, sortie: cli.sortie() };
  };
  return { ouvert, repertoire, serveur, commande };
}

// Chaque test a son arbitre, sur le port 0, et son état : ils se jouent de front.
describe("la commande de l'arbitre", { concurrency: 8 }, () => {
  test("le chef voit, par projet, ce qui tourne, ce que l'arbitre autorise encore, et la consommation des cooks dite comme telle", async (t) => {
    const { ouvert, serveur, commande } = await servi(t, 10);
    ouvert.dire("thermigo", mot(5, { nonArbitres: 1, consommation: { jour: 1200, semaine: 9000 } }));
    ouvert.dire("brigade", mot(2, { demande: false, consommation: { jour: 300, semaine: 300 } }));

    const { code, sortie } = await commande();
    assert.equal(code, 0);
    assert.match(sortie, new RegExp(String.raw`^arbiter\s+127\.0\.0\.1:${serveur.port} — started 2026-10-09T08:00:00\.000Z$`, "m"));
    assert.match(sortie, /^account cap\s+10 cooks — 7 running, all projects heard$/m);
    assert.match(sortie, /^machine\s+no project says it is held by it$/m);
    assert.match(sortie, /^  brigade {2,}weight 1 · 2 running · share 5 · 3 left · nothing queued · cooks consumed: 300 tokens in 24 h, 300 in 7 days$/m);
    assert.match(sortie, /^  thermigo {2}weight 1 · 5 running \(of which 1 left without the arbiter\) · share 5 · 3 left · tickets are queued · cooks consumed: 1,200 tokens in 24 h, 9,000 in 7 days$/m);
    assert.match(sortie, /^cooks consumed\s+1,500 tokens in 24 h, 9,300 in 7 days — that of the ticket cooks the runtimes report, not the account's$/m);
  });

  test("une machine saturée, un projet qui n'a pas reparlé, un projet parti : chacun se lit", async (t) => {
    const { ouvert, repertoire, serveur, commande } = await servi(t, 50);
    ouvert.dire("muet", mot(1));
    ouvert.dire("parti", mot(1));
    ouvert.quitter("parti");
    await serveur.fermer();
    ouvert.fermer();

    // L'arbitre redémarre : « muet » tient sa part sans avoir reparlé.
    const revenu = ouvrirArbitre({ repertoire, plafond: 50, maintenant: horloge("2026-10-09T09:00:00.000Z") });
    const reservi = await servirArbitre(revenu, 0);
    t.after(async () => {
      await reservi.fermer();
      revenu.fermer();
    });
    revenu.dire("thermigo", mot(9));
    revenu.dire("brigade", mot(0, { machine: true }));
    const cli = lancer(t, CLI, [], { BRIGADE_ARBITER_PORT: String(reservi.port) });
    assert.equal(await cli.fin, 0);
    const sortie = cli.sortie();
    assert.match(sortie, /^machine\s+SATURATED according to brigade — the effective cap is what is running \(9\): only a project under its share launches again$/m);
    assert.match(sortie, /^  muet {2,}weight 1 · HAS NOT SPOKEN SINCE 2026-10-09T09:00:00\.000Z — share reserved: 3, which nobody borrows; `remove` frees it$/m);
    assert.match(sortie, /^  parti {2,}weight 1 · absent since 2026-10-09T08:00:0\d\.000Z — holds no share$/m);
    assert.match(sortie, /^  thermigo {2}weight 1 · 9 running · share 3 · 0 left /m);
  });

  test("le chef règle un poids et retire un projet : l'arbitre qui tourne le lit à sa décision suivante", async (t) => {
    const { ouvert, commande } = await servi(t, 8);
    ouvert.dire("thermigo", mot(4));
    ouvert.dire("brigade", mot(0));
    const part = (nom: string) => ouvert.etat().projets.find((projet) => projet.projet === nom)?.part;

    assert.deepEqual(await commande("weight", "thermigo", "3"), { code: 0, sortie: "thermigo: weight 3 (was 1); the arbiter reads it at its next decision\n" });
    assert.deepEqual([part("thermigo"), part("brigade")], [6, 2]);
    assert.deepEqual(await commande("weight", "espace", "2"), {
      code: 0,
      sortie: "espace: weight 2 — project not yet known to the arbiter: it will have a share only once its runtime has been heard\n",
    });
    assert.equal(part("espace"), null);

    assert.deepEqual(await commande("remove", "brigade"), {
      code: 0,
      sortie: "brigade: removed — its share is no longer reserved; if its runtime is running, it registers again at weight 1 as soon as it speaks\n",
    });
    assert.deepEqual(ouvert.etat().projets.map((projet) => projet.projet), ["espace", "thermigo"]);
    assert.deepEqual(await commande("remove", "brigade"), { code: 1, sortie: "brigade : brigade: project unknown to the arbiter\n" });
  });

  test("arbitre injoignable : la commande le dit, rappelle le mode dégradé, et montre les réglages qui restent lisibles", async (t) => {
    // Le refus est joué dans le process de la commande, où toute connexion est
    // refusée : le port d'un arbitre qu'on vient de fermer n'est pas muet pour
    // autant, un voisin peut l'avoir repris. Celui du test écoute encore — joint,
    // il répondrait.
    const { ouvert, repertoire, serveur } = await servi(t);
    ouvert.dire("thermigo", mot(1));

    const cli = lancer(t, CLI, [], { BRIGADE_ARBITER_PORT: String(serveur.port), BRIGADE_ARBITER_STATE_DIR: repertoire, NODE_OPTIONS: `--import=${SANS_RESEAU}` });
    const [code, sortie] = [await cli.fin, cli.sortie()];
    assert.equal(code, 1);
    assert.match(sortie, new RegExp(String.raw`^arbiter\s+UNREACHABLE — connection refused on 127\.0\.0\.1:${serveur.port}$`, "m"));
    assert.match(sortie, /each project launches at most one cook at a time, without arbitration \(degraded mode\), until it is back/);
    assert.match(sortie, /^known projects\s+1$/m);
    assert.match(sortie, /^  thermigo {2}weight 1$/m);
  });

  test("ce que la commande ne comprend pas est refusé sans rien écrire", async (t) => {
    const { repertoire, commande } = await servi(t);
    for (const args of [["weight", "thermigo", "0"], ["weight", "Pas Un Nom", "2"], ["peser", "thermigo", "2"]]) {
      const { code, sortie } = await commande(...args);
      assert.equal(code, 2, args.join(" "));
      assert.match(sortie, /usage: BRIGADE_ARBITER_PORT=/);
    }
    const reglages = ouvrirReglages(repertoire);
    t.after(() => reglages.fermer());
    assert.deepEqual(reglages.projets(), []);

    const sans = async (env: Record<string, string>, ...args: string[]) => {
      const cli = lancer(t, CLI, args, env);
      return { code: await cli.fin, sortie: cli.sortie() };
    };
    assert.match((await sans({})).sortie, /BRIGADE_ARBITER_PORT is not set/);
    assert.match((await sans({}, "weight", "thermigo", "2")).sortie, /BRIGADE_ARBITER_STATE_DIR is not set/);
    const vide = repertoireTemporaire(t);
    assert.deepEqual(await sans({ BRIGADE_ARBITER_STATE_DIR: vide }, "weight", "thermigo", "2"), {
      code: 1,
      sortie: `brigade : no arbiter has run in ${vide}: no settings to read\n`,
    });
  });

  test("ce que le process de la commande écrit ne porte aucun mot français du glossaire : l'état, les réglages, les refus", async (t) => {
    const { ouvert, repertoire, serveur, commande } = await servi(t, 8);
    ouvert.dire("thermigo", mot(4, { nonArbitres: 1, consommation: { jour: 10, semaine: 20 } }));
    ouvert.dire("muet", mot(1, { machine: true }));
    ouvert.dire("parti", mot(1));
    ouvert.quitter("parti");
    const lignes = (sortie: string) => sortie.trimEnd().split("\n");

    const etat = await commande();
    assert.equal(etat.code, 0);
    assert.ok(lignes(etat.sortie).length > 5);
    sansMotFrancais(lignes(etat.sortie));
    for (const args of [["weight", "thermigo", "3"], ["weight", "thermigo", "3"], ["weight", "atelier", "2"], ["remove", "atelier"]]) {
      const dit = await commande(...args);
      assert.equal(dit.code, 0, args.join(" "));
      sansMotFrancais(lignes(dit.sortie));
    }
    // Les refus : un projet inconnu, un poids ou un nom illisible, une commande inconnue.
    for (const args of [["remove", "atelier"], ["weight", "thermigo", "0"], ["weight", "Pas Un Nom", "2"], ["peser", "thermigo", "2"], ["weight", "thermigo"]]) {
      const refus = await commande(...args);
      assert.notEqual(refus.code, 0, args.join(" "));
      sansMotFrancais(lignes(refus.sortie));
    }
    // Sans port, avec un port illisible, sans répertoire, sans réglages, arbitre injoignable.
    const sans = async (env: Record<string, string>, ...args: string[]) => {
      const cli = lancer(t, CLI, args, env);
      return { code: await cli.fin, lignes: lignes(cli.sortie()) };
    };
    for (const [env, args] of [
      [{}, []],
      [{ BRIGADE_ARBITER_PORT: "pas-un-port" }, []],
      [{}, ["weight", "thermigo", "2"]],
      [{ BRIGADE_ARBITER_STATE_DIR: repertoireTemporaire(t) }, ["weight", "thermigo", "2"]],
      [{ BRIGADE_ARBITER_PORT: String(serveur.port), BRIGADE_ARBITER_STATE_DIR: repertoire, NODE_OPTIONS: `--import=${SANS_RESEAU}` }, []],
    ] as const) {
      const refus = await sans({ ...env }, ...args);
      assert.notEqual(refus.code, 0, JSON.stringify(env));
      sansMotFrancais(refus.lignes);
    }
    assert.match((await sans({ BRIGADE_ARBITER_PORT: "pas-un-port" })).lignes.join("\n"), /BRIGADE_ARBITER_PORT invalid: "pas-un-port"/);
  });

  test("un poids posé avant le ticket est toujours montré et appliqué, sans rien éditer à la main", async (t) => {
    const { ouvert, repertoire, commande } = await servi(t, 8);
    ouvert.dire("thermigo", mot(0));
    ouvert.dire("brigade", mot(0));
    // Le poids tel qu'une version d'avant l'a posé : directement dans les réglages de l'arbitre.
    const reglages = ouvrirReglages(repertoire);
    t.after(() => reglages.fermer());
    reglages.peser("thermigo", 3, "2026-10-01T00:00:00.000Z");

    assert.match((await commande()).sortie, /^  thermigo {2}weight 3 · /m);
    assert.equal(ouvert.etat().projets.find((projet) => projet.projet === "thermigo")?.part, 6);
    assert.deepEqual(await commande("weight", "thermigo", "3"), { code: 0, sortie: "thermigo: weight 3 — unchanged; the arbiter reads it at its next decision\n" });
  });

  test("l'arbitre tient dans son propre process : il répond sur son port, et s'arrête proprement sur SIGTERM", { skip: posixOnly("stops the arbiter with SIGTERM: on Windows kill('SIGTERM') ends the process before its handler runs, so the job saw exit code null instead of 0") }, async (t) => {
    const repertoire = repertoireTemporaire(t);
    // L'arbitre n'en choisit pas : c'est le chef qui pose le port, et l'arbitre dit celui qu'il tient.
    const pose = {
      env: (port: number) => ({ BRIGADE_ARBITER_STATE_DIR: repertoire, BRIGADE_ARBITER_PORT: String(port), BRIGADE_ARBITER_MAX_COOKS: "2" }),
      ouvert: (port: number) => `arbiter open — 127.0.0.1:${port}, account cap: 2 cooks, settings in ${repertoire}`,
    };
    const { enfant: tenu, port } = await lancerSurPortPose(t, TENIR, pose);
    const env = pose.env(port);

    const client = joindreArbitre(port);
    assert.deepEqual(await client.echanger("brigade", { ...mot(1), veut: true }), { accorde: true, motif: null });
    assert.deepEqual(await client.echanger("brigade", { ...mot(2), veut: true }), { accorde: false, motif: "compte" });

    // Un second arbitre sur la même machine est refusé, et ne dérange pas le premier.
    const second = lancer(t, TENIR, [], env);
    assert.equal(await second.fin, 2);
    assert.match(second.sortie(), /the arbiter refuses to start — an arbiter already holds/);
    assert.equal((await client.etat()).plafond, 2);

    tenu.process.kill("SIGTERM");
    assert.equal(await tenu.fin, 0);
    assert.match(tenu.sortie(), /arbiter closed \(SIGTERM\)/);

    // Revenu, il nomme ceux dont il réserve la part.
    // Sur un port tiré à neuf : celui qu'il vient de rendre a pu être repris.
    const { enfant: revenu } = await lancerSurPortPose(t, TENIR, pose);
    await revenu.attendre("share reserved, until they speak again: brigade");
  });

  test("sans répertoire, sans port, sans plafond, ou sur un port pris, l'arbitre refuse de démarrer et dit pourquoi", async (t) => {
    const repertoire = repertoireTemporaire(t);
    const sans = async (env: Record<string, string>) => {
      const tenu = lancer(t, TENIR, [], env);
      return { code: await tenu.fin, sortie: tenu.sortie() };
    };
    assert.deepEqual(await sans({}), { code: 2, sortie: "brigade : the arbiter refuses to start — BRIGADE_ARBITER_STATE_DIR is not set\n" });
    assert.match((await sans({ BRIGADE_ARBITER_STATE_DIR: repertoire, BRIGADE_ARBITER_PORT: "20900" })).sortie, /BRIGADE_ARBITER_MAX_COOKS is not set/);

    const pris = createServer();
    const port = await new Promise<number>((resoudre) => pris.listen(0, "127.0.0.1", () => resoudre((pris.address() as { port: number }).port)));
    t.after(() => pris.close());
    assert.deepEqual(await sans({ BRIGADE_ARBITER_STATE_DIR: repertoire, BRIGADE_ARBITER_PORT: String(port), BRIGADE_ARBITER_MAX_COOKS: "2" }), {
      code: 2,
      sortie: `brigade : the arbiter refuses to start — port ${port} is already taken (BRIGADE_ARBITER_PORT)\n`,
    });
  });
});

// L'arbitre entre projets dans son propre process (`tenir-arbitre`), et la
// commande par laquelle le chef le lit et le règle (`npm run arbitre`).
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { ouvrirArbitre, ouvrirReglages, servirArbitre, type Mot } from "../src/arbitre.ts";
import { joindreArbitre } from "../src/arbitrage.ts";
import { horloge, lancer, lancerSurPortPose, repertoireTemporaire, SANS_RESEAU } from "./outils.ts";

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

test("le chef voit, par projet, ce qui tourne, ce que l'arbitre autorise encore, et la consommation des cooks dite comme telle", async (t) => {
  const { ouvert, serveur, commande } = await servi(t, 10);
  ouvert.dire("thermigo", mot(5, { nonArbitres: 1, consommation: { jour: 1200, semaine: 9000 } }));
  ouvert.dire("brigade", mot(2, { demande: false, consommation: { jour: 300, semaine: 300 } }));

  const { code, sortie } = await commande();
  assert.equal(code, 0);
  assert.match(sortie, new RegExp(String.raw`^arbitre\s+127\.0\.0\.1:${serveur.port} — démarré le 2026-10-09T08:00:00\.000Z$`, "m"));
  assert.match(sortie, /^plafond du compte\s+10 cooks — 7 en cours, tous projets entendus$/m);
  assert.match(sortie, /^machine\s+aucun projet ne s'en dit retenu$/m);
  assert.match(sortie, /^  brigade {2,}poids 1 · 2 en cours · part 5 · encore 3 · rien n'attend · consommation des cooks : 300 tokens sur 24 h, 300 sur 7 jours$/m);
  assert.match(sortie, /^  thermigo {2}poids 1 · 5 en cours \(dont 1 parti sans arbitre\) · part 5 · encore 3 · des tickets attendent · consommation des cooks : 1\s200 tokens sur 24 h, 9\s000 sur 7 jours$/m);
  assert.match(sortie, /^consommation des cooks\s+1\s500 tokens sur 24 h, 9\s300 sur 7 jours — celle des cooks de tickets que les runtimes redisent, pas celle du compte$/m);
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
  assert.match(sortie, /^machine\s+SATURÉE d'après brigade — le plafond effectif est ce qui tourne \(9\) : seul un projet sous sa part relance$/m);
  assert.match(sortie, /^  muet {2,}poids 1 · N'A PAS REPARLÉ depuis le 2026-10-09T09:00:00\.000Z — part réservée : 3, que personne n'emprunte ; `retirer` la libère$/m);
  assert.match(sortie, /^  parti {2,}poids 1 · absent depuis le 2026-10-09T08:00:0\d\.000Z — ne tient aucune part$/m);
  assert.match(sortie, /^  thermigo {2}poids 1 · 9 en cours · part 3 · encore 0 /m);
});

test("le chef règle un poids et retire un projet : l'arbitre qui tourne le lit à sa décision suivante", async (t) => {
  const { ouvert, commande } = await servi(t, 8);
  ouvert.dire("thermigo", mot(4));
  ouvert.dire("brigade", mot(0));
  const part = (nom: string) => ouvert.etat().projets.find((projet) => projet.projet === nom)?.part;

  assert.deepEqual(await commande("poids", "thermigo", "3"), { code: 0, sortie: "thermigo : poids 3 (était 1) ; l'arbitre le lit à sa prochaine décision\n" });
  assert.deepEqual([part("thermigo"), part("brigade")], [6, 2]);
  assert.deepEqual(await commande("poids", "espace", "2"), {
    code: 0,
    sortie: "espace : poids 2 — projet encore inconnu de l'arbitre : il n'aura de part qu'une fois son runtime entendu\n",
  });
  assert.equal(part("espace"), null);

  assert.deepEqual(await commande("retirer", "brigade"), {
    code: 0,
    sortie: "brigade : retiré — sa part n'est plus réservée ; si son runtime tourne, il se réinscrit au poids 1 dès qu'il reparle\n",
  });
  assert.deepEqual(ouvert.etat().projets.map((projet) => projet.projet), ["espace", "thermigo"]);
  assert.deepEqual(await commande("retirer", "brigade"), { code: 1, sortie: "brigade : brigade : projet inconnu de l'arbitre\n" });
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
  assert.match(sortie, new RegExp(String.raw`^arbitre\s+INJOIGNABLE — connexion refusée sur 127\.0\.0\.1:${serveur.port}$`, "m"));
  assert.match(sortie, /chaque projet lance au plus un cook à la fois, sans arbitrage \(mode dégradé\), jusqu'à son retour/);
  assert.match(sortie, /^projets connus\s+1$/m);
  assert.match(sortie, /^  thermigo {2}poids 1$/m);
});

test("ce que la commande ne comprend pas est refusé sans rien écrire", async (t) => {
  const { repertoire, commande } = await servi(t);
  for (const args of [["poids", "thermigo", "0"], ["poids", "Pas Un Nom", "2"], ["peser", "thermigo", "2"]]) {
    const { code, sortie } = await commande(...args);
    assert.equal(code, 2, args.join(" "));
    assert.match(sortie, /usage : BRIGADE_ARBITER_PORT=/);
  }
  const reglages = ouvrirReglages(repertoire);
  t.after(() => reglages.fermer());
  assert.deepEqual(reglages.projets(), []);

  const sans = async (env: Record<string, string>, ...args: string[]) => {
    const cli = lancer(t, CLI, args, env);
    return { code: await cli.fin, sortie: cli.sortie() };
  };
  assert.match((await sans({})).sortie, /BRIGADE_ARBITER_PORT n'est pas défini/);
  assert.match((await sans({}, "poids", "thermigo", "2")).sortie, /BRIGADE_ARBITER_STATE_DIR n'est pas défini/);
  const vide = repertoireTemporaire(t);
  assert.deepEqual(await sans({ BRIGADE_ARBITER_STATE_DIR: vide }, "poids", "thermigo", "2"), {
    code: 1,
    sortie: `brigade : aucun arbitre n'a tourné dans ${vide} : pas de réglages à lire\n`,
  });
});

test("l'arbitre tient dans son propre process : il répond sur son port, et s'arrête proprement sur SIGTERM", async (t) => {
  const repertoire = repertoireTemporaire(t);
  // L'arbitre n'en choisit pas : c'est le chef qui pose le port, et l'arbitre dit celui qu'il tient.
  const pose = {
    env: (port: number) => ({ BRIGADE_ARBITER_STATE_DIR: repertoire, BRIGADE_ARBITER_PORT: String(port), BRIGADE_ARBITER_MAX_COOKS: "2" }),
    ouvert: (port: number) => `arbitre ouvert — 127.0.0.1:${port}, plafond du compte : 2 cooks, réglages dans ${repertoire}`,
  };
  const { enfant: tenu, port } = await lancerSurPortPose(t, TENIR, pose);
  const env = pose.env(port);

  const client = joindreArbitre(port);
  assert.deepEqual(await client.echanger("brigade", { ...mot(1), veut: true }), { accorde: true, motif: null });
  assert.deepEqual(await client.echanger("brigade", { ...mot(2), veut: true }), { accorde: false, motif: "compte" });

  // Un second arbitre sur la même machine est refusé, et ne dérange pas le premier.
  const second = lancer(t, TENIR, [], env);
  assert.equal(await second.fin, 2);
  assert.match(second.sortie(), /l'arbitre refuse de démarrer — un arbitre tient déjà/);
  assert.equal((await client.etat()).plafond, 2);

  tenu.process.kill("SIGTERM");
  assert.equal(await tenu.fin, 0);
  assert.match(tenu.sortie(), /arbitre fermé \(SIGTERM\)/);

  // Revenu, il nomme ceux dont il réserve la part.
  // Sur un port tiré à neuf : celui qu'il vient de rendre a pu être repris.
  const { enfant: revenu } = await lancerSurPortPose(t, TENIR, pose);
  await revenu.attendre("part réservée, tant qu'ils n'ont pas reparlé : brigade");
});

test("sans répertoire, sans port, sans plafond, ou sur un port pris, l'arbitre refuse de démarrer et dit pourquoi", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const sans = async (env: Record<string, string>) => {
    const tenu = lancer(t, TENIR, [], env);
    return { code: await tenu.fin, sortie: tenu.sortie() };
  };
  assert.deepEqual(await sans({}), { code: 2, sortie: "brigade : l'arbitre refuse de démarrer — BRIGADE_ARBITER_STATE_DIR n'est pas défini\n" });
  assert.match((await sans({ BRIGADE_ARBITER_STATE_DIR: repertoire, BRIGADE_ARBITER_PORT: "20900" })).sortie, /BRIGADE_ARBITER_MAX_COOKS n'est pas défini/);

  const pris = createServer();
  const port = await new Promise<number>((resoudre) => pris.listen(0, "127.0.0.1", () => resoudre((pris.address() as { port: number }).port)));
  t.after(() => pris.close());
  assert.deepEqual(await sans({ BRIGADE_ARBITER_STATE_DIR: repertoire, BRIGADE_ARBITER_PORT: String(port), BRIGADE_ARBITER_MAX_COOKS: "2" }), {
    code: 2,
    sortie: `brigade : l'arbitre refuse de démarrer — le port ${port} est déjà pris (BRIGADE_ARBITER_PORT)\n`,
  });
});

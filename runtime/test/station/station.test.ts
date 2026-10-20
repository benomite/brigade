// La station relit sa configuration et ouvre ou arrête ses projets — ici avec
// une fausse cuisine, sans rien lancer : ce qui s'ouvre vraiment se prouve
// dans `main.test.ts`.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { DEBUT, FIN } from "../../src/projets/bloc.ts";
import { ConfigInvalide, DejaEnCours } from "../../src/runtime.ts";
import type { Cuisine, OptionsCuisine } from "../../src/station/cuisine.ts";
import { ecrirePortes } from "../../src/station/portes.ts";
import { ouvrirStation } from "../../src/station/station.ts";
import { aArreter, repertoireTemporaire, temporaireDuFichier } from "../outils.ts";

const rienNeReste = temporaireDuFichier();

type Ouverture = { projet: string; env: Record<string, string | undefined>; arrets: string[] };

// Une station dont chaque cuisine est un témoin : ce qu'on lui a donné, et
// comment elle a été arrêtée. `refus` : ce qu'un projet lève à l'ouverture.
// `portes` : sous les portes de la station, le fichier où elles écrivent leurs ports.
function station(t: TestContext, configuration: string, options: { portes?: boolean } = {}) {
  const racine = repertoireTemporaire(t);
  const ecrire = (texte: string) => writeFileSync(join(racine, "projets"), texte);
  ecrire(configuration);
  const ouvertures: Ouverture[] = [];
  const lignes: string[] = [];
  const refus = new Map<string, Error>();
  const ouvrir = (env: Record<string, string | undefined>, options: OptionsCuisine): Cuisine => {
    const projet = env.BRIGADE_PROJECT ?? "";
    const leve = refus.get(projet);
    if (leve) throw leve;
    const ouverture: Ouverture = { projet, env, arrets: [] };
    ouvertures.push(ouverture);
    options.dire("brigade : ouvert");
    return { projet, repertoireEtat: env.BRIGADE_STATE_DIR ?? "", arreter: (motif) => void ouverture.arrets.push(motif) };
  };
  // Aucune relecture ne vient d'une minuterie : le test relit quand il veut.
  const portes = options.portes ? join(racine, "portes.json") : null;
  const servie = ouvrirStation({ racine, env: { BRIGADE_CLAUDE_BIN: "claude" }, dire: (ligne) => void lignes.push(ligne), ouvrir, relectureMs: 3_600_000, portes });
  aArreter(t, () => servie.arreter("fin du test"));
  return { racine, ecrire, ouvertures, lignes, refus, servie, portes };
}

test("chaque projet de la configuration est ouvert avec son environnement, et chaque ligne qu'il dit porte son nom", (t) => {
  const { racine, ouvertures, lignes, servie } = station(t, "brigade benomite/brigade v2\nespace benomite/espace main BRIGADE_SECRETS_FILE=/s\n");
  assert.deepEqual(servie.projets(), ["brigade", "espace"]);
  assert.deepEqual(
    ouvertures.map(({ env }) => [env.BRIGADE_PROJECT, env.BRIGADE_GITHUB_REPO, env.BRIGADE_BASE_BRANCH, env.BRIGADE_STATE_DIR, env.BRIGADE_SECRETS_FILE, env.BRIGADE_CLAUDE_BIN]),
    [
      ["brigade", "benomite/brigade", "v2", join(racine, "etat/brigade"), undefined, "claude"],
      ["espace", "benomite/espace", "main", join(racine, "etat/espace"), "/s", "claude"],
    ],
  );
  assert.deepEqual(lignes.slice(0, 2), ["brigade [brigade] : ouvert", `brigade [brigade] : servi par la station — benomite/brigade, branche v2, état dans ${join(racine, "etat/brigade")}`]);
});

test("un projet ajouté s'ouvre, un projet retiré s'arrête, une ligne changée rouvre son projet — et les autres ne sont pas touchés", (t) => {
  const { ecrire, ouvertures, lignes, servie } = station(t, "brigade benomite/brigade v2\n");
  ecrire("brigade benomite/brigade v2\nespace benomite/espace main\n");
  servie.relire();
  assert.deepEqual(servie.projets(), ["brigade", "espace"]);

  // Relire sans changement ne rouvre rien ; les blancs ne sont pas un changement.
  ecrire("brigade   benomite/brigade\tv2\n\n# un commentaire\nespace benomite/espace main\n");
  servie.relire();
  assert.equal(ouvertures.length, 2);

  ecrire("brigade benomite/brigade v2\n");
  servie.relire();
  assert.deepEqual(servie.projets(), ["brigade"]);
  assert.deepEqual(ouvertures.map((o) => [o.projet, o.arrets]), [["brigade", []], ["espace", ["removed"]]]);
  assert.ok(lignes.includes("brigade [espace] : retiré de la configuration : la station ne le sert plus"));

  ecrire("brigade benomite/brigade v3\n");
  servie.relire();
  assert.deepEqual(ouvertures.map((o) => [o.projet, o.env.BRIGADE_BASE_BRANCH, o.arrets]), [["brigade", "v2", ["reconfigured"]], ["espace", "main", ["removed"]], ["brigade", "v3", []]]);

  // Tout retiré : la station tourne encore, sans projet.
  ecrire("");
  servie.relire();
  assert.deepEqual(servie.projets(), []);
  assert.deepEqual(ouvertures.at(-1)?.arrets, ["removed"]);
});

test("un projet refusé est dit une fois, les autres sont servis ; il n'est réessayé que si sa ligne change", (t) => {
  const { ecrire, refus, lignes, servie, ouvertures } = station(t, "");
  refus.set("espace", new ConfigInvalide("BRIGADE_SECRETS_FILE invalide"));
  ecrire("brigade benomite/brigade v2\nespace benomite/espace main\n");
  servie.relire();
  servie.relire();
  assert.deepEqual(servie.projets(), ["brigade"]);
  assert.deepEqual(lignes.filter((ligne) => ligne.startsWith("brigade [espace]")), ["brigade [espace] : refusé par la station, les autres projets restent servis — BRIGADE_SECRETS_FILE invalide"]);

  // Réparé sans que sa ligne change : rien n'est réessayé.
  refus.delete("espace");
  servie.relire();
  assert.deepEqual(servie.projets(), ["brigade"]);
  ecrire("brigade benomite/brigade v2\nespace benomite/espace main BRIGADE_SECRETS_FILE=/s\n");
  servie.relire();
  assert.deepEqual(servie.projets(), ["brigade", "espace"]);
  assert.equal(ouvertures.length, 2);
});

test("un projet qu'un autre runtime tient encore est repris dès qu'il est libre, sans que sa ligne change", (t) => {
  const { ecrire, refus, lignes, servie } = station(t, "");
  refus.set("brigade", new DejaEnCours("un runtime tient déjà le projet « brigade »"));
  ecrire("brigade benomite/brigade v2\n");
  servie.relire();
  servie.relire();
  assert.deepEqual(servie.projets(), []);
  assert.equal(lignes.filter((ligne) => ligne.includes("refusé")).length, 1);
  refus.delete("brigade");
  servie.relire();
  assert.deepEqual(servie.projets(), ["brigade"]);
});

test("une ligne illisible de la configuration est dite une fois, tant qu'elle ne change pas", (t) => {
  const { ecrire, lignes, servie } = station(t, "brigade benomite/brigade v2\nseul\n");
  servie.relire();
  assert.deepEqual(lignes.filter((ligne) => ligne.startsWith("brigade : station")), ["brigade : station — ligne 2 de la configuration (« seul ») : attendu le nom du projet, son dépôt GitHub (<owner>/<repo>) et sa branche d'intégration"]);
  assert.deepEqual(servie.projets(), ["brigade"]);
  ecrire("brigade benomite/brigade v2\n");
  servie.relire();
  ecrire("brigade benomite/brigade v2\nseul\n");
  servie.relire();
  assert.equal(lignes.filter((ligne) => ligne.startsWith("brigade : station")).length, 2);
});

test("arrêtée, la station arrête chacun de ses projets par le signal reçu, et ne relit plus rien", (t) => {
  const { ecrire, ouvertures, servie } = station(t, "brigade benomite/brigade v2\nespace benomite/espace main\n");
  servie.arreter("SIGTERM");
  assert.deepEqual(ouvertures.map((o) => o.arrets), [["SIGTERM"], ["SIGTERM"]]);
  ecrire("calculus benomite/calculus main\n");
  servie.relire();
  assert.equal(ouvertures.length, 2);
  assert.deepEqual(servie.projets(), []);
});

// Ce que la station publie de ses projets (appairage/presence.ts, `projets: () => station.projets()`
// dans station/main.ts) : l'app en tire la liste de sa page (#878). Une ligne écrite à la main n'y est
// pas moins qu'une ligne que l'app a fait écrire.
test("les projets servis sont tous ceux de la configuration : ceux que l'app a ajoutés, et ceux écrits à la main hors de son bloc", (t) => {
  const { servie } = station(t, ["cantine benomite/cantine main", DEBUT, "parade benomite/parade main", FIN, "brigade benomite/brigade v2", ""].join("\n"));
  assert.deepEqual([...servie.projets()].sort(), ["brigade", "cantine", "parade"]);
});

test("station.test.ts ne laisse rien dans le répertoire temporaire", rienNeReste);

test("sous les portes de la station, chaque projet reçoit le port de la sienne — jamais celui d'un autre projet ni celui de la station", (t) => {
  const racine = repertoireTemporaire(t);
  ecrirePortes(join(racine, "portes.json"), { station: 41000, projets: { brigade: 41001, espace: 41002 } });
  const ecrire = (texte: string) => writeFileSync(join(racine, "projets"), texte);
  ecrire("brigade benomite/brigade v2\nespace benomite/espace main\n");
  const ports: Record<string, string | undefined> = {};
  const servie = ouvrirStation({
    racine,
    env: { BRIGADE_CLAUDE_BIN: "claude" },
    dire: () => {},
    ouvrir: (env) => {
      ports[env.BRIGADE_PROJECT ?? ""] = env.BRIGADE_PROXY_PORT;
      return { projet: env.BRIGADE_PROJECT ?? "", repertoireEtat: "", arreter: () => {} };
    },
    relectureMs: 3_600_000,
    portes: join(racine, "portes.json"),
  });
  aArreter(t, () => servie.arreter("fin du test"));
  assert.deepEqual(servie.projets(), ["brigade", "espace"]);
  assert.deepEqual(ports, { brigade: "41001", espace: "41002" });
});

test("un projet dont la porte n'a pas encore dit son port attend, en le disant ; servi dès qu'elle l'a écrit — les autres projets ne l'attendent pas", (t) => {
  const { portes, ouvertures, lignes, servie } = station(t, "brigade benomite/brigade v2\nespace benomite/espace main\n", { portes: true });
  assert.ok(portes);
  assert.deepEqual(servie.projets(), []);
  assert.match(servie.refus("espace") ?? "", /sa porte n'est pas ouverte — brigade-station-porte\.service n'a pas écrit son port dans .*portes\.json/);
  assert.equal(servie.cause("espace"), "door-not-open");
  // Relire sans port ne le redit pas.
  const dits = lignes.length;
  servie.relire();
  assert.equal(lignes.length, dits);

  ecrirePortes(portes, { station: 41000, projets: { brigade: 41001 } });
  servie.relire();
  assert.deepEqual(servie.projets(), ["brigade"]);
  ecrirePortes(portes, { station: 41000, projets: { brigade: 41001, espace: 41002 } });
  servie.relire();
  assert.deepEqual(servie.projets(), ["brigade", "espace"]);
  assert.deepEqual(ouvertures.map(({ projet, env }) => [projet, env.BRIGADE_PROXY_PORT]), [["brigade", "41001"], ["espace", "41002"]]);
  assert.equal(servie.refus("espace"), null);
});

test("une porte qui change de port rouvre son projet, et lui seul ; une porte qui disparaît arrête son projet : il ne part jamais sans elle", (t) => {
  const { portes, ouvertures, lignes, servie } = station(t, "brigade benomite/brigade v2\nespace benomite/espace main\n", { portes: true });
  assert.ok(portes);
  ecrirePortes(portes, { station: 41000, projets: { brigade: 41001, espace: 41002 } });
  servie.relire();
  ecrirePortes(portes, { station: 41000, projets: { brigade: 41001, espace: 41003 } });
  servie.relire();
  assert.deepEqual(ouvertures.map(({ projet, env, arrets }) => [projet, env.BRIGADE_PROXY_PORT, arrets]), [["brigade", "41001", []], ["espace", "41002", ["reconfigured"]], ["espace", "41003", []]]);
  assert.ok(lignes.includes("brigade [espace] : sa porte a changé de port : la station le rouvre"), lignes.join("\n"));

  ecrirePortes(portes, { station: 41000, projets: { brigade: 41001 } });
  servie.relire();
  assert.deepEqual(servie.projets(), ["brigade"]);
  assert.deepEqual(ouvertures.at(-1)?.arrets, ["reconfigured"]);
  assert.match(servie.refus("espace") ?? "", /sa porte n'est pas ouverte/);
});

test("sous les portes de la station, une ligne qui nomme sa propre porte est refusée : la station la donne, elle ne se règle pas", (t) => {
  const { portes, servie } = station(t, "brigade benomite/brigade v2 BRIGADE_PROXY_PORT=3128\nespace benomite/espace main\n", { portes: true });
  assert.ok(portes);
  ecrirePortes(portes, { station: 41000, projets: { brigade: 41001, espace: 41002 } });
  servie.relire();
  assert.deepEqual(servie.projets(), ["espace"]);
  assert.equal(servie.cause("brigade"), "proxy-port-set");
  assert.match(servie.refus("brigade") ?? "", /BRIGADE_PROXY_PORT ne se règle pas sur sa ligne : la station donne à chaque projet sa porte \(brigade-station-porte\.service\)/);
});

test("chaque refus d'ouverture a sa cause — et le texte brut du refus reste celui de l'erreur", (t) => {
  const { ecrire, refus, servie } = station(t, "");
  refus.set("a", new DejaEnCours("un autre runtime le tient"));
  refus.set("b", new ConfigInvalide("sans cause"));
  refus.set("c", new ConfigInvalide("bac à sable inutilisable", "sandbox-unusable"));
  refus.set("d", new Error("imprévu"));
  ecrire("a benomite/a v2\nb benomite/b v2\nc benomite/c v2\nd benomite/d v2\ne benomite/e v2\n");
  servie.relire();
  assert.deepEqual([servie.cause("a"), servie.cause("b"), servie.cause("c"), servie.cause("d"), servie.cause("e")], ["already-served", "configuration-invalid", "sandbox-unusable", "unexpected", null]);
  assert.deepEqual(servie.refuses(), { a: "un autre runtime le tient", b: "sans cause", c: "bac à sable inutilisable", d: "imprévu" });
});

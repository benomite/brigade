// Une station secondaire du projet — une autre machine, déclarée
// `distante+ensemble` — réclame un ticket et renouvelle son bail par GitHub
// seulement : elle pose sa demande dans son gist, la principale la relaie au
// journal du projet, son runtime en décide, et la réponse se publie au Kitchen
// board, où la station la lit. Sur une cuisine complète ; GitHub est un double
// en mémoire — des gists et des issues. La station secondaire n'a ni ssh vers
// la box ni accès à son journal : elle n'a que son gist et le tableau.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import type { Canal, Fichiers } from "../../src/appairage/canal.ts";
import type { BacASableDeLaStation, Reponse } from "../../src/events/remote.ts";
import { lireStations } from "../../src/stations-declarees.ts";
import type { ClientDuTableau, IssueDuTableau } from "../../src/tableau/publication/client.ts";
import { publierLeTableau, tableauDuJournal } from "../../src/tableau/publication/publier.ts";
import type { DemandeParGitHub } from "../../src/tirer-par-github/demande.ts";
import { demanderParGitHub, lecteurDuTableau } from "../../src/tirer-par-github/demander.ts";
import { relayerLesDemandes } from "../../src/tirer-par-github/relayer.ts";
import { attributionsDuTableau } from "../../src/tirer-par-github/tableau.ts";
import { cuisine, issue, type Options } from "../aides/cuisine.ts";
import { DEPOT, jusqua } from "../outils.ts";
import { posixOnly } from "../support/plateforme.ts";

const [BOX, MAC, PC] = ["box/claude", "mac/claude", "pc/claude"];
const GISTS: Record<string, string> = { [MAC]: "gistmac", [PC]: "gistpc" };
// Le poste de la seconde station, tel que sa sonde le dit : le bac à sable est là.
const DISPONIBLE: BacASableDeLaStation = { available: true, version: "2.1.250", home: "/Users/chef", worktrees: "/Users/chef/brigade-cooks/brigade", caches: [] };

// GitHub, doublé : les gists du compte et les issues du dépôt.
function fauxGitHub() {
  const gists = new Map<string, Fichiers>(Object.values(GISTS).map((id) => [id, {}]));
  const canal: Canal = {
    creer: async () => assert.fail("personne ne crée de gist ici"),
    async ecrire(id, fichiers) {
      const gist = gists.get(id);
      if (gist === undefined) return "absent";
      Object.assign(gist, fichiers);
      return "ecrit";
    },
    lire: async (id) => {
      const gist = gists.get(id);
      return gist === undefined ? null : { ...gist };
    },
  };
  const issues = new Map<number, IssueDuTableau>();
  const tableau: ClientDuTableau = {
    auLabel: async (label) => [...issues.values()].filter((une) => une.labels.includes(label)).map((une) => ({ ...une })),
    issue: async (numero) => (issues.has(numero) ? { ...issues.get(numero)! } : null),
    async creer({ titre, corps, labels }) {
      const numero = issues.size + 1;
      issues.set(numero, { numero, ouverte: true, titre, corps, labels });
      return numero;
    },
    async ecrireCorps(numero, corps) {
      issues.get(numero)!.corps = corps;
    },
    rouvrir: async () => {},
    epingler: async () => false,
  };
  const corps = () => [...issues.values()][0]?.corps ?? "";
  return { gists, canal, tableau, corps };
}

// Une cuisine dont le projet déclare ces stations ; la principale qui relaie et
// publie ; et de quoi jouer chaque station secondaire, par GitHub seulement.
function service(t: TestContext, declaration: string, options: Options = {}) {
  const lieu = cuisine(t, { stations: lireStations({ BRIGADE_STATIONS: declaration }), scenario: "muet", presenceMs: 120_000, plafonds: { durationMs: 3_600_000, idleMs: 3_600_000 }, ...options });
  const { journal, repertoire, heure, runtime } = lieu;
  const github = fauxGitHub();
  const instant = () => heure.maintenant().getTime();
  const secondaires = Object.entries(GISTS).map(([station, gist]) => ({ station, gist }));
  // La principale : ce que `projets/tenir.ts` fait à chaque lecture, puis ce
  // que le tableau fait à chaque tick (`brancherLeTableau`).
  const relayer = () => relayerLesDemandes({ repertoireEtat: repertoire, depot: DEPOT, secondaires, lire: github.canal.lire, maintenant: instant });
  const publication = publierLeTableau({ client: github.tableau, depot: DEPOT, lire: (lu) => tableauDuJournal(journal, runtime.projet, lu, { depot: DEPOT }), dire: () => {} });
  const relayees: string[] = [];
  let tourne = false;
  let boucle: Promise<void> = Promise.resolve();
  // Ce qui l'a arrêtée pendant qu'elle tournait : le test le dit à sa fin.
  let panne: unknown = null;
  const principale = () => {
    tourne = true;
    boucle = (async () => {
      while (tourne) {
        relayees.push(...(await relayer()).relayees.map(({ station, verb }) => `${station} ${verb}`));
        await publication.rafraichir(heure.maintenant());
        await new Promise((resoudre) => setTimeout(resoudre, 5));
      }
    })().catch((erreur: unknown) => void (tourne && (panne = erreur)));
  };
  // Arrêtée avant que la cuisine ne ferme son journal.
  const arreterLaPrincipale = async () => {
    tourne = false;
    await boucle;
    assert.equal(panne, null);
  };
  const demander = (station: string, demande: DemandeParGitHub): Promise<Reponse> =>
    demanderParGitHub({ station, depot: DEPOT, gist: GISTS[station]!, canal: github.canal, lireLeTableau: lecteurDuTableau(github.tableau), maintenant: instant, pasMs: 5, attenteMs: 60_000 }, demande);
  const prises = (ticket: number) => journal.duTicket(ticket).filter((e) => e.type === "ticket.taken").map((e) => e.author.replace(/^station:/, ""));
  return { ...lieu, github, relayer, principale, relayees, demander, prises, arreterLaPrincipale };
}

const enAttente = async (lieu: ReturnType<typeof service>, ...numeros: number[]) => {
  // La box, à un cook au plus, est occupée : les tickets suivants attendent une station.
  lieu.gh.poser(issue(14));
  await jusqua(() => lieu.etat(14) === "taken");
  for (const numero of numeros) lieu.gh.poser(issue(numero));
  await jusqua(() => numeros.every((numero) => lieu.etat(numero) === "waiting"));
};

describe("une station secondaire tire son travail par GitHub, arbitrée par la principale", { concurrency: 4, skip: posixOnly("the kitchen runs the fake claude, a POSIX shell script") }, () => {
  test("sans ssh vers la box, elle obtient un ticket et son bail : sa demande posée dans son gist, la réponse lue au Kitchen board", async (t) => {
    const lieu = service(t, `${BOX}:1:code,${MAC}:1:code:distante+ensemble`);
    const { github, journal, etat, prises } = lieu;
    await enAttente(lieu, 17);
    lieu.principale();

    const reponse = await lieu.demander(MAC, { verb: "claim", sandbox: DISPONIBLE });
    assert.ok(reponse.ok && reponse.verb === "claim", JSON.stringify(reponse));
    const { mission } = reponse;
    assert.ok(mission !== null, JSON.stringify(reponse));
    assert.equal(mission.ticket, 17);
    assert.equal(mission.branch, `cook/${mission.run}`);
    // Un ticket ordinaire ne part sur une autre machine que dans son bac à sable.
    assert.equal(mission.sandbox, true);
    // Les arguments de `claude` reviennent entiers : la consigne en tête, comme `pull` les rend.
    assert.deepEqual(mission.args.slice(0, 2), ["-p", mission.prompt]);
    assert.ok(mission.args.includes("--model") && mission.args.includes(mission.model));
    assert.match(mission.prompt, /ticket #17/);
    assert.ok(Date.parse(mission.leaseUntil) > lieu.heure.maintenant().getTime());

    // C'est la principale qui a décidé : le ticket est à elle au journal, une fois.
    assert.equal(etat(17), "taken");
    assert.deepEqual(prises(17), [MAC]);
    // Et rien n'est passé par le geste de la box : chaque demande au journal vient de GitHub.
    const demandes = journal.tout().filter((e) => e.type === "remote.asked");
    assert.equal(demandes.length, 1);
    assert.ok(demandes.every((e) => e.type === "remote.asked" && e.payload.via === "github"));
    // Le tableau dit le prêt et son bail.
    assert.deepEqual(attributionsDuTableau(github.corps(), MAC), [{ ticket: 17, station: MAC, run: mission.run, bailJusqua: mission.leaseUntil }]);
    // Sa demande est restée dans son gist ; la principale ne la relaie qu'une fois.
    assert.equal(Object.keys(github.gists.get("gistmac") ?? {}).length, 1);
    assert.deepEqual(lieu.relayees, [`${MAC} claim`]);
    await lieu.arreterLaPrincipale();
  });

  test("deux stations réclament le même ticket au même instant : une seule l'obtient, l'autre n'en reçoit aucun", async (t) => {
    const lieu = service(t, `${BOX}:1:code,${MAC}:1:code:distante+ensemble,${PC}:1:code:distante+ensemble`);
    const { github, etat, prises } = lieu;
    await enAttente(lieu, 17);

    // Les deux demandes sont posées avant que la principale ne lise : elle les relaie ensemble.
    const reponses = [lieu.demander(MAC, { verb: "claim", sandbox: DISPONIBLE }), lieu.demander(PC, { verb: "claim", sandbox: DISPONIBLE })];
    await jusqua(() => [...github.gists.values()].every((gist) => Object.keys(gist).length === 1));
    lieu.principale();
    const [mac, pc] = await Promise.all(reponses);
    assert.deepEqual(lieu.relayees.slice(0, 2).sort(), [`${MAC} claim`, `${PC} claim`]);

    const recues = [mac, pc].map((reponse) => (reponse?.ok && reponse.verb === "claim" ? (reponse.mission?.ticket ?? null) : "refus"));
    assert.deepEqual(recues.filter((recue) => recue === 17).length, 1, JSON.stringify([mac, pc]));
    assert.deepEqual(recues.filter((recue) => recue === null).length, 1, JSON.stringify([mac, pc]));
    const gagnante = recues[0] === 17 ? MAC : PC;
    assert.equal(etat(17), "taken");
    assert.deepEqual(prises(17), [gagnante]);
    // Le tableau ne prête le ticket qu'à elle.
    assert.deepEqual(attributionsDuTableau(github.corps(), gagnante).map(({ ticket }) => ticket), [17]);
    assert.deepEqual(attributionsDuTableau(github.corps(), gagnante === MAC ? PC : MAC), []);
    await lieu.arreterLaPrincipale();
  });

  test("la station renouvelle son bail par GitHub : son échéance avance au Kitchen board — sans preuve de progrès, elle n'avance pas", async (t) => {
    const lieu = service(t, `${BOX}:1:code,${MAC}:1:code:distante+ensemble`);
    const { github, heure } = lieu;
    await enAttente(lieu, 17);
    lieu.principale();
    const prise = await lieu.demander(MAC, { verb: "claim", sandbox: DISPONIBLE });
    assert.ok(prise.ok && prise.verb === "claim" && prise.mission !== null, JSON.stringify(prise));
    const { run, leaseUntil: premier } = prise.mission;
    await jusqua(() => attributionsDuTableau(github.corps(), MAC)[0]?.bailJusqua === premier);

    // Son cook a travaillé : son worktree a bougé.
    heure.avancer(60_000);
    const renouvele = await lieu.demander(MAC, { verb: "renew", run, proof: "empreinte-1", turns: 3, tokens: 1200 });
    assert.ok(renouvele.ok && renouvele.verb === "renew", JSON.stringify(renouvele));
    assert.ok(Date.parse(renouvele.leaseUntil) > Date.parse(premier), `${renouvele.leaseUntil} après ${premier}`);
    await jusqua(() => attributionsDuTableau(github.corps(), MAC)[0]?.bailJusqua === renouvele.leaseUntil);
    assert.deepEqual(attributionsDuTableau(github.corps(), MAC), [{ ticket: 17, station: MAC, run, bailJusqua: renouvele.leaseUntil }]);

    // La même empreinte : rien n'a bougé, le bail ne se renouvelle pas — il reste au tableau tel quel.
    heure.avancer(60_000);
    const refuse = await lieu.demander(MAC, { verb: "renew", run, proof: "empreinte-1", turns: 4, tokens: 1300 });
    assert.deepEqual([refuse.ok, !refuse.ok && refuse.refusal], [false, "no-progress"]);
    assert.equal(attributionsDuTableau(github.corps(), MAC)[0]?.bailJusqua, renouvele.leaseUntil);
    // Chaque renouvellement a son fichier dans le gist, à côté de la réclamation.
    assert.equal(Object.keys(github.gists.get("gistmac") ?? {}).length, 2);
    await lieu.arreterLaPrincipale();
  });
});

test("le côté de la station secondaire n'ouvre aucun journal et ne passe par aucun geste de la box : il n'a que son gist et le tableau", () => {
  const source = readFileSync(join(import.meta.dirname, "../../src/tirer-par-github/demander.ts"), "utf8");
  assert.doesNotMatch(source, /from "\.\.\/(journal|tirer|distantes)\.ts"|ouvrirJournal|BRIGADE_STATE_DIR|node:child_process/);
});

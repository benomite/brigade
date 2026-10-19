// Le runner du poste, de bout en bout, contre une box de test : la cuisine du
// runtime elle-même — rail, garde-fous, stations, pass —, sur un vrai dépôt git,
// un faux `claude`, de fausses gates et un GitHub de test. Le runner la joint
// comme il joindrait une box : par un `ssh`, ici une doublure qui lance le vrai
// geste `pull` du runtime dans son propre process. Ni réseau, ni quota.
//
// Aucun test n'attend une durée : il attend un fait — au journal de la box, sur
// l'origine, ou la mort d'un process.
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { environnementCook as environnementDUnCookDeLaBox, lireFlux, verdict } from "../../runtime/src/claude.ts";
import type { Mission as MissionDeLaBox, Reponse as ReponseDeLaBox } from "../../runtime/src/events/remote.ts";
import { decrireEtat, lireEtat } from "../../runtime/src/etat.ts";
import { MARQUEUR } from "../../runtime/src/fiche.ts";
import { etatStation } from "../../runtime/src/projections/stations.ts";
import { lireStations } from "../../runtime/src/stations-declarees.ts";
import { superviser } from "../../runtime/src/superviseur.ts";
import { chef, cuisine, fauxGitHub, issue, PLAFONDS, type Lieux, type Options } from "../../runtime/test/aides/cuisine.ts";
import { aArreter, BASE, depotGit, ecrireSuite, ENV_GIT, FAUX_CLAUDE, git, jusqua, lancementsDuFauxClaude, repertoireTemporaire, vivant } from "../../runtime/test/outils.ts";
import { lireConfiguration } from "../src/config.ts";
import { commandeTirer, environnementCook, missionLue, ouvrirLecture, ouvrirRunner, tirer, type EtatDeStation, type Mission, type Reponse } from "../src/runner.ts";

const [STATION, MAC] = ["box/claude", "mac/claude"];
const DECLAREES = lireStations({ BRIGADE_STATIONS: `${STATION}:1:code,${MAC}:1:chrome-connecté:distante` });
const RUNTIME = join(import.meta.dirname, "../../runtime");
const FLUX = join(RUNTIME, "test/aides/flux");
// Large : rien ne court contre lui, il ne tombe que si un test le règle court.
const BAIL_MS = 600_000;

// Ce que la box répond a la forme que le runner en lit : l'une se pose sur l'autre.
const _mission: Mission = {} as MissionDeLaBox;
const _reponse: Reponse = {} as ReponseDeLaBox;
void [_mission, _reponse];

// Pose un ticket calibré avec sa fiche, comme le manager au découpage.
const poser = (gh: Lieux["gh"], numero: number, ...lignes: string[]) => {
  if (lignes.length > 0) gh.ficher(numero, "2026-10-08T09:00:00Z", [MARQUEUR, ...lignes].join("\n"));
  gh.poser(issue(numero));
};

// Une box de test, et le poste du chef à côté : son clone du projet, son `ssh`,
// son `claude`. `ouvrir` lance l'app — son runner ; `fermer` l'arrête.
// `claude` : le scénario du faux `claude` du poste ; `suiteDuPoste` : celui de chacun de ses
// lancements, dans l'ordre.
function service(t: TestContext, options: Options & { claude?: string; suiteDuPoste?: string[] } = {}) {
  const { origine, clone } = depotGit(t);
  // Le projet porte ses gates : la pass les joue sur toute livraison, d'où qu'elle vienne.
  mkdirSync(join(clone, ".claude/brigade"), { recursive: true });
  symlinkSync(join(RUNTIME, "test/aides/fausses-gates.sh"), join(clone, ".claude/brigade/gates.sh"));
  git(clone, "add", ".");
  git(clone, "commit", "-q", "-m", "les gates du projet");
  git(clone, "push", "-q", "origin", BASE);
  // L'horloge de la box est la vraie : les demandes du runner lui arrivent d'un autre process.
  const lieux: Lieux = { repertoire: repertoireTemporaire(t), origine, clone, gh: fauxGitHub(), heure: { maintenant: () => new Date(), avancer: () => {} } };
  const box = cuisine(t, {
    lieux,
    git: true,
    pass: true,
    stations: DECLAREES,
    scenario: "livre",
    bailMs: BAIL_MS,
    // Aucun plafond ne tombe pendant un test, si chargée que soit la machine.
    plafonds: { durationMs: 600_000, idleMs: 600_000 },
    ...options,
  });

  // Le poste : rien de lui n'est dans l'état de la box.
  const poste = repertoireTemporaire(t);
  const dossier = join(poste, "brigade");
  git(poste, "clone", "-q", origine, dossier);
  const temoin = join(poste, "temoin");
  mkdirSync(temoin);
  const feu = join(poste, "feu");
  const appels = join(poste, "appels");
  // Le `ssh` du poste : il note ce qu'on lui demande, puis fait ce que ferait
  // la box — son shell redécoupe la ligne, et le geste lance la commande du
  // runtime, ici `pull`, sur l'état du projet. `coupee` : la box ne répond plus.
  const ssh = join(poste, "ssh");
  writeFileSync(
    ssh,
    `#!/bin/sh
printf '%s\\n' "$*" >>'${appels}'
[ -e '${poste}/coupee' ] && { echo 'ssh: connect to host box port 22: Connection refused' >&2; exit 255; }
for ligne; do :; done
eval "set -- $ligne"
[ "$1" = brigade ] && [ "$2" = brigade ] || exit 65
[ "$3" = pull ] || exit 66
shift 3
cd '${RUNTIME}' && BRIGADE_STATE_DIR='${lieux.repertoire}' exec '${process.execPath}' src/tirer-cli.ts "$@"
`,
  );
  chmodSync(ssh, 0o755);
  writeFileSync(join(poste, "app.json"), JSON.stringify({ projets: [{ nom: "brigade", dossier, hote: "box", stations: [MAC] }] }));
  const worktrees = join(poste, "worktrees");
  // L'environnement du poste : ce qu'un cook d'ici en hérite, et ce qui règle son faux `claude`.
  const suite = join(poste, "suite.txt");
  if (options.suiteDuPoste) ecrireSuite(suite, options.suiteDuPoste);
  const env = { ...ENV_GIT, FAUX_CLAUDE: options.claude ?? "livre", FAUX_CLAUDE_SUITE: suite, FAUX_CLAUDE_TEMOIN: temoin, FAUX_CLAUDE_FEU: feu, BRIGADE_APP_CONFIG: join(poste, "app.json") };

  const dits: EtatDeStation[] = [];
  let runner: ReturnType<typeof ouvrirRunner> | undefined;
  const fermer = async () => {
    await runner?.fermer();
    runner = undefined;
  };
  // Avant que les répertoires ne partent : plus aucun cook, plus aucun `ssh`.
  aArreter(t, fermer);
  const ouvrir = () => {
    runner = ouvrirRunner({ ssh, git: "git", claude: FAUX_CLAUDE, worktrees, env, delaiMs: 120_000, connexionS: 10, gitMs: 120_000, pasMs: 20, graceMs: 2000, surEtat: (etat) => void dits.push(etat) });
    // L'app joue ce que son fichier des projets déclare.
    runner.servir(lireConfiguration(join(poste, "app.json")).projets);
    return runner;
  };

  const { journal } = box;
  const servi = (ticket: number) => box.types(ticket).includes("ticket.served");
  const raison = (ticket: number) => box.runtime.rail.tickets().find((x) => x.ticket === ticket)?.reason;
  // Les missions que la box a remises pour ce ticket, telles que son journal les garde — et la dernière.
  const missions = (ticket: number): MissionDeLaBox[] =>
    journal.duTicket(ticket).flatMap((e) => (e.type === "remote.answered" && e.payload.ok && e.payload.verb === "claim" && e.payload.mission !== null ? [e.payload.mission] : []));
  const mission = (ticket: number): MissionDeLaBox => {
    const remise = missions(ticket).at(-1);
    assert.ok(remise, `aucune mission au journal pour #${ticket}`);
    return remise;
  };
  // Vrai tant que la box tient la station du poste pour présente.
  const presente = () => etatStation(journal.base, MAC)?.presentSince != null;
  // Les réponses de la box aux renouvellements de ce run.
  const renouvellements = (run: string) => {
    const demandes = new Set(journal.tout().flatMap((e) => (e.type === "remote.asked" && e.payload.verb === "renew" && e.payload.run === run ? [e.payload.id] : [])));
    return journal.tout().flatMap((e) => (e.type === "remote.answered" && demandes.has(e.payload.id) ? [e.payload] : []));
  };
  return {
    ...box,
    lieux,
    dossier,
    worktrees,
    feu,
    env,
    dits,
    ouvrir,
    fermer,
    servi,
    raison,
    mission,
    missions,
    presente,
    renouvellements,
    // Vrai quand le runner a rangé le poste : plus de worktree de cook, plus de
    // branche de cook. Il range après la réponse de la box à sa livraison, que la
    // pass a pu servir avant : un test qui ferme l'app sur `servi` l'attend d'abord.
    range: () =>
      existsSync(join(worktrees, "brigade")) && readdirSync(join(worktrees, "brigade")).length === 0 && git(dossier, "for-each-ref", "refs/heads/cook", "refs/brigade/origine/cook") === "",
    // Les lancements du `claude` du poste — jamais ceux de la box.
    cooksDuPoste: () => lancementsDuFauxClaude(temoin),
    // Le pid de chacun : le nom sous lequel la doublure note son lancement.
    pidsDuPoste: () => (existsSync(join(temoin, "ordre")) ? readFileSync(join(temoin, "ordre"), "utf8").split("\n").filter(Boolean).map((nom) => Number(nom.split("-")[0])) : []),
    // Chaque ligne que le `ssh` du poste a reçue.
    appels: () => (existsSync(appels) ? readFileSync(appels, "utf8").split("\n").filter(Boolean) : []),
    couper: () => writeFileSync(join(poste, "coupee"), ""),
    status: () => decrireEtat(lireEtat(journal), new Date()),
  };
}

// Tout ce que le runner demande à la box, et rien d'autre : le geste `pull`,
// au nom de sa station — sans transfert de port, sans adresse, sans rien qui
// dise à la box où est ce poste.
const DEMANDE = new RegExp(
  `^-o BatchMode=yes -o ConnectTimeout=10 -- box brigade brigade pull ${MAC} (announce|claim|renew [0-9a-z-]+ (--proof [0-9a-f]{64} )?--turns [0-9]+ --tokens [0-9]+|return [0-9a-z-]+ --end (livre|echec( --reason .+)?) --turns [0-9]+ --tokens [0-9]+)$`,
);

describe("le runner du poste, contre une box de test", { concurrency: 4 }, () => {
  test("un ticket qui demande ce que seul le poste fournit part, est cuisiné par le runner, et sa livraison passe la pass — mêmes gates, même reviewer, même chemin au journal que celle d'un cook de la box", async (t) => {
    const lieu = service(t);
    const { gh, repertoire, origine, journal, dossier, worktrees, etat, servi, gates, relectures, cooks, dernier, types } = lieu;
    const avant = git(dossier, "for-each-ref");
    chef(repertoire, "grant.activated");
    poser(gh, 14, "- requiert : code");
    poser(gh, 16, "- requiert : chrome-connecté");
    // Le ticket de la box d'abord, seul en pass : son chemin est celui auquel l'autre se compare.
    await jusqua(() => servi(14) && etat(16) === "86");
    lieu.ouvrir();
    await jusqua(() => servi(16) && lieu.range());
    await lieu.fermer();

    // Le cook d'ici a reçu les arguments que la box a remis, tels quels — ceux
    // d'un cook de la box, à la consigne près, qui nomme le ticket.
    const { run, branch, args, limits } = lieu.mission(16);
    const [dIci] = lieu.cooksDuPoste();
    assert.equal(lieu.cooksDuPoste().length, 1);
    assert.deepEqual(dIci?.args, args);
    const deLaBox = cooks();
    assert.deepEqual(deLaBox.map((lance) => /ticket #(\d+)/.exec(lance.args[1] ?? "")?.[1]), ["14"]);
    const sansConsigne = (lus: string[]) => lus.map((arg, i) => (i === 1 ? "" : arg));
    assert.deepEqual(sansConsigne(dIci?.args ?? []), sansConsigne(deLaBox[0]?.args ?? []));
    // Le chemin réel : le répertoire temporaire de macOS passe par un lien (/var → /private/var).
    assert.equal(dIci?.cwd, join(realpathSync(worktrees), "brigade", run));
    // Aucun grant de plus : son environnement est celui du poste, trié comme la
    // box trie celui des siens — ni jeton, ni secret, ni rien que le runner ajoute.
    assert.deepEqual(dIci?.env, environnementDUnCookDeLaBox(lieu.env));
    assert.deepEqual(Object.keys(dIci?.env ?? {}).filter((nom) => /TOKEN|SECRET|GRANT|^BRIGADE_|^GH_|^GITHUB_|^ANTHROPIC_/.test(nom)), []);
    // Lancé sous les plafonds d'un cook de la box, par les mêmes garde-fous.
    assert.deepEqual(limits, { ...PLAFONDS, durationMs: 600_000, idleMs: 600_000 });
    assert.deepEqual(dernier("cook.launched", 16)?.limits, dernier("cook.launched", 14)?.limits);
    assert.deepEqual([dernier("cook.launched", 16)?.station, dernier("cook.launched", 16)?.remote], [MAC, true]);

    // Chaque étape du cook d'ici est au journal de la box comme celles du cook
    // de la box : la prise, le lancement, la fin et ce qu'il a consommé, le
    // compte-rendu, puis la pass jusqu'au service.
    const etapes = (ticket: number): string[] => types(ticket).filter((type) => /^(ticket\.(taken|passing|served)|cook\.(launched|exited|reported)|pass\.|grant\.|merge\.|gates\.|review\.)/.test(type));
    assert.deepEqual(etapes(16), etapes(14));
    assert.ok(["ticket.taken", "cook.launched", "cook.exited", "cook.reported", "pass.judged", "merge.done", "ticket.served"].every((type) => etapes(16).includes(type)), etapes(16).join(" "));
    const fin = (ticket: number) => {
      const sortie = dernier("cook.exited", ticket);
      return [sortie?.outcome, sortie?.turns, sortie?.tokens];
    };
    assert.deepEqual(fin(16), fin(14));
    assert.deepEqual(fin(16), ["ok", 1, 10]);
    const rapport = dernier("cook.reported", 16);
    assert.deepEqual([rapport?.ending, rapport?.branch], ["done", branch]);
    assert.equal(journal.duTicket(16).findLast((e) => e.type === "cook.reported")?.author, `station:${MAC}`);
    assert.match(String(rapport?.pr), /\/pull\/10[12]$/);

    // Les mêmes gates : jouées une fois par livraison, dans le worktree de son jugement.
    assert.deepEqual(gates.appels().map((essai) => essai.slice(essai.lastIndexOf("/") + 1)).sort(), ["jugement-14", "jugement-16"]);
    // Le même reviewer : même binaire, même calibrage, mêmes arguments.
    const lus = relectures();
    assert.equal(lus.length, 2);
    assert.deepEqual(sansConsigne(lus[0]?.args ?? []), sansConsigne(lus[1]?.args ?? []));
    // Et le même verdict, rendu par les mêmes juges.
    const juge = (ticket: number) => {
      const verdict = dernier("pass.judged", ticket) as { verdict: string; gates: { outcome: string }; review: { outcome: string } };
      return [verdict.verdict, verdict.gates.outcome, verdict.review.outcome];
    };
    assert.deepEqual(juge(16), juge(14));
    assert.deepEqual(juge(16), ["green", "green", "green"]);
    assert.deepEqual(gh.merges.map(([pr]) => pr).sort(), [101, 102]);

    // La box n'a rien cuisiné pour lui : sa livraison est la branche que le
    // runner a poussée sur l'origine, et c'est de là qu'elle l'a prise.
    assert.equal(types(16).includes("worktree.removed"), false);
    assert.equal(git(origine, "log", "--format=%s", `${BASE}..${branch}`), "le travail du cook");
    // Le poste est rangé : plus de worktree, plus de branche, et rien de ce qui
    // est au chef dans son clone n'a bougé.
    assert.deepEqual(readdirSync(join(worktrees, "brigade")), []);
    assert.equal(git(dossier, "for-each-ref", "refs/heads", "refs/remotes", "refs/tags"), avant);
    assert.equal(git(dossier, "worktree", "list", "--porcelain").split("\n").filter((ligne) => ligne.startsWith("worktree ")).length, 1);

    // Toutes ses connexions sont sortantes : un `ssh` vers la box, pour le geste
    // `pull`, et rien d'autre — ni transfert de port, ni adresse du poste.
    const appels = lieu.appels();
    assert.ok(appels.length >= 3);
    assert.deepEqual(appels.filter((appel) => !DEMANDE.test(appel)), []);
    // Et chaque demande est au journal de la box, avec sa réponse.
    const echanges = journal.tout().flatMap((e) => (e.type === "remote.asked" || e.type === "remote.answered" ? [`${e.type}:${e.payload.verb}`] : []));
    assert.deepEqual(echanges.slice(0, 2), ["remote.asked:announce", "remote.answered:announce"]);
    assert.ok(echanges.includes("remote.answered:claim") && echanges.includes("remote.answered:deliver"), echanges.join(" "));
  });

  test("app arrêtée, le ticket attend, 86 « station absente », et `status` le dit ; les autres partent sur la box ; relancer l'app le fait partir sans autre geste", async (t) => {
    const lieu = service(t, { presenceMs: 500 });
    const { gh, repertoire, journal, etat, servi, raison, status, cooks } = lieu;
    chef(repertoire, "grant.activated");
    poser(gh, 14, "- requiert : code");
    poser(gh, 16, "- requiert : chrome-connecté");

    // L'app n'a jamais été lancée : la box cuisine ce qu'elle peut, et l'autre attend.
    await jusqua(() => servi(14) && etat(16) === "86");
    assert.equal(raison(16), `station-absent: ${MAC}`);
    assert.equal(journal.duTicket(16).filter((e) => e.type === "ticket.taken" || e.type === "cook.launched").length, 0);
    const dit = status();
    assert.ok(dit.some((ligne) => ligne.includes("#16") && ligne.includes("station absent — `mac/claude` has not shown up lately")), dit.join("\n"));
    assert.ok(dit.some((ligne) => ligne.startsWith("  #16  86") && ligne.includes(`(station-absent: ${MAC})`)), dit.join("\n"));
    assert.deepEqual(lieu.appels(), []);

    // L'app est lancée : il part, sans autre geste.
    lieu.ouvrir();
    await jusqua(() => servi(16));
    assert.equal(journal.duTicket(16).findLast((e) => e.type === "ticket.taken")?.author, `station:${MAC}`);

    // L'app est fermée : plus rien ne part d'elle, et la box la dit absente —
    // sans traitement à part : un ticket pour elle attend, un autre part.
    await lieu.fermer();
    const partis = lieu.appels().length;
    poser(gh, 18, "- requiert : chrome-connecté");
    poser(gh, 19, "- requiert : code");
    await jusqua(() => !lieu.presente() && servi(19) && etat(18) === "86");
    assert.equal(raison(18), `station-absent: ${MAC}`);
    assert.ok(status().some((ligne) => ligne.includes("#18") && ligne.includes("station absent")), status().join("\n"));
    assert.equal(lieu.appels().length, partis);
    assert.deepEqual(cooks().map((lance) => /ticket #(\d+)/.exec(lance.args[1] ?? "")?.[1]), ["14", "19"]);

    // Relancée, elle le fait partir.
    lieu.ouvrir();
    await jusqua(() => servi(18));
    assert.deepEqual(lieu.cooksDuPoste().map((lance) => /ticket #(\d+)/.exec(lance.args[1] ?? "")?.[1]), ["16", "18"]);
  });

  test("le bail d'un cook d'ici ne se renouvelle que sur une preuve de travail : son worktree a bougé — sur la même empreinte, la box refuse, et il livre quand même s'il conclut à temps", async (t) => {
    const lieu = service(t, { claude: "commite-puis-attend" });
    const { gh, journal, etat, dernier } = lieu;
    poser(gh, 16, "- requiert : chrome-connecté");
    lieu.ouvrir();
    await jusqua(() => journal.duTicket(16).some((e) => e.type === "cook.launched"));
    const { run } = lieu.mission(16);

    // Il a commité : l'empreinte de son worktree n'est plus celle du départ, le bail est renouvelé.
    await jusqua(() => journal.duTicket(16).some((e) => e.type === "ticket.renewed"));
    // Puis il ne touche plus à rien : la même empreinte n'est la preuve de rien.
    await jusqua(() => lieu.renouvellements(run).some((reponse) => !reponse.ok && reponse.refusal === "no-progress"));
    // Un renouvellement par empreinte nouvelle, et pas un de plus. Il y en a une
    // ou deux : un pas du runner peut tomber entre le fichier écrit et son commit.
    const preuves = new Set(lieu.appels().flatMap((appel) => (appel.includes(` renew ${run} `) ? (/--proof (\S+)/.exec(appel)?.slice(1) ?? []) : [])));
    assert.ok(preuves.size >= 1);
    assert.equal(journal.duTicket(16).filter((e) => e.type === "ticket.renewed").length, preuves.size);
    // Ce qu'il consomme arrive à la box à chaque demande : le relevé du tick est celui de tout cook.
    await jusqua(() => journal.duTicket(16).some((e) => e.type === "cook.progressed" && e.payload.turns === 1 && e.payload.tokens === 10));

    writeFileSync(lieu.feu, "");
    await jusqua(() => journal.duTicket(16).some((e) => e.type === "cook.reported"));
    assert.deepEqual([dernier("cook.exited", 16)?.outcome, dernier("cook.reported", 16)?.ending], ["ok", "done"]);
    assert.equal(etat(16), "pass");
  });

  test("un cook d'ici qui ne produit rien perd son bail : aucun renouvellement n'est accordé, la box l'arrête comme un des siens, et le runner tue le sien — rien n'est livré", async (t) => {
    // Un échec ouvre le disjoncteur : le ticket n'est pas repris pendant que le test regarde.
    const lieu = service(t, { claude: "muet", bailMs: 1500, seuilDisjoncteur: 1 });
    const { gh, origine, journal, worktrees, dernier } = lieu;
    poser(gh, 16, "- requiert : chrome-connecté");
    lieu.ouvrir();
    await jusqua(() => journal.duTicket(16).some((e) => e.type === "guard.tripped"));
    const { run, branch } = lieu.mission(16);
    assert.equal(lieu.missions(16).length, 1);

    assert.deepEqual([dernier("guard.tripped", 16)?.run, dernier("guard.tripped", 16)?.reason], [run, "lease"]);
    await jusqua(() => journal.duTicket(16).some((e) => e.type === "cook.exited"));
    assert.equal(dernier("cook.exited", 16)?.outcome, "guard");
    // Rien ne l'a renouvelé : un worktree intact n'est pas présenté comme une preuve.
    assert.equal(journal.duTicket(16).filter((e) => e.type === "ticket.renewed").length, 0);
    assert.deepEqual(lieu.renouvellements(run).filter((reponse) => reponse.ok), []);
    assert.deepEqual(lieu.appels().filter((appel) => appel.includes(` renew ${run} `) && appel.includes("--proof")), []);
    // Le cook du poste est tué, son worktree rangé.
    await jusqua(() => lieu.pidsDuPoste().length >= 1);
    const [pid] = lieu.pidsDuPoste();
    await jusqua(() => !vivant(pid));
    await jusqua(() => existsSync(join(worktrees, "brigade")) && !readdirSync(join(worktrees, "brigade")).includes(run));
    // Et rien n'est livré : aucune demande de livraison, aucune branche sur l'origine.
    assert.deepEqual(lieu.appels().filter((appel) => appel.includes(` rendre ${run} `)), []);
    assert.equal(git(origine, "for-each-ref", `refs/heads/${branch}`), "");
  });

  test("une livraison que la pass renvoie est reprise par le runner sur la même branche, telle que l'origine la porte — et ce que son cook y laisse non commité part avec elle, commité à sa place", async (t) => {
    // Le reviewer refuse la première livraison, et laisse passer la seconde.
    const lieu = service(t, { suiteDuPoste: ["livre", "ecrit-sans-commiter"], reviewer: { suite: ["relit-rouge", "relit-vert"] } });
    const { gh, repertoire, origine, journal, dossier, worktrees, servi } = lieu;
    chef(repertoire, "grant.activated");
    poser(gh, 16, "- requiert : chrome-connecté");
    lieu.ouvrir();
    await jusqua(() => servi(16) && lieu.range());
    await lieu.fermer();

    const lances = journal.duTicket(16).flatMap((e) => (e.type === "cook.launched" ? [e.payload] : []));
    assert.deepEqual(lances.map((lance) => [lance.station, lance.remote]), [[MAC, true], [MAC, true]]);
    assert.equal(lances[0]?.branch, lances[1]?.branch);
    const reprise = lieu.mission(16);
    assert.deepEqual([reprise.branch, reprise.resumes?.returns], [lances[0]?.branch, 1]);
    assert.notEqual(reprise.run, lances[0]?.run);
    assert.equal(journal.duTicket(16).filter((e) => e.type === "pass.returned").length, 1);
    // Le second cook est parti de la livraison refusée, et l'origine porte les deux.
    assert.deepEqual(git(origine, "log", "--format=%s", `${BASE}..${reprise.branch}`).split("\n"), ["brigade : récolte — ce que le cook avait laissé non commité dans son worktree", "le travail du cook"]);
    assert.equal(git(origine, "show", `${reprise.branch}:brouillon.txt`), "le travail du cook, jamais commité");
    // Tout est sur l'origine : le poste ne garde ni worktree ni branche.
    assert.deepEqual(readdirSync(join(worktrees, "brigade")), []);
    assert.equal(git(dossier, "for-each-ref", "refs/heads/cook", "refs/brigade/origine/cook"), "");
  });

  test("un cook d'ici qui conclut sans commit : intact, ce qu'il a délimité est son livrable ; des fichiers écrits et jamais commités, il n'a rien livré — et ils restent sur sa branche, dans le clone du poste", async (t) => {
    const lieu = service(t, { suiteDuPoste: ["rapporte-sans-commit", "ecrit-sans-commiter"], seuilDisjoncteur: 1 });
    const { gh, origine, journal, dossier, etat } = lieu;
    poser(gh, 16, "- requiert : chrome-connecté");
    lieu.ouvrir();
    const rapports = (ticket: number) => journal.duTicket(ticket).flatMap((e) => (e.type === "cook.reported" ? [e.payload] : []));
    await jusqua(() => rapports(16).length === 1);
    assert.deepEqual([rapports(16)[0]?.ending, rapports(16)[0]?.reason], ["done", "no-diff"]);
    assert.equal(etat(16), "pass");

    poser(gh, 17, "- requiert : chrome-connecté");
    await jusqua(() => rapports(17).length === 1);
    assert.deepEqual([rapports(17)[0]?.ending, rapports(17)[0]?.reason], ["failed", "no-commit"]);
    const { branch } = lieu.mission(17);
    await jusqua(() => lieu.dits.some((dit) => dit.dit.includes(`branch \`${branch}\` of ticket #17 stays in`)));
    await lieu.fermer();
    // Rien n'est parti sur l'origine, et rien n'est perdu.
    assert.equal(git(origine, "for-each-ref", "refs/heads/cook"), "");
    assert.equal(git(dossier, "show", `${branch}:brouillon.txt`), "le travail du cook, jamais commité");
    assert.equal(git(dossier, "worktree", "list", "--porcelain").split("\n").filter((ligne) => ligne.startsWith("worktree ")).length, 1);
  });

  test("une box que le poste ne joint plus : le runner n'y laisse pas un cook tourner sans garde — passé son bail sans renouvellement, il l'arrête de lui-même", async (t) => {
    const lieu = service(t, { claude: "muet", bailMs: 1500, seuilDisjoncteur: 1 });
    const { gh, journal } = lieu;
    poser(gh, 16, "- requiert : chrome-connecté");
    lieu.ouvrir();
    await jusqua(() => lieu.pidsDuPoste().length === 1);
    lieu.couper();
    const [pid] = lieu.pidsDuPoste();
    await jusqua(() => !vivant(pid));
    await jusqua(() => lieu.dits.some((etat) => etat.dit.includes("stopped (lease)")));
    // La box, elle, a fait tomber le bail de son côté, sans rien attendre du poste.
    await jusqua(() => journal.duTicket(16).some((e) => e.type === "guard.tripped" && e.payload.reason === "lease"));
  });
});

describe("le runner du poste, pièce par pièce", () => {
  test("le flux d'un cook se lit comme la box lit celui des siens : ce qu'il a consommé, son dernier message, et s'il a conclu", async (t) => {
    // Le compte des tours et des jetons, contre le superviseur de la box, sur les mêmes flux.
    for (const scenario of ["livre", "morcele", "cache", "plaintif", "fini-sans-commit", "quota", "refuse", "non-connecte"]) {
      const repertoire = repertoireTemporaire(t);
      const env = { ...ENV_GIT, FAUX_CLAUDE: scenario };
      const flux = join(repertoire, "flux.jsonl");
      const fin = await superviser({ commande: FAUX_CLAUDE, args: [], cwd: repertoire, env, plafonds: PLAFONDS, graceMs: 2000, flux }).fin;
      const contenu = readFileSync(flux, "utf8");
      const lecture = ouvrirLecture();
      for (const ligne of contenu.split("\n")) lecture.recevoir(ligne);
      assert.deepEqual(lecture.mesure(), { turns: fin.turns, tokens: fin.tokens }, scenario);
      const deLaBox = lireFlux(contenu);
      assert.equal(lecture.message(), deLaBox.message, scenario);
      // « Conclu » ici, c'est « done » là-bas — pour le même code de sortie.
      assert.equal(lecture.echec(fin.code) === null, verdict(deLaBox, fin.code) === "done", scenario);
    }
    // Et ce qui n'a pas conclu dit pourquoi, sur les flux que la box garde en exemple.
    const raison = (nom: string, code: number | null) => {
      const lecture = ouvrirLecture();
      for (const ligne of readFileSync(join(FLUX, `${nom}.jsonl`), "utf8").split("\n")) lecture.recevoir(ligne);
      return lecture.echec(code);
    };
    assert.deepEqual([raison("fini", 0), raison("fini", 1), raison("non-connecte", 1), raison("quota-epuise", 1), raison("refuse", 0)], [null, "exit code 1", "disconnected", "quota", "refused"]);
    const vide = ouvrirLecture();
    assert.deepEqual([vide.echec(0), vide.echec(null, "SIGKILL"), vide.message(), vide.mesure()], ["finished without concluding", "killed by SIGKILL", null, { turns: 0, tokens: 0 }]);
  });

  test("l'environnement d'un cook d'ici est trié comme celui d'un cook de la box : rien de brigade, rien qui détourne `claude` de sa connexion, rien d'ajouté", () => {
    const poste = { PATH: "/usr/bin", HOME: "/Users/chef", GH_TOKEN: "le-sien", BRIGADE_APP_CONFIG: "/x", BRIGADE_CLAUDE_BIN: "/y", ANTHROPIC_API_KEY: "sk", ANTHROPIC_AUTH_TOKEN: "t", CLAUDE_CODE_OAUTH_TOKEN: "o" };
    assert.deepEqual(environnementCook(poste), environnementDUnCookDeLaBox(poste));
    assert.deepEqual(environnementCook(poste), { PATH: "/usr/bin", HOME: "/Users/chef", GH_TOKEN: "le-sien", CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1" });
  });

  test("ce qui part vers la box est le geste `pull`, mot pour mot — et ce que le shell de la box redécoupe lui revient entier", async (t) => {
    assert.equal(commandeTirer(MAC, ["claim"]), "pull mac/claude claim");
    assert.equal(commandeTirer(MAC, ["renew", "16-ab12", "--proof", "e1", "--turns", "3", "--tokens", "40"]), "pull mac/claude renew 16-ab12 --proof e1 --turns 3 --tokens 40");
    assert.equal(commandeTirer("poste-é/claude", ["return", "r", "--reason", "push-failed: c'est `non` ; $(rm)"]), `pull 'poste-é/claude' return r --reason 'push-failed: c'\\''est \`non\` ; $(rm)'`);

    // Un `ssh` qui rend ce que le shell de la box aurait donné au geste, et son entrée.
    const racine = repertoireTemporaire(t);
    const ssh = join(racine, "ssh");
    writeFileSync(ssh, `#!/bin/sh\nfor ligne; do :; done\neval "set -- $ligne"\nprintf '%s\\n' "$@" >'${racine}/mots'\ncat >'${racine}/entree'\necho '{"ok":true,"verb":"deliver","ending":"done","reason":null}'\n`);
    chmodSync(ssh, 0o755);
    const reglages = { ssh, git: "git", claude: "claude", delaiMs: 60_000, connexionS: 10, gitMs: 60_000 };
    const servi = { nom: "brigade", box: { hote: "box" } };
    const rendue = await tirer(reglages, servi, MAC, ["return", "16-ab12", "--end", "echec", "--reason", "push-failed: c'est `non` ; $(rm)", "--turns", "3", "--tokens", "40"], "son compte-rendu\n<livrable>fait</livrable>");
    assert.deepEqual(rendue, { reponse: { ok: true, verb: "deliver", ending: "done", reason: null } });
    assert.deepEqual(readFileSync(join(racine, "mots"), "utf8").split("\n").slice(0, -1), ["brigade", "brigade", "pull", MAC, "return", "16-ab12", "--end", "echec", "--reason", "push-failed: c'est `non` ; $(rm)", "--turns", "3", "--tokens", "40"]);
    assert.equal(readFileSync(join(racine, "entree"), "utf8"), "son compte-rendu\n<livrable>fait</livrable>");
  });

  test("une demande a sa réponse, servie ou refusée — ou rien n'est à supposer : box pas jointe, runtime à l'arrêt, sortie qui n'est pas celle du geste", async (t) => {
    const racine = repertoireTemporaire(t);
    const reglages = (corps: string) => {
      const ssh = join(racine, `ssh-${readdirSync(racine).length}`);
      writeFileSync(ssh, `#!/bin/sh\n${corps}\n`);
      chmodSync(ssh, 0o755);
      return { ssh, git: "git", claude: "claude", delaiMs: 60_000, connexionS: 10, gitMs: 60_000 };
    };
    const servi = { nom: "brigade", box: { hote: "box" } };
    const demander = (corps: string) => tirer(reglages(corps), servi, MAC, ["claim"]);

    assert.deepEqual(await demander(`echo '{"ok":true,"verb":"claim","mission":null,"held":"stopped"}'`), { reponse: { ok: true, verb: "claim", mission: null, held: "stopped" } });
    // Refusée : le geste sort en 1, et sa réponse dit pourquoi — et si le cook est à arrêter.
    const refus = { ok: false, verb: "renew", refusal: "stopped", said: "arrête le tien", stop: "lease" };
    assert.deepEqual(await demander(`echo '${JSON.stringify(refus)}'; echo 'brigade : arrête le tien' >&2; exit 1`), { reponse: refus });
    for (const [quoi, corps, attendu] of [
      ["box pas jointe", "echo 'ssh: connect to host box port 22: Connection refused' >&2; exit 255", /Connection refused[\s\S]*exit code 255/],
      ["aucun runtime ne tourne", "echo 'brigade : aucun runtime ne tourne pour ce projet' >&2; exit 3", /aucun runtime ne tourne[\s\S]*exit code 3/],
      ["une box d'avant `pull`", "echo 'brigade : « pull » n'\\''est pas une commande du runtime' >&2; exit 66", /exit code 66/],
      ["une sortie qui n'est pas la réponse", "echo 'bienvenue sur la box'", /unreadable answer/],
      ["un code 1 sans réponse", "echo 'node: bad option' >&2; exit 1", /exit code 1/],
    ] as const) {
      const rendue = await demander(corps);
      assert.ok("muette" in rendue && attendu.test(rendue.muette), `${quoi} : ${JSON.stringify(rendue)}`);
    }
    // Abandonnée avant de partir : aucun `ssh` n'est lancé.
    const parti = join(racine, "parti");
    const abandon = new AbortController();
    abandon.abort();
    assert.ok("muette" in (await tirer(reglages(`touch '${parti}'`), servi, MAC, ["claim"], null, abandon.signal)));
    assert.equal(existsSync(parti), false);
  });

  test("une mission ne se lance que si elle est entière, et que rien d'elle ne sort du worktree et de la branche d'un cook", () => {
    const entiere = { ticket: 16, title: "T", run: "16-ab12cd34", branch: "cook/16-ab12cd34", base: "v2", repository: "o/r", model: "sonnet", effort: "low", prompt: "p", args: ["-p", "p"], limits: PLAFONDS, leaseMs: 600_000, leaseUntil: "2026-10-08T10:10:00.000Z", resumes: null };
    assert.equal(missionLue(entiere), entiere);
    assert.notEqual(missionLue({ ...entiere, resumes: { returns: 1, pr: null } }), null);
    for (const abimee of [null, "mission", { ...entiere, run: "../ailleurs" }, { ...entiere, run: "" }, { ...entiere, branch: "--upload-pack=x" }, { ...entiere, branch: "cook/../../main" }, { ...entiere, base: "v2 ; rm" }, { ...entiere, args: [] }, { ...entiere, args: ["-p", 3] }, { ...entiere, limits: null }, { ...entiere, leaseMs: 0 }, { ...entiere, ticket: "16" }]) {
      assert.equal(missionLue(abimee), null, JSON.stringify(abimee));
    }
  });

  test("le runner n'écoute rien : il n'importe aucun module qui ouvre un serveur, et ne lance que `ssh`, `git` et `claude`", () => {
    const source = readFileSync(join(import.meta.dirname, "../src/runner.ts"), "utf8");
    const importes = [...source.matchAll(/^import .* from "([^"]+)";$/gm)].map(([, module]) => module);
    assert.deepEqual(importes, ["node:child_process", "node:crypto", "node:fs", "node:path", "node:readline", "node:timers/promises", "./box.ts", "./config.ts"]);
    assert.equal(/createServer|\.listen\(|node:(net|http|https|http2|tls|dgram)/.test(source), false);
    // Ce que ses deux modules de l'app importent à leur tour n'en ouvre pas davantage.
    for (const module of ["box.ts", "config.ts"]) {
      assert.equal(/createServer|\.listen\(|node:(net|http|https|http2|tls|dgram)/.test(readFileSync(join(import.meta.dirname, "../src", module), "utf8")), false, module);
    }
    // Trois programmes, chacun par le réglage qui le nomme : rien d'autre n'est lancé d'ici.
    const lances = [...source.matchAll(/\b(?:execFile|spawn)\(([^,]+),/g)].map(([, programme]) => programme);
    assert.deepEqual(lances.sort(), ["options.claude", "options.git", "reglages.ssh"]);
    // Et rien de ce poste ne part vers la box : il ne lit ni son nom ni ses adresses — les
    // arguments de chaque `ssh` sont comparés un à un dans le test de bout en bout.
    assert.equal(/hostname|networkInterfaces|node:os/.test(source), false);
  });

  test("un fichier des projets dit les stations que le poste joue : auprès d'une box, sous le nom que la box déclare, et sur le seul moteur `claude`", (t) => {
    const racine = repertoireTemporaire(t);
    const lire = (projet: object) => {
      const chemin = join(racine, "app.json");
      writeFileSync(chemin, JSON.stringify({ projets: [{ nom: "brigade", dossier: racine, ...projet }] }));
      return lireConfiguration(chemin, racine);
    };
    assert.deepEqual(lire({ hote: "box", stations: [MAC] }).projets, [{ nom: "brigade", dossier: racine, box: { hote: "box" }, stations: [MAC] }]);
    // Sans station, un projet se lit comme avant.
    assert.deepEqual(lire({ hote: "box" }).projets, [{ nom: "brigade", dossier: racine, box: { hote: "box" } }]);
    assert.deepEqual(lire({ hote: "box", stations: [] }).projets, [{ nom: "brigade", dossier: racine, box: { hote: "box" } }]);
    assert.match(lire({ stations: [MAC] }).refus ?? "", /“stations” without “hote”/);
    assert.match(lire({ hote: "box", stations: MAC }).refus ?? "", /“stations” must be a list/);
    assert.match(lire({ hote: "box", stations: ["Mac/Claude"] }).refus ?? "", /is not in the form `<machine>\/<engine>`/);
    assert.match(lire({ hote: "box", stations: ["mac/codex"] }).refus ?? "", /it only runs `claude`/);
    assert.match(lire({ hote: "box", stations: [MAC, MAC] }).refus ?? "", /is written twice/);
  });

  test("le runner ne joue que ce qui se joue : un projet sans box, sans station, désinstallé ou qui ne s'ouvre pas ne lance rien — et une station retirée du fichier est quittée", async (t) => {
    const racine = repertoireTemporaire(t);
    const appels = join(racine, "appels");
    const ssh = join(racine, "ssh");
    writeFileSync(ssh, `#!/bin/sh\nprintf '%s\\n' "$*" >>'${appels}'\necho '{"ok":false,"verb":"announce","refusal":"unknown-station","said":"le projet ne déclare aucune station"}'\nexit 1\n`);
    chmodSync(ssh, 0o755);
    const dits: EtatDeStation[] = [];
    const runner = ouvrirRunner({ ssh, git: "git", claude: FAUX_CLAUDE, worktrees: join(racine, "worktrees"), env: ENV_GIT, delaiMs: 60_000, connexionS: 10, gitMs: 60_000, pasMs: 3_600_000, surEtat: (etat) => void dits.push(etat) });
    aArreter(t, () => runner.fermer());
    const box = { hote: "box" };
    runner.servir([
      { nom: "sans-box", dossier: racine },
      { nom: "sans-station", dossier: racine, box },
      { nom: "ferme", dossier: "/nulle/part", box, stations: [MAC], refus: "dossier introuvable : /nulle/part" },
      { nom: "parti", dossier: racine, box, stations: [MAC], desinstalle: { hote: "box", a: "2026-10-08T10:00:00.000Z", titre: "", lignes: [] } },
      { nom: "servi", dossier: racine, box, stations: [MAC] },
    ]);
    assert.deepEqual(runner.etats().map(({ projet, station }) => [projet, station]), [["servi", MAC]]);
    // Refusée par la box — elle ne la déclare pas `distante` : c'est dit, et rien n'est réclamé.
    await new Promise<void>((resoudre) => {
      const voir = setInterval(() => dits.some((etat) => etat.dit.startsWith("refused by the main station")) && (clearInterval(voir), resoudre()), 5);
    });
    assert.deepEqual(readFileSync(appels, "utf8").split("\n").filter(Boolean), [`-o BatchMode=yes -o ConnectTimeout=10 -- box brigade servi pull ${MAC} announce`]);
    runner.servir([{ nom: "servi", dossier: racine, box }]);
    assert.deepEqual(runner.etats(), []);
  });
});

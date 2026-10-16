// L'échéance de la session Max, annoncée avant qu'elle tombe. Le runtime relit
// le fichier d'état que le renouvellement (`deploy/brigade-renouvellement`)
// tient à jour — jamais les identifiants —, l'écrit au journal quand il
// change, et la file du chef en tire une ligne : l'échéance estimée approche,
// ou le renouvellement a échoué. Elle en sort au renouvellement réussi
// suivant, ou à la reconnexion du chef. Une session déjà tombée reste dite
// comme avant : depuis quand, et le geste.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { test, type TestContext } from "node:test";
import { configCloison, envelopper } from "../src/cloison.ts";
import { decrireEtat, lireEtat } from "../src/etat.ts";
import type { Fait } from "../src/evenements.ts";
import type { ObservationDeSession } from "../src/evenements/renouvellement.ts";
import { etatDesGardeFous } from "../src/projections/garde-fous.ts";
import { principal as gardeFous } from "../src/garde-fous-cli.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { alerteDeSession } from "../src/projections/renouvellement.ts";
import { stationsDeconnectees } from "../src/projections/stations.ts";
import { brancherJeton } from "../src/jeton-claude.ts";
import { brancherSession, configSession, lireSession } from "../src/renouvellement.ts";
import { ConfigInvalide, demarrer, type CauseReveil } from "../src/runtime.ts";
import { appeler, FAUX_BWRAP, JOUR_HORLOGE, repertoireTemporaire } from "./outils.ts";

const STATION = "box/claude";
const GESTE_TOMBEE = "`claude /login` sous le compte du service — la cuisine reprend seule dans la minute, sans « resume »";
const ETAT = "/var/lib/brigade/.session/renouvellement";
const GESTE = "`claude /login` sous le compte du service, puis `brigade <projet> guardrails resume`";
const RIEN = ["attend     rien n'attend le chef"];
const a = (heure: string) => `${JOUR_HORLOGE}T${heure}.000Z`;

// Ce que le runtime écrit du fichier d'état : par défaut, un renouvellement
// lu, qui ne tourne plus — le préavis se compte sans lui.
const observation = (lue: Partial<ObservationDeSession> = {}): ObservationDeSession => ({
  state: ETAT,
  file: "read",
  renewed: null,
  written: null,
  failure: null,
  live: false,
  lifetimeS: 8 * 3600,
  warningS: 3 * 3600,
  ...lue,
});

// Une cuisine dont le test tient l'horloge, et le bloc `attend` de `status`
// tel que le chef le lit à une heure donnée.
function cuisine(t: TestContext) {
  let instant = a("08:00:00");
  const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: () => new Date(instant) });
  t.after(() => journal.fermer());
  const noter = (fait: Fait, author = "runtime") => journal.ajouter({ project: "brigade", ticket: null, author, ...fait });
  const aLHeure = (heure: string) => void (instant = a(heure));
  const observer = (heure: string, lue: Partial<ObservationDeSession>) => {
    aLHeure(heure);
    noter({ type: "session.observed", payload: observation(lue) });
  };
  const bloc = (heure: string) => {
    const lignes = decrireEtat(lireEtat(journal, new Date(a(heure))), new Date(a(heure)));
    return lignes.slice(lignes.findIndex((ligne) => ligne.startsWith("attend")), lignes.indexOf("fin attend"));
  };
  return { journal, noter, aLHeure, observer, bloc };
}

test("sans renouvellement qui tourne : rien sous le seuil, l'échéance annoncée au-delà avec son heure et le geste, et la ligne sort au renouvellement suivant", (t) => {
  const { observer, bloc } = cuisine(t);
  observer("08:00:00", { renewed: a("08:00:00"), written: a("08:00:00") });

  // Échéance estimée : 16 h ; le préavis de trois heures s'ouvre à 13 h.
  assert.deepEqual(bloc("12:59:59"), RIEN);
  const annonce = `session Max près de son échéance — échéance estimée le ${a("16:00:00")}, 8 h après le dernier renouvellement réussi (${a("08:00:00")}) — à faire avant : ${GESTE}`;
  assert.deepEqual(bloc("13:00:00"), ["attend     1 décision attend le chef depuis 0 s", `  session  depuis 0 s  ${annonce}`]);
  assert.deepEqual(bloc("15:30:00"), ["attend     1 décision attend le chef depuis 2 h 30", `  session  depuis 2 h 30  ${annonce}`]);

  // Le renouvellement a réussi : l'échéance repart de lui, la ligne sort.
  observer("15:55:00", { renewed: a("15:55:00"), written: a("15:55:00") });
  assert.deepEqual(bloc("15:56:00"), RIEN);
});

test("un renouvellement en échec s'annonce aussitôt, avant le seuil, avec sa nature et ce qu'il en dit — et sort au passage réussi suivant", (t) => {
  const { noter, observer, bloc } = cuisine(t);
  observer("09:00:00", { renewed: a("09:00:00"), written: a("09:00:00"), live: true });
  noter({ type: "runtime.ticked", payload: { intervalMs: 60_000 } });
  assert.deepEqual(bloc("10:04:00"), RIEN);

  const detail = "`claude` a réécrit ses identifiants et dit la session fermée : Anthropic a refusé le renouvellement — `claude /login` sous le compte du service";
  observer("10:05:00", { renewed: a("09:00:00"), written: a("09:00:00"), live: true, failure: { at: a("10:05:00"), nature: "session-refusee", detail } });
  assert.deepEqual(bloc("10:06:00"), [
    "attend     1 décision attend le chef depuis 1 min",
    `  session  depuis 1 min  renouvellement de la session Max en échec (session-refusee : ${detail}) — échéance estimée le ${a("17:00:00")}, 8 h après le dernier renouvellement réussi (${a("09:00:00")}) — à rétablir : ${GESTE}`,
  ]);

  // Un échec sans détail ni connexion connue se dit quand même.
  observer("10:07:00", { live: true, failure: { at: a("10:07:00"), nature: "identifiants-absents", detail: null } });
  assert.match(bloc("10:08:00")[1] ?? "", /^ {2}session {2}depuis 1 min {2}renouvellement de la session Max en échec \(identifiants-absents\) — échéance inconnue — à rétablir : /);

  // Le chef s'est reconnecté, le passage suivant a réussi : l'échec est derrière.
  observer("10:09:00", { renewed: a("09:00:00"), written: a("10:09:00"), live: true });
  noter({ type: "runtime.ticked", payload: { intervalMs: 60_000 } });
  assert.deepEqual(bloc("10:10:00"), RIEN);
});

test("un renouvellement qui tourne et réussit n'éteint pas l'annonce : elle vient au seuil comme sans lui, et sort quand il fait repartir l'échéance", (t) => {
  const { noter, aLHeure, observer, bloc } = cuisine(t);
  observer("08:00:00", { renewed: a("08:00:00"), written: a("08:00:00"), live: true });
  aLHeure("12:59:00");
  noter({ type: "runtime.ticked", payload: { intervalMs: 60_000 } });
  assert.deepEqual(bloc("12:59:59"), RIEN);

  // Il tourne, le runtime qui l'a lu bat : passé le seuil, l'échéance s'annonce quand même — il peut échouer.
  aLHeure("14:00:00");
  noter({ type: "runtime.ticked", payload: { intervalMs: 60_000 } });
  const annonce = `session Max près de son échéance — échéance estimée le ${a("16:00:00")}, 8 h après le dernier renouvellement réussi (${a("08:00:00")}) — à faire avant : ${GESTE}`;
  assert.deepEqual(bloc("14:01:00"), ["attend     1 décision attend le chef depuis 1 h 01", `  session  depuis 1 h 01  ${annonce}`]);

  // Il a renouvelé : l'échéance repart de lui, la ligne sort d'elle-même.
  observer("15:56:00", { renewed: a("15:56:00"), written: a("15:56:00"), live: true });
  noter({ type: "runtime.ticked", payload: { intervalMs: 60_000 } });
  assert.deepEqual(bloc("15:57:00"), RIEN);
});

test("une session déjà tombée se dit comme avant — depuis quand, et le geste — sans annonce d'échéance ; la reprise date la reconnexion, d'où se compte la suivante", (t) => {
  const { journal, noter, aLHeure, observer, bloc } = cuisine(t);
  noter({ type: "station.announced", payload: { station: STATION, engine: "claude", provides: ["opus"], maxCooks: 2 } });
  observer("08:00:00", { file: "absent" });
  aLHeure("08:05:00");
  noter({ type: "station.disconnected", payload: { station: STATION, reason: "authentication_failed", run: null } }, `station:${STATION}`);

  assert.deepEqual(bloc("08:25:00"), ["attend     1 décision attend le chef depuis 20 min", `  ${STATION}  depuis 20 min  connexion Max expirée (authentication_failed) — à rétablir : ${GESTE_TOMBEE}`]);
  const station = decrireEtat(lireEtat(journal, new Date(a("08:25:00"))), new Date(a("08:25:00"))).filter((ligne) => ligne.startsWith("connexion"));
  assert.deepEqual(station, [`connexion  Max EXPIRÉE depuis 20 min sur ${STATION} (authentication_failed) — plus aucun ticket n'est pris : ${GESTE_TOMBEE}`]);

  aLHeure("08:30:00");
  noter({ type: "kitchen.resumed", payload: {} }, "chef");
  assert.deepEqual(bloc("13:29:59"), RIEN);
  assert.deepEqual(bloc("13:30:00"), [
    "attend     1 décision attend le chef depuis 0 s",
    `  session  depuis 0 s  session Max près de son échéance — échéance estimée le ${a("16:30:00")}, 8 h après la dernière reconnexion (${a("08:30:00")}) — à faire avant : ${GESTE}`,
  ]);
});

test("sans rien qui dise quand la session a été ouverte, rien n'est annoncé", (t) => {
  const { observer, bloc } = cuisine(t);
  assert.deepEqual(bloc("23:00:00"), RIEN);
  observer("08:00:00", { file: "absent" });
  assert.deepEqual(bloc("23:00:00"), RIEN);
  observer("08:01:00", { file: "unreadable" });
  assert.deepEqual(bloc("23:00:00"), RIEN);
});

test("« resume » après l'annonce date la reconnexion : la ligne sort, et un « resume » sans annonce n'écrit toujours rien", async (t) => {
  const repertoire = repertoireTemporaire(t);
  const journal = ouvrirJournal(repertoire);
  t.after(() => journal.fermer());
  const noter = (fait: Fait) => journal.ajouter({ project: "brigade", ticket: null, author: "runtime", ...fait });
  const reprendre = async () => {
    const cli = appeler(gardeFous, ["resume"], { BRIGADE_STATE_DIR: repertoire });
    return { code: await cli.fin, sortie: cli.sortie() };
  };
  noter({ type: "runtime.started", payload: { pid: 1, host: "box", node: "v26" } });
  assert.match((await reprendre()).sortie, /rien à reprendre/);

  const ilYA = (heures: number) => new Date(Date.now() - heures * 3_600_000).toISOString();
  noter({ type: "session.observed", payload: observation({ renewed: ilYA(6), written: ilYA(6) }) });
  assert.notEqual(alerteDeSession(journal.base, new Date()), null);

  const { code, sortie } = await reprendre();
  assert.equal(code, 0);
  assert.match(sortie, /session Max tenue pour renouvelée/);
  assert.deepEqual(journal.tout().filter((e) => e.type === "session.reconnected").length, 1);
  assert.equal(alerteDeSession(journal.base, new Date()), null);
  assert.match((await reprendre()).sortie, /rien à reprendre/);
});

// --- Le fichier d'état, lu sans les identifiants -------------------------------

const CONFIG = (etat: string) => ({ etat, vieS: 8 * 3600, preavisS: 3 * 3600 });

test("le fichier d'état se lit clé par clé : un échec derrière un passage réussi n'en est plus un, un échec qui continue garde sa première date", (t) => {
  const etat = join(repertoireTemporaire(t), "renouvellement");
  const lire = (texte: string, heure: string, precedente: ObservationDeSession | null = null) => {
    writeFileSync(etat, texte);
    return lireSession(CONFIG(etat), new Date(a(heure)), precedente);
  };

  const reussi = lire(`ecrits=${JOUR_HORLOGE}T08:00:00Z\nrenouvele=${JOUR_HORLOGE}T08:00:00Z\nverifie=${JOUR_HORLOGE}T10:00:00Z\ninconnue=bruit\n`, "10:01:00");
  assert.deepEqual(reussi, observation({ state: etat, renewed: a("08:00:00"), written: a("08:00:00"), live: true }));
  // Dix minutes sans passage : il ne tourne plus.
  assert.equal(lire(`verifie=${JOUR_HORLOGE}T10:00:00Z\n`, "10:10:01").live, false);

  const derriere = `ecrits=${JOUR_HORLOGE}T08:00:00Z\nverifie=${JOUR_HORLOGE}T10:00:00Z\nechec=${JOUR_HORLOGE}T09:00:00Z\nechec_nature=claude-muet\n`;
  assert.equal(lire(derriere, "10:01:00").failure, null);

  const premier = lire(`verifie=${JOUR_HORLOGE}T10:00:00Z\nechec=${JOUR_HORLOGE}T10:01:00Z\nechec_nature=claude-en-echec\nechec_detail=\`claude mcp list\` a rendu 1 : réseau\n`, "10:01:30");
  assert.deepEqual(premier.failure, { at: a("10:01:00"), nature: "claude-en-echec", detail: "`claude mcp list` a rendu 1 : réseau" });
  const suite = lire(`verifie=${JOUR_HORLOGE}T10:00:00Z\nechec=${JOUR_HORLOGE}T10:02:00Z\nechec_nature=claude-en-echec\nechec_detail=autre chose\n`, "10:02:30", premier);
  assert.deepEqual(suite.failure, premier.failure);
  const autre = lire(`verifie=${JOUR_HORLOGE}T10:00:00Z\nechec=${JOUR_HORLOGE}T10:03:00Z\nechec_nature=session-refusee\n`, "10:03:30", suite);
  assert.deepEqual(autre.failure, { at: a("10:03:00"), nature: "session-refusee", detail: null });

  assert.equal(lireSession(CONFIG(join(dirname(etat), "absent")), new Date()).file, "absent");
  // Un répertoire à la place du fichier : illisible, et rien n'en est tiré.
  const repertoire = repertoireTemporaire(t);
  assert.deepEqual(lireSession(CONFIG(repertoire), new Date(a("10:00:00"))), observation({ state: repertoire, file: "unreadable" }));
});

test("le fichier que le vrai `brigade-renouvellement` écrit se lit : son échec, puis son renouvellement — sans que le runtime ouvre les identifiants", (t) => {
  const racine = repertoireTemporaire(t);
  const [home, bin, session] = ["home", "bin", "session"].map((nom) => join(racine, nom)) as [string, string, string];
  for (const repertoire of [join(home, ".claude"), bin, session]) mkdirSync(repertoire, { recursive: true });
  const identifiants = join(home, ".claude/.credentials.json");
  writeFileSync(identifiants, "jeton-qui-ne-doit-jamais-sortir");
  chmodSync(identifiants, 0o000);
  const etat = join(session, "renouvellement");
  // `claude` factice : `mcp list` échoue tant que le témoin n'est pas posé, puis réécrit les identifiants.
  const temoin = join(racine, "reussir");
  writeFileSync(
    join(bin, "claude"),
    `#!/bin/sh\nC="$HOME/.claude/.credentials.json"\ncase "$1 $2" in\n  "mcp list") [ -e "${temoin}" ] || { echo "réseau coupé" >&2; exit 1; }; rm -f "$C"; printf neuf > "$C"; chmod 000 "$C" ;;\n  "auth status") echo '{ "loggedIn": true }' ;;\nesac\n`,
  );
  chmodSync(join(bin, "claude"), 0o755);
  const passer = () => spawnSync(join(import.meta.dirname, "../deploy/brigade-renouvellement"), [], { encoding: "utf8", env: { HOME: home, PATH: `${bin}:/usr/bin:/bin`, BRIGADE_SESSION_STATE: etat } });

  assert.equal(passer().status, 1);
  const enEchec = lireSession(CONFIG(etat), new Date());
  assert.equal(enEchec.file, "read");
  assert.equal(enEchec.live, true);
  assert.equal(enEchec.failure?.nature, "claude-en-echec");
  assert.match(enEchec.failure?.detail ?? "", /réseau coupé/);

  writeFileSync(temoin, "");
  assert.equal(passer().status, 0);
  const renouvelee = lireSession(CONFIG(etat), new Date(), enEchec);
  assert.equal(renouvelee.failure, null);
  assert.ok(renouvelee.renewed !== null && renouvelee.renewed === renouvelee.written);
  // Rien de ce que le runtime a tiré du fichier ne cite les identifiants.
  assert.doesNotMatch(JSON.stringify([enEchec, renouvelee]), /jeton|neuf|credentials/);
});

test("une connexion tombée se rétablit seule : un passage réussi postérieur à la chute lève l'arrêt, un échec ou un passage d'avant n'y fait rien, et les autres arrêts restent", (t) => {
  const repertoire = join(repertoireTemporaire(t), "brigade");
  const etat = join(repertoireTemporaire(t), "renouvellement");
  const runtime = demarrer({ repertoireEtat: repertoire, projet: "brigade", intervalleVeilleMs: 5, intervalleTickMs: 3_600_000 });
  let tick: (cause: CauseReveil) => void = () => {};
  t.after(() => runtime.arreter("test"));
  const noter = (fait: Fait) => runtime.journal.ajouter({ project: "brigade", ticket: null, author: "runtime", ...fait });
  const ecrire = (texte: string) => writeFileSync(etat, texte);
  const tombees = () => stationsDeconnectees(runtime.journal.base);

  noter({ type: "station.announced", payload: { station: STATION, engine: "claude", provides: ["opus"], maxCooks: 2 } });
  noter({ type: "station.disconnected", payload: { station: STATION, reason: "authentication_failed", run: null } });
  noter({ type: "kitchen.stopped", payload: {} });
  brancherSession({ ...runtime, surReveil: (ecouter) => ((tick = ecouter), () => {}) }, CONFIG(etat));
  assert.deepEqual(tombees(), [STATION]);

  // Un passage d'avant la chute, puis un échec : la connexion n'est pas revenue.
  ecrire("verifie=2000-01-01T00:00:00Z\n");
  tick("tick");
  ecrire("verifie=2000-01-01T00:00:00Z\nechec=2099-01-01T00:00:00Z\nechec_nature=session-refusee\n");
  tick("tick");
  assert.deepEqual(tombees(), [STATION]);

  // Un passage réussi et frais, mais qui n'a pas vu les identifiants réécrits
  // après la chute (`ecrits`/`renouvele` d'avant, ou absents) : pas de login.
  ecrire("verifie=2099-01-01T00:01:00Z\necrits=2000-01-01T00:00:00Z\nrenouvele=2000-01-01T00:00:00Z\n");
  tick("tick");
  ecrire("verifie=2099-01-01T00:01:00Z\n");
  tick("tick");
  assert.deepEqual(tombees(), [STATION]);

  // Le chef s'est reconnecté : le passage réussi suivant, qui voit les identifiants réécrits, lève l'arrêt, une fois.
  ecrire("verifie=2099-01-01T00:01:00Z\nechec=2099-01-01T00:00:00Z\nechec_nature=session-refusee\necrits=2099-01-01T00:00:30Z\n");
  tick("tick");
  tick("tick");
  assert.deepEqual(tombees(), []);
  const levees = runtime.journal.tout().filter((e) => e.type === "session.restored");
  assert.equal(levees.length, 1);
  assert.deepEqual(levees[0]?.payload, { stations: [STATION], verified: "2099-01-01T00:00:30.000Z" });
  // L'arrêt du chef, lui, n'est pas levé.
  assert.notEqual(etatDesGardeFous(runtime.journal.base).stoppedAt, null);
});

test("le runtime écrit au journal ce qu'il lit au démarrage, puis ce qui change à chaque tick — un passage qui ne change rien n'écrit rien", (t) => {
  const repertoire = join(repertoireTemporaire(t), "brigade");
  const etat = join(repertoireTemporaire(t), "renouvellement");
  let runtime = demarrer({ repertoireEtat: repertoire, projet: "brigade", intervalleVeilleMs: 5, intervalleTickMs: 3_600_000 });
  let tick: (cause: CauseReveil) => void = () => {};
  const avecTick = (r: typeof runtime) => ({ ...r, surReveil: (ecouter: (cause: CauseReveil) => void) => ((tick = ecouter), () => {}) });
  t.after(() => runtime.arreter("test"));
  const observees = () => runtime.journal.tout().flatMap((e) => (e.type === "session.observed" ? [e.payload] : []));
  const ecrire = (texte: string) => writeFileSync(etat, texte);

  brancherSession(avecTick(runtime), CONFIG(etat));
  assert.deepEqual(observees().map((o) => o.file), ["absent"]);

  ecrire(`ecrits=2026-10-14T08:26:00Z\nrenouvele=2026-10-14T08:26:00Z\nverifie=2026-10-14T08:30:00Z\n`);
  tick("tick");
  tick("log");
  assert.deepEqual(observees().map((o) => [o.file, o.renewed]), [["absent", null], ["read", "2026-10-14T08:26:00.000Z"]]);
  // Le passage suivant ne change que sa propre date : rien de neuf.
  ecrire(`ecrits=2026-10-14T08:26:00Z\nrenouvele=2026-10-14T08:26:00Z\nverifie=2026-10-14T08:31:00Z\n`);
  tick("tick");
  assert.equal(observees().length, 2);

  // Redémarré, il repart de ce que le journal porte : rien à réécrire.
  runtime.arreter("test");
  runtime = demarrer({ repertoireEtat: repertoire, projet: "brigade", intervalleVeilleMs: 5, intervalleTickMs: 3_600_000 });
  brancherSession(avecTick(runtime), CONFIG(etat));
  assert.equal(observees().length, 2);
});

test("la configuration : le fichier d'état à côté des répertoires d'état des projets par défaut, des durées en secondes, et jamais un fichier d'identifiants", () => {
  assert.deepEqual(configSession({}, "/var/lib/brigade/brigade"), { etat: ETAT, vieS: 28_800, preavisS: 10_800 });
  assert.deepEqual(configSession({ BRIGADE_SESSION_STATE: "/ailleurs/etat", BRIGADE_SESSION_LIFETIME: "3600", BRIGADE_SESSION_WARNING: "600" }, "/x/y"), { etat: "/ailleurs/etat", vieS: 3600, preavisS: 600 });
  const refus = (env: NodeJS.ProcessEnv) => assert.throws(() => configSession(env, "/var/lib/brigade/brigade"), ConfigInvalide);
  refus({ BRIGADE_SESSION_STATE: "relatif" });
  refus({ BRIGADE_SESSION_STATE: "/home/brigade/.claude/.credentials.json" });
  refus({ BRIGADE_SESSION_WARNING: "3h" });
  refus({ BRIGADE_SESSION_LIFETIME: "0" });
  refus({ BRIGADE_SESSION_LIFETIME: "3600", BRIGADE_SESSION_WARNING: "7200" });
});

// --- Les identifiants : en lecture seule pour tous, ouverts par personne -------

test("la cloison monte les identifiants en lecture seule pour tous les rôles — setup, cook et gates, reviewer, juge — et rien ne les rend inscriptibles", (t) => {
  const racine = repertoireTemporaire(t);
  const lieux = { repertoireEtat: join(racine, "etats/brigade"), clone: join(racine, "etats/brigade/depot") };
  const worktree = join(lieux.repertoireEtat, "worktrees/17-abc");
  mkdirSync(join(lieux.clone, ".git"), { recursive: true });
  mkdirSync(worktree, { recursive: true });
  const home = join(racine, "compte");
  mkdirSync(join(home, ".claude"), { recursive: true });
  const cloison = configCloison({ BRIGADE_SANDBOX_BIN: FAUX_BWRAP, BRIGADE_SANDBOX_HIDDEN: join(racine, "etats"), HOME: home }, lieux);
  const identifiants = join(home, ".claude/.credentials.json");
  assert.equal(cloison?.identifiants, identifiants);

  const roles = {
    "setup, cook et gates": { cwd: worktree, depot: "ecriture" as const },
    reviewer: { cwd: worktree, depot: "lecture" as const },
    juge: { cwd: "/tmp", depot: null },
  };
  for (const [role, acces] of Object.entries(roles)) {
    const { args } = envelopper(cloison, { commande: "claude", args: [] }, acces);
    const recu = args.slice(args.indexOf("brigade") + 1, args.indexOf("--"));
    const montages = recu.flatMap((arg, i) => (arg.startsWith("--") && recu[i + 2] === identifiants ? [arg] : []));
    assert.deepEqual(montages, ["--ro-bind-try"], role);
    // Monté après le `~/.claude` du projet, qu'il recouvre : c'est bien lui qu'on voit.
    assert.ok(recu.lastIndexOf(identifiants) > recu.indexOf(join(home, ".claude")), role);
    // Un montage recouvre ceux qui le précèdent : aucun montage inscriptible
    // ne le recouvre ensuite, ni lui ni un répertoire qui le contient.
    const apres = recu.slice(recu.lastIndexOf(identifiants) + 1);
    const recouvrants = apres.flatMap((arg, i) => (arg === "--bind" && (apres[i + 2] === identifiants || identifiants.startsWith(`${apres[i + 2]}/`)) ? [apres[i + 2]] : []));
    assert.deepEqual(recouvrants, [], role);
  }
});

test("aucun code du runtime n'ouvre le fichier d'identifiants : son nom n'y sert qu'à la cloison, aux refus et à la reconnaissance d'une livraison", () => {
  const SRC = join(import.meta.dirname, "../src");
  const sources = (repertoire: string): string[] =>
    readdirSync(repertoire, { withFileTypes: true }).flatMap((entree) => (entree.isDirectory() ? sources(join(repertoire, entree.name)) : entree.name.endsWith(".ts") ? [join(repertoire, entree.name)] : []));
  const lues = sources(SRC).map((fichier) => ({ nom: relative(SRC, fichier), texte: readFileSync(fichier, "utf8") }));
  const qui = (motif: RegExp) => lues.filter(({ texte }) => motif.test(texte)).map(({ nom }) => nom).sort();

  // Son nom en clair : la cloison, qui le monte, et le module qui le reconnaît dans une livraison.
  assert.deepEqual(qui(/\.credentials\.json/), ["cloison.ts", "identifiants.ts"]);
  // Son nom par la constante : les messages d'un refus de push, et le refus d'un fichier d'état qui le désignerait.
  assert.deepEqual(qui(/\bFICHIER_DES_IDENTIFIANTS\b/), ["identifiants.ts", "renouvellement.ts", "station.ts"]);
  // Son chemin, tel que la cloison le donne : l'annonce au journal — par le runtime d'un projet, et par la cuisine
  // que la station ouvre pour chacun des siens —, et la sonde qui le regarde de l'intérieur de la cloison.
  assert.deepEqual(qui(/\.identifiants\b/), ["eprouver.ts", "main.ts", "station/cuisine.ts"]);
  // Et aucune lecture, ouverture ou copie de quoi que ce soit qui le nomme.
  assert.deepEqual(qui(/\b(readFileSync|readFile|openSync|open|createReadStream|copyFileSync|copyFile|cpSync|readSync)\s*\([^)]*(identifiants|credentials)/i), []);
  // La sonde n'ouvre rien : `test -r` et `test -w` n'en demandent que les droits.
  const sonde = lues.find(({ nom }) => nom === "eprouver.ts")?.texte ?? "";
  assert.match(sonde, /sh\('\[ -r "\$1" \] && ! \[ -w "\$1" \]', cloison\.identifiants\)/);
});

test("avec un jeton longue durée, le renouvellement n'est pas suivi : aucun fichier lu, rien d'écrit, aucune perte rétablie ni annoncée ; sans jeton, comme avant", (t) => {
  const repertoire = join(repertoireTemporaire(t), "brigade");
  const etat = join(repertoireTemporaire(t), "renouvellement");
  const runtime = demarrer({ repertoireEtat: repertoire, projet: "brigade", intervalleVeilleMs: 5, intervalleTickMs: 3_600_000 });
  let tick: (cause: CauseReveil) => void = () => {};
  let abonnements = 0;
  t.after(() => runtime.arreter("test"));
  const noter = (fait: Fait) => runtime.journal.ajouter({ project: "brigade", ticket: null, author: "runtime", ...fait });
  const faits = (type: string) => runtime.journal.tout().filter((e) => e.type === type);
  const ecrire = (texte: string) => writeFileSync(etat, texte);

  noter({ type: "station.announced", payload: { station: STATION, engine: "claude", provides: ["opus"], maxCooks: 2 } });
  noter({ type: "station.disconnected", payload: { station: STATION, reason: "authentication_failed", run: null } });
  ecrire("verifie=2099-01-01T00:01:00Z\nechec=2099-01-01T00:00:00Z\nechec_nature=session-refusee\necrits=2099-01-01T00:00:30Z\n");
  brancherSession({ ...runtime, surReveil: (ecouter) => ((tick = ecouter), void abonnements++, () => {}) }, CONFIG(etat), () => new Date(a("12:00:00")), "/secret/jeton");
  tick("tick");
  assert.equal(abonnements, 0);
  assert.equal(faits("session.observed").length, 0);
  assert.equal(faits("session.restored").length, 0);
  assert.deepEqual(stationsDeconnectees(runtime.journal.base), [STATION]);

  // Sans jeton : le même fichier est lu, et la connexion rétablie.
  brancherSession({ ...runtime, surReveil: (ecouter) => ((tick = ecouter), () => {}) }, CONFIG(etat), () => new Date(a("12:00:00")));
  assert.equal(faits("session.observed").length, 1);
  assert.equal(faits("session.restored").length, 1);
});

test("une échéance de session déjà annoncée sort de la file dès qu'un jeton longue durée est configuré", (t) => {
  const { observer, noter, bloc } = cuisine(t);
  observer("08:00:00", { renewed: a("07:00:00"), lifetimeS: 8 * 3600, warningS: 3 * 3600 });
  assert.notDeepEqual(bloc("12:00:00"), RIEN);
  noter({ type: "token.observed", payload: { token: "/secret/jeton", file: "/secret/jeton.cree", state: "read", created: a("07:00:00"), lifetimeDays: 365, warningDays: 30 } });
  assert.ok(!bloc("12:00:00").some((l) => l.includes("session")), bloc("12:00:00").join("\n"));
});

test("un jeton longue durée configuré puis retiré : l'échéance de session s'annonce de nouveau, la trace du jeton ne la tait pas", (t) => {
  const etat = join(repertoireTemporaire(t), "brigade");
  const jeton = join(repertoireTemporaire(t), "claude-token");
  writeFileSync(jeton, "x".repeat(60), { mode: 0o600 });
  let runtime = demarrer({ repertoireEtat: etat, projet: "brigade", intervalleVeilleMs: 5, intervalleTickMs: 3_600_000 });
  t.after(() => runtime.arreter("test"));
  const sansEcoute = () => ({ ...runtime, surReveil: () => () => {} });
  const maintenant = new Date(a("12:00:00"));
  runtime.journal.ajouter({ project: "brigade", ticket: null, author: "runtime", type: "session.observed", payload: observation({ renewed: a("07:00:00"), lifetimeS: 8 * 3600, warningS: 3 * 3600 }) });

  brancherJeton(sansEcoute(), jeton);
  assert.equal(alerteDeSession(runtime.journal.base, maintenant), null);

  // Le jeton est retiré de la configuration : le redémarrage lève la trace.
  runtime.arreter("test");
  runtime = demarrer({ repertoireEtat: etat, projet: "brigade", intervalleVeilleMs: 5, intervalleTickMs: 3_600_000 });
  brancherJeton(sansEcoute(), null);
  assert.notEqual(alerteDeSession(runtime.journal.base, maintenant), null);
});

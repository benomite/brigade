// La bascule d'une machine servie à l'ancienne — une unité par projet — vers
// la station : ce qu'elle lit, ce qu'elle refuse sans rien changer, ce qu'elle
// écrit pour la station, ce qu'elle retire du système et ce qu'elle laisse.
// Sur une machine d'essai posée sous une racine à part (`aides.ts`) ; systemd
// est une doublure qui note ses appels.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { lieux, lireAncienneInstallation } from "../../src/switchover/previous.ts";
import { attendreLaReprise, basculer, BasculeEnEchec, lireNote, type Systemctl } from "../../src/switchover/switch.ts";
import { lireConfiguration } from "../../src/station/configuration.ts";
import { lirePortes } from "../../src/station/doors.ts";
import { repertoireTemporaire } from "../outils.ts";
import { ancienneMachine, GESTES_ANCIENS, TROIS } from "./helpers.ts";

const MAIN = join(import.meta.dirname, "../../src/switchover/main.ts");

// Un systemd qui fait ce qu'on lui demande, et le note. `actives` : les unités
// qui tournent encore ; `refuse` : ce qu'il refuse de faire.
function unSystemd(options: { tourneEncore?: string[]; refuse?: string } = {}) {
  const appels: string[] = [];
  const systemctl: Systemctl = (args) => {
    const ligne = args.join(" ");
    appels.push(ligne);
    if (options.refuse !== undefined && ligne.startsWith(options.refuse)) return { code: 1, sortie: "Failed: Access denied" };
    if (args[0] === "is-active") return { code: options.tourneEncore?.includes(args.at(-1) ?? "") ? 0 : 3, sortie: "" };
    return { code: 0, sortie: "" };
  };
  return { systemctl, appels };
}

function machine(t: TestContext, ...args: Parameters<typeof ancienneMachine> extends [string, ...infer R] ? R : never) {
  return ancienneMachine(join(repertoireTemporaire(t), "machine"), ...args);
}

function basculerTout(m: ReturnType<typeof machine>, systemd = unSystemd()) {
  const ici = lieux(m.racine);
  const { plan, refus } = lireAncienneInstallation(ici);
  assert.deepEqual(refus, []);
  assert.ok(plan);
  const dit: string[] = [];
  const note = basculer(plan, ici, { systemctl: systemd.systemctl, dire: (ligne) => dit.push(ligne), maintenant: () => new Date("2026-10-16T08:00:00.000Z") });
  return { ici, note, dit, appels: systemd.appels };
}

test("les trois projets passent à la station : une ligne chacun — dépôt, branche, clone et réglages de leur unité —, leur état laissé où il est, et le port de leur porte repris", (t) => {
  const m = machine(t);
  const { ici, note, dit } = basculerTout(m);

  const configuration = lireConfiguration(readFileSync(join(ici.station, "projets"), "utf8"));
  assert.deepEqual(configuration.problemes, []);
  assert.deepEqual(
    configuration.projets.map(({ nom, depot, base, reglages }) => ({ nom, depot, base, reglages })),
    [
      { nom: "brigade", depot: "benomite/brigade", base: "v2", reglages: { BRIGADE_REPO_DIR: m.sous("var/lib/brigade/brigade/depot"), BRIGADE_ARBITER_PORT: "8470", BRIGADE_ROADMAP_ISSUE: "1" } },
      { nom: "calculus-workspace", depot: "benomite/calculus-workspace", base: "main", reglages: { BRIGADE_REPO_DIR: m.sous("var/lib/brigade/calculus-workspace/depot"), BRIGADE_ARBITER_PORT: "8470" } },
      { nom: "espace", depot: "benomite/espace", base: "main", reglages: { BRIGADE_REPO_DIR: m.sous("var/lib/brigade/espace/depot"), BRIGADE_ARBITER_PORT: "8470", BRIGADE_SECRETS_FILE: "/srv/secrets/espace.env" } },
    ],
  );
  // La station range l'état de chaque projet sous `etat/` : il y est, sans avoir bougé.
  for (const { nom } of TROIS) {
    assert.equal(readlinkSync(join(ici.station, "etat", nom)), m.etat(nom));
    assert.equal(realpathSync(join(ici.station, "etat", nom, "log.db")), join(m.etat(nom), "log.db"));
  }
  assert.deepEqual(note, { arretee: "2026-10-16T08:00:00.000Z", projets: ["brigade", "calculus-workspace", "espace"], reprise: null });
  assert.deepEqual(lireNote(ici.note), note);
  assert.match(dit.join("\n"), /brigade — réglages de son unité non repris \(After, IPAddressAllow, IPAddressDeny, PrivateTmp, Requires, WorkingDirectory\) : ceux de la station s'appliquent/);
  // Le port de chaque porte ne s'écrit pas sur la ligne : il attend les portes
  // de la station, là où elles le chercheront — un cook en vol retrouve la sienne.
  assert.deepEqual(lirePortes(join(ici.station, "portes.json")), { station: null, projets: { brigade: 8481, "calculus-workspace": 8482, espace: 8483 } });
  assert.match(dit.join("\n"), /espace — sa porte reprise par la station : même port \(127\.0\.0\.1:8483\), même liste blanche, lue à son journal/);
});

test("un projet sans porte dans l'ancienne installation : aucun port repris — la station lui en ouvre une, et le dit", (t) => {
  const m = machine(t, [{ nom: "espace", depot: "benomite/espace", base: "main" }, TROIS[0] ?? assert.fail()], { sansPorte: ["espace"] });
  const { ici, dit } = basculerTout(m);
  assert.deepEqual(lirePortes(join(ici.station, "portes.json")), { station: null, projets: { brigade: 8481 } });
  assert.match(dit.join("\n"), /espace — il n'avait pas de porte : la station lui en ouvre une, qui ne laisse passer que sa liste blanche/);
});

test("un port que les portes de la station tiennent déjà n'est pas réécrit : la bascule n'ajoute que ceux qui leur manquent", (t) => {
  const m = machine(t);
  const ici = lieux(m.racine);
  mkdirSync(ici.station, { recursive: true });
  writeFileSync(join(ici.station, "portes.json"), JSON.stringify({ station: 40001, projets: { brigade: 40002 } }));
  basculerTout(m);
  assert.deepEqual(lirePortes(join(ici.station, "portes.json")), { station: 40001, projets: { brigade: 40002, "calculus-workspace": 8482, espace: 8483 } });
});

test("journal, décisions et clone de chaque projet sont intacts : la bascule n'y écrit rien", (t) => {
  const m = machine(t);
  const avant = Object.fromEntries(TROIS.map(({ nom }) => [nom, m.faits(nom)]));
  const etats = () => Object.fromEntries(Object.entries(m.photo()).filter(([chemin]) => chemin.startsWith("var/lib/brigade/") && !/^var\/lib\/brigade\/(projets|portes\.json|etat\/)/.test(chemin)));
  const photoAvant = etats();
  basculerTout(m);
  for (const { nom } of TROIS) assert.deepEqual(m.faits(nom), avant[nom]);
  assert.deepEqual(etats(), photoAvant);
  assert.deepEqual(
    m.faits("espace").filter((e) => e.type === "decision.set").map((e) => (e.payload as { name: string }).name),
    ["BRIGADE_STATIONS", "BRIGADE_MANAGER_MODEL", "BRIGADE_MANAGER_EFFORT", "BRIGADE_REVIEWER_MODEL", "BRIGADE_REVIEWER_EFFORT"],
  );
});

test("les anciennes unités s'arrêtent avant que la station ne reçoive rien, puis leurs portes, et l'ancien renouvellement avec elles", (t) => {
  const m = machine(t);
  const { appels } = basculerTout(m);
  assert.deepEqual(appels, [
    "disable --now brigade@brigade.service brigade@calculus-workspace.service brigade@espace.service",
    "is-active --quiet brigade@brigade.service",
    "is-active --quiet brigade@calculus-workspace.service",
    "is-active --quiet brigade@espace.service",
    "disable --now brigade-porte@brigade.service brigade-porte@calculus-workspace.service brigade-porte@espace.service",
    "is-active --quiet brigade-porte@brigade.service",
    "is-active --quiet brigade-porte@calculus-workspace.service",
    "is-active --quiet brigade-porte@espace.service",
    "disable --now brigade-renouvellement.timer",
    "stop brigade-renouvellement.timer brigade-renouvellement.service",
    "daemon-reload",
  ]);
});

test("ce que l'ancienne installation avait posé part — unités, portes, drop-ins, liens d'activation, gestes et leurs règles sudoers —, et rien d'autre", (t) => {
  const m = machine(t);
  const avant = m.photo();
  basculerTout(m);
  const apres = m.photo();
  const partis = Object.keys(avant).filter((chemin) => !(chemin in apres)).sort();
  assert.deepEqual(partis, [
    "etc/sudoers.d/brigade-ancien-geste",
    "etc/sudoers.d/brigade-installer",
    ...TROIS.flatMap(({ nom }) => ["arbitre.conf", "chef.conf", "cloison.conf", "code.conf", "projet.conf", "reglages.conf"].map((f) => `etc/systemd/system/brigade@${nom}.service.d/${f}`)),
    "etc/systemd/system/brigade-porte@.service",
    ...TROIS.map(({ nom }) => `etc/systemd/system/brigade-porte@${nom}.service.d/port.conf`),
    ...TROIS.map(({ nom }) => `etc/systemd/system/multi-user.target.wants/brigade-porte@${nom}.service`),
    "etc/systemd/system/brigade-renouvellement.service",
    "etc/systemd/system/brigade-renouvellement.timer",
    "etc/systemd/system/brigade@.service",
    "etc/systemd/system/brigade@.service.d/chemin.conf",
    ...TROIS.map(({ nom }) => `etc/systemd/system/multi-user.target.wants/brigade@${nom}.service`),
    "etc/systemd/system/timers.target.wants/brigade-renouvellement.timer",
    ...GESTES_ANCIENS.map((geste) => `usr/local/bin/${geste}`),
  ].sort());
  for (const nom of ["brigade@.service.d", ...TROIS.flatMap((p) => [`brigade@${p.nom}.service.d`, `brigade-porte@${p.nom}.service.d`])]) assert.equal(existsSync(m.sous("etc/systemd/system", nom)), false, nom);
  // L'arbitre des projets, la règle du geste `brigade` et celle sans rapport,
  // node et claude : là, tels quels.
  for (const reste of ["etc/systemd/system/brigade-arbitre.service", "etc/sudoers.d/brigade", "etc/sudoers.d/sauvegardes", "usr/local/bin/node", "usr/local/bin/claude"]) {
    assert.equal(apres[reste], avant[reste], reste);
  }
  // Le geste `brigade` pointe sur celui du paquet : l'app lit ses projets comme avant.
  assert.equal(apres["usr/local/bin/brigade"], `-> ${m.sous("usr/lib/brigade-station/brigade")}`);
});

test("rejouée, la bascule ne trouve plus rien à faire : la machine reste telle quelle", (t) => {
  const m = machine(t);
  basculerTout(m);
  const apres = m.photo();
  assert.deepEqual(lireAncienneInstallation(lieux(m.racine)), { plan: null, refus: [] });
  const rejouee = spawnSync(process.execPath, [MAIN, "--racine", m.racine], { encoding: "utf8" });
  assert.equal(rejouee.status, 0, rejouee.stderr);
  assert.equal(rejouee.stdout, "");
  assert.deepEqual(m.photo(), apres);
});

test("une machine sans ancienne installation : rien à basculer, rien d'écrit", (t) => {
  const racine = repertoireTemporaire(t);
  assert.deepEqual(lireAncienneInstallation(lieux(racine)), { plan: null, refus: [] });
  const rendu = spawnSync(process.execPath, [MAIN, "--racine", racine], { encoding: "utf8" });
  assert.equal(rendu.status, 0, rendu.stderr);
  assert.equal(rendu.stdout + rendu.stderr, "");
  const attendu = spawnSync(process.execPath, [MAIN, "attendre", "--racine", racine], { encoding: "utf8" });
  assert.equal(attendu.status, 0, attendu.stderr);
  assert.equal(attendu.stdout + attendu.stderr, "");
});

for (const [cas, projet, motif] of [
  ["sans dépôt", { nom: "espace", depot: "", base: "main" }, /brigade@espace\.service : BRIGADE_GITHUB_REPO n'est pas défini/],
  ["avec une valeur à blancs", { nom: "espace", depot: "benomite/espace", base: "main", environnement: { BRIGADE_SECRETS_FILE: "/srv/mes secrets.env" } }, /brigade@espace\.service : BRIGADE_SECRETS_FILE : sa valeur contient un blanc/],
  ["avec une variable hors BRIGADE_", { nom: "espace", depot: "benomite/espace", base: "main", environnement: { NODE_OPTIONS: "--max-old-space-size=4096" } }, /brigade@espace\.service : NODE_OPTIONS : la configuration de la station ne porte que des réglages BRIGADE_…/],
] as const) {
  test(`un projet ${cas} : la bascule est refusée en le disant, et rien ne change sur la machine`, (t) => {
    const m = machine(t, [TROIS[0] ?? { nom: "brigade", depot: "benomite/brigade", base: "v2" }, projet]);
    const avant = m.photo();
    const rendu = spawnSync(process.execPath, [MAIN, "--racine", m.racine], { encoding: "utf8", env: { ...process.env, PATH: "/nulle/part" } });
    assert.equal(rendu.status, 1);
    assert.match(rendu.stderr, /^bascule refusée — rien n'a changé : les anciennes unités servent toujours leurs projets, la station n'en sert aucun/);
    assert.match(rendu.stderr, motif);
    assert.deepEqual(m.photo(), avant);
  });
}

test("un drop-in qui lit ses variables d'un fichier : refusé — elles ne se reprendraient pas", (t) => {
  const m = machine(t);
  writeFileSync(m.sous("etc/systemd/system/brigade@espace.service.d/fichier.conf"), "[Service]\nEnvironmentFile=/etc/brigade/espace.env\n");
  const { plan, refus } = lireAncienneInstallation(lieux(m.racine));
  assert.equal(plan, null);
  assert.match(refus.join("\n"), /brigade@espace\.service : EnvironmentFile= : ses variables ne se lisent pas ici/);
});

test("la configuration de la station qui porte déjà ce projet sous un autre dépôt : refusée", (t) => {
  const m = machine(t);
  writeFileSync(m.sous("var/lib/brigade/projets"), "espace benomite/autre main\n");
  const { refus } = lireAncienneInstallation(lieux(m.racine));
  assert.match(refus.join("\n"), /brigade@espace\.service : la configuration de la station a déjà une ligne « espace » \(benomite\/autre, main\), qui n'est pas celle de son unité \(benomite\/espace, main\)/);
});

test("une décision restée dans une unité n'est pas recopiée sur la ligne : elle vit au journal, la bascule le dit", (t) => {
  const m = machine(t, [{ nom: "espace", depot: "benomite/espace", base: "main", environnement: { BRIGADE_MANAGER_MODEL: "opus" } }]);
  const { ici, dit } = basculerTout(m);
  assert.doesNotMatch(readFileSync(join(ici.station, "projets"), "utf8"), /MANAGER/);
  assert.match(dit.join("\n"), /espace — BRIGADE_MANAGER_MODEL dans son unité, non repris : une décision vit au journal du projet/);
});

test("une unité déclarée qui n'a jamais servi — aucun journal : rien à reprendre, son unité part", (t) => {
  const m = machine(t, [TROIS[0] ?? { nom: "brigade", depot: "benomite/brigade", base: "v2" }, { nom: "essai", depot: "benomite/essai", base: "main", sansJournal: true }]);
  const { ici, note, dit, appels } = basculerTout(m);
  assert.deepEqual(note.projets, ["brigade"]);
  assert.deepEqual(lireConfiguration(readFileSync(join(ici.station, "projets"), "utf8")).projets.map((p) => p.nom), ["brigade"]);
  assert.equal(existsSync(m.sous("etc/systemd/system/brigade@essai.service.d")), false);
  assert.equal(appels[0], "disable --now brigade@brigade.service brigade@essai.service");
  assert.match(dit.join("\n"), /brigade@essai\.service — aucun journal, rien à reprendre : son unité est retirée/);
});

test("une ancienne unité qui tourne encore après son arrêt : la bascule s'arrête là — rien n'est écrit pour la station, rien n'est retiré", (t) => {
  const m = machine(t);
  const ici = lieux(m.racine);
  const { plan } = lireAncienneInstallation(ici);
  assert.ok(plan);
  const avant = m.photo();
  assert.throws(() => basculer(plan, ici, { systemctl: unSystemd({ tourneEncore: ["brigade@espace.service"] }).systemctl, dire: () => {} }), (erreur: unknown) => erreur instanceof BasculeEnEchec && /brigade@espace\.service tourne encore après son arrêt/.test(erreur.message));
  assert.deepEqual(m.photo(), avant);
});

test("le rechargement de systemd en échec, à la toute fin : la bascule le dit ; rejouée, elle n'a plus rien à défaire, et la reprise se mesure quand même", (t) => {
  const m = machine(t);
  const ici = lieux(m.racine);
  const { plan } = lireAncienneInstallation(ici);
  assert.ok(plan);
  assert.throws(() => basculer(plan, ici, { systemctl: unSystemd({ refuse: "daemon-reload" }).systemctl, dire: () => {} }), (erreur: unknown) => erreur instanceof BasculeEnEchec && /`systemctl daemon-reload` a rendu 1 — Failed: Access denied/.test(erreur.message));
  assert.deepEqual(lireAncienneInstallation(ici), { plan: null, refus: [] });
  assert.equal(lireConfiguration(readFileSync(join(ici.station, "projets"), "utf8")).projets.length, 3);
  assert.deepEqual(lireNote(ici.note)?.projets, ["brigade", "calculus-workspace", "espace"]);
});

test("une bascule interrompue après avoir écrit la configuration : rejouée, elle ne double ni une ligne ni un lien", (t) => {
  const m = machine(t);
  const ici = lieux(m.racine);
  const { plan } = lireAncienneInstallation(ici);
  assert.ok(plan);
  // Ce que la première a laissé : la ligne et le lien d'un projet.
  const [espace] = plan.projets.filter((p) => p.nom === "espace");
  assert.ok(espace);
  writeFileSync(join(ici.station, "projets"), `${espace.ligne}\n`);
  mkdirSync(join(ici.station, "etat"));
  symlinkSync(m.etat("espace"), join(ici.station, "etat", "espace"));
  const reprise = lireAncienneInstallation(ici);
  assert.deepEqual(reprise.refus, []);
  assert.ok(reprise.plan);
  assert.deepEqual(reprise.plan.projets.map((p) => [p.nom, p.dejaConfigure, p.dejaLie]), [["brigade", false, false], ["calculus-workspace", false, false], ["espace", true, true]]);
  basculer(reprise.plan, ici, { systemctl: unSystemd().systemctl, dire: () => {} });
  assert.deepEqual(lireConfiguration(readFileSync(join(ici.station, "projets"), "utf8")).projets.map((p) => p.nom), ["espace", "brigade", "calculus-workspace"]);
});

test("un `etat/<projet>` déjà là, qui n'est pas l'état de son unité : refusé", (t) => {
  const m = machine(t);
  mkdirSync(m.sous("var/lib/brigade/etat/espace"), { recursive: true });
  const { refus } = lireAncienneInstallation(lieux(m.racine));
  assert.match(refus.join("\n"), /brigade@espace\.service : \S+\/etat\/espace existe déjà, et n'est pas son état/);
});

test("la reprise constatée : la station sert les projets remis, et l'arrêt de leur cuisine est mesuré, de la bascule à la station", async (t) => {
  const m = machine(t);
  const { ici } = basculerTout(m);
  const enService = (servis: string[], refuses: Record<string, string> = {}) =>
    writeFileSync(join(ici.station, "en-service"), JSON.stringify({ version: "1.0.0", pid: process.pid, depuis: "2026-10-16T08:00:30.000Z", servis, refuses }));

  enService(["brigade"], { espace: "le clone du projet n'existe pas" });
  const dit: string[] = [];
  assert.equal(await attendreLaReprise(ici, { delaiMs: 0, dire: (ligne) => dit.push(ligne) }), false);
  assert.match(dit.join("\n"), /la station ne sert pas encore calculus-workspace, espace \(le clone du projet n'existe pas\)/);
  assert.equal(lireNote(ici.note)?.reprise, null);

  enService(["brigade", "calculus-workspace", "espace"]);
  dit.length = 0;
  assert.equal(await attendreLaReprise(ici, { dire: (ligne) => dit.push(ligne), maintenant: () => new Date("2026-10-16T08:02:05.000Z") }), true);
  assert.match(dit.join("\n"), /^bascule : cuisine reprise par la station — brigade, calculus-workspace, espace ; arrêtée 2 min 05 s, de \d\d:\d\d:\d\d à \d\d:\d\d:\d\d$/);
  assert.equal(lireNote(ici.note)?.reprise, "2026-10-16T08:02:05.000Z");
  // Constatée, elle ne s'attend plus.
  dit.length = 0;
  rmSync(join(ici.station, "en-service"));
  assert.equal(await attendreLaReprise(ici, { delaiMs: 0, dire: (ligne) => dit.push(ligne) }), true);
  assert.deepEqual(dit, []);
});

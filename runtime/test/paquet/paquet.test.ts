// Le paquet Debian de la station (runtime/paquet) : ce que la commande de
// construction produit, et ce que dpkg joue à l'installation et à la mise à
// jour — la commande d'installation du guide a les siens
// (deploy/installer-station.test.ts). Ni root, ni vraie machine : `dpkg-deb`
// construit et ouvre le paquet, et les commandes du système que les scripts
// appellent sont des doublures qui notent leurs appels.
import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test, type TestContext } from "node:test";
import { lancer, repertoireTemporaire } from "../outils.ts";

const PAQUET = join(import.meta.dirname, "../../paquet");
const CONSTRUIRE = join(PAQUET, "construire.ts");
const REFUS = 2;

const sansDpkgDeb = spawnSync("dpkg-deb", ["--version"]).status !== 0 && "`dpkg-deb` manque sur cette machine : le paquet ne s'y construit pas";
// Les scripts du paquet ne parlent à systemd que là où il tourne.
const sansSystemd = !existsSync("/run/systemd/system") && "systemd ne tourne pas sur cette machine : les scripts du paquet n'y appellent pas systemctl";

type Rendu = { code: number; sortie: string };

function construire(args: string[]): Promise<Rendu> {
  return new Promise((resoudre) => {
    const donnee = args.includes("--repo") || args.includes("--sans-identite");
    const identite = donnee ? [] : ["--repo", "acme/brigade", "--maintainer", "Test <test@example.org>"];
    execFile(process.execPath, [CONSTRUIRE, ...args.filter((a) => a !== "--sans-identite"), ...identite], { encoding: "utf8" }, (erreur, stdout, stderr) => {
      resoudre({ code: erreur ? Number(erreur.code ?? 1) : 0, sortie: stdout + stderr });
    });
  });
}

// Un `node` qui ne fait que dire sa version : le paquet le porte sans le lancer.
function fauxNode(repertoire: string, version: string): string {
  const fichier = join(repertoire, `node-${version}`);
  writeFileSync(fichier, `#!/bin/sh\necho ${version}\n`);
  chmodSync(fichier, 0o755);
  return fichier;
}

// Des commandes du système qui notent chacun de leurs appels, une ligne
// chacun, dans `appels`.
function doublures(t: TestContext, corps: Record<string, string>) {
  const bin = repertoireTemporaire(t);
  const appels = join(bin, "appels");
  writeFileSync(appels, "");
  for (const [nom, script] of Object.entries(corps)) {
    writeFileSync(join(bin, nom), `#!/bin/sh\necho "${nom} $*" >>"${appels}"\n${script}\n`);
    chmodSync(join(bin, nom), 0o755);
  }
  return {
    env: { ...process.env, PATH: `${bin}:/usr/bin:/bin`, BRIGADE_DEPOT: "acme/brigade" },
    appels: () => readFileSync(appels, "utf8").trim().split("\n").filter(Boolean),
  };
}

function jouer(script: string, args: string[], env: NodeJS.ProcessEnv): Rendu {
  const rendu = spawnSync("sh", [script, ...args], { encoding: "utf8", env });
  return { code: rendu.status ?? -1, sortie: rendu.stdout + rendu.stderr };
}

describe("la construction du paquet", { skip: sansDpkgDeb }, () => {
  let dossier = "";
  let deb = "";
  let rendu: Rendu = { code: -1, sortie: "" };

  before(async () => {
    dossier = mkdtempSync(join(tmpdir(), "brigade-paquet-test-"));
    const sortie = join(dossier, "construit");
    rendu = await construire(["--sortie", sortie, "--version", "1.2.3", "--node", fauxNode(dossier, "v99.0.0")]);
    deb = existsSync(sortie) ? join(sortie, readdirSync(sortie)[0] ?? "") : "";
  });
  after(() => rmSync(dossier, { recursive: true, force: true }));

  const champ = (nom: string) => spawnSync("dpkg-deb", ["--field", deb, nom], { encoding: "utf8" }).stdout.trim();
  const contenu = () =>
    spawnSync("dpkg-deb", ["--contents", deb], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
      .stdout.trim()
      .split("\n")
      .map((ligne) => {
        const [droits = "", proprietaire = "", , , , chemin = ""] = ligne.split(/\s+/);
        return { droits, proprietaire, chemin: chemin.replace(/^\.\//, "/") };
      });

  test("une commande produit un .deb nommé par sa version et son architecture, et dit son chemin", () => {
    assert.equal(rendu.code, 0, rendu.sortie);
    assert.match(deb, /\/brigade-station_1\.2\.3_(amd64|arm64)\.deb$/);
    assert.match(rendu.sortie, new RegExp(`paquet construit — ${deb.replaceAll(".", "\\.")} \\(version 1\\.2\\.3, `));
    assert.equal(champ("Package"), "brigade-station");
    assert.equal(champ("Version"), "1.2.3");
    for (const dependance of ["git", "gh", "bubblewrap", "libatomic1", "adduser", "systemd"]) assert.ok(champ("Depends").split(/,\s*/).some((d) => d.split(" ")[0] === dependance), `Depends sans ${dependance} : ${champ("Depends")}`);
  });

  test("le dépôt et le mainteneur sont ceux qu'on a donnés, et la mise à jour lit les versions de ce dépôt", () => {
    assert.equal(champ("Maintainer"), "Test <test@example.org>");
    assert.equal(champ("Homepage"), "https://github.com/acme/brigade");
    const unite = spawnSync("dpkg-deb", ["--fsys-tarfile", deb], { maxBuffer: 64 * 1024 * 1024 });
    const lu = spawnSync("tar", ["-xOf", "-", "./usr/lib/systemd/system/brigade-station-mise-a-jour.service"], { input: unite.stdout, encoding: "utf8" });
    assert.match(lu.stdout, /^Environment=BRIGADE_MISE_A_JOUR_SOURCE=github:acme\/brigade$/m);
  });

  test("il porte le runtime, son node, ses unités, le renouvellement et le geste `brigade` — ni tests, ni rien sous /etc, aucune règle sudoers", () => {
    const fichiers = contenu();
    const chemins = fichiers.map((f) => f.chemin);
    for (const attendu of [
      "/usr/lib/brigade-station/node/bin/node",
      "/usr/lib/brigade-station/runtime/package.json",
      "/usr/lib/brigade-station/runtime/src/station/main.ts",
      "/usr/lib/brigade-station/renouvellement",
      "/usr/lib/brigade-station/brigade",
      "/usr/lib/systemd/system/brigade-station.service",
      "/usr/lib/systemd/system/brigade-station-renouvellement.service",
      "/usr/lib/systemd/system/brigade-station-renouvellement.timer",
    ]) {
      assert.ok(chemins.includes(attendu), `${attendu} manque au paquet`);
    }
    assert.deepEqual(chemins.filter((c) => c.startsWith("/etc") || /sudo/.test(c)), []);
    assert.deepEqual(chemins.filter((c) => c.includes("/test/") || c.includes("node_modules")), []);
    assert.deepEqual(fichiers.filter((f) => f.proprietaire !== "root/root"), []);
    const droits = (chemin: string) => fichiers.find((f) => f.chemin === chemin)?.droits;
    assert.equal(droits("/usr/lib/brigade-station/node/bin/node"), "-rwxr-xr-x");
    assert.equal(droits("/usr/lib/brigade-station/renouvellement"), "-rwxr-xr-x");
    assert.equal(droits("/usr/lib/brigade-station/brigade"), "-rwxr-xr-x");
    assert.equal(droits("/usr/lib/brigade-station/runtime/src/station/main.ts"), "-rw-r--r--");
  });

  test("le runtime du paquet démarre la station et ses portes telles que leurs unités les lancent — la station filtrée, ses portes non", async (t) => {
    const arbre = repertoireTemporaire(t);
    assert.equal(spawnSync("dpkg-deb", ["--extract", deb, arbre]).status, 0);
    const lireUnite = (nom: string) => {
      const unite = readFileSync(join(arbre, "usr/lib/systemd/system", nom), "utf8");
      return (cle: string) => [...unite.matchAll(new RegExp(`^${cle}=(.*)$`, "gm"))].map((m) => m[1] ?? "");
    };
    // L'environnement d'une unité, la machine remplacée par un répertoire d'essai.
    const machine = repertoireTemporaire(t);
    const HOME = join(machine, "home");
    mkdirSync(HOME);
    const lancerUnite = (nom: string) => {
      const valeur = lireUnite(nom);
      const [dossierDeTravail = ""] = valeur("WorkingDirectory");
      const [binaire = "", script = ""] = (valeur("ExecStart")[0] ?? "").split(" ");
      assert.equal(binaire, "/usr/lib/brigade-station/node/bin/node", nom);
      assert.ok(existsSync(join(arbre, binaire)), `${nom} : ExecStart lance ${binaire}, absent du paquet`);
      assert.ok(existsSync(join(arbre, dossierDeTravail, script)), `${nom} : ExecStart lance ${script} depuis ${dossierDeTravail}, absent du paquet`);
      assert.deepEqual(valeur("User"), ["brigade"], nom);
      const env: Record<string, string> = { HOME };
      for (const affectation of valeur("Environment")) {
        const [cle = "", ...reste] = affectation.split("=");
        env[cle] = reste.join("=").replaceAll("/var/lib/brigade", join(machine, "var/lib/brigade"));
      }
      assert.equal(env.BRIGADE_STATION_DIR, join(machine, "var/lib/brigade"), nom);
      assert.equal(env.BRIGADE_STATION_PORTES, join(machine, "var/lib/brigade/portes.json"), nom);
      // Le node du test, faute du vrai dans le paquet : c'est le code livré qui est éprouvé.
      return lancer(t, join(arbre, dossierDeTravail, script), [], env);
    };

    const station = lireUnite("brigade-station.service");
    assert.deepEqual(station("KillMode"), ["process"]);
    // La station ne joint que la boucle locale ; ses portes, qu'elle réclame, sortent.
    assert.deepEqual([station("IPAddressDeny"), station("IPAddressAllow")], [["any"], ["localhost"]]);
    assert.ok(station("Wants").includes("brigade-station-porte.service"), station("Wants").join(" "));
    assert.ok(station("After").includes("brigade-station-porte.service"), station("After").join(" "));
    const portes = lireUnite("brigade-station-porte.service");
    assert.deepEqual([portes("IPAddressDeny"), portes("IPAddressAllow")], [[], []]);

    const lanceesPortes = lancerUnite("brigade-station-porte.service");
    await lanceesPortes.attendre("portes de la station ouvertes");
    const lancee = lancerUnite("brigade-station.service");
    await lancee.attendre("station démarrée");
    assert.match(lancee.sortie(), new RegExp(`station démarrée — pid ${lancee.process.pid}, configuration ${join(machine, "var/lib/brigade/projets")} ; aucun projet servi`));
  });

  test("ses scripts dpkg sont du sh valide", (t) => {
    const arbre = repertoireTemporaire(t);
    assert.equal(spawnSync("dpkg-deb", ["--control", deb, arbre]).status, 0);
    for (const script of ["postinst", "prerm", "postrm"]) {
      const lu = spawnSync("sh", ["-n", join(arbre, script)], { encoding: "utf8" });
      assert.equal(lu.status, 0, `${script} : ${lu.stderr}`);
    }
  });
});

describe("les refus de la construction", { skip: sansDpkgDeb }, () => {
  test("un node plus vieux que celui que le runtime réclame est refusé, sans rien écrire", async (t) => {
    const dossier = repertoireTemporaire(t);
    const rendu = await construire(["--sortie", join(dossier, "construit"), "--version", "1.0.0", "--node", fauxNode(dossier, "v20.1.0")]);
    assert.equal(rendu.code, REFUS, rendu.sortie);
    assert.match(rendu.sortie, /paquet non construit — le node à porter .* est en v20\.1\.0, le runtime réclame la version \d+ au moins/);
    assert.equal(existsSync(join(dossier, "construit")), false);
  });

  test("sans le dépôt qui publie le paquet, ou sans mainteneur, la construction est refusée en le disant, sans rien écrire", async (t) => {
    const dossier = repertoireTemporaire(t);
    const base = ["--sortie", join(dossier, "construit"), "--version", "1.0.0", "--node", fauxNode(dossier, "v99.0.0")];
    const sansDepot = await construire([...base, "--sans-identite", "--maintainer", "Test <test@example.org>"]);
    assert.equal(sansDepot.code, REFUS, sansDepot.sortie);
    assert.match(sansDepot.sortie, /the GitHub repository that publishes this package is missing or invalid.*--repo <account>\/<repository>/);
    const sansMainteneur = await construire([...base, "--sans-identite", "--repo", "acme/brigade"]);
    assert.equal(sansMainteneur.code, REFUS, sansMainteneur.sortie);
    assert.match(sansMainteneur.sortie, /the package maintainer is missing or invalid.*--maintainer "Name <email>"/);
    assert.equal(existsSync(join(dossier, "construit")), false);
  });

  test("une version que dpkg n'accepterait pas est refusée, sans rien écrire", async (t) => {
    const dossier = repertoireTemporaire(t);
    const rendu = await construire(["--sortie", join(dossier, "construit"), "--version", "v1-final", "--node", fauxNode(dossier, "v99.0.0")]);
    assert.equal(rendu.code, REFUS, rendu.sortie);
    assert.match(rendu.sortie, /version invalide « v1-final »/);
    assert.equal(existsSync(join(dossier, "construit")), false);
  });

  test("une autre architecture sans son node est refusée", async (t) => {
    const dossier = repertoireTemporaire(t);
    const autre = process.arch === "arm64" ? "amd64" : "arm64";
    const rendu = await construire(["--sortie", join(dossier, "construit"), "--version", "1.0.0", "--arch", autre]);
    assert.equal(rendu.code, REFUS, rendu.sortie);
    assert.match(rendu.sortie, new RegExp(`--arch ${autre} sans --node`));
  });
});

describe("ce que dpkg joue à l'installation et à la mise à jour", { skip: sansSystemd }, () => {
  const POSTINST = join(PAQUET, "debian/postinst");
  // Un système vierge : ni compte ni groupe brigade.
  const vierge = { getent: "exit 2", adduser: "", systemctl: 'case "$1" in is-enabled|--quiet) exit 1 ;; esac' };

  test("la première installation crée le compte, puis active et démarre la station et son renouvellement", (t) => {
    const systeme = doublures(t, vierge);
    const rendu = jouer(POSTINST, ["configure", ""], systeme.env);
    assert.equal(rendu.code, 0, rendu.sortie);
    assert.deepEqual(
      systeme.appels().filter((a) => !a.startsWith("getent")),
      [
        "adduser --quiet --system --group --home /home/brigade --shell /bin/bash brigade",
        "systemctl daemon-reload",
        "systemctl enable --now brigade-station.service brigade-station-renouvellement.timer",
      ],
    );
  });

  test("un compte brigade déjà là est gardé tel quel", (t) => {
    const systeme = doublures(t, { ...vierge, getent: "exit 0" });
    assert.equal(jouer(POSTINST, ["configure", ""], systeme.env).code, 0);
    assert.deepEqual(systeme.appels().filter((a) => a.startsWith("adduser")), []);
  });

  test("un groupe brigade sans compte : le compte le rejoint", (t) => {
    const systeme = doublures(t, { ...vierge, getent: '[ "$1" = group ] && exit 0; exit 2' });
    assert.equal(jouer(POSTINST, ["configure", ""], systeme.env).code, 0);
    assert.deepEqual(systeme.appels().filter((a) => a.startsWith("adduser")), ["adduser --quiet --system --ingroup brigade --home /home/brigade --shell /bin/bash brigade"]);
  });

  test("une mise à jour relance ce qui est activé sur le nouveau code, sans rien réactiver — les portes d'abord, quand elles tournent", (t) => {
    // Le renouvellement a été désactivé par l'administrateur ; la station, non. Ses portes tournent.
    const systeme = doublures(t, { getent: "exit 0", systemctl: '[ "$2" = is-enabled ] && { [ "$3" = brigade-station.service ] && exit 0; exit 1; }; exit 0' });
    const rendu = jouer(POSTINST, ["configure", "1.2.2"], systeme.env);
    assert.equal(rendu.code, 0, rendu.sortie);
    assert.deepEqual(
      systeme.appels().filter((a) => a.startsWith("systemctl") && !a.includes("is-enabled") && !a.includes("is-active")),
      ["systemctl daemon-reload", "systemctl restart brigade-station-porte.service", "systemctl restart brigade-station.service"],
    );
  });

  test("une mise à jour depuis une version sans portes ne les démarre pas elle-même : la station les réclame en repartant", (t) => {
    const systeme = doublures(t, { getent: "exit 0", systemctl: '[ "$2" = is-enabled ] && { [ "$3" = brigade-station.service ] && exit 0; exit 1; }; [ "$2" = is-active ] && exit 3; exit 0' });
    assert.equal(jouer(POSTINST, ["configure", "1.2.2"], systeme.env).code, 0);
    assert.deepEqual(
      systeme.appels().filter((a) => a.startsWith("systemctl") && !a.includes("is-enabled") && !a.includes("is-active")),
      ["systemctl daemon-reload", "systemctl restart brigade-station.service"],
    );
  });

  test("le retrait arrête la station et ses portes, sans toucher à son état", (t) => {
    const systeme = doublures(t, { systemctl: "" });
    assert.equal(jouer(join(PAQUET, "debian/prerm"), ["remove"], systeme.env).code, 0);
    assert.deepEqual(systeme.appels(), ["systemctl stop brigade-station.service brigade-station-renouvellement.timer brigade-station-porte.service"]);
  });

  test("une mise à jour n'arrête pas la station avant de poser le nouveau code", (t) => {
    const systeme = doublures(t, { systemctl: "" });
    assert.equal(jouer(join(PAQUET, "debian/prerm"), ["upgrade", "1.2.4"], systeme.env).code, 0);
    assert.deepEqual(systeme.appels(), []);
  });
});

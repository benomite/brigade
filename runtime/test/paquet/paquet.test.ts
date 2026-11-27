// Ce que publie la station (runtime/paquet) : les archives et le .deb, pont à sens unique vers
// elles (#4741) — ce que la commande de construction produit, et ce que le postinst du pont joue
// sur une machine qui a l'ancien layout. La commande d'installation du guide a ses tests
// (deploy/installer-station.test.ts). Ni root, ni vraie machine : `dpkg-deb` construit et ouvre le
// paquet, et les commandes du système que les scripts appellent sont des doublures qui notent
// leurs appels, sous une racine d'essai (BRIGADE_RACINE).
import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, describe, test, type TestContext } from "node:test";
import { cibleDuBinaire } from "../../paquet/binaire.ts";
import { jusqua, lancer, repertoireTemporaire } from "../outils.ts";

const PAQUET = join(import.meta.dirname, "../../paquet");
const CONSTRUIRE = join(PAQUET, "construire.ts");
const REFUS = 2;

const sansDpkgDeb = spawnSync("dpkg-deb", ["--version"]).status !== 0 && "`dpkg-deb` manque sur cette machine : le paquet ne s'y construit pas";

type Rendu = { code: number; sortie: string };

function construire(args: string[]): Promise<Rendu> {
  return new Promise((resoudre) => {
    const donnee = args.includes("--repo") || args.includes("--sans-identite");
    const identite = donnee ? [] : ["--repo", "acme/brigade", "--maintainer", "Test <test@example.org>"];
    const archives = args.includes("--node-linux-x64") ? [] : ["--sans-archives"];
    execFile(process.execPath, [CONSTRUIRE, ...args.filter((a) => a !== "--sans-identite"), ...identite, ...archives], { encoding: "utf8" }, (erreur, stdout, stderr) => {
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

  test("le dépôt et le mainteneur sont ceux qu'on a donnés", () => {
    assert.equal(champ("Maintainer"), "Test <test@example.org>");
    assert.equal(champ("Homepage"), "https://github.com/acme/brigade");
  });

  test("sans archive (--sans-archives) le pont ne porte que sa licence : ni runtime, ni node, ni unité", () => {
    const chemins = contenu().map((f) => f.chemin);
    assert.deepEqual(chemins.filter((c) => c.startsWith("/usr/lib") || c.startsWith("/etc") || /sudo/.test(c)), []);
  });

  test("son seul script dpkg est le postinst, du sh valide : ni prerm ni postrm, que le retrait ne touche pas la station", (t) => {
    const arbre = repertoireTemporaire(t);
    assert.equal(spawnSync("dpkg-deb", ["--control", deb, arbre]).status, 0);
    assert.deepEqual(readdirSync(arbre).filter((f) => f !== "control" && f !== "md5sums").sort(), ["postinst"]);
    const lu = spawnSync("sh", ["-n", join(arbre, "postinst")], { encoding: "utf8" });
    assert.equal(lu.status, 0, lu.stderr);
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

// Des binaires qui n'ont de `node` que l'en-tête : celui d'un ELF ou d'un Mach-O 64 bits.
function binaireFactice(fichier: string, os: "linux" | "darwin", arch: "x64" | "arm64"): string {
  const tete = Buffer.alloc(64);
  if (os === "linux") {
    tete.writeUInt32BE(0x7f454c46, 0);
    tete[4] = 2;
    tete[5] = 1;
    tete.writeUInt16LE(arch === "x64" ? 0x3e : 0xb7, 18);
  } else {
    tete.writeUInt32LE(0xfeedfacf, 0);
    tete.writeUInt32LE(arch === "x64" ? 0x01000007 : 0x0100000c, 4);
  }
  writeFileSync(fichier, tete);
  return fichier;
}

describe("les archives de la station (#4734)", { skip: sansDpkgDeb }, () => {
  let dossier = "";
  let sortie = "";
  let rendu: Rendu = { code: -1, sortie: "" };
  const archive = (os: string, arch: string) => join(sortie, `brigade-station-1.2.3-${os}-${arch}.tar.gz`);
  const pont = () => join(sortie, readdirSync(sortie).find((f) => f.endsWith(".deb")) ?? "");
  const contenuDuPont = () =>
    spawnSync("dpkg-deb", ["--contents", pont()], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
      .stdout.trim()
      .split("\n")
      .map((ligne) => {
        const [droits = "", proprietaire = "", , , , chemin = ""] = ligne.split(/\s+/);
        return { droits, proprietaire, chemin: chemin.replace(/^\.\//, "/") };
      });
  const liste = (os: string, arch: string) => spawnSync("tar", ["-tzf", archive(os, arch)], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).stdout.split("\n").map((l) => l.replace(/^\.\//, ""));

  before(async () => {
    dossier = mkdtempSync(join(tmpdir(), "brigade-archives-test-"));
    sortie = join(dossier, "construit");
    rendu = await construire([
      "--sortie", sortie, "--version", "1.2.3", "--node", fauxNode(dossier, "v99.0.0"),
      "--node-linux-x64", binaireFactice(join(dossier, "node-linux"), "linux", "x64"),
      "--node-darwin-arm64", binaireFactice(join(dossier, "node-darwin"), "darwin", "arm64"),
    ]);
  });
  after(() => rmSync(dossier, { recursive: true, force: true }));

  test("une commande produit une archive par plateforme, qui porte runtime, node, bin/brigade, install.sh et services", () => {
    assert.equal(rendu.code, 0, rendu.sortie);
    for (const [os, arch] of [["linux", "x64"], ["darwin", "arm64"]] as const) {
      const fichiers = liste(os, arch);
      for (const attendu of ["runtime/src/kitchen/main.ts", "node/bin/node", "bin/brigade", "install.sh", "services/"]) assert.ok(fichiers.includes(attendu), `${attendu} manque à l'archive ${os}-${arch}`);
      assert.ok(fichiers.includes("services/brigade-station.service"));
    }
  });

  test("le node de chaque archive est celui de son système et de son architecture", (t) => {
    for (const [os, arch] of [["linux", "x64"], ["darwin", "arm64"]] as const) {
      const lu = repertoireTemporaire(t);
      assert.equal(spawnSync("tar", ["-xzf", archive(os, arch), "-C", lu, "node/bin/node"]).status, 0);
      assert.deepEqual(cibleDuBinaire(join(lu, "node/bin/node")), { os, arch });
    }
  });

  test("les unités de l'archive pointent sous /opt/brigade-station/current, et le lanceur du Mac a son emplacement de plists", () => {
    const lu = spawnSync("tar", ["-xzOf", archive("linux", "x64"), "services/brigade-station.service"], { encoding: "utf8" });
    assert.match(lu.stdout, /^ExecStart=\/opt\/brigade-station\/current\/node\/bin\/node src\/kitchen\/main\.ts$/m);
    assert.doesNotMatch(lu.stdout, /\/usr\/lib\/brigade-station/);
    assert.ok(liste("darwin", "arm64").some((f) => f.startsWith("services/launchd/")));
  });

  // L'archive linux-x64 défaite, et l'emplacement que ses unités nomment (/opt/brigade-station/current) ramené dessus.
  const defaite = (t: TestContext) => {
    const arbre = repertoireTemporaire(t);
    assert.equal(spawnSync("tar", ["-xzf", archive("linux", "x64"), "-C", arbre]).status, 0);
    return arbre;
  };

  test("l'archive porte l'install.sh du dépôt, sa version et une commande brigade qui lance celle du runtime", (t) => {
    const arbre = defaite(t);
    assert.equal(readFileSync(join(arbre, "install.sh"), "utf8"), readFileSync(join(PAQUET, "../archive/install.sh"), "utf8"));
    assert.equal(readFileSync(join(arbre, "version"), "utf8"), "1.2.3\n");
    assert.match(readFileSync(join(arbre, "bin/brigade"), "utf8"), /brigade-command\/main\.ts/);
    assert.ok(existsSync(join(arbre, "runtime/src/brigade-command/main.ts")));
    const unite = readFileSync(join(arbre, "services/brigade-station-mise-a-jour.service"), "utf8");
    assert.match(unite, /^Environment=BRIGADE_MISE_A_JOUR_SOURCE=github:acme\/brigade$/m);
  });

  test("elle porte la consigne du second juge, celle de ce commit, et le runtime installé la lit (#2571)", (t) => {
    const arbre = defaite(t);
    assert.equal(readFileSync(join(arbre, "runtime/agents/kitchen/second-judge.md"), "utf8"), readFileSync(join(PAQUET, "../../agents/kitchen/second-judge.md"), "utf8"));
    const lu = spawnSync(process.execPath, ["--input-type=module", "-e", `import { lireLaConsigne } from ${JSON.stringify(join(arbre, "runtime/src/second-juge.ts"))}; process.stdout.write(lireLaConsigne());`], { encoding: "utf8" });
    assert.equal(lu.status, 0, lu.stderr);
    assert.match(lu.stdout, /Dans le doute, c'est `refuse`/);
  });

  test("le runtime de l'archive démarre la cuisine et ses portes telles que leurs unités les lancent — la cuisine filtrée, ses portes non", async (t) => {
    const arbre = defaite(t);
    const lireUnite = (nom: string) => {
      const unite = readFileSync(join(arbre, "services", nom), "utf8");
      return (cle: string) => [...unite.matchAll(new RegExp(`^${cle}=(.*)$`, "gm"))].map((m) => m[1] ?? "");
    };
    const dansArchive = (chemin: string) => join(arbre, chemin.replace("/opt/brigade-station/current", ""));
    // L'environnement d'une unité, la machine remplacée par un répertoire d'essai.
    const machine = repertoireTemporaire(t);
    const HOME = join(machine, "home");
    mkdirSync(HOME);
    const lancerUnite = (nom: string) => {
      const valeur = lireUnite(nom);
      const [dossierDeTravail = ""] = valeur("WorkingDirectory");
      const [binaire = "", script = ""] = (valeur("ExecStart")[0] ?? "").split(" ");
      assert.equal(binaire, "/opt/brigade-station/current/node/bin/node", nom);
      assert.ok(existsSync(dansArchive(binaire)), `${nom} : ExecStart lance ${binaire}, absent de l'archive`);
      assert.ok(existsSync(join(dansArchive(dossierDeTravail), script)), `${nom} : ExecStart lance ${script} depuis ${dossierDeTravail}, absent de l'archive`);
      assert.deepEqual(valeur("User"), ["brigade"], nom);
      const env: Record<string, string> = { HOME };
      for (const affectation of valeur("Environment")) {
        const [cle = "", ...reste] = affectation.split("=");
        env[cle] = reste.join("=").replaceAll("/var/lib/brigade", join(machine, "var/lib/brigade"));
      }
      assert.equal(env.BRIGADE_STATION_DIR, join(machine, "var/lib/brigade"), nom);
      assert.equal(env.BRIGADE_STATION_PORTES, join(machine, "var/lib/brigade/portes.json"), nom);
      // Le node du test, faute du vrai dans l'archive : c'est le code livré qui est éprouvé.
      return lancer(t, join(dansArchive(dossierDeTravail), script), [], env);
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
    assert.deepEqual(station("ExecStart"), ["/opt/brigade-station/current/node/bin/node src/kitchen/main.ts"]);
    const lancee = lancerUnite("brigade-station.service");
    // The kitchen says it is in service, under its own pid: what the station's update waits for.
    const enService = join(machine, "var/lib/brigade/en-service");
    await jusqua(() => existsSync(enService) && (JSON.parse(readFileSync(enService, "utf8")) as { pid: number }).pid === lancee.process.pid);
    assert.deepEqual((JSON.parse(readFileSync(enService, "utf8")) as { servis: string[] }).servis, []);
  });

  test("le pont porte l'archive linux-x64 et rien du système : ni runtime, ni node, ni unité, ni /etc, ni sudoers", () => {
    const fichiers = contenuDuPont();
    const chemins = fichiers.map((f) => f.chemin);
    assert.ok(chemins.includes("/usr/share/brigade-station/brigade-station-linux-x64.tar.gz"), chemins.join("\n"));
    assert.deepEqual(chemins.filter((c) => c.startsWith("/usr/lib") || c.startsWith("/etc") || /sudo/.test(c)), []);
    assert.deepEqual(fichiers.filter((f) => f.proprietaire !== "root/root"), []);
    const portee = spawnSync("tar", ["-tzf", "-"], { input: readFileSync(archive("linux", "x64")), encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    const dansLePont = spawnSync("dpkg-deb", ["--fsys-tarfile", pont()], { maxBuffer: 256 * 1024 * 1024 });
    const extrait = spawnSync("tar", ["-xOf", "-", "./usr/share/brigade-station/brigade-station-linux-x64.tar.gz"], { input: dansLePont.stdout, maxBuffer: 256 * 1024 * 1024 });
    assert.deepEqual(extrait.stdout, readFileSync(archive("linux", "x64")), "l'archive du pont n'est pas celle de la release");
    assert.ok(portee.stdout.includes("install.sh"));
  });

  describe("le postinst du pont, sur une machine au layout du .deb (#4741)", () => {
    const POSTINST = "postinst";
    // Une machine d'essai : la racine, des doublures de `dpkg`, `systemctl` et du reste, qui notent leurs appels.
    function machineDuDeb(t: TestContext, ecart: { sansArchive?: boolean } = {}) {
      const racine = repertoireTemporaire(t);
      const bin = join(repertoireTemporaire(t), "bin");
      mkdirSync(bin);
      const appels = join(bin, "appels");
      const base = join(bin, "base");
      writeFileSync(appels, "");
      writeFileSync(base, "installed\n");
      const doublure = (nom: string, corps: string) => {
        writeFileSync(join(bin, nom), `#!/bin/sh\necho "${nom} $*" >>"${appels}"\n${corps}\n`);
        chmodSync(join(bin, nom), 0o755);
      };
      doublure("systemctl", '[ "$1" = --quiet ] && exit 3\nexit 0');
      doublure("bwrap", "exit 0");
      doublure("chown", "exit 0");
      doublure("useradd", `touch "${bin}/compte"`);
      doublure("id", `[ "$2" = brigade ] && [ ! -e "${bin}/compte" ] && exit 1\nexec /usr/bin/id "$@"`);
      // dpkg : sa base est un fichier ; `dpkg -l` ne trouve plus le paquet une fois purgé (code 1, comme le vrai).
      doublure("dpkg", `case "$1" in\n  --purge) echo not-installed >"${base}" ;;\n  -l) grep -qx installed "${base}" && echo "ii  brigade-station" || { echo "dpkg-query: no packages found matching $2" >&2; exit 1; } ;;\nesac`);
      doublure("dpkg-query", `s=$(cat "${base}"); [ "$s" = not-installed ] && exit 1; echo "$s"`);
      // `setsid --fork` rend la main tout de suite ; la doublure joue le retrait sur place.
      doublure("setsid", 'shift\n"$@"');
      const env: NodeJS.ProcessEnv = { ...process.env, PATH: `${bin}:/usr/bin:/bin`, BRIGADE_RACINE: racine, BRIGADE_TERMINAL: "/nonexistent" };
      delete env.BRIGADE_GITHUB_TOKEN;
      delete env.BRIGADE_CLAUDE_TOKEN;

      // Ce que dpkg a posé : le pont (son archive, le postinst).
      const deb = pont();
      assert.equal(spawnSync("dpkg-deb", ["--extract", deb, racine]).status, 0);
      const controle = join(racine, "DEBIAN");
      assert.equal(spawnSync("dpkg-deb", ["--control", deb, controle]).status, 0);
      if (ecart.sansArchive) rmSync(join(racine, "usr/share/brigade-station/brigade-station-linux-x64.tar.gz"));

      // Ce que l'ancien paquet avait posé : son arbre, ses unités activées, l'état et les secrets de la machine.
      const ecrire = (chemin: string, texte: string, droits = 0o644) => {
        mkdirSync(dirname(join(racine, chemin)), { recursive: true });
        writeFileSync(join(racine, chemin), texte);
        chmodSync(join(racine, chemin), droits);
      };
      ecrire("usr/lib/brigade-station/runtime/package.json", '{"version":"0.old"}\n');
      ecrire("usr/lib/brigade-station/node/bin/node", "#!/bin/sh\n", 0o755);
      for (const unite of ["brigade-station.service", "brigade-station-porte.service", "brigade-station-mise-a-jour.service", "brigade-station-mise-a-jour.timer"]) ecrire(`usr/lib/systemd/system/${unite}`, `# ancienne ${unite}\nExecStart=/usr/lib/brigade-station/node/bin/node\n`);
      mkdirSync(join(racine, "etc/systemd/system/multi-user.target.wants"), { recursive: true });
      symlinkSync("/usr/lib/systemd/system/brigade-station.service", join(racine, "etc/systemd/system/multi-user.target.wants/brigade-station.service"));
      ecrire("var/lib/brigade/kitchen/projects", "acme/depot\n");
      ecrire("var/lib/brigade/kitchen/acme/depot/etat.json", '{"queue":[4741]}\n');
      ecrire("var/lib/brigade/reglages", "gel=non\n", 0o600);
      ecrire("etc/brigade/claude-token", "sk-ant-deja-la\n", 0o640);
      ecrire("etc/brigade/claude-token.cree", "2026-01-01\n");
      ecrire("etc/brigade/jeton.env", "BRIGADE_CLAUDE_TOKEN_FILE=/etc/brigade/claude-token\n");
      return {
        racine,
        env,
        appels: () => readFileSync(appels, "utf8").trim().split("\n").filter(Boolean),
        base: () => readFileSync(base, "utf8").trim(),
        dpkgL: () => spawnSync("dpkg", ["-l", "brigade-station"], { env, encoding: "utf8" }),
        jouer: (args: string[] = ["configure", "0.old"]) => jouer(join(controle, POSTINST), args, env),
        // Chaque chemin sous `dossier` avec son type, ses droits, sa cible ou son contenu.
        photo: (dossier: string): string[] => {
          const lire = (rel: string): string[] => {
            if (!existsSync(join(racine, dossier, rel))) return [];
            return readdirSync(join(racine, dossier, rel)).sort().flatMap((n) => {
              const chemin = join(rel, n);
              const st = lstatSync(join(racine, dossier, chemin));
              if (st.isSymbolicLink()) return [`${chemin} -> ${readlinkSync(join(racine, dossier, chemin))}`];
              if (st.isDirectory()) return [chemin + "/", ...lire(chemin)];
              return [`${chemin} ${(st.mode & 0o777).toString(8)} ${readFileSync(join(racine, dossier, chemin), "utf8")}`];
            });
          };
          return lire("");
        },
      };
    }

    test("depuis le layout du .deb : /opt, le même état et les mêmes secrets, les unités de l'archive activées, les anciennes parties, le paquet retiré de dpkg", (t) => {
      const m = machineDuDeb(t);
      const etat = m.photo("var/lib/brigade");
      const secrets = m.photo("etc/brigade");
      assert.equal(m.dpkgL().status, 0, "le paquet est d'abord installé");

      const rendu = m.jouer();
      assert.equal(rendu.code, 0, rendu.sortie);

      // Le layout /opt.
      const opt = join(m.racine, "opt/brigade-station");
      assert.equal(readlinkSync(join(opt, "current")), "1.2.3");
      for (const attendu of ["install.sh", "version", "runtime/src/kitchen/main.ts", "node/bin/node", "bin/brigade", "services/brigade-station.service"]) assert.ok(existsSync(join(opt, "1.2.3", attendu)), `${attendu} manque sous /opt`);
      assert.equal(readlinkSync(join(m.racine, "usr/local/bin/brigade")), "/opt/brigade-station/current/bin/brigade");
      // L'état et les secrets, tels quels — pas un token demandé, pas un fichier réécrit.
      assert.deepEqual(m.photo("var/lib/brigade"), etat);
      assert.deepEqual(m.photo("etc/brigade"), secrets);
      // Les unités de l'archive, posées, activées et démarrées ; celles de l'ancien paquet, parties.
      for (const unite of ["brigade-station.service", "brigade-station-porte.service", "brigade-station-mise-a-jour.service", "brigade-station-mise-a-jour.timer"]) {
        const posee = readFileSync(join(m.racine, "etc/systemd/system", unite), "utf8");
        assert.doesNotMatch(posee, /\/usr\/lib\/brigade-station/, unite);
        assert.equal(existsSync(join(m.racine, "usr/lib/systemd/system", unite)), false, `${unite} de l'ancien paquet reste`);
      }
      assert.match(readFileSync(join(m.racine, "etc/systemd/system/brigade-station.service"), "utf8"), /^ExecStart=\/opt\/brigade-station\/current\/node\/bin\/node /m);
      assert.equal(existsSync(join(m.racine, "usr/lib/brigade-station")), false, "l'arbre de l'ancien paquet reste");
      assert.equal(lstatSync(join(m.racine, "etc/systemd/system/multi-user.target.wants/brigade-station.service"), { throwIfNoEntry: false }), undefined, "le lien d'activation de l'ancienne unité reste");
      const appels = m.appels();
      assert.ok(appels.includes("systemctl daemon-reload"), appels.join("\n"));
      assert.ok(appels.includes("systemctl enable --now brigade-station-porte.service brigade-station.service brigade-station-mise-a-jour.timer"), appels.join("\n"));
      // Le paquet n'est plus installé pour dpkg ; ce qui est sous /opt n'a pas bougé.
      assert.equal(m.base(), "not-installed");
      assert.notEqual(m.dpkgL().status, 0);
      assert.ok(appels.includes("dpkg --purge brigade-station"), appels.join("\n"));
      assert.ok(existsSync(join(opt, "1.2.3/runtime/src/kitchen/main.ts")));
    });

    test("rejoué, il ne change rien : ni fichier, ni redémarrage", (t) => {
      const m = machineDuDeb(t);
      assert.equal(m.jouer().code, 0);
      const avant = ["opt", "etc", "var", "usr"].flatMap((d) => m.photo(d).map((l) => `${d}/${l}`));
      const appelsAvant = m.appels().length;
      const rendu = m.jouer(["configure", "1.2.3"]);
      assert.equal(rendu.code, 0, rendu.sortie);
      assert.deepEqual(["opt", "etc", "var", "usr"].flatMap((d) => m.photo(d).map((l) => `${d}/${l}`)), avant);
      const nouveaux = m.appels().slice(appelsAvant);
      assert.deepEqual(nouveaux.filter((a) => /^systemctl (restart|stop)/.test(a)), []);
      assert.equal(m.base(), "not-installed");
    });

    test("une station qui s'est déjà mise à jour par l'archive garde sa version courante : le pont rejoué ne la ramène pas en arrière", (t) => {
      const m = machineDuDeb(t);
      mkdirSync(join(m.racine, "opt/brigade-station/9.9.9"), { recursive: true });
      symlinkSync("9.9.9", join(m.racine, "opt/brigade-station/current"));
      assert.equal(m.jouer().code, 0);
      assert.equal(readlinkSync(join(m.racine, "opt/brigade-station/current")), "9.9.9");
    });

    test("un pont sans archive échoue en le disant, et ne touche à rien", (t) => {
      const m = machineDuDeb(t, { sansArchive: true });
      const etat = m.photo("var/lib/brigade");
      const rendu = m.jouer();
      assert.notEqual(rendu.code, 0);
      assert.match(rendu.sortie, /l'archive du paquet manque/);
      assert.deepEqual(m.photo("var/lib/brigade"), etat);
      assert.equal(existsSync(join(m.racine, "opt")), false);
      assert.equal(m.base(), "installed");
    });
  });

  test("l'archive darwin porte les cinq fichiers de l'ancre pf, charger-pf.sh exécutable", () => {
    const detail = spawnSync("tar", ["-tvzf", archive("darwin", "arm64")], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).stdout.split("\n");
    for (const f of ["brigade.pf.conf", "brigade.sudoers", "charger-pf.sh", "com.brigade.pf.plist", "com.brigade.gate.plist"]) {
      const ligne = detail.find((l) => l.endsWith(`runtime/paquet/macos/${f}`));
      assert.ok(ligne, `${f} absent de l'archive darwin`);
      assert.equal(ligne.startsWith("-rwxr-xr-x"), f === "charger-pf.sh", `${f} : mode ${ligne.slice(0, 10)}`);
    }
  });

  test("un node d'une autre plateforme est refusé, et rien n'est écrit", async () => {
    const autre = join(dossier, "refus");
    const refus = await construire(["--sortie", autre, "--version", "1.2.3", "--node", fauxNode(dossier, "v99.0.0"), "--node-linux-x64", binaireFactice(join(dossier, "mauvais"), "darwin", "arm64"), "--node-darwin-arm64", binaireFactice(join(dossier, "node-darwin"), "darwin", "arm64")]);
    assert.notEqual(refus.code, 0);
    assert.match(refus.sortie, /linux-x64.*darwin-arm64/);
    assert.equal(existsSync(join(autre, "brigade-station-1.2.3-linux-x64.tar.gz")), false);
  });
});

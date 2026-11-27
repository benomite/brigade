// Doublure de `apt-get install <paquet.deb>` pour une machine d'essai posée
// sous $FAUSSE_RACINE : ce que dpkg fait d'un paquet de la station, sans root.
// Le vrai `dpkg-deb` ouvre le paquet ; ses fichiers remplacent ceux de la
// version installée ; la version est notée là où la doublure de `dpkg-query`
// la lit ; puis le vrai postinst du paquet est joué (`configure <version
// d'avant>`), les chemins de la machine ramenés sous la racine d'essai — c'est lui
// qui recharge les unités et relance la station, par la doublure de
// `systemctl`. Un postinst en échec fait rendre 100, comme apt.
import { spawnSync } from "node:child_process";
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const racine = process.env.FAUSSE_RACINE ?? "";
const args = process.argv.slice(2);
mkdirSync(join(racine, "run/faux-systemd"), { recursive: true });
const [verbe] = args;
const paquet = args.at(-1) ?? "";
if (racine === "" || verbe !== "install" || !paquet.endsWith(".deb")) {
  console.error(`faux apt-get : « ${args.join(" ")} » n'est pas joué`);
  process.exit(100);
}

const ouvert = mkdtempSync(join(tmpdir(), "faux-apt-"));
try {
  const extrait = spawnSync("dpkg-deb", ["--raw-extract", paquet, ouvert], { encoding: "utf8" });
  if (extrait.status !== 0) {
    console.error(`E: ${paquet} ne s'ouvre pas : ${extrait.stderr.trim()}`);
    process.exit(100);
  }
  const champ = (nom: string) => new RegExp(`^${nom}: (.*)$`, "m").exec(readFileSync(join(ouvert, "DEBIAN/control"), "utf8"))?.[1]?.trim() ?? "";
  const nom = champ("Package");
  const version = champ("Version");
  const note = join(racine, "var/lib/dpkg-faux", nom);
  const avant = existsSync(note) ? readFileSync(note, "utf8").trim() : "";
  appendFileSync(join(racine, "run/faux-systemd/appels"), `apt-get install ${nom} ${version}\n`);

  // Les fichiers du paquet, à la place de ceux de la version d'avant.
  rmSync(join(racine, "usr/lib", nom), { recursive: true, force: true });
  cpSync(join(ouvert, "usr"), join(racine, "usr"), { recursive: true, force: true });
  mkdirSync(join(racine, "var/lib/dpkg-faux"), { recursive: true });
  writeFileSync(note, version);

  const postinst = join(ouvert, "DEBIAN/postinst");
  if (existsSync(postinst)) {
    const ramene = join(ouvert, "postinst.essai");
    // Les chemins de la machine, sous la racine d'essai — la bascule y reçoit
    // la sienne —, et le `node` du paquet remplacé par celui du test.
    const ramenes = readFileSync(postinst, "utf8")
      .replaceAll("/run/systemd/system", join(racine, "run/systemd/system"))
      .replaceAll("/etc/systemd/system", join(racine, "etc/systemd/system"))
      .replace(/^RACINE=\/$/m, `RACINE=${racine}`)
      .replace(/^NODE=\/usr\/lib\/brigade-station\/node\/bin\/node$/m, `NODE=${process.execPath}`)
      .replaceAll("=/usr/lib/brigade-station/runtime/", `=${racine}/usr/lib/brigade-station/runtime/`);
    writeFileSync(ramene, ramenes);
    const joue = spawnSync("sh", [ramene, "configure", avant], { stdio: "inherit" });
    if (joue.status !== 0) {
      console.error(`E: le postinst de ${nom} ${version} a rendu ${joue.status}`);
      process.exit(100);
    }
  }
} finally {
  rmSync(ouvert, { recursive: true, force: true });
}

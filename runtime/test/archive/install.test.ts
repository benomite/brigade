// The Linux install script of the archive (runtime/archive/install.sh), run
// against a temporary root: no root, no systemd, no account. `useradd`,
// `systemctl` and `chown` are stubs that note their calls.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { repertoireTemporaire } from "../outils.ts";
import { posixOnly } from "../support/plateforme.ts";

const SOURCE = join(import.meta.dirname, "../../archive");

// The unpacked archive: install.sh, services/, a version and a bin/brigade.
function archive(t: TestContext): string {
  const dir = join(repertoireTemporaire(t), "archive");
  mkdirSync(join(dir, "bin"), { recursive: true });
  cpSync(join(SOURCE, "services"), join(dir, "services"), { recursive: true });
  cpSync(join(SOURCE, "install.sh"), join(dir, "install.sh"));
  writeFileSync(join(dir, "version"), "1.2.3\n");
  writeFileSync(join(dir, "bin/brigade"), "#!/bin/sh\n");
  chmodSync(join(dir, "bin/brigade"), 0o755);
  return dir;
}

function machine(t: TestContext, without: string[] = []) {
  const bin = join(repertoireTemporaire(t), "bin");
  mkdirSync(bin);
  const calls = join(bin, "calls");
  // Only the tools the script needs, so a bwrap of the host is never found.
  for (const tool of ["sh", "cat", "chmod", "cmp", "cp", "dirname", "ln", "mkdir", "mv", "readlink", "rm", "tr", "uname", "id"]) {
    for (const dir of ["/usr/bin", "/bin"]) {
      if (existsSync(join(dir, tool))) {
        if (tool !== "id") symlinkSync(join(dir, tool), join(bin, tool));
        break;
      }
    }
  }
  writeFileSync(calls, "");
  for (const name of ["bwrap", "useradd", "systemctl", "chown"].filter((n) => !without.includes(n))) {
    writeFileSync(join(bin, name), `#!/bin/sh\necho "${name} $*" >>"${calls}"\n${name === "systemctl" ? "[ \"$1\" = --quiet ] && exit 3\n" : ""}exit 0\n`);
    chmodSync(join(bin, name), 0o755);
  }
  // `id -u brigade` fails until useradd ran: the account does not exist.
  writeFileSync(join(bin, "id"), `#!/bin/sh\n[ "$2" = brigade ] && exit 1\nexec /usr/bin/id "$@"\n`);
  chmodSync(join(bin, "id"), 0o755);
  const racine = join(repertoireTemporaire(t), "racine");
  mkdirSync(racine);
  return {
    racine,
    calls: () => readFileSync(calls, "utf8").trim().split("\n").filter(Boolean),
    run: (dir: string, extra: NodeJS.ProcessEnv = {}) => {
      const r = spawnSync("sh", [join(dir, "install.sh")], {
        encoding: "utf8",
        env: { ...process.env, PATH: bin, BRIGADE_RACINE: racine, BRIGADE_TERMINAL: "/nonexistent", BRIGADE_GITHUB_TOKEN: "ghp_x", BRIGADE_CLAUDE_TOKEN: "sk-ant-x", ...extra },
      });
      return { code: r.status ?? -1, out: r.stdout + r.stderr };
    },
  };
}

// Every path under `dir` with its type, mode, link target and content.
function tree(dir: string, rel = ""): string[] {
  return readdirSync(join(dir, rel)).sort().flatMap((name) => {
    const path = join(rel, name);
    const st = lstatSync(join(dir, path));
    const base = `${path} ${(st.mode & 0o7777).toString(8)}`;
    if (st.isSymbolicLink()) return [`${base} -> ${readlinkSync(join(dir, path))}`];
    if (st.isDirectory()) return [base, ...tree(dir, path)];
    return [`${base} ${readFileSync(join(dir, path), "utf8").length}`];
  });
}
const mode = (path: string) => (lstatSync(path).mode & 0o777).toString(8);

describe("install.sh on Linux", { skip: posixOnly("install.sh is a POSIX script for Linux") }, () => {
  test("lays out the archive, the account, the links, the units and the modes", (t) => {
    const m = machine(t);
    const r = m.run(archive(t));
    assert.equal(r.code, 0, r.out);
    const { racine } = m;
    assert.ok(m.calls().some((c) => c.startsWith("useradd") && c.includes("brigade")));
    assert.ok(existsSync(join(racine, "opt/brigade-station/1.2.3/bin/brigade")));
    assert.equal(readlinkSync(join(racine, "opt/brigade-station/current")), "1.2.3");
    assert.equal(readlinkSync(join(racine, "usr/local/bin/brigade")), "/opt/brigade-station/current/bin/brigade");
    assert.equal(mode(join(racine, "etc/brigade")), "750");
    assert.equal(mode(join(racine, "var/lib/brigade")), "750");
    assert.equal(mode(join(racine, "etc/brigade/github.env")), "600");
    assert.equal(readFileSync(join(racine, "etc/brigade/github.env"), "utf8"), "GH_TOKEN=ghp_x\n");
    assert.equal(readFileSync(join(racine, "etc/brigade/claude-token"), "utf8"), "sk-ant-x\n");
    assert.match(readFileSync(join(racine, "etc/brigade/jeton.env"), "utf8"), /BRIGADE_CLAUDE_TOKEN_FILE=\/etc\/brigade\/claude-token/);
    const units = join(racine, "etc/systemd/system");
    const station = readFileSync(join(units, "brigade-station.service"), "utf8");
    assert.match(station, /^IPAddressDeny=any$/m);
    assert.match(station, /^IPAddressAllow=localhost$/m);
    assert.match(station, /^Environment=BRIGADE_SANDBOX_HIDDEN=\/var\/lib\/brigade:\/etc\/brigade$/m);
    for (const unit of ["brigade-station.service", "brigade-station-porte.service", "brigade-station-mise-a-jour.service", "brigade-station-mise-a-jour.timer"]) {
      const text = readFileSync(join(units, unit), "utf8");
      assert.ok(!text.includes("/usr/lib/brigade-station"), unit);
      if (!unit.endsWith(".timer")) assert.match(text, /\/opt\/brigade-station\/current\//, unit);
    }
    assert.ok(m.calls().some((c) => c.startsWith("systemctl enable --now") && c.includes("brigade-station.service") && c.includes("brigade-station-porte.service")));
  });

  test("a second run changes nothing", (t) => {
    const m = machine(t);
    const dir = archive(t);
    assert.equal(m.run(dir).code, 0);
    const before = tree(m.racine);
    const r = m.run(dir, { BRIGADE_GITHUB_TOKEN: "", BRIGADE_CLAUDE_TOKEN: "" });
    assert.equal(r.code, 0, r.out);
    assert.deepEqual(tree(m.racine), before);
  });

  test("without bwrap it refuses in one line, and writes nothing", (t) => {
    const m = machine(t, ["bwrap"]);
    const r = m.run(archive(t));
    assert.notEqual(r.code, 0);
    assert.equal(r.out.trim().split("\n").length, 1, r.out);
    assert.match(r.out, /bwrap/);
    assert.deepEqual(readdirSync(m.racine), []);
  });
});

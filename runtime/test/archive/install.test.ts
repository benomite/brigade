// The install script of the archive (runtime/archive/install.sh), run against a
// temporary root: no root, no systemd, no account. On Linux `useradd`, `systemctl`
// and `chown` are stubs that note their calls; for macOS `uname` says Darwin and
// `dscl`, `launchctl` and `chown` are the stubs.
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
    run: (dir: string, extra: NodeJS.ProcessEnv = {}, args: string[] = []) => {
      const r = spawnSync("sh", [join(dir, "install.sh"), ...args], {
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

  test("--update refreshes the units only: `current`, the account, the tokens and the services stay as they are", (t) => {
    const m = machine(t);
    const first = archive(t);
    assert.equal(m.run(first).code, 0);
    // A newer version, unpacked where the station's update puts it, with a changed unit.
    const next = join(m.racine, "opt/brigade-station/1.3.0");
    cpSync(first, next, { recursive: true });
    writeFileSync(join(next, "version"), "1.3.0\n");
    const unit = join(next, "services/brigade-station.service");
    writeFileSync(unit, `${readFileSync(unit, "utf8")}# 1.3.0\n`);
    const before = m.calls().length;
    const r = m.run(next, { BRIGADE_GITHUB_TOKEN: "", BRIGADE_CLAUDE_TOKEN: "" }, ["--update"]);
    assert.equal(r.code, 0, r.out);
    assert.equal(readlinkSync(join(m.racine, "opt/brigade-station/current")), "1.2.3");
    assert.match(readFileSync(join(m.racine, "etc/systemd/system/brigade-station.service"), "utf8"), /# 1\.3\.0/);
    assert.deepEqual(m.calls().slice(before), ["systemctl daemon-reload"]);
  });

  test("--update needs no bwrap and writes no state on a machine without the station", (t) => {
    const m = machine(t, ["bwrap", "useradd"]);
    const r = m.run(archive(t), {}, ["--update"]);
    assert.equal(r.code, 0, r.out);
    assert.ok(!existsSync(join(m.racine, "opt")) && !existsSync(join(m.racine, "etc/brigade")));
    assert.deepEqual(m.calls(), ["systemctl daemon-reload"]);
  });

  test("an unknown argument is refused", (t) => {
    const m = machine(t);
    const r = m.run(archive(t), {}, ["--nope"]);
    assert.equal(r.code, 1);
    assert.match(r.out, /unknown argument/);
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

// A Mac: `uname` says Darwin, `dscl` knows no account until it created one.
function mac(t: TestContext) {
  const bin = join(repertoireTemporaire(t), "bin");
  mkdirSync(bin);
  const calls = join(bin, "calls");
  for (const tool of ["sh", "cat", "chmod", "cmp", "cp", "dirname", "ln", "mkdir", "mv", "readlink", "rm", "tr", "grep"]) {
    for (const dir of ["/usr/bin", "/bin"]) {
      if (existsSync(join(dir, tool))) {
        symlinkSync(join(dir, tool), join(bin, tool));
        break;
      }
    }
  }
  writeFileSync(calls, "");
  const stub = (name: string, body: string) => {
    writeFileSync(join(bin, name), `#!/bin/sh\n${body}\n`);
    chmodSync(join(bin, name), 0o755);
  };
  stub("uname", 'echo Darwin');
  stub("chown", `echo "chown $*" >>"${calls}"`);
  // The account exists once `-create /Users/brigade` ran; the lists hold a taken UID.
  stub("dscl", `echo "dscl $*" >>"${calls}"
case "$2" in
  -read) [ -e "${bin}/made-$(echo "$3" | tr / -)" ]; exit $? ;;
  -create) : >"${bin}/made-$(echo "$3" | tr / -)"; exit 0 ;;
  -list) echo "root 0"; echo "_www 70"; echo "daemon 300"; exit 0 ;;
esac`);
  stub("launchctl", `echo "launchctl $*" >>"${calls}"`);
  const racine = join(repertoireTemporaire(t), "racine");
  mkdirSync(racine);
  return {
    racine,
    calls: () => readFileSync(calls, "utf8").trim().split("\n").filter(Boolean),
    run: (dir: string, extra: NodeJS.ProcessEnv = {}, args: string[] = []) => {
      const r = spawnSync("sh", [join(dir, "install.sh"), ...args], {
        encoding: "utf8",
        env: { ...process.env, PATH: bin, BRIGADE_RACINE: racine, BRIGADE_TERMINAL: "/nonexistent", BRIGADE_GITHUB_TOKEN: "ghp_x", BRIGADE_CLAUDE_TOKEN: "sk-ant-x", ...extra },
      });
      return { code: r.status ?? -1, out: r.stdout + r.stderr };
    },
  };
}

// The value of `key` in a plist: the line after it.
function plistValue(text: string, key: string): string | undefined {
  return text.match(new RegExp(`<key>${key}</key>\\s*<(?:string|integer)>([^<]*)<`))?.[1];
}

describe("install.sh on macOS", { skip: posixOnly("install.sh is a POSIX script") }, () => {
  const PLISTS = ["com.brigade.station.plist", "com.brigade.station.gate.plist", "com.brigade.station.update.plist"];

  test("creates the hidden account below 500, the layout, the plists and starts them", (t) => {
    const m = mac(t);
    const r = m.run(archive(t));
    assert.equal(r.code, 0, r.out);
    const { racine } = m;
    const calls = m.calls();
    const user = calls.filter((c) => c.startsWith("dscl . -create /Users/brigade"));
    const uid = Number(user.find((c) => c.includes(" UniqueID "))?.split(" ").pop());
    assert.ok(uid >= 300 && uid < 500 && uid !== 300, `UID ${uid}`);
    assert.ok(user.some((c) => c.endsWith(" IsHidden 1")));
    assert.ok(user.some((c) => c.endsWith(" UserShell /usr/bin/false")));
    assert.ok(calls.some((c) => c === `dscl . -create /Groups/brigade PrimaryGroupID ${uid}`));
    assert.equal(readlinkSync(join(racine, "opt/brigade-station/current")), "1.2.3");
    assert.equal(readlinkSync(join(racine, "usr/local/bin/brigade")), "/opt/brigade-station/current/bin/brigade");
    const state = join(racine, "Library/Application Support/brigade");
    assert.equal(mode(state), "750");
    assert.equal(mode(join(state, "etc")), "700");
    assert.equal(readFileSync(join(state, "etc/github.env"), "utf8"), "GH_TOKEN=ghp_x\n");
    assert.equal(mode(join(state, "etc/github.env")), "600");
    assert.equal(readFileSync(join(state, "etc/claude-token"), "utf8"), "sk-ant-x\n");
    assert.ok(calls.includes(`chown brigade:brigade ${state}/etc`));
    assert.ok(calls.includes(`chown brigade:brigade ${state}`));
    assert.ok(existsSync(join(state, "log")) && existsSync(join(state, "home")));

    const daemons = join(racine, "Library/LaunchDaemons");
    const text = (name: string) => readFileSync(join(daemons, name), "utf8");
    const station = text("com.brigade.station.plist");
    assert.equal(plistValue(station, "UserName"), "brigade");
    assert.equal(plistValue(station, "WorkingDirectory"), "/opt/brigade-station/current/runtime");
    assert.match(station, /<string>\/opt\/brigade-station\/current\/node\/bin\/node<\/string>\s*<string>src\/kitchen\/main\.ts<\/string>/);
    assert.equal(plistValue(station, "BRIGADE_STATION_DIR"), "/Library/Application Support/brigade");
    assert.equal(plistValue(station, "BRIGADE_SANDBOX_HIDDEN"), "/Library/Application Support/brigade/etc");
    assert.doesNotMatch(station, /BRIGADE_SANDBOX_BIN/);
    const gate = text("com.brigade.station.gate.plist");
    assert.equal(plistValue(gate, "UserName"), "brigade");
    assert.match(gate, /\/opt\/brigade-station\/current\/node\/bin\/node<\/string>\s*<string>src\/station\/tenir-portes\.ts/);
    const update = text("com.brigade.station.update.plist");
    assert.equal(plistValue(update, "StartInterval"), "600");
    assert.doesNotMatch(update, /<key>UserName<\/key>/);
    assert.match(update, /\/opt\/brigade-station\/current\/node\/bin\/node<\/string>\s*<string>src\/mise-a-jour\/main\.ts/);
    for (const name of PLISTS) {
      assert.ok(!text(name).includes("/usr/lib/brigade-station"), name);
      assert.ok(calls.includes(`chown root:wheel ${daemons}/${name}`), name);
      assert.ok(calls.includes(`launchctl bootstrap system ${daemons}/${name}`), name);
    }
    assert.ok(!existsSync(join(racine, "etc/systemd")));
  });

  test("--update rewrites the plists only: no account, no `current`, no launchctl", (t) => {
    const m = mac(t);
    const dir = archive(t);
    const r = m.run(dir, {}, ["--update"]);
    assert.equal(r.code, 0, r.out);
    assert.ok(m.calls().every((c) => c.startsWith("chown root:wheel ")), m.calls().join("\n"));
    assert.ok(existsSync(join(m.racine, "Library/LaunchDaemons/com.brigade.station.plist")));
    assert.ok(!existsSync(join(m.racine, "opt")));
  });

  test("a second run changes nothing and reloads nothing", (t) => {
    const m = mac(t);
    const dir = archive(t);
    assert.equal(m.run(dir).code, 0);
    const before = tree(m.racine);
    const called = m.calls().length;
    const r = m.run(dir, { BRIGADE_GITHUB_TOKEN: "", BRIGADE_CLAUDE_TOKEN: "" });
    assert.equal(r.code, 0, r.out);
    assert.deepEqual(tree(m.racine), before);
    const again = m.calls().slice(called);
    assert.ok(!again.some((c) => c.startsWith("dscl . -create") || c.startsWith("launchctl bootstrap") || c.startsWith("launchctl bootout") || c.startsWith("launchctl kickstart")), again.join("\n"));
  });

  test("the plists of the archive pass plutil -lint", { skip: process.platform !== "darwin" && "plutil is macOS's" }, () => {
    for (const name of PLISTS) {
      const r = spawnSync("plutil", ["-lint", join(SOURCE, "services/launchd", name)], { encoding: "utf8" });
      assert.equal(r.status, 0, r.stdout + r.stderr);
    }
  });
});

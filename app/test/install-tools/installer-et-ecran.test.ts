// L'installation d'un clic de gh et de claude (#4350) au-delà des tests d'acceptation : l'archive de chaque machine, le
// PATH de l'app, le vrai téléchargement (un faux `fetch`, une vraie archive défaite par `tar`), le chemin natif de
// claude sans npm, la tenue de l'écran (installing, failed, done) et ses boutons.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { archiveDeGh, commandeDe, enTeteDuPath, lancerPourDeBon, pourLaVue, rattacherGhPose, RELEASES_GH, telechargerPourDeBon, tenirInstallation, type Lancer } from "../../src/install-tools/install-tools.ts";
import { aMontrer, CLAUDE_INSTALLE, DEJA_INSTALLE, EN_INSTALLATION, IMPOSSIBLE, INSTALLER, LA_PAGE, oublierLInstallation, poserLesOutils, SE_CONNECTER_A_CLAUDE, tenirLesOutils } from "../../src/vue/outils-requis/outils-requis.js";
import { SANS_POSIX } from "../aides/posix.ts";
import { Faux, repos } from "../aides/fausse-vue.ts";

const doc = { createElement: (balise: string) => new Faux(balise) } as never;
const installation = { texte: "Install the GitHub CLI.", lien: "https://cli.github.com" };
const pose = (etat: object, geste: object = { ouvrir: () => {}, verifier: () => {}, installer: () => {} }) => {
  const lieu = new Faux("div");
  lieu.replaceChildren(...(poserLesOutils(doc, etat as never, geste as never) as Faux[]));
  return lieu;
};
const boutonDit = (lieu: Faux, texte: string) => lieu.dessous("button").find((b) => b.textContent === texte) ?? assert.fail(`no '${texte}' button`);

test("each machine gets the GitHub CLI archive its releases name; any other gets none", () => {
  assert.equal(archiveDeGh("darwin", "arm64"), "macOS_arm64.zip");
  assert.equal(archiveDeGh("darwin", "x64"), "macOS_amd64.zip");
  assert.equal(archiveDeGh("win32", "x64"), "windows_amd64.zip");
  assert.equal(archiveDeGh("win32", "arm64"), "windows_arm64.zip");
  assert.equal(archiveDeGh("linux", "x64"), "linux_amd64.tar.gz");
  assert.equal(archiveDeGh("linux", "arm64"), "linux_arm64.tar.gz");
  assert.equal(archiveDeGh("linux", "ia32"), undefined);
  assert.equal(archiveDeGh("freebsd", "x64"), undefined);
  const install = (plateforme: NodeJS.Platform, arch = "x64") => tenirInstallation({ plateforme, arch, env: {}, dossier: "/x", telecharger: async () => {}, rendre: () => {} });
  assert.equal(install("darwin").possible("claude"), true);
  assert.equal(install("win32").possible("claude"), true);
  assert.equal(install("linux").possible("claude"), true);
  assert.equal(install("freebsd").possible("claude"), false);
  assert.equal(install("linux").possible("git"), false);
  assert.equal(install("linux", "ia32").possible("gh"), false);
});

test("the tool's folder goes first on the app's PATH once; under Windows on its `Path`, with `;`", () => {
  const env: Record<string, string | undefined> = { Path: "C:\\a;C:\\b" };
  enTeteDuPath(env, "C:\\b", "win32");
  assert.deepEqual(env, { Path: "C:\\b;C:\\a" });
  const posix: Record<string, string | undefined> = {};
  enTeteDuPath(posix, "/t/bin", "linux");
  assert.equal(posix.PATH, "/t/bin");
});

test("at launch, a gh the app put before is put back first on its PATH; with none, the PATH is left alone", { skip: SANS_POSIX }, () => {
  const dossier = mkdtempSync(join(tmpdir(), "gh-pose-"));
  const env: Record<string, string | undefined> = { PATH: "/usr/bin" };
  assert.equal(rattacherGhPose(env, dossier, "linux"), false);
  assert.equal(env.PATH, "/usr/bin");
  mkdirSync(join(dossier, "bin"));
  writeFileSync(join(dossier, "bin", "gh"), "");
  assert.equal(rattacherGhPose(env, dossier, "linux"), true);
  assert.equal(env.PATH, `${join(dossier, "bin")}:/usr/bin`);
});

test("gh: the official archive of this machine is asked for; a gh that does not answer is a failure with its reason; two clicks download once", async () => {
  const urls: string[] = [];
  let liberer = () => {};
  const retenu = new Promise<void>((resolu) => (liberer = resolu));
  const env: Record<string, string | undefined> = { PATH: "/usr/bin" };
  const install = tenirInstallation({
    plateforme: "darwin",
    arch: "arm64",
    env,
    dossier: "/home/u/tools/gh",
    telecharger: async (url) => void (urls.push(url), await retenu),
    lancer: async () => ({ code: 127, sortie: "line 1\ngh: not found" }),
    rendre: () => {},
  });
  const un = install.installer("gh");
  const deux = install.installer("gh");
  liberer();
  await Promise.all([un, deux]);
  assert.deepEqual(urls, [`${RELEASES_GH}/download/v{version}/gh_{version}_macOS_arm64.zip`]);
  assert.equal(install.etat("gh").phase, "failed");
  assert.match(install.etat("gh").raison ?? "", /gh: not found/);
  assert.equal(env.PATH, "/home/u/tools/gh/bin:/usr/bin");
});

test("claude without npm: the native installer, then ~/.local/bin on the app's PATH before `claude --version`; under Windows, PowerShell", async () => {
  for (const [plateforme, attendu] of [["linux", /^bash -c curl -fsSL https:\/\/claude\.ai\/install\.sh \| bash$/], ["win32", /^powershell .*irm https:\/\/claude\.ai\/install\.ps1 \| iex$/]] as const) {
    const appels: string[] = [];
    const env: Record<string, string | undefined> = { PATH: "/usr/bin" };
    const lancer: Lancer = async (commande, args, options) => {
      appels.push([commande, ...args].join(" "));
      if (commande === "npm") return { code: 127, sortie: "npm: not found" };
      if (commande === "claude") return options.env.PATH?.includes(".local") ? { code: 0, sortie: "1.0.0" } : { code: 127, sortie: "not found" };
      return { code: 0, sortie: "" };
    };
    const install = tenirInstallation({ plateforme, env, dossier: "/x", maison: "/home/u", telecharger: async () => {}, lancer, rendre: () => {} });
    await install.installer("claude");
    assert.equal(install.etat("claude").phase, "done", appels.join(" | "));
    assert.match(appels[1] ?? "", attendu);
    assert.equal(appels.filter((a) => a.startsWith("npm install")).length, 0);
  }
});

test("claude with npm: npm installs it, the PATH is left as it was; a claude that does not answer is a failure", async () => {
  const env: Record<string, string | undefined> = { PATH: "/usr/bin" };
  const install = tenirInstallation({
    plateforme: "linux",
    env,
    dossier: "/x",
    maison: "/home/u",
    telecharger: async () => {},
    lancer: async (commande) => (commande === "claude" ? { code: 1, sortie: "claude: not found" } : { code: 0, sortie: "10.0.0" }),
    rendre: () => {},
  });
  await install.installer("claude");
  assert.equal(env.PATH, "/usr/bin");
  assert.equal(install.etat("claude").phase, "failed");
  assert.match(install.etat("claude").raison ?? "", /does not answer: claude: not found/);
});

test("under Windows npm goes through cmd.exe; no command opens a window", () => {
  assert.deepEqual(commandeDe("npm", ["--version"], "win32").programme, "cmd.exe");
  assert.deepEqual(commandeDe("npm", ["--version"], "win32").args, ["/d", "/s", "/c", "npm", "--version"]);
  assert.deepEqual(commandeDe("npm", ["--version"], "linux"), commandeDe("npm", ["--version"], "darwin"));
  assert.equal(commandeDe("npm", ["--version"], "linux").programme, "npm");
  assert.equal(commandeDe("gh", ["--version"], "win32").programme, "gh");
  assert.equal(commandeDe("gh", [], "win32").options.windowsHide, true);
});

test("a real command is run in the env given: its code and what it said", { skip: SANS_POSIX }, async () => {
  assert.deepEqual(await lancerPourDeBon("sh", ["-c", "echo $X"], { env: { X: "oui", PATH: process.env.PATH } }), { code: 0, sortie: "oui" });
  assert.deepEqual(await lancerPourDeBon("sh", ["-c", "echo non >&2; exit 3"], { env: { PATH: process.env.PATH } }), { code: 3, sortie: "non" });
});

test("the real download reads the latest version, takes the archive, unpacks it in place; a refused download or a missing tag throws and leaves nothing", { skip: SANS_POSIX }, async (t) => {
  const source = mkdtempSync(join(tmpdir(), "gh-source-"));
  mkdirSync(join(source, "gh_2.5.0_linux_amd64", "bin"), { recursive: true });
  writeFileSync(join(source, "gh_2.5.0_linux_amd64", "bin", "gh"), "#!/bin/sh\necho 'gh version 2.5.0'\n");
  chmodSync(join(source, "gh_2.5.0_linux_amd64", "bin", "gh"), 0o755);
  execFileSync("tar", ["-czf", join(source, "a.tar.gz"), "-C", source, "gh_2.5.0_linux_amd64"]);
  const archive = execFileSync("cat", [join(source, "a.tar.gz")]);
  const demandes: string[] = [];
  let repond = (url: string): Response => (url.endsWith("/latest") ? new Response(null, { status: 302, headers: { location: `${RELEASES_GH}/tag/v2.5.0` } }) : new Response(archive));
  const vrai = globalThis.fetch;
  globalThis.fetch = (async (url: string) => (demandes.push(String(url)), repond(String(url)))) as typeof fetch;
  t.after(() => void (globalThis.fetch = vrai));
  const racine = join(mkdtempSync(join(tmpdir(), "gh-tools-")), "tools");
  const dossier = join(racine, "gh");

  // Un dossier qui n'existe pas encore : il est créé.
  await telechargerPourDeBon(`${RELEASES_GH}/download/v{version}/gh_{version}_linux_amd64.tar.gz`, dossier);
  assert.deepEqual(demandes, [`${RELEASES_GH}/latest`, `${RELEASES_GH}/download/v2.5.0/gh_2.5.0_linux_amd64.tar.gz`]);
  assert.match(execFileSync(join(dossier, "bin", "gh"), { encoding: "utf8" }), /2\.5\.0/);
  assert.deepEqual(readdirSync(racine), ["gh"]);
  // Une seconde fois, sur un gh déjà posé et le reste d'un essai coupé : le nouveau prend la place.
  writeFileSync(join(dossier, "ancien"), "");
  mkdirSync(join(`${dossier}.part`, "reste"), { recursive: true });
  await telechargerPourDeBon(`${RELEASES_GH}/download/v{version}/gh_{version}_linux_amd64.tar.gz`, dossier);
  assert.deepEqual(readdirSync(dossier), ["bin"]);
  assert.deepEqual(readdirSync(racine), ["gh"]);

  repond = (url) => (url.endsWith("/latest") ? new Response(null, { status: 302, headers: { location: `${RELEASES_GH}/tag/v2.5.0` } }) : new Response("no", { status: 404 }));
  await assert.rejects(telechargerPourDeBon(`${RELEASES_GH}/download/v{version}/gh_{version}_linux_amd64.tar.gz`, join(racine, "autre")), /HTTP 404/);
  repond = () => new Response(null, { status: 500 });
  await assert.rejects(telechargerPourDeBon(`${RELEASES_GH}/download/v{version}/gh_{version}_linux_amd64.tar.gz`, join(racine, "autre")), /could not be read \(HTTP 500\)/);
  repond = () => new Response("not an archive");
  await assert.rejects(telechargerPourDeBon("https://example.test/gh.tar.gz", join(racine, "autre")), /could not be unpacked/);
  assert.equal(existsSync(join(racine, "autre")), false);
  assert.deepEqual(readdirSync(racine), ["gh"]);
});

test("the screen holds the install: idle offers it, a click goes installing then done and checks again, and the step resumes", async () => {
  let gh = false;
  const rendus: string[] = [];
  let pret = 0;
  let liberer = () => {};
  const retenu = new Promise<void>((resolu) => (liberer = resolu));
  const pont = {
    outilsManquants: async () => (gh ? [] : [{ outil: "gh" as const, installation, installable: true }]),
    installerOutil: async () => (await retenu, (gh = true), { phase: "done" as const }),
  };
  const outils = tenirLesOutils({ pont, rendre: () => rendus.push(outils.etat.installation?.phase ?? "-"), quandPret: () => pret++ });
  await outils.verifier();
  assert.deepEqual(outils.etat.installation, { installable: true, phase: "idle" });
  const fini = outils.installer();
  assert.equal(outils.etat.installation?.phase, "installing");
  const pendant = pose(outils.etat);
  assert.equal(pendant.dessous("p").find((p) => p.role === "status")?.textContent, EN_INSTALLATION("gh"));
  assert.ok(boutonDit(pendant, INSTALLER("gh")).disabled && boutonDit(pendant, DEJA_INSTALLE).disabled);
  assert.equal(boutonDit(pendant, LA_PAGE("gh")).disabled, false, "the written guidance stays open while it installs");
  await outils.installer();
  liberer();
  await fini;
  assert.equal(pret, 1);
  assert.equal(outils.etat.manque, undefined);
  assert.ok(rendus.includes("installing") && rendus.includes("done"));
  assert.deepEqual(pose(outils.etat).dessous("button"), []);
});

test("an install that throws or ends without done is failed with a reason; the same tool keeps it, another starts idle", async () => {
  let manque: "gh" | "claude" = "gh";
  let rendu: () => Promise<{ phase: "done" | "failed" | "installing"; raison?: string }> = async () => {
    throw new Error("the bridge broke");
  };
  const outils = tenirLesOutils({ pont: { outilsManquants: async () => [{ outil: manque, installation, installable: true }], installerOutil: () => rendu() as never }, rendre: () => {} });
  await outils.verifier();
  await outils.installer();
  assert.deepEqual(outils.etat.installation, { installable: true, phase: "failed", raison: "the bridge broke" });
  rendu = async () => ({ phase: "installing" });
  await outils.installer();
  assert.deepEqual(outils.etat.installation, { installable: true, phase: "failed", raison: "the install of gh did not end" });
  await outils.verifier(true);
  assert.equal(outils.etat.installation?.phase, "failed");
  manque = "claude";
  await outils.verifier(true);
  assert.deepEqual(outils.etat.installation, { installable: true, phase: "idle" });
});

test("no install is held for git, for a bridge that does not install, or for a machine where it cannot; a click there does nothing", async () => {
  let appels = 0;
  const installerOutil = async () => (appels++, { phase: "done" as const });
  const git = tenirLesOutils({ pont: { outilsManquants: async () => [{ outil: "git" as const, installation, installable: true }], installerOutil }, rendre: () => {} });
  await git.verifier();
  assert.equal(git.etat.installation, undefined);
  await git.installer();
  const sansPont = tenirLesOutils({ pont: { outilsManquants: async () => [{ outil: "gh" as const, installation, installable: true }] }, rendre: () => {} });
  await sansPont.verifier();
  assert.equal(sansPont.etat.installation, undefined);
  const sansDire = tenirLesOutils({ pont: { outilsManquants: async () => [{ outil: "gh" as const, installation }], installerOutil }, rendre: () => {} });
  await sansDire.verifier();
  assert.equal(sansDire.etat.installation, undefined);
  const impossible = tenirLesOutils({ pont: { outilsManquants: async () => [{ outil: "gh" as const, installation, installable: false }], installerOutil }, rendre: () => {} });
  await impossible.verifier();
  assert.deepEqual(impossible.etat.installation, { installable: false, phase: "idle" });
  await impossible.installer();
  assert.equal(appels, 0);
  await repos();
});

test("the install button is the recommended gesture, the page link is not; where it cannot install, the link is", () => {
  const offert = pose({ lu: true, manque: { outil: "gh", installation }, installation: { installable: true, phase: "idle" } });
  assert.deepEqual(offert.dessous("button").map((b) => b.textContent), [INSTALLER("gh"), LA_PAGE("gh"), DEJA_INSTALLE]);
  assert.equal(boutonDit(offert, INSTALLER("gh")).dataset.bouton, "recommande");
  assert.notEqual(boutonDit(offert, LA_PAGE("gh")).dataset.bouton, "recommande");
  assert.ok(offert.dessous("button").every((b) => !b.disabled));
  assert.doesNotMatch(offert.textContent, /cannot install/);
  const non = pose({ lu: true, manque: { outil: "gh", installation }, installation: { installable: false, phase: "idle" } });
  assert.equal(boutonDit(non, LA_PAGE("gh")).dataset.bouton, "recommande");
  assert.match(non.textContent, new RegExp(IMPOSSIBLE("gh").slice(0, 30)));
});

test("claude installed: the screen ends on 'log in', which logs in; any other done tool shows nothing", () => {
  let login = 0;
  const lieu = pose({ lu: true, installation: { installable: true, phase: "done", outil: "claude" } }, { ouvrir: () => {}, verifier: () => {}, seConnecterAClaude: () => login++ });
  assert.equal(lieu.dessous("p")[0]?.textContent, CLAUDE_INSTALLE);
  assert.equal(boutonDit(lieu, SE_CONNECTER_A_CLAUDE).dataset.bouton, "recommande");
  boutonDit(lieu, SE_CONNECTER_A_CLAUDE).click();
  assert.equal(login, 1);
  assert.equal(pose({ lu: true, installation: { installable: true, phase: "done", outil: "gh" } }).textContent, "");
  assert.equal(pose({ lu: true, installation: { installable: true, phase: "failed", outil: "claude" } }).textContent, "");
});

test("an install already done but the tool still missing: one 'still missing' line, the install offered again", () => {
  const lieu = pose({ lu: true, manque: { outil: "gh", installation }, dit: { absent: true }, installation: { installable: true, phase: "done" } });
  assert.equal(lieu.dessous("p").filter((p) => p.role === "alert").length, 1);
  assert.ok(lieu.dessous("button").some((b) => b.textContent === INSTALLER("gh")));
  const enVerification = pose({ lu: true, manque: { outil: "gh", installation }, enCours: "verification", dit: { absent: true }, installation: { installable: true, phase: "idle" } });
  assert.equal(enVerification.dessous("p").filter((p) => p.role === "alert").length, 0);
  assert.ok(boutonDit(enVerification, INSTALLER("gh")).disabled && boutonDit(enVerification, DEJA_INSTALLE).disabled);
});

test("the main process tells the view which missing tool it can install, and installs only gh and claude", async () => {
  const lances: string[] = [];
  const vue = pourLaVue(tenirInstallation({ plateforme: "linux", arch: "x64", env: {}, dossier: "/x", telecharger: async () => {}, lancer: async (c) => (lances.push(c), { code: 0, sortie: "" }), rendre: () => {} }));
  assert.deepEqual(vue.installables([{ outil: "git" }, { outil: "gh" }, { outil: "claude" }]), [
    { outil: "git", installable: false },
    { outil: "gh", installable: true },
    { outil: "claude", installable: true },
  ]);
  assert.deepEqual(await vue.installer("git"), { phase: "failed", raison: "the app installs only gh and claude" });
  assert.deepEqual(lances, []);
  assert.deepEqual(await vue.installer("claude"), { phase: "done" });
  assert.deepEqual(await vue.installer("gh"), { phase: "done" });
});

test("the notice shows a missing tool, or Claude Code just installed; closing it forgets a finished install only", () => {
  assert.equal(aMontrer({ lu: true }), false);
  assert.equal(aMontrer({ lu: true, manque: { outil: "git" } }), true);
  assert.equal(aMontrer({ lu: true, installation: { installable: true, phase: "done", outil: "claude" } }), true);
  assert.equal(aMontrer({ lu: true, installation: { installable: true, phase: "done", outil: "gh" } }), false);
  const encore = { lu: true, manque: { outil: "gh" as const }, installation: { installable: true, phase: "failed" as const } };
  oublierLInstallation(encore);
  assert.equal(encore.installation.phase, "failed");
  const fini: { lu: boolean; installation?: object } = { lu: true, installation: { installable: true, phase: "done", outil: "claude" } };
  oublierLInstallation(fini);
  assert.equal(fini.installation, undefined);
});

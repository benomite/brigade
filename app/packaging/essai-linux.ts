// Éprouve l'AppImage Linux sur un vrai Linux x64, avec un écran (sur un serveur, sous `xvfb-run`) —
// ce que les tests ne peuvent pas : elle est un exécutable x86-64, elle se lance telle quelle, sans
// aucun `node` dans le PATH, et ouvre l'app jusqu'à son écran principal.
//
//   node app/packaging/essai-linux.ts <brigade-<version>-linux-x64.AppImage> [--capture <fichier.png>]
//
// L'écran principal se lit comme sous Windows (essai-windows.ts) : par le protocole des DevTools de
// Chromium, l'app ouverte avec `--remote-debugging-port`. `--capture` y écrit ce que montre la
// fenêtre. L'app s'ouvre sur un fichier de projets neuf (BRIGADE_APP_CONFIG), dans un dossier
// temporaire : ceux du compte ne sont pas touchés.
//
// Codes de sortie : 0 tout est vérifié, 1 une vérification a échoué (elle est nommée), 2 refus
// (option invalide, ce n'est pas un Linux).
import { spawn } from "node:child_process";
import { closeSync, existsSync, mkdtempSync, openSync, readSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { cheminSansNode, Echec, jusqua, jusquAEcranPrincipal } from "./essai-windows.ts";
import { estElfX64 } from "./linux.ts";

const echouer = (motif: string): never => {
  throw new Echec(motif);
};
const refuser = (motif: string): never => {
  throw new Echec(motif, 2);
};
const verifie = (quoi: string) => console.log(`ok    ${quoi}`);

async function principal(): Promise<void> {
  let lu: { values: { capture?: string }; positionals: string[] };
  try {
    lu = parseArgs({ options: { capture: { type: "string" } }, allowPositionals: true, strict: true });
  } catch (erreur) {
    return refuser(`${erreur instanceof Error ? erreur.message : String(erreur)} — usage: essai-linux.ts <file.AppImage> [--capture <file.png>]`);
  }
  const { values, positionals } = lu;
  const appimage = positionals[0];
  if (appimage === undefined || positionals.length > 1) return refuser("usage: essai-linux.ts <file.AppImage> [--capture <file.png>]");
  if (process.platform !== "linux") refuser(`the AppImage is tried on Linux, not on ${process.platform}`);
  if (!existsSync(appimage)) refuser(`${appimage} does not exist — build it with \`node app/packaging/linux.ts\``);

  // Ce que le chef télécharge : un seul fichier, exécutable, pour x86-64.
  if ((statSync(appimage).mode & 0o111) === 0) echouer(`${appimage} is not executable`);
  const debut = Buffer.alloc(64);
  const fd = openSync(appimage, "r");
  try {
    readSync(fd, debut, 0, debut.length, 0);
  } finally {
    closeSync(fd);
  }
  if (!estElfX64(debut)) echouer(`${appimage} is not a Linux x64 executable`);
  verifie(`${appimage} is a Linux x64 executable`);

  // L'app, lancée par l'AppImage elle-même, sans `node` dans le PATH, jusqu'à son écran principal.
  const essai = mkdtempSync(join(tmpdir(), "brigade-essai-linux-"));
  const port = 9333;
  const env: NodeJS.ProcessEnv = { ...process.env, PATH: cheminSansNode(process.env.PATH ?? "", existsSync, "node"), BRIGADE_APP_CONFIG: join(essai, "app.json"), BRIGADE_STATION_DIR: join(essai, "station") };
  for (const variable of ["NODE_OPTIONS", "npm_node_execpath", "npm_execpath"]) delete env[variable];
  // Son propre groupe de process : l'AppImage, AppRun, Electron et la station se ferment ensemble.
  const app = spawn(resolve(appimage), [`--remote-debugging-port=${port}`, "--remote-allow-origins=*"], { env, stdio: ["ignore", "inherit", "inherit"], detached: true });
  let sortie: string | undefined;
  app.once("exit", (code, signal) => (sortie = `the app exited (${code ?? signal}) before reaching its main screen`));
  app.once("error", (erreur) => (sortie = `the AppImage could not be run: ${erreur.message}`));
  try {
    await jusquAEcranPrincipal(port, () => sortie, "the AppImage started the app on its main screen, with no node on the PATH", values.capture);
  } finally {
    if (app.pid !== undefined)
      try {
        process.kill(-app.pid, "SIGKILL");
      } catch {
        // Le groupe est déjà fermé.
      }
    await jusqua("the app closed", 60_000, () => (app.exitCode !== null || app.signalCode !== null ? true : undefined)).catch(() => undefined);
    rmSync(essai, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
}

if (import.meta.main) {
  try {
    await principal();
    console.log("brigade: the Linux AppImage starts the app");
  } catch (erreur) {
    if (!(erreur instanceof Echec)) throw erreur;
    console.error(erreur.code === 2 ? `brigade: ${erreur.message}` : `FAIL  ${erreur.message}`);
    process.exit(erreur.code);
  }
}

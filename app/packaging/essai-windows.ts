// Éprouve l'installeur Windows sur un vrai Windows, de bout en bout — ce que les tests ne peuvent
// pas : il l'installe sans rien demander (`/S`), vérifie ce qu'il a posé (l'app, son `node.exe`, le
// raccourci du menu Démarrer, la clé de désinstallation), ouvre l'app installée par la cible de
// son raccourci, sans aucun `node` dans le PATH, jusqu'à son écran principal, puis la désinstalle
// et vérifie que l'app, son raccourci et sa clé sont partis.
//
//   node app/packaging/essai-windows.ts <installeur.exe> [--capture <fichier.png>]
//
// L'écran principal se lit par le protocole des DevTools de Chromium (l'app est ouverte avec
// `--remote-debugging-port`) : la vue est chargée, son pont est là, et l'un de ses écrans est
// visible. `--capture` y écrit ce que montre la fenêtre. L'app s'ouvre sur un fichier de projets
// neuf (BRIGADE_APP_CONFIG), dans un dossier temporaire : ceux du compte ne sont pas touchés.
//
// Chaque attente attend un fait — un fichier, une clé, une page —, avec une garde large.
//
// Codes de sortie : 0 tout est vérifié, 1 une vérification a échoué (elle est nommée), 2 refus
// (option invalide, ce n'est pas Windows).
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { NOM } from "./construire.ts";
import { CLE_DE_DESINSTALLATION, DESINSTALLEUR, EXE, NODE_EXE } from "./windows.ts";

// Le PATH sans aucun dossier qui porte un `node.exe` : la machine, pour l'app, n'a pas de Node.
export function cheminSansNode(chemin: string, existe: (fichier: string) => boolean = existsSync): string {
  return chemin
    .split(delimiter)
    .filter((dossier) => dossier !== "" && !existe(join(dossier, "node.exe")))
    .join(delimiter);
}

// Ce que la page évalue pour dire qu'elle est sur son écran principal : la vue chargée par le
// pont du process principal, et l'un de ses écrans visible.
export const ECRAN_PRINCIPAL = `(() => {
  if (typeof window.brigade !== "object" || document.readyState !== "complete") return "";
  const visibles = ["#ajout", "#tous", "main"].map((id) => document.querySelector(id)).filter((e) => e !== null && !e.hidden && e.getClientRects().length > 0);
  return visibles.length === 0 ? "" : document.body.innerText.trim().split("\\n").filter((l) => l.trim() !== "").slice(0, 3).join(" | ") || "(no text)";
})()`;

class Echec extends Error {
  readonly code: number;
  constructor(message: string, code = 1) {
    super(message);
    this.code = code;
  }
}
const echouer = (motif: string): never => {
  throw new Echec(motif);
};
const refuser = (motif: string): never => {
  throw new Echec(motif, 2);
};

// Attend qu'une condition rende autre chose que `undefined`, à un dixième de seconde près.
async function jusqua<T>(quoi: string, delaiMs: number, lire: () => T | undefined | Promise<T | undefined>): Promise<T> {
  const fin = performance.now() + delaiMs;
  for (;;) {
    const lu = await lire();
    if (lu !== undefined) return lu;
    if (performance.now() > fin) return echouer(`${quoi}: still not so after ${Math.round(delaiMs / 1000)} s`);
    await new Promise((fait) => setTimeout(fait, 100));
  }
}

const verifie = (quoi: string) => console.log(`ok    ${quoi}`);
const cleExiste = () => spawnSync("reg", ["query", `HKCU\\${CLE_DE_DESINSTALLATION}`], { stdio: "ignore" }).status === 0;

// La cible d'un raccourci `.lnk`, lue par Windows.
function cibleDuRaccourci(raccourci: string): string {
  const lu = spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", `(New-Object -ComObject WScript.Shell).CreateShortcut('${raccourci.replaceAll("'", "''")}').TargetPath`], { encoding: "utf8" });
  if (lu.status !== 0) echouer(`the shortcut ${raccourci} could not be read: ${lu.stderr.trim()}`);
  return lu.stdout.trim();
}

// Une commande du protocole des DevTools, sur la page : sa réponse.
function devtools(adresse: string): { envoyer(methode: string, params?: object): Promise<Record<string, unknown>>; fermer(): void } {
  const socket = new WebSocket(adresse);
  const ouverte = new Promise<void>((fait, rate) => {
    socket.addEventListener("open", () => fait());
    socket.addEventListener("error", () => rate(new Echec(`the DevTools socket ${adresse} could not be opened`)));
  });
  const attentes = new Map<number, (reponse: Record<string, unknown>) => void>();
  socket.addEventListener("message", (message) => {
    const lu = JSON.parse(String(message.data));
    attentes.get(lu.id)?.(lu);
    attentes.delete(lu.id);
  });
  let suivant = 0;
  return {
    async envoyer(methode, params = {}) {
      await ouverte;
      const id = ++suivant;
      const reponse = new Promise<Record<string, unknown>>((fait) => attentes.set(id, fait));
      socket.send(JSON.stringify({ id, method: methode, params }));
      return reponse;
    },
    fermer: () => socket.close(),
  };
}

async function principal(): Promise<void> {
  let lu: { values: { capture?: string }; positionals: string[] };
  try {
    lu = parseArgs({ options: { capture: { type: "string" } }, allowPositionals: true, strict: true });
  } catch (erreur) {
    return refuser(`${erreur instanceof Error ? erreur.message : String(erreur)} — usage: essai-windows.ts <installer.exe> [--capture <file.png>]`);
  }
  const { values, positionals } = lu;
  const installeur = positionals[0];
  if (installeur === undefined || positionals.length > 1) return refuser("usage: essai-windows.ts <installer.exe> [--capture <file.png>]");
  if (process.platform !== "win32") refuser(`the installer is tried on Windows, not on ${process.platform}`);
  if (!existsSync(installeur)) refuser(`${installeur} does not exist — build it with \`node app/packaging/windows.ts\``);
  const localAppData = process.env.LOCALAPPDATA ?? echouer("LOCALAPPDATA is not set");
  const appData = process.env.APPDATA ?? echouer("APPDATA is not set");
  const dossier = join(localAppData, "Programs", NOM);
  const raccourci = join(appData, "Microsoft", "Windows", "Start Menu", "Programs", `${NOM}.lnk`);
  if (existsSync(dossier) || existsSync(raccourci) || cleExiste()) echouer(`${NOM} is already installed on this machine (${dossier}): try on a machine without it`);

  // L'installation : l'installeur rend la main quand il a fini.
  const installe = spawnSync(resolve(installeur), ["/S"], { stdio: "inherit" });
  if (installe.status !== 0) echouer(`the installer exited with ${installe.status ?? installe.error?.message}`);
  for (const fichier of [EXE, DESINSTALLEUR, join("resources", NODE_EXE), join("resources", "app", "src", "main.ts"), join("resources", "app", "package.json"), join("resources", "runtime", "src", "station", "main.ts")])
    if (!existsSync(join(dossier, fichier))) echouer(`the installer did not lay ${join(dossier, fichier)}`);
  verifie(`the app is installed in ${dossier}`);
  if (!existsSync(raccourci)) echouer(`the installer wrote no Start menu shortcut (${raccourci})`);
  const cible = cibleDuRaccourci(raccourci);
  if (resolve(cible).toLowerCase() !== join(dossier, EXE).toLowerCase()) echouer(`the Start menu shortcut points to ${cible}, not to ${join(dossier, EXE)}`);
  verifie(`the Start menu shortcut ${raccourci} launches ${cible}`);
  if (!cleExiste()) echouer(`the installer wrote no uninstall key (HKCU\\${CLE_DE_DESINSTALLATION})`);
  verifie("the app is listed in the installed apps");

  // L'app, ouverte par la cible du raccourci, sans `node` dans le PATH, jusqu'à son écran principal.
  const essai = mkdtempSync(join(tmpdir(), "brigade-essai-windows-"));
  const port = 9333;
  const env: NodeJS.ProcessEnv = { ...process.env, PATH: cheminSansNode(process.env.PATH ?? ""), BRIGADE_APP_CONFIG: join(essai, "app.json"), BRIGADE_STATION_DIR: join(essai, "station") };
  for (const variable of ["NODE_OPTIONS", "npm_node_execpath", "npm_execpath"]) delete env[variable];
  const app = spawn(cible, [`--remote-debugging-port=${port}`, "--remote-allow-origins=*"], { env, stdio: ["ignore", "inherit", "inherit"] });
  let sortie: string | undefined;
  app.once("exit", (code, signal) => (sortie = `the app exited (${code ?? signal}) before reaching its main screen`));
  try {
    const page = await jusqua("the app's window", 120_000, async () => {
      if (sortie !== undefined) echouer(sortie);
      const cibles = (await fetch(`http://127.0.0.1:${port}/json/list`).then((reponse) => reponse.json()).catch(() => [])) as { type: string; url: string; webSocketDebuggerUrl: string }[];
      return cibles.find((cible) => cible.type === "page" && cible.url.endsWith("/vue/index.html"));
    });
    const outils = devtools(page.webSocketDebuggerUrl);
    try {
      const texte = await jusqua("the app's main screen", 120_000, async () => {
        if (sortie !== undefined) echouer(sortie);
        const lu = (await outils.envoyer("Runtime.evaluate", { expression: ECRAN_PRINCIPAL, returnByValue: true })) as { result?: { result?: { value?: unknown } } };
        const valeur = lu.result?.result?.value;
        return typeof valeur === "string" && valeur !== "" ? valeur : undefined;
      });
      verifie(`the app reached its main screen, with no node on the PATH: ${texte}`);
      if (values.capture !== undefined) {
        const capture = (await outils.envoyer("Page.captureScreenshot", { format: "png" })) as { result?: { data?: string } };
        writeFileSync(values.capture, Buffer.from(capture.result?.data ?? echouer("the window could not be captured"), "base64"));
        verifie(`the window is captured in ${values.capture}`);
      }
    } finally {
      outils.fermer();
    }
  } finally {
    // L'app et ce qu'elle a lancé — ses process d'Electron, sa station —, par son pid.
    if (app.pid !== undefined) spawnSync("taskkill", ["/PID", String(app.pid), "/T", "/F"], { stdio: "ignore" });
    await jusqua("the app closed", 60_000, () => (app.exitCode !== null || app.signalCode !== null ? true : undefined)).catch(() => undefined);
    rmSync(essai, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }

  // La désinstallation : le désinstalleur se copie ailleurs et rend la main aussitôt — c'est
  // ce qu'il a retiré qui se lit, pas sa fin.
  const desinstalle = spawnSync(join(dossier, DESINSTALLEUR), ["/S"], { stdio: "inherit" });
  if (desinstalle.status !== 0) echouer(`the uninstaller exited with ${desinstalle.status ?? desinstalle.error?.message}`);
  await jusqua("the app uninstalled", 120_000, () => (!existsSync(dossier) ? true : undefined));
  verifie(`the uninstaller removed ${dossier}`);
  if (existsSync(raccourci)) echouer(`the uninstaller left the Start menu shortcut (${raccourci})`);
  verifie("the uninstaller removed the Start menu shortcut");
  if (cleExiste()) echouer(`the uninstaller left the uninstall key (HKCU\\${CLE_DE_DESINSTALLATION})`);
  verifie("the app is no longer listed in the installed apps");
}

if (import.meta.main) {
  try {
    await principal();
    console.log("brigade: the Windows installer installs, opens and uninstalls the app");
  } catch (erreur) {
    if (!(erreur instanceof Echec)) throw erreur;
    console.error(erreur.code === 2 ? `brigade: ${erreur.message}` : `FAIL  ${erreur.message}`);
    process.exit(erreur.code);
  }
}

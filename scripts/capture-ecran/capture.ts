// Capture un écran de l'app dans un PNG : la vue telle qu'elle est (app/src/vue/), rendue par un
// navigateur sans tête, devant un faux pont et des données figées — ni `claude`, ni box, ni réseau.
//   node scripts/capture-ecran/capture.ts <écran> <fichier.png>
//   node scripts/capture-ecran/capture.ts --liste
// Les écrans sont dans ecrans/ (README.md). Le même écran, sur un code inchangé, donne le même PNG
// à l'octet près : l'heure, le fuseau, la langue, la taille et les polices sont arrêtés.
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve, sep } from "node:path";
import type { Donnees, Ecran } from "./ecrans/commun.ts";
import { type Evenement, lancer, navigateur, type Pilote } from "./navigateur.ts";

// Les heures que la vue reçoit sont calculées ici aussi, par les modules de l'app : même fuseau.
process.env.TZ = "UTC";

const ICI = import.meta.dirname;
const APP = resolve(ICI, "../../app");
// L'adresse sous laquelle la page voit l'app : un nom qui ne se résout jamais (.invalid). Chaque
// requête qui la vise est servie depuis app/, sur le disque ; toute autre est refusée.
const ORIGINE = "http://app.brigade.invalid";
const PAGE = `${ORIGINE}/src/vue/index.html`;
const DELAI_MS = 120_000;

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

// Les écrans : chaque fichier de ecrans/ qui exporte `ecran`, par son nom de fichier.
export async function ecrans(): Promise<Map<string, Ecran>> {
  const trouves = new Map<string, Ecran>();
  for (const fichier of readdirSync(join(ICI, "ecrans")).filter((nom) => nom.endsWith(".ts")).sort()) {
    const module = (await import(join(ICI, "ecrans", fichier))) as { ecran?: Ecran };
    if (module.ecran !== undefined) trouves.set(fichier.slice(0, -3), module.ecran);
  }
  return trouves;
}

// Ce que la page a demandé et n'a pas eu, et ce qu'elle a levé : une capture qui en a n'est pas écrite.
type Accrocs = { refusees: string[]; absentes: string[]; exceptions: string[] };

// Rend l'écran et rend son PNG — ou lève, en disant ce qui a accroché.
export async function capturer(ecran: Ecran, { largeur, hauteur }: { largeur?: number; hauteur?: number } = {}): Promise<Buffer> {
  const taille = { largeur: largeur ?? ecran.largeur, hauteur: hauteur ?? ecran.hauteur };
  const pilote = lancer(navigateur(), taille);
  let garde: NodeJS.Timeout | undefined;
  // Rien ne reste pendu : un navigateur qui s'arrête, ou une capture trop longue, la fait échouer.
  const delai = new Promise<never>((_, lacher) => (garde = setTimeout(() => lacher(new Error(`la capture a dépassé ${DELAI_MS / 1000} s`)), DELAI_MS)));
  try {
    return await Promise.race([rendre(ecran, taille, pilote), pilote.arrete, delai]);
  } finally {
    clearTimeout(garde);
    await pilote.fermer();
  }
}

async function rendre(ecran: Ecran, taille: { largeur: number; hauteur: number }, pilote: Pilote): Promise<Buffer> {
  const donnees: Donnees = ecran.donnees();
  const pont = readFileSync(join(ICI, "pont.js"), "utf8");
  const accrocs: Accrocs = { refusees: [], absentes: [], exceptions: [] };
  const { targetId } = await pilote.envoyer("Target.createTarget", { url: "about:blank" });
  const { sessionId } = (await pilote.envoyer("Target.attachToTarget", { targetId, flatten: true })) as { sessionId: string };
  const dire = (methode: string, params: Record<string, unknown> = {}) => pilote.envoyer(methode, params, sessionId);
  let charge: () => void = () => undefined;
  const chargee = new Promise<void>((resoudre) => (charge = resoudre));
  pilote.surEvenement((evenement) => {
    if (evenement.session !== sessionId) return;
    if (evenement.methode === "Fetch.requestPaused") void servir(dire, evenement, accrocs);
    else if (evenement.methode === "Page.loadEventFired") charge();
    else if (evenement.methode === "Runtime.exceptionThrown") accrocs.exceptions.push(exception(evenement.params));
  });
  await dire("Runtime.enable");
  await dire("Page.enable");
  await dire("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
  await dire("Emulation.setDeviceMetricsOverride", { width: taille.largeur, height: taille.hauteur, deviceScaleFactor: 1, mobile: false });
  await dire("Emulation.setTimezoneOverride", { timezoneId: "UTC" });
  await dire("Emulation.setLocaleOverride", { locale: "en-US" });
  await dire("Emulation.setFocusEmulationEnabled", { enabled: true });
  await dire("Page.addScriptToEvaluateOnNewDocument", { source: `window.__donnees = ${enJs(donnees)};\n${pont}` });
  await dire("Page.navigate", { url: PAGE });
  await chargee;
  const evaluer = async (expression: string): Promise<unknown> => {
    const { result, exceptionDetails } = (await dire("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })) as { result: { value?: unknown }; exceptionDetails?: Record<string, unknown> };
    if (exceptionDetails !== undefined) throw new Error(`dans la page : ${exception({ exceptionDetails })}`);
    return result.value;
  };
  const poser = async (apres: string) => {
    await evaluer("window.__capture.calme()");
    verifier(accrocs, apres);
  };
  await poser("au démarrage de la vue");
  if (!((await evaluer("window.__capture.demandes.includes('demarrage')")) as boolean)) throw new Error("la vue n'a pas démarré : elle n'a jamais demandé `demarrage` au pont");
  for (const etape of ecran.etapes) {
    if ("glisser" in etape) {
      // Un glisser, comme le navigateur le rejoue : `dragstart` sur ce qui part, `dragover` sur ce qu'il survole — et, lâché,
      // `drop` là, puis `dragend` sur ce qui est parti. Le même transfert les porte tous.
      const geste = `glisser ${etape.glisser} sur ${etape.sur}`;
      const lacher = etape.lacher === true ? `cible.dispatchEvent(evenement("drop")); source.dispatchEvent(evenement("dragend"));` : "";
      const trouves = (await evaluer(
        `(() => { const sources = document.querySelectorAll(${JSON.stringify(etape.glisser)}); const cibles = document.querySelectorAll(${JSON.stringify(etape.sur)});` +
          ` if (sources.length !== 1 || cibles.length !== 1) return [sources.length, cibles.length]; const [source] = sources; const [cible] = cibles;` +
          ` const dataTransfer = new DataTransfer(); const evenement = (type) => new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer });` +
          ` source.dispatchEvent(evenement("dragstart")); cible.dispatchEvent(evenement("dragover")); ${lacher} return [1, 1]; })()`,
      )) as [number, number];
      if (trouves[0] !== 1 || trouves[1] !== 1) throw new Error(`étape « ${geste} » : ${trouves[0]} et ${trouves[1]} élément(s) trouvé(s), il en faut un de chaque`);
      await poser(`après « ${geste} »`);
      continue;
    }
    if ("soulever" in etape) {
      // Un appui long au doigt (ticket 1348) : `touchstart` sur ce qui est soulevé, la vue attend la fin de l'appui, puis le doigt
      // mène la carte au centre de `vers` (`touchmove`) — et, `lacher`, le lève là (`touchend`). Les mêmes événements que le navigateur.
      const geste = `soulever ${etape.soulever} vers ${etape.vers}`;
      const lever = etape.lacher === true ? `source.dispatchEvent(contact("touchend", [])); ` : "";
      const trouves = (await evaluer(
        `(async () => { const sources = document.querySelectorAll(${JSON.stringify(etape.soulever)}); const cibles = document.querySelectorAll(${JSON.stringify(etape.vers)});` +
          ` if (sources.length !== 1 || cibles.length !== 1) return [sources.length, cibles.length]; const [source] = sources; const [cible] = cibles;` +
          ` const centre = (element) => { const r = element.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };` +
          ` const toucher = (element) => { const [clientX, clientY] = centre(element); return new Touch({ identifier: 1, target: source, clientX, clientY }); };` +
          ` const contact = (type, doigts) => new TouchEvent(type, { bubbles: true, cancelable: true, touches: doigts, targetTouches: doigts, changedTouches: [toucher(type === "touchstart" ? source : cible)] });` +
          ` source.dispatchEvent(contact("touchstart", [toucher(source)])); await new Promise((fini) => setTimeout(fini, 700));` +
          ` source.dispatchEvent(contact("touchmove", [toucher(cible)])); ${lever}return [1, 1]; })()`,
      )) as [number, number];
      if (trouves[0] !== 1 || trouves[1] !== 1) throw new Error(`étape « ${geste} » : ${trouves[0]} et ${trouves[1]} élément(s) trouvé(s), il en faut un de chaque`);
      await poser(`après « ${geste} »`);
      continue;
    }
    // Un clic, ou un texte tapé dans un champ — sa valeur posée, et l'`input` que la frappe déclencherait.
    const [geste, selecteur, faire] =
      "cliquer" in etape
        ? ["cliquer", etape.cliquer, "trouves[0].click();"]
        : ["saisir", etape.saisir, `trouves[0].value = ${JSON.stringify(etape.texte)}; trouves[0].dispatchEvent(new Event("input"));`];
    const trouves = (await evaluer(`(() => { const trouves = document.querySelectorAll(${JSON.stringify(selecteur)}); if (trouves.length === 1) { ${faire} } return trouves.length; })()`)) as number;
    if (trouves !== 1) throw new Error(`étape « ${geste} ${selecteur} » : ${trouves} élément(s) trouvé(s), il en faut un`);
    await poser(`après « ${geste} ${selecteur} »`);
  }
  const { data } = (await dire("Page.captureScreenshot", { format: "png" })) as { data: string };
  verifier(accrocs, "à la capture");
  return Buffer.from(data, "base64");
}

// Ce qu'une requête de la page reçoit : un fichier de app/, sous l'adresse de l'app — rien
// d'autre. `refusee` : elle visait ailleurs, le réseau ; `absente` : un chemin hors de app/, ou
// un fichier qui n'y est pas.
export function fichierDe(adresse: string): { fichier: string } | { refusee: string } | { absente: string } {
  const url = new URL(adresse);
  if (url.origin !== ORIGINE) return { refusee: url.href };
  const chemin = resolve(APP, `.${decodeURIComponent(url.pathname)}`);
  return chemin.startsWith(APP + sep) && statSync(chemin, { throwIfNoEntry: false })?.isFile() === true ? { fichier: chemin } : { absente: chemin };
}

async function servir(dire: (methode: string, params?: Record<string, unknown>) => Promise<unknown>, { params }: Evenement, accrocs: Accrocs): Promise<void> {
  const requete = params.requestId as string;
  const servi = fichierDe((params.request as { url: string }).url);
  if ("refusee" in servi) {
    accrocs.refusees.push(servi.refusee);
    await dire("Fetch.failRequest", { requestId: requete, errorReason: "BlockedByClient" }).catch(() => undefined);
  } else if ("absente" in servi) {
    accrocs.absentes.push(servi.absente);
    await dire("Fetch.fulfillRequest", { requestId: requete, responseCode: 404, body: "" }).catch(() => undefined);
  } else {
    const type = TYPES[extname(servi.fichier)] ?? "application/octet-stream";
    await dire("Fetch.fulfillRequest", { requestId: requete, responseCode: 200, responseHeaders: [{ name: "Content-Type", value: type }], body: readFileSync(servi.fichier).toString("base64") }).catch(() => undefined);
  }
}

// Les données, telles que la page les lit. L'IPC d'Electron garde `undefined` — un argument absent,
// un champ posé sans valeur — là où JSON écrirait `null` ou rien : il passe marqué, et revient tel quel.
const INDEFINI = "__indefini";
function enJs(donnees: Donnees): string {
  const json = JSON.stringify(donnees, (_, valeur: unknown) => (valeur === undefined ? { [INDEFINI]: true } : valeur));
  return `JSON.parse(${JSON.stringify(json)}, (_, valeur) => (valeur !== null && typeof valeur === "object" && valeur.${INDEFINI} === true ? undefined : valeur))`;
}

function exception(params: Record<string, unknown>): string {
  const details = params.exceptionDetails as { text?: string; exception?: { description?: string } } | undefined;
  return details?.exception?.description ?? details?.text ?? "exception sans description";
}

function verifier({ refusees, absentes, exceptions }: Accrocs, quand: string): void {
  const dits = [
    ...refusees.map((url) => `la page a demandé le réseau — refusé : ${url}`),
    ...absentes.map((chemin) => `la page a demandé un fichier absent : ${chemin}${chemin.includes(`${sep}node_modules${sep}`) ? " (npm ci --ignore-scripts --prefix app)" : ""}`),
    ...exceptions.map((texte) => `la vue a levé : ${texte}`),
  ];
  if (dits.length > 0) throw new Error(`${quand} :\n  ${dits.join("\n  ")}`);
}

// La ligne de commande.
const USAGE = "usage : node scripts/capture-ecran/capture.ts <écran> <fichier.png> [--largeur <px>] [--hauteur <px>]\n        node scripts/capture-ecran/capture.ts --liste";

async function principal(args: string[]): Promise<number> {
  if (args[0] === "--liste") {
    for (const [nom, { dit, largeur, hauteur }] of await ecrans()) console.log(`${nom.padEnd(20)} ${largeur}×${hauteur}  ${dit}`);
    return 0;
  }
  const libres: string[] = [];
  const tailles: { largeur?: number; hauteur?: number } = {};
  for (let rang = 0; rang < args.length; rang++) {
    const arg = args[rang] ?? "";
    if (arg === "--largeur" || arg === "--hauteur") {
      const valeur = Number(args[++rang]);
      if (!Number.isSafeInteger(valeur) || valeur < 200 || valeur > 4000) return refuser(`${arg} attend un nombre de pixels entre 200 et 4000`);
      tailles[arg === "--largeur" ? "largeur" : "hauteur"] = valeur;
    } else libres.push(arg);
  }
  const [nom, sortie] = libres;
  if (libres.length !== 2 || nom === undefined || sortie === undefined) return refuser(USAGE);
  if (!sortie.endsWith(".png")) return refuser(`le fichier de sortie doit finir par .png : ${sortie}`);
  const connus = await ecrans();
  const ecran = connus.get(nom);
  if (ecran === undefined) return refuser(`écran inconnu : ${nom} — les écrans : ${[...connus.keys()].join(", ")}`);
  const png = await capturer(ecran, tailles);
  mkdirSync(dirname(resolve(sortie)), { recursive: true });
  writeFileSync(sortie, png);
  console.log(`${sortie} — ${nom}, ${png.length} octets`);
  return 0;
}

function refuser(texte: string): number {
  console.error(texte);
  return 2;
}

if (import.meta.main) {
  principal(process.argv.slice(2)).then(
    (code) => (process.exitCode = code),
    (erreur: unknown) => {
      console.error(`capture-ecran : ${erreur instanceof Error ? erreur.message : String(erreur)}`);
      process.exitCode = 1;
    },
  );
}

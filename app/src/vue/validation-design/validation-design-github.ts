// La carte « Validate its screen » (ticket 3185, épique 3180) : la livraison design verte que la pass retient pour le chef
// (ticket 3184, runtime/src/validation-design/). Le runtime la pose en issue au label `chef-todo` :
//   - son commentaire de carte (`<!-- brigade:todo kind=design-validation -->`) dit la question et le lien de la PR — l'app
//     le lit comme toute carte du chef (tableau/todo-github.ts) ;
//   - son corps commence par `<!-- brigade:validation-design pr=<PR> ticket=<ticket> sha=<sha> -->`, puis porte la question,
//     le lien de la PR et, écran par écran, les captures avant et après en images, au commit que la pass a jugé vert.
// Ce module lit le corps (`validationDuCorps`) : la PR, son adresse, et les captures, chacune par son adresse sur GitHub —
// seulement celles du dépôt du projet, au commit de la carte, dans `docs/captures/<ticket>/`. Puis il joue les deux gestes
// du chef par la commande du runtime (`npm --prefix runtime run design`, runtime/src/validation-design/commande.ts), que le
// process principal importe et joue dans le sien (`jouerLaValidation`) : `validate <owner>/<repo>#<PR>` merge la PR et
// ferme la carte ; `send-back <owner>/<repo>#<PR> --comment <…>` renvoie la livraison à un cook avec le commentaire, et
// ferme la carte. La carte quitte TODO à la lecture suivante : l'issue est fermée.
import { lireAdresse, type CapturesLues } from "../../captures.ts";

// La sorte de la carte, telle que le runtime l'écrit (runtime/src/validation-design/validation-design.ts, `SORTE_DE_CARTE`).
export const SORTE_DE_VALIDATION = "design-validation";

// Ce que la carte valide : sa PR et son adresse, le ticket livré, la tête jugée verte, et les captures de chaque écran.
export type ValidationDesign = { pr: number; ticket: number; sha: string; url: string; captures: CapturesLues };

const MARQUE = /^\s*<!-- brigade:validation-design pr=([1-9][0-9]*) ticket=([1-9][0-9]*) sha=([0-9a-f]{7,40}) -->/;
const IMAGE = /!\[[^\]]*\]\((https:\/\/github\.com\/[^)\s]+)\)/g;
// Le nom d'une capture, comme le runtime l'apparie (runtime/src/captures.ts, `capturesLivrees`) : `<écran>-avant.png`,
// `<écran>-apres.png`, sans égard à la casse ni aux accents.
const MOMENT = /^(.*?)[-_. ]*(avant|apres)$/;
const sansAccents = (texte: string) => texte.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

// La carte que le corps de l'issue porte, pour le projet de `depot` — nulle si son marqueur n'y est pas. Une image qui
// n'est pas une capture du ticket, sur ce dépôt et à ce commit, n'est pas lue : la vue ne demande que celles-là.
export function validationDuCorps(depot: string, corps: string): ValidationDesign | null {
  const lu = MARQUE.exec(corps);
  if (lu === null) return null;
  const [, pr, ticket, sha] = lu as unknown as [string, string, string, string];
  const dossier = `docs/captures/${ticket}/`;
  const ecrans = new Map<string, { ecran: string; avant: string | null; apres: string | null }>();
  for (const [, adresse] of corps.matchAll(IMAGE)) {
    const lue = adresse === undefined ? undefined : lireAdresse(adresse);
    if (adresse === undefined || lue === undefined || lue.depot.toLowerCase() !== depot.toLowerCase() || lue.sha !== sha || !lue.chemin.startsWith(dossier)) continue;
    const nom = lue.chemin.slice(dossier.length);
    if (nom.includes("/") || !/\.png$/i.test(nom)) continue;
    const [, ecran = "", moment] = MOMENT.exec(sansAccents(nom.slice(0, -".png".length))) ?? [];
    if (moment !== "avant" && moment !== "apres") continue;
    const sien = ecrans.get(ecran) ?? { ecran: nom.slice(0, ecran.length), avant: null, apres: null };
    sien[moment] ??= adresse;
    ecrans.set(ecran, sien);
  }
  const lus = [...ecrans.values()];
  return {
    pr: Number(pr),
    ticket: Number(ticket),
    sha,
    url: `https://github.com/${depot}/pull/${pr}`,
    captures: { complet: lus.length > 0 && lus.every(({ avant, apres }) => avant !== null && apres !== null), ecrans: lus },
  };
}

// La même carte relue des faits (faits.ts, `chefLu`) — ou rien, si elle n'en a pas la forme.
export function validationLue(brut: unknown): ValidationDesign | undefined {
  const lu = typeof brut === "object" && brut !== null ? (brut as Record<string, unknown>) : undefined;
  const entier = (valeur: unknown): valeur is number => typeof valeur === "number" && Number.isSafeInteger(valeur) && valeur > 0;
  const captures = typeof lu?.captures === "object" && lu.captures !== null ? (lu.captures as Record<string, unknown>) : undefined;
  if (lu === undefined || !entier(lu.pr) || !entier(lu.ticket) || typeof lu.sha !== "string" || typeof lu.url !== "string" || captures === undefined) return undefined;
  if (typeof captures.complet !== "boolean" || !Array.isArray(captures.ecrans)) return undefined;
  const adresse = (valeur: unknown): valeur is string | null => valeur === null || typeof valeur === "string";
  const ecrans = (captures.ecrans as unknown[]).flatMap((un) => {
    const e = typeof un === "object" && un !== null ? (un as Record<string, unknown>) : {};
    return typeof e.ecran === "string" && adresse(e.avant) && adresse(e.apres) ? [{ ecran: e.ecran, avant: e.avant, apres: e.apres }] : [];
  });
  return { pr: lu.pr, ticket: lu.ticket, sha: lu.sha, url: lu.url, captures: { complet: captures.complet, ecrans } };
}

// ── Les deux gestes ──

// Ce que la vue envoie : valider, ou renvoyer en cuisine avec le commentaire du chef.
export type GesteDeValidation = { geste: "valider" } | { geste: "renvoyer"; commentaire: string };
// Ce qu'il en est advenu : fait — ce que le runtime en dit —, ou rien n'est fait, et pourquoi en une ligne, le détail au survol.
export type RenduDeValidation = { fait: string } | { refus: string; detail: string };

// La commande du runtime, telle que le process principal l'importe (runtime/src/validation-design/commande.ts, `principal`) :
// elle dit ce qu'elle a fait par `dire`, un refus par `redire`, et lève sa sortie (`Sortie`, un objet qui porte `code`).
export type CommandeDuRuntime = (appel: { args: string[]; env: Record<string, string | undefined>; dire: (ligne: string) => void; redire: (ligne: string) => void }) => Promise<void>;

export const VIDE = "nothing was sent: the comment says what to change — write it first";
export const INCONNUE = "nothing was sent: this card is not in the latest reading — it was answered elsewhere, or it left TODO";

const sansPrefixe = (ligne: string) => ligne.replace(/^brigade : /, "").split("\n")[0]?.trim() ?? "";

// Le geste du chef sur la carte `design` du projet de `depot`, joué par la commande du runtime : ses arguments, puis ce
// qu'elle a dit. Rien ne part sans la carte, ni pour un renvoi sans commentaire. Une commande qui refuse, ou qui lève, dit
// pourquoi : la carte reste.
export async function jouerLaValidation({ depot, design, geste, commande, env }: { depot: string; design: ValidationDesign | undefined; geste: unknown; commande: () => Promise<CommandeDuRuntime>; env: Record<string, string | undefined> }): Promise<RenduDeValidation> {
  if (design === undefined) return { refus: INCONNUE, detail: "" };
  const lu = typeof geste === "object" && geste !== null ? (geste as Record<string, unknown>) : {};
  const cible = `${depot}#${design.pr}`;
  let args: string[];
  if (lu.geste === "valider") args = ["validate", cible];
  else if (lu.geste === "renvoyer") {
    const commentaire = typeof lu.commentaire === "string" ? lu.commentaire.trim().replace(/\r\n?/g, "\n") : "";
    if (commentaire === "") return { refus: VIDE, detail: "" };
    args = ["send-back", cible, "--comment", commentaire];
  } else return { refus: "nothing was sent: the app does not know this gesture", detail: String(lu.geste) };
  const dits: string[] = [];
  const redits: string[] = [];
  try {
    await (await commande())({ args, env, dire: (ligne) => void dits.push(ligne), redire: (ligne) => void redits.push(ligne) });
  } catch (erreur) {
    const code = typeof erreur === "object" && erreur !== null && "code" in erreur && typeof erreur.code === "number" ? erreur.code : undefined;
    const detail = code === undefined ? (erreur instanceof Error ? erreur.message : String(erreur)) : redits.join("\n");
    const refus = code === undefined ? "the kitchen's command could not run" : sansPrefixe(redits[0] ?? `the command ended with code ${code}`);
    return { refus: `nothing was done: ${refus}`, detail };
  }
  return { fait: dits.at(-1) ?? (lu.geste === "valider" ? `PR #${design.pr} validated` : `PR #${design.pr} sent back`) };
}

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
// Le téléphone ne porte pas le runtime : la WebView ne charge pas ce que sa commande importe. Il joue les deux mêmes gestes
// sur l'API de GitHub, avec le jeton de son coffre (`validerSurGithub`, gestes-github-telephone.ts) : les mêmes lectures,
// les mêmes contrôles et les mêmes écritures que `valider` et `renvoyerLeDesign` (runtime/src/validation-design/
// validation-design.ts), à la lettre — le test (app/test/validation-design/) les joue tous deux sur le même GitHub.
import { capturesDeCarte, lireAdresse, type CapturesDeCarte, type CapturesLues } from "../../captures.ts";
import type { MethodeDEcriture } from "../../priorite.ts";
import { refusDe, type AppelGitHub, type ReponseGitHub } from "../../tableau/client.ts";
import { LABEL_DU_CHEF } from "../../tableau/todo-github.ts";

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

// Les captures que la carte pose. Une carte dont le corps ne montre aucune capture lisible le dit en une ligne, et au
// survol ce que l'app y cherche : la vue n'a sinon rien à montrer, et le chef ne saurait pas pourquoi.
export const SANS_CAPTURE = "no screenshot could be read on this card — open its pull request to see the screen";
export function capturesDeLaValidation({ ticket, sha, captures }: ValidationDesign): CapturesDeCarte {
  if (captures.ecrans.length > 0) return capturesDeCarte(captures);
  return { ecrans: [], incomplete: { ligne: SANS_CAPTURE, detail: `the app shows only the images of docs/captures/${ticket}/ on the project's repository at \`${sha.slice(0, 7)}\`, the head the pass judged green, and the card's issue shows none` } };
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
// elle dit ce qu'elle a fait par `dire`, un refus par `redire`, et lève sa sortie — une `Sortie` (runtime/src/appel.ts), que
// `estUneSortie` reconnaît : celle du runtime même que le process principal a chargé.
export type CommandeDuRuntime = (appel: { args: string[]; env: Record<string, string | undefined>; dire: (ligne: string) => void; redire: (ligne: string) => void }) => Promise<void>;
export type CommandeChargee = { principal: CommandeDuRuntime; estUneSortie: (erreur: unknown) => erreur is { code: number } };

export const VIDE = "nothing was sent: the comment says what to change — write it first";
export const INCONNUE = "nothing was sent: this card is not in the latest reading — it was answered elsewhere, or it left TODO";

const sansPrefixe = (ligne: string) => ligne.replace(/^brigade : /, "").split("\n")[0]?.trim() ?? "";
const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

// Le geste que la vue envoie, contrôlé : rien ne part sans la carte, ni pour un renvoi sans commentaire.
type GesteLu = { geste: "valider" } | { geste: "renvoyer"; commentaire: string };
function gesteLu(design: ValidationDesign | undefined, geste: unknown): GesteLu | { refus: string; detail: string } {
  if (design === undefined) return { refus: INCONNUE, detail: "" };
  const lu = typeof geste === "object" && geste !== null ? (geste as Record<string, unknown>) : {};
  if (lu.geste === "valider") return { geste: "valider" };
  if (lu.geste !== "renvoyer") return { refus: "nothing was sent: the app does not know this gesture", detail: String(lu.geste) };
  const commentaire = typeof lu.commentaire === "string" ? lu.commentaire.trim().replace(/\r\n?/g, "\n") : "";
  return commentaire === "" ? { refus: VIDE, detail: "" } : { geste: "renvoyer", commentaire };
}

// Le geste du chef sur la carte `design` du projet de `depot`, joué par la commande du runtime : ses arguments, puis ce
// qu'elle a dit. Une commande qui refuse dit pourquoi, la carte reste ; une commande qui ne se charge pas, ou lève autre
// chose que sa sortie, dit qu'elle n'a pas pu tourner, et son erreur au survol.
export async function jouerLaValidation({ depot, design, geste, commande, env }: { depot: string; design: ValidationDesign | undefined; geste: unknown; commande: () => Promise<CommandeChargee>; env: Record<string, string | undefined> }): Promise<RenduDeValidation> {
  const lu = gesteLu(design, geste);
  if ("refus" in lu || design === undefined) return "refus" in lu ? lu : { refus: INCONNUE, detail: "" };
  const cible = `${depot}#${design.pr}`;
  const args = lu.geste === "valider" ? ["validate", cible] : ["send-back", cible, "--comment", lu.commentaire];
  return jouerLaCommande({ args, commande, env, parDefaut: lu.geste === "valider" ? `PR #${design.pr} validated` : `PR #${design.pr} sent back` });
}

// Une commande du runtime que le process principal joue, avec ses arguments : ce qu'elle a dit en dernier — `parDefaut`, si
// elle n'a rien dit —, ou pourquoi rien n'est fait. La carte « review before merge » (vue/carte-sensible/, ticket 3224) joue
// la sienne par ce même chemin.
export async function jouerLaCommande({ args, commande, env, parDefaut }: { args: string[]; commande: () => Promise<CommandeChargee>; env: Record<string, string | undefined>; parDefaut: string }): Promise<RenduDeValidation> {
  const dits: string[] = [];
  const redits: string[] = [];
  let chargee: CommandeChargee | undefined;
  try {
    chargee = await commande();
    await chargee.principal({ args, env, dire: (ligne) => void dits.push(ligne), redire: (ligne) => void redits.push(ligne) });
  } catch (erreur) {
    if (chargee?.estUneSortie(erreur) !== true) return { refus: "nothing was done: the kitchen's command could not run", detail: message(erreur) };
    return { refus: `nothing was done: ${sansPrefixe(redits[0] ?? `the command ended with code ${erreur.code}`)}`, detail: redits.join("\n") };
  }
  return { fait: dits.at(-1) ?? parDefaut };
}

// ── Les deux gestes sur le téléphone, sur l'API de GitHub ──

// Ce que le runtime écrit et lit, tel qu'il l'écrit (le test les compare aux siens) : les auteurs de confiance
// (runtime/src/alimenter.ts, `DE_CONFIANCE`), la marque d'un renvoi (runtime/src/qualite-github.ts, `MARQUE_DE_RENVOI`), le
// label d'une livraison à la pass (runtime/src/github-etat/etats.ts, `LABEL_IN_PASS`), la branche d'un ticket
// (runtime/src/brigade-github.ts, `brancheDuTicket`) et la trace qu'une carte laisse sur son ticket.
export const DE_CONFIANCE: readonly string[] = ["OWNER", "MEMBER", "COLLABORATOR"];
export const MARQUE_DE_RENVOI = "<!-- brigade:renvoi";
export const LABEL_IN_PASS = "in-pass";
export const brancheDuTicket = (ticket: number) => `cook/${ticket}-github`;
const MARQUE_DE_RETENUE = /^<!-- brigade:validation-design-carte carte=([1-9][0-9]*) pr=([1-9][0-9]*) sha=([0-9a-f]{7,40}) -->/;

// Le client du téléphone : ses lectures, et ses écritures avec le même jeton (priorite.ts, `clientDeLaPriorite`).
export type ClientDeLaValidation = { lire: AppelGitHub; ecrire: (methode: MethodeDEcriture, chemin: string, corps?: unknown) => Promise<ReponseGitHub> };

// Un refus de la règle — rien n'est fait, ou la carte est fermée et le dit — par opposition à GitHub qui ne répond pas.
class Refus extends Error {}

type Brut = Record<string, unknown>;
const objet = (valeur: unknown): Brut => (typeof valeur === "object" && valeur !== null && !Array.isArray(valeur) ? (valeur as Brut) : {});
const chaine = (valeur: unknown): string => (typeof valeur === "string" ? valeur : "");

// Le geste du chef sur la carte `carte` du projet de `depot` — `design`, ce que la dernière lecture en porte —, joué sur
// l'API de GitHub. Ce qu'il fait, dit comme la commande du runtime le dit ; ou pourquoi rien n'est fait. Une écriture que
// GitHub refuse après une autre dit ce qui est déjà écrit : le geste se rejoue.
export async function validerSurGithub({ depot, carte, design, geste, client }: { depot: string; carte: unknown; design: ValidationDesign | undefined; geste: unknown; client: ClientDeLaValidation }): Promise<RenduDeValidation> {
  const lu = gesteLu(design, geste);
  if ("refus" in lu || design === undefined || typeof carte !== "number") return "refus" in lu ? lu : { refus: INCONNUE, detail: "" };
  const ecrits: string[] = [];
  const github = gestesSurLAPI(depot, client, ecrits);
  const nom = `${depot}#${design.pr}`;
  try {
    if (lu.geste === "valider") {
      const { ticket, enAttente } = await validerLaCarte(github, carte, design);
      return { fait: enAttente ? `${nom} validated: your validation is kept, card #${carte} closed — the branch was updated since the card and is being checked again; the pass merges it once its head is green` : `${nom} validated: merged, card #${carte} closed — ticket #${ticket} is served` };
    }
    const { ticket } = await renvoyerLaCarte(github, carte, design, lu.commentaire);
    return { fait: `${nom} sent back: #${ticket} goes back to a cook with your comment, card #${carte} closed — its next delivery comes back as a new card` };
  } catch (erreur) {
    if (erreur instanceof Refus) return { refus: ecrits.length === 0 ? `nothing was done: ${erreur.message}` : erreur.message, detail: ecrits.length === 0 ? "" : `already written on GitHub: ${ecrits.join("; ")}` };
    if (ecrits.length === 0) return { refus: "nothing was done: GitHub did not take the gesture", detail: message(erreur) };
    return { refus: `GitHub stopped the gesture midway — already written: ${ecrits.join("; ")}; play it again`, detail: message(erreur) };
  }
}

// Ce que les deux gestes lisent et écrivent sur GitHub ; chaque écriture faite est notée dans `ecrits`.
function gestesSurLAPI(depot: string, client: ClientDeLaValidation, ecrits: string[]) {
  const lire = async (chemin: string, quoi: string): Promise<unknown> => {
    const lu = await client.lire(chemin);
    if (lu.status !== 200) throw refusDe(quoi, lu);
    return lu.data;
  };
  const ecrire = async (methode: MethodeDEcriture, chemin: string, corps: unknown, quoi: string, attendus: readonly number[]): Promise<ReponseGitHub> => {
    const rendu = await client.ecrire(methode, chemin, corps);
    if (!attendus.includes(rendu.status)) throw refusDe(quoi, rendu);
    ecrits.push(quoi);
    return rendu;
  };
  return {
    issue: async (numero: number) => objet(await lire(`/repos/${depot}/issues/${numero}`, `the reading of #${numero}`)),
    pr: async (numero: number) => objet(await lire(`/repos/${depot}/pulls/${numero}`, `the reading of PR #${numero}`)),
    // Les commentaires de l'issue, page après page — dix au plus, comme toute liste que l'app lit.
    async commentaires(numero: number): Promise<Array<{ body: string; association: string }>> {
      const tous: Array<{ body: string; association: string }> = [];
      for (let page = 1; page <= 10; page++) {
        const lue = await lire(`/repos/${depot}/issues/${numero}/comments?per_page=100&page=${page}`, `the reading of the comments of #${numero}`);
        if (!Array.isArray(lue)) throw new Error(`GitHub's answer for the comments of #${numero} is not a list`);
        tous.push(...lue.map(objet).map((brut) => ({ body: chaine(brut.body), association: chaine(brut.author_association) || "NONE" })));
        if (lue.length < 100) break;
      }
      return tous;
    },
    commenter: (numero: number, corps: string) => ecrire("POST", `/repos/${depot}/issues/${numero}/comments`, { body: corps }, `a comment on #${numero}`, [201]),
    // Une issue qui ne porte pas le label : rien à retirer.
    delabelliser: (numero: number, label: string) => ecrire("DELETE", `/repos/${depot}/issues/${numero}/labels/${encodeURIComponent(label)}`, undefined, `\`${label}\` taken off #${numero}`, [200, 404]),
    fermer: (numero: number) => ecrire("PATCH", `/repos/${depot}/issues/${numero}`, { state: "closed", state_reason: "completed" }, `#${numero} closed`, [200]),
    // Le merge à la tête `sha` : un refus de GitHub (4xx) est une réponse — rien n'est mergé —, tout autre statut lève.
    async merger(numero: number, sha: string): Promise<{ fait: true } | { fait: false; motif: string }> {
      const rendu = await client.ecrire("PUT", `/repos/${depot}/pulls/${numero}/merge`, { sha, merge_method: "merge" });
      if (rendu.status === 200) {
        ecrits.push(`PR #${numero} merged`);
        return { fait: true };
      }
      if (rendu.status < 400 || rendu.status >= 500) throw refusDe(`the merge of PR #${numero}`, rendu);
      const dit = chaine(objet(rendu.data).message);
      return { fait: false, motif: `HTTP ${rendu.status}${dit === "" ? "" : ` — ${dit}`}` };
    },
  };
}
type GitHubDeLaValidation = ReturnType<typeof gestesSurLAPI>;

// La carte, relue : encore ouverte, posée par un auteur de confiance, et portant la PR, le ticket et la tête que la
// dernière lecture en a lus — sinon elle ne tient plus cette livraison (runtime : `carteDeLaPR`).
async function carteQuiTient(github: GitHubDeLaValidation, carte: number, { pr, ticket, sha }: ValidationDesign): Promise<void> {
  const issue = await github.issue(carte);
  const lu = DE_CONFIANCE.includes(chaine(issue.author_association)) ? MARQUE.exec(chaine(issue.body)) : null;
  if (issue.state !== "open" || lu === null || Number(lu[1]) !== pr || Number(lu[2]) !== ticket || lu[3] !== sha) throw new Refus(`no open “Validate its screen” card holds PR #${pr}`);
}

// La PR de la carte, relue : encore la livraison de son ticket, sur sa branche (runtime : `prDeLaCarte`).
async function prDeLaCarte(github: GitHubDeLaValidation, { pr, ticket }: ValidationDesign): Promise<{ sha: string; state: string; merged: boolean }> {
  const lue = await github.pr(pr);
  const tete = objet(lue.head);
  if (tete.ref !== brancheDuTicket(ticket)) throw new Refus(`PR #${pr} is no longer the delivery of #${ticket}`);
  return { sha: chaine(tete.sha), state: chaine(lue.state), merged: lue.merged === true || (lue.merged_at ?? null) !== null };
}

// La dernière trace de la carte sur le ticket, et si un renvoi la suit ; nulle si le ticket ne la dit pas (runtime :
// `derniereRetenue`).
function derniereRetenue(commentaires: ReadonlyArray<{ body: string; association: string }>, carte: number): { renvoyee: boolean } | null {
  const sures = commentaires.filter((c) => DE_CONFIANCE.includes(c.association));
  const rang = sures.findLastIndex((c) => Number(MARQUE_DE_RETENUE.exec(c.body)?.[1]) === carte);
  return rang === -1 ? null : { renvoyee: sures.slice(rang + 1).some((c) => c.body.startsWith(MARQUE_DE_RENVOI)) };
}

// Ferme une carte : un mot dessus, `chef-todo` retiré, l'issue fermée.
async function fermerLaCarte(github: GitHubDeLaValidation, carte: number, mot: string): Promise<void> {
  await github.commenter(carte, mot);
  await github.delabelliser(carte, LABEL_DU_CHEF);
  await github.fermer(carte);
}

// Valider (runtime : `valider`) : merge la tête que la pass a jugée verte et que la carte porte, puis ferme la carte. La tête
// a bougé sans qu'un renvoi suive la carte — la branche mise à jour depuis sa base — : la validation s'écrit sur le ticket,
// la carte se ferme, et la pass merge la PR une fois sa tête verte (ticket 3332) — `enAttente`.
async function validerLaCarte(github: GitHubDeLaValidation, carte: number, design: ValidationDesign): Promise<{ ticket: number; enAttente: boolean }> {
  const { pr, ticket, sha } = design;
  await carteQuiTient(github, carte, design);
  const lue = await prDeLaCarte(github, design);
  if (!lue.merged) {
    if (lue.state !== "open") throw new Refus(`PR #${pr} is closed without being merged: there is nothing to validate`);
    const retenue = derniereRetenue(await github.commentaires(ticket), carte);
    if (retenue === null || retenue.renvoyee) {
      const pourquoi = retenue === null ? `ticket #${ticket} does not say card #${carte}` : `the delivery of PR #${pr} went back to a cook since card #${carte}`;
      await fermerLaCarte(github, carte, `Closed by the kitchen: ${pourquoi}. Its next delivery comes back as a new card.`);
      throw new Refus(`${pourquoi}: nothing merged, card #${carte} closed — its next delivery comes back as a new card`);
    }
    if (lue.sha !== sha) {
      const de = `\`${sha.slice(0, 7)}\` → \`${lue.sha.slice(0, 7)}\``;
      await github.commenter(ticket, `<!-- brigade:validation-design-validee carte=${carte} pr=${pr} sha=${sha} -->\nValidated by the chef on card #${carte} — merge pending. The branch of PR #${pr} was updated since the card (${de}), with no new delivery of a cook: the answer is kept, and the pass merges PR #${pr} once it judges its head green, without a new card. Only a cook changing the delivery (a send-back to the kitchen) asks the chef again.`);
      await fermerLaCarte(github, carte, `Validated by the chef: the answer is kept — merge pending. The branch of PR #${pr} was updated since this card (${de}) and is being checked again: the pass merges it once its head is green.`);
      return { ticket, enAttente: true };
    }
    const merge = await github.merger(pr, sha);
    if (!merge.fait) throw new Refus(`GitHub refused to merge PR #${pr} — ${merge.motif}; card #${carte} stays open`);
  }
  await fermerLaCarte(github, carte, `Validated by the chef: PR #${pr} is merged.`);
  return { ticket, enAttente: false };
}

// Renvoyer (runtime : `renvoyerLeDesign`) : la livraison repart à un cook, le commentaire du chef comme ce qu'il faut
// changer — un renvoi sur sa tête, que le cook lit sur le ticket, et `in-pass` retiré —, puis la carte se ferme.
async function renvoyerLaCarte(github: GitHubDeLaValidation, carte: number, design: ValidationDesign, aChanger: string): Promise<{ ticket: number }> {
  const { pr, ticket } = design;
  await carteQuiTient(github, carte, design);
  const lue = await prDeLaCarte(github, design);
  if (lue.state !== "open" || lue.merged) throw new Refus(`PR #${pr} is no longer open: there is nothing to send back`);
  const renvois = (await github.commentaires(ticket)).filter((c) => DE_CONFIANCE.includes(c.association) && c.body.startsWith(MARQUE_DE_RENVOI));
  await github.commenter(ticket, `${MARQUE_DE_RENVOI} n=${renvois.length + 1} sha=${lue.sha} -->\nThe chef sent the design of PR #${pr} back to a cook — the chef asks for changes to the screen:\n\n${aChanger}\n\nChange the screen as asked, take its before and after captures again, and deliver.`);
  await github.delabelliser(ticket, LABEL_IN_PASS);
  await fermerLaCarte(github, carte, `Sent back to a cook by the chef: ${aChanger}`);
  return { ticket };
}

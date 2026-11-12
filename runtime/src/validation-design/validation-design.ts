// Une livraison design validée par un humain (#3184). Un projet qui le
// demande (`humanValidatesDesigns` dans `.claude/brigade/projet.json`) ne voit
// plus la pass merger seule une livraison qui change ce que l'utilisateur voit
// — un écran de l'app, le site, un visuel : verte, elle attend sa carte.
//
// - La pass, au moment de merger (`brigade-github.ts`, `merger`), demande à
//   `retenirLeDesign` : nul, elle merge comme avant ; un motif, elle ne merge
//   pas. Une livraison design sans ses captures avant/après repart à son cook,
//   qui les prend, sans carte ni chef. Avec, une issue `chef-todo` « Validate
//   its screen » porte la question, le lien de la PR, son brief (`brief.ts`,
//   #3330) et les captures en images, et son numéro dans un marqueur que
//   l'app lit, avec la tête jugée verte
//   (`<!-- brigade:validation-design pr=<PR> ticket=<ticket> sha=<sha> -->`).
//   Le ticket garde la trace de sa carte (`<!-- brigade:validation-design-carte
//   … -->`) : tant qu'elle est ouverte et qu'aucun renvoi ne la suit, la pass
//   n'en pose pas d'autre, même sur une tête neuve (#3332) — une tête qui bouge
//   sans renvoi est une mise à jour de la branche depuis sa base, pas une
//   livraison neuve : l'écran est le même, la carte aussi. Seule la livraison
//   d'un cook, après un renvoi, revient en carte neuve ; un renvoi ferme la
//   carte qu'il dépasse (`fermerLaCarteDepassee`).
// - Deux gestes, que l'app appelle (`commande.ts`) : `valider` merge la tête de
//   la carte — jamais une autre, ni après un renvoi de la pass — et ferme la
//   carte ; la tête a bougé depuis (une mise à jour depuis la base), la
//   validation s'écrit sur le ticket (`<!-- brigade:validation-design-validee
//   … -->`) et la carte se ferme : la pass merge la PR quand elle juge sa tête
//   verte, sans reposer de carte, tant qu'aucun renvoi ne suit la validation
//   (#3332). `renvoyerLeDesign` renvoie la livraison à un cook avec le
//   commentaire du chef comme ce qu'il faut changer, et ferme la carte. La
//   livraison suivante revient en carte neuve, avec ses captures neuves.
//
// Réglage absent ou faux : rien ne change, la pass merge.
//
// La carte, la pose d'une seule par tête et les deux gestes valent pour toute
// livraison que la pass retient pour le chef (`SorteDeRetenue`) : le ticket
// sensible (#3223, `sensible/`) s'en sert aussi.
import { DE_CONFIANCE } from "../alimenter.ts";
import { capturesLivrees, capturesManquantes, direCaptures, dossierDesCaptures, estDInterface, VISUELS, type CapturesDEcran } from "../captures.ts";
import { LABEL_IN_PASS } from "../github-etat/etats.ts";
import { CHEF_TODO, corpsDeCarte, type Sorte } from "../github-seul/carte-todo/carte-todo.ts";
import type { GitHub, PR } from "../github.ts";
import { MARQUE_DE_RENVOI } from "../qualite-github.ts";
import { GesteRefuse } from "../rail.ts";
import { possede } from "../zones.ts";
import { ceQuiEstDemande, ceQuiEstFait, lignesDuBrief } from "./brief.ts";

// Le titre de la carte, et la sorte de son commentaire de carte : l'app les lit.
export const TITRE_DE_CARTE = "Validate its screen";
export const SORTE_DE_CARTE = "design-validation";

// Le réglage du projet, tel que la station le relit à chaque merge : vrai
// seulement s'il est posé à `true`.
export function designsValidesParUnHumain(config: unknown): boolean {
  return typeof config === "object" && config !== null && (config as { humanValidatesDesigns?: unknown }).humanValidatesDesigns === true;
}

// Une livraison design change ce que l'utilisateur voit : la vue de l'app, ou
// un ticket désigné pour le cook design (`estDInterface`), le site, une
// maquette, ou des captures d'écran livrées pour le ticket.
export function estUneLivraisonDesign(ticket: number, fichiers: readonly string[], labels: readonly string[]): boolean {
  return estDInterface({ zone: [...fichiers], labels }) || fichiers.some((fichier) => VISUELS.some((visuel) => possede(visuel, fichier))) || capturesLivrees(ticket, fichiers).length > 0;
}

// ── La carte ──

// Une sorte de carte qui retient une livraison verte pour le chef : celle-ci,
// et le ticket sensible (#3223, `sensible/`). Chacune a ses marqueurs — `mot` —,
// son titre, sa sorte de carte de TODO et ses mots ; le reste, une carte par
// tête, le merge de la tête jugée verte et le renvoi au cook, est commun.
export type SorteDeRetenue = {
  // Le mot de ses marqueurs : `<!-- brigade:<mot> pr=… -->` sur la carte,
  // `<!-- brigade:<mot>-carte … -->` sur le ticket.
  mot: string;
  titre: string;
  sorte: Sorte;
  // La question de la carte, sur sa première ligne : ce que le TODO du chef montre.
  question(ticket: number, pr: number): string;
  // Pourquoi la pass ne merge pas, sur le ticket, puis ce qu'elle en fait.
  pourquoi: string;
  tenue: string;
  // Ce qui a mergé, sur la carte qui se ferme : « <faite>: PR #N is merged. »
  faite: string;
  // La réponse du chef gardée quand la tête a bougé depuis la carte, avant le
  // merge que la pass fera : « <gardee> on card #C — merge pending. »
  gardee: string;
  // Le renvoi du chef sur le ticket, après son marqueur.
  renvoi(pr: number, note: string): string;
  // Le refus d'un renvoi sans note.
  sansNote: string;
};

export const DESIGN: SorteDeRetenue = {
  mot: "validation-design",
  titre: TITRE_DE_CARTE,
  sorte: SORTE_DE_CARTE,
  question: (ticket, pr) => `Does the screen of #${ticket} look right? Validate it and PR #${pr} is merged; send it back with what to change and a cook takes it up again.`,
  pourquoi: "the delivery is green, and a human validates the designs of this project",
  tenue: "held for the chef's validation of its screen",
  faite: "Validated by the chef",
  gardee: "Validated by the chef",
  renvoi: (pr, note) => `The chef sent the design of PR #${pr} back to a cook — the chef asks for changes to the screen:\n\n${note}\n\nChange the screen as asked, take its before and after captures again, and deliver.`,
  sansNote: "the comment says what to change: it cannot be empty",
};

const marqueDeCarte = (sorte: SorteDeRetenue, pr: number, ticket: number, sha: string) => `<!-- brigade:${sorte.mot} pr=${pr} ticket=${ticket} sha=${sha} -->`;

// La PR, le ticket et la tête jugée verte qu'une carte de cette sorte tient,
// lus dans son corps ; null si ce n'en est pas une.
export function carteDuCorpsDe(sorte: SorteDeRetenue, corps: string): { pr: number; ticket: number; sha: string } | null {
  const lu = new RegExp(`^<!-- brigade:${sorte.mot} pr=([1-9][0-9]*) ticket=([1-9][0-9]*) sha=([0-9a-f]{7,40}) -->`).exec(corps);
  return lu === null ? null : { pr: Number(lu[1]), ticket: Number(lu[2]), sha: lu[3] ?? "" };
}

// La PR, le ticket et la tête jugée verte qu'une carte valide, lus dans son
// corps ; null si ce n'en est pas une.
export const carteDuCorps = (corps: string) => carteDuCorpsDe(DESIGN, corps);

const adresseDeLaPR = (depot: string, pr: number) => `https://github.com/${depot}/pull/${pr}`;

type CarteAPoser = { depot: string; ticket: { number: number; title: string }; pr: number; sha: string; suite: readonly string[] };

// Le corps de l'issue de la carte : le marqueur, la question, le lien de la
// PR, puis ce que la sorte y ajoute (chaque écran avant et après, en images).
function corpsDeLaCarte(sorte: SorteDeRetenue, { depot, ticket, pr, sha, suite }: CarteAPoser): string {
  return [marqueDeCarte(sorte, pr, ticket.number, sha), `**${sorte.question(ticket.number, pr)}**`, "", `Ticket: #${ticket.number} — ${ticket.title}`, `Pull request: ${adresseDeLaPR(depot, pr)}`, ...(suite.length === 0 ? [] : ["", ...suite])].join("\n");
}

// ── La pass ──

const marqueDeRetenue = (sorte: SorteDeRetenue, carte: number, pr: number, sha: string) => `<!-- brigade:${sorte.mot}-carte carte=${carte} pr=${pr} sha=${sha} -->`;

// La dernière trace sur le ticket de la carte qui retient `pr`, et si un
// renvoi la suit ; null si le ticket n'en dit aucune.
function derniereRetenue(sorte: SorteDeRetenue, commentaires: ReadonlyArray<{ body: string; association: string }>, retient: (carte: number, pr: number) => boolean): { carte: number; pr: number; renvoyee: boolean } | null {
  const marque = new RegExp(`^<!-- brigade:${sorte.mot}-carte carte=([1-9][0-9]*) pr=([1-9][0-9]*) sha=([0-9a-f]{7,40}) -->`);
  const sures = commentaires.filter((c) => DE_CONFIANCE.includes(c.association));
  const rang = sures.findLastIndex((c) => {
    const lu = marque.exec(c.body);
    return lu !== null && retient(Number(lu[1]), Number(lu[2]));
  });
  if (rang === -1) return null;
  const lu = marque.exec(sures[rang]?.body ?? "");
  return { carte: Number(lu?.[1]), pr: Number(lu?.[2]), renvoyee: sures.slice(rang + 1).some((c) => c.body.startsWith(MARQUE_DE_RENVOI)) };
}

// La réponse du chef gardée sur le ticket quand la tête de la PR avait bougé
// depuis sa carte (#3332) : la carte, la PR et la tête que la carte portait.
const marqueDeValidation = (sorte: SorteDeRetenue, carte: number, pr: number, sha: string) => `<!-- brigade:${sorte.mot}-validee carte=${carte} pr=${pr} sha=${sha} -->`;

// La réponse du chef qui tient encore `pr`, d'après le ticket : la dernière
// qu'il y a gardée pour elle, si aucun renvoi ne la suit — un renvoi, c'est un
// cook qui change la livraison, et le chef est redemandé ; une tête qui bouge
// sans renvoi, c'est la branche mise à jour depuis sa base, et la réponse
// tient. Comme l'approbation de la relecture (`github-etat/fusion.ts`).
function validationQuiTient(sorte: SorteDeRetenue, commentaires: ReadonlyArray<{ body: string; association: string }>, pr: number): { carte: number; sha: string } | null {
  const marque = new RegExp(`^<!-- brigade:${sorte.mot}-validee carte=([1-9][0-9]*) pr=([1-9][0-9]*) sha=([0-9a-f]{7,40}) -->`);
  const sures = commentaires.filter((c) => DE_CONFIANCE.includes(c.association));
  const rang = sures.findLastIndex((c) => Number(marque.exec(c.body)?.[2]) === pr);
  if (rang === -1 || sures.slice(rang + 1).some((c) => c.body.startsWith(MARQUE_DE_RENVOI))) return null;
  const lu = marque.exec(sures[rang]?.body ?? "");
  return { carte: Number(lu?.[1]), sha: lu?.[3] ?? "" };
}

// Combien de réponses du chef tiennent `pr` sur le ticket, toutes sortes de
// carte confondues : la pass, qui ne retente pas une livraison retenue sur la
// même tête, la retente quand ce nombre change — le chef a répondu (#3332).
export async function reponsesGardees(sortes: readonly SorteDeRetenue[], github: Pick<GitHubDeLaRetenue, "commentaires">, ticket: number, pr: number): Promise<number> {
  const commentaires = await github.commentaires(ticket);
  return sortes.filter((sorte) => validationQuiTient(sorte, commentaires, pr) !== null).length;
}

export type GitHubDeLaRetenue = Pick<GitHub, "creerIssue" | "commenter" | "delabelliser" | "fermerIssue"> & { commentaires(numero: number): Promise<Array<{ body: string; association: string }>>; issue?: GitHub["issue"] };

export type LivraisonARetenir = {
  // `owner/name` du projet ; absent, la carte ne sait pas montrer ses captures.
  depot: string | undefined;
  station: string;
  ticket: { number: number; title: string; labels: readonly string[] };
  pr: { number: number; sha: string };
  // Les fichiers que la PR change ; null s'ils ne se sont pas lus.
  fichiers: readonly string[] | null;
  // Le renvoi de la pass au cook, avec sa raison.
  renvoyer(raison: string): Promise<void>;
};

// La raison du renvoi d'une livraison design sans ses captures.
const raisonSansCaptures = (ticket: number, manque: string) =>
  `the design delivery does not carry its before/after captures (missing: ${manque}): take each screen it changes before and after with \`scripts/capture-ecran/\`, commit them as \`${dossierDesCaptures(ticket)}/<screen>-avant.png\` and \`${dossierDesCaptures(ticket)}/<screen>-apres.png\`, and deliver again`;

// Ferme une carte : un mot dessus, `chef-todo` retiré, l'issue fermée.
async function fermerLaCarte(github: Pick<GitHub, "commenter" | "delabelliser" | "fermerIssue">, carte: number, mot: string): Promise<void> {
  await github.commenter(carte, mot);
  await github.delabelliser(carte, CHEF_TODO);
  await github.fermerIssue(carte);
}

// La carte, d'après sa dernière trace : ouverte, ou fermée et rien à faire.
async function estOuverte(github: Pick<GitHubDeLaRetenue, "issue">, carte: number): Promise<boolean> {
  if (github.issue === undefined) return true;
  const lue = await github.issue(carte);
  return lue !== null && lue.state === "open";
}

const motDuRenvoi = (pr: number) => `Closed by the kitchen: the delivery of PR #${pr} went back to a cook since this card — there is nothing to answer on it. Its next delivery comes back as a new card.`;

// La carte qui tient encore la PR, d'après le ticket : la dernière posée pour
// elle, si aucun renvoi ne la suit et qu'elle est encore ouverte — sur sa tête
// ou sur une autre : une tête qui bouge sans renvoi est la branche mise à jour
// depuis sa base, l'écran que la carte montre est le même (#3332). Une carte
// qu'un renvoi a dépassée (la CI rougie après une mise à jour, une livraison
// sans captures) est fermée : sa livraison n'est plus celle-là.
async function carteQuiTient(sorte: SorteDeRetenue, github: GitHubDeLaRetenue, commentaires: ReadonlyArray<{ body: string; association: string }>, pr: number): Promise<number | null> {
  const derniere = derniereRetenue(sorte, commentaires, (_, sienne) => sienne === pr);
  if (derniere === null) return null;
  const { carte } = derniere;
  if (!(await estOuverte(github, carte))) return null;
  if (!derniere.renvoyee) return carte;
  await fermerLaCarte(github, carte, motDuRenvoi(pr));
  return null;
}

// La carte qui attend encore le chef pour `pr`, quelle que soit sa tête : la
// dernière posée pour elle, ouverte, qu'aucun renvoi ne suit ; null sinon.
// Lecture seule — rien ne se ferme ici. Une carte posée est le garde du merge
// même quand le réglage du projet ne se lit plus, ou qu'une autre station ne
// l'a pas (#3347) : `humanValidatesDesigns` retire, la carte retient encore.
export async function carteEnAttenteDuChef(sorte: SorteDeRetenue, github: GitHubDeLaRetenue, ticket: number, pr: number): Promise<number | null> {
  const derniere = derniereRetenue(sorte, await github.commentaires(ticket), (_, sienne) => sienne === pr);
  if (derniere === null || derniere.renvoyee) return null;
  const lue = github.issue === undefined ? null : await github.issue(derniere.carte);
  return github.issue === undefined || (lue !== null && lue.state === "open") ? derniere.carte : null;
}

// Un renvoi vient d'être posé sur le ticket : la carte de cette sorte qu'il
// dépasse, encore ouverte, n'attend plus rien du chef — elle quitte TODO tout
// de suite, sans attendre la livraison suivante (#3332). Rend la carte fermée,
// ou null.
export async function fermerLaCarteDepassee(sorte: SorteDeRetenue, github: Pick<GitHubDeLaRetenue, "commentaires" | "issue" | "commenter" | "delabelliser" | "fermerIssue">, ticket: number): Promise<number | null> {
  const derniere = derniereRetenue(sorte, await github.commentaires(ticket), () => true);
  if (derniere === null || !derniere.renvoyee || !(await estOuverte(github, derniere.carte))) return null;
  await fermerLaCarte(github, derniere.carte, motDuRenvoi(derniere.pr));
  return derniere.carte;
}

// Retient la livraison verte pour le chef, sur une carte de cette sorte : la
// carte qui la tient déjà, sinon une neuve — jamais deux. Rend le motif pour
// lequel la pass ne la merge pas ; null si le chef a déjà répondu pour elle
// et qu'aucun renvoi n'a suivi (`validationQuiTient`) — sur une carte de
// cette sorte ou de l'une de `repondues` — : la pass la merge. Le dépôt
// inconnu, ou une carte que GitHub ne crée pas, lèvent : la pass le dit, ne
// merge pas, et réessaie. `suite` : ce que la carte porte après le lien de la
// PR, lu seulement quand une carte neuve se pose.
export async function tenirPourLeChef(sorte: SorteDeRetenue, github: GitHubDeLaRetenue, livraison: Pick<LivraisonARetenir, "depot" | "station" | "ticket" | "pr">, suite: (depot: string) => Promise<readonly string[]> = async () => [], repondues: readonly SorteDeRetenue[] = []): Promise<string | null> {
  const { ticket, pr } = livraison;
  const commentaires = await github.commentaires(ticket.number);
  if ([sorte, ...repondues].some((repondue) => validationQuiTient(repondue, commentaires, pr.number) !== null)) return null;
  const tenue = await carteQuiTient(sorte, github, commentaires, pr.number);
  if (tenue !== null) return `${sorte.tenue} (card #${tenue})`;
  if (livraison.depot === undefined) throw new Error(`the station does not know its repository: the card of PR #${pr.number} cannot link it — not merged on this turn`);
  const corps = corpsDeLaCarte(sorte, { depot: livraison.depot, ticket, pr: pr.number, sha: pr.sha, suite: await suite(livraison.depot) });
  const carte = await github.creerIssue({ titre: sorte.titre, corps, labels: [CHEF_TODO] });
  await github.commenter(carte, corpsDeCarte({ sorte: sorte.sorte, texte: `${sorte.question(ticket.number, pr.number)}\n\nPull request: ${adresseDeLaPR(livraison.depot, pr.number)}` }));
  await github.commenter(ticket.number, `${marqueDeRetenue(sorte, carte, pr.number, pr.sha)}\nStation \`${livraison.station}\`: ${sorte.pourquoi} — ${sorte.tenue}, card #${carte}.`);
  return `${sorte.tenue} (card #${carte})`;
}

// Ce que la pass fait d'une livraison verte, au moment de la merger, quand le
// projet veut qu'un humain valide ses designs : null, elle la merge ; sinon le
// motif pour lequel elle ne la merge pas. Les fichiers de la PR illisibles, ou
// le dépôt inconnu, lèvent : la pass le dit, ne merge pas, et réessaie.
export async function retenirLeDesign(github: GitHubDeLaRetenue, livraison: LivraisonARetenir): Promise<string | null> {
  const { ticket, pr, fichiers } = livraison;
  if (fichiers === null) throw new Error(`the files of PR #${pr.number} could not be read: whether it is a design delivery, which a human validates on this project, is not known — not merged on this turn`);
  if (!estUneLivraisonDesign(ticket.number, fichiers, ticket.labels)) return null;
  const screens = capturesLivrees(ticket.number, fichiers);
  const manque = capturesManquantes(screens);
  if (manque !== null) {
    await livraison.renvoyer(raisonSansCaptures(ticket.number, manque));
    return `design delivery without its captures (${manque}): sent back to its cook for them`;
  }
  return tenirPourLeChef(DESIGN, github, livraison, async (depot) => [...(await briefDeLaCarte(github, ticket, pr.number)), ...direCaptures(depot, ticket.number, { sha: pr.sha, screens })]);
}

// Le brief en tête de la carte (#3330) : ce que le ticket demandait, tiré de
// son issue — son titre seul si GitHub ne la trouve pas —, et ce que le cook a
// changé à l'écran, tel que la station l'a posté sur la PR. L'issue ou les
// commentaires de la PR que GitHub ne donne pas lèvent : la pass le dit, ne
// merge pas, et réessaie.
async function briefDeLaCarte(github: GitHubDeLaRetenue, ticket: { number: number; title: string }, pr: number): Promise<string[]> {
  const issue = github.issue === undefined ? null : await github.issue(ticket.number);
  const fait = ceQuiEstFait(await github.commentaires(pr));
  return lignesDuBrief(ceQuiEstDemande(ticket.title, issue?.body ?? null), fait);
}

// ── Les gestes du chef ──

export type GitHubDesGestes = Pick<GitHub, "ouvertes" | "commentaires" | "commenter" | "delabelliser" | "fermerIssue" | "prDeBranche" | "merger" | "creerIssue">;

// La carte ouverte de cette sorte qui tient la PR, son ticket et sa tête jugée
// verte ; refusé s'il n'y en a pas.
async function carteDeLaPR(sorte: SorteDeRetenue, github: Pick<GitHub, "ouvertes">, pr: number): Promise<{ carte: number; ticket: number; sha: string }> {
  const sondage = await github.ouvertes();
  if (sondage.inchange) throw new Error("GitHub did not return the list of open issues");
  for (const issue of sondage.issues) {
    const lue = DE_CONFIANCE.includes(issue.association) ? carteDuCorpsDe(sorte, issue.body) : null;
    if (lue?.pr === pr) return { carte: issue.number, ticket: lue.ticket, sha: lue.sha };
  }
  throw new GesteRefuse(`no open “${sorte.titre}” card holds PR #${pr}`);
}

// La PR de la carte, relue : encore la livraison de son ticket.
async function prDeLaCarte(github: Pick<GitHub, "prDeBranche">, pr: number, ticket: number, brancheDuTicket: (ticket: number) => string): Promise<PR> {
  const lue = await github.prDeBranche(brancheDuTicket(ticket));
  if (lue === null || lue.number !== pr) throw new GesteRefuse(`PR #${pr} is no longer the delivery of #${ticket}`);
  return lue;
}

// La réponse du chef gardée, et ce qui suit, sur le ticket et sur la carte :
// les mêmes mots que la commande du runtime et le téléphone écrivent.
const gardeeSurLeTicket = (gardee: string, carte: number, pr: number, sha: string, tete: string) =>
  `${gardee} on card #${carte} — merge pending. The branch of PR #${pr} was updated since the card (\`${sha.slice(0, 7)}\` → \`${tete.slice(0, 7)}\`), with no new delivery of a cook: the answer is kept, and the pass merges PR #${pr} once it judges its head green, without a new card. Only a cook changing the delivery (a send-back to the kitchen) asks the chef again.`;
const gardeeSurLaCarte = (gardee: string, pr: number, sha: string, tete: string) =>
  `${gardee}: the answer is kept — merge pending. The branch of PR #${pr} was updated since this card (\`${sha.slice(0, 7)}\` → \`${tete.slice(0, 7)}\`) and is being checked again: the pass merges it once its head is green.`;

// Merger la carte : merge la tête que la pass a jugée verte et que la carte
// porte, puis ferme la carte. Si la PR a une autre tête sans qu'un renvoi ait
// suivi la carte — la branche mise à jour depuis sa base —, rien ne se merge
// tout de suite : la réponse du chef s'écrit sur le ticket, la carte se ferme,
// et la pass merge la PR quand elle juge sa tête verte (#3332) — `enAttente`.
// Rien ne se merge si la pass a renvoyé la livraison depuis la carte, ou que
// le ticket ne dit pas la carte : celle-là se ferme. Un merge que GitHub
// refuse laisse la carte ouverte, et le dit.
export async function mergerLaCarte(sorte: SorteDeRetenue, github: GitHubDesGestes, pr: number, brancheDuTicket: (ticket: number) => string): Promise<{ carte: number; ticket: number; enAttente: boolean }> {
  const { carte, ticket, sha } = await carteDeLaPR(sorte, github, pr);
  const lue = await prDeLaCarte(github, pr, ticket, brancheDuTicket);
  if (!lue.merged) {
    if (lue.state !== "open") throw new GesteRefuse(`PR #${pr} is closed without being merged: there is nothing to merge`);
    const retenue = derniereRetenue(sorte, await github.commentaires(ticket), (sienne) => sienne === carte);
    if (retenue === null || retenue.renvoyee) {
      const pourquoi = retenue === null ? `ticket #${ticket} does not say card #${carte}` : `the delivery of PR #${pr} went back to a cook since card #${carte}`;
      await fermerLaCarte(github, carte, `Closed by the kitchen: ${pourquoi}. Its next delivery comes back as a new card.`);
      throw new GesteRefuse(`${pourquoi}: nothing merged, card #${carte} closed — its next delivery comes back as a new card`);
    }
    if (lue.sha !== sha) {
      await github.commenter(ticket, `${marqueDeValidation(sorte, carte, pr, sha)}\n${gardeeSurLeTicket(sorte.gardee, carte, pr, sha, lue.sha)}`);
      await fermerLaCarte(github, carte, gardeeSurLaCarte(sorte.gardee, pr, sha, lue.sha));
      return { carte, ticket, enAttente: true };
    }
    const merge = await github.merger(pr, sha);
    if (!merge.fait) throw new GesteRefuse(`GitHub refused to merge PR #${pr} — ${merge.motif}; card #${carte} stays open`);
  }
  await fermerLaCarte(github, carte, `${sorte.faite}: PR #${pr} is merged.`);
  return { carte, ticket, enAttente: false };
}

// Ce que la commande dit d'une validation gardée, le merge en attente : le
// téléphone le dit à la lettre (app/src/vue/validation-design/).
export const validationGardee = (nom: string, carte: number) => `${nom} validated: your validation is kept, card #${carte} closed — the branch was updated since the card and is being checked again; the pass merges it once its head is green`;

// Valider : merger la carte « Validate its screen ».
export const valider = (github: GitHubDesGestes, pr: number, brancheDuTicket: (ticket: number) => string) => mergerLaCarte(DESIGN, github, pr, brancheDuTicket);

// Renvoyer la carte : la livraison repart à un cook, la note du chef comme ce
// qu'il faut changer — un renvoi sur sa tête, que le cook lit sur le ticket,
// et `in-pass` retiré —, puis la carte se ferme. Une note vide est refusée.
export async function renvoyerLaCarte(sorte: SorteDeRetenue, github: GitHubDesGestes, pr: number, note: string, brancheDuTicket: (ticket: number) => string): Promise<{ carte: number; ticket: number; suivi?: number }> {
  const aChanger = note.trim();
  if (aChanger === "") throw new GesteRefuse(sorte.sansNote);
  const { carte, ticket } = await carteDeLaPR(sorte, github, pr);
  const lue = await prDeLaCarte(github, pr, ticket, brancheDuTicket);
  if (lue.merged) {
    // Mergée malgré tout : il n'y a plus de livraison à reprendre, le commentaire du chef ouvre un ticket de suite.
    const suivi = await github.creerIssue({ titre: `Follow-up of #${ticket}: the chef asks for changes after PR #${pr} was merged`, corps: `PR #${pr}, the delivery of #${ticket}, was merged before the chef validated it. The chef asks for these changes:\n\n${aChanger}`, labels: [] });
    await fermerLaCarte(github, carte, `PR #${pr} was already merged: the chef's comment is now #${suivi}.\n\n${aChanger}`);
    return { carte, ticket, suivi };
  }
  if (lue.state !== "open") throw new GesteRefuse(`PR #${pr} is no longer open: there is nothing to send back`);
  const renvois = (await github.commentaires(ticket)).filter((c) => DE_CONFIANCE.includes(c.association) && c.body.startsWith(MARQUE_DE_RENVOI));
  await github.commenter(ticket, `${MARQUE_DE_RENVOI} n=${renvois.length + 1} sha=${lue.sha} -->\n${sorte.renvoi(pr, aChanger)}`);
  await github.delabelliser(ticket, LABEL_IN_PASS);
  await fermerLaCarte(github, carte, `Sent back to a cook by the chef: ${aChanger}`);
  return { carte, ticket };
}

// Renvoyer : renvoyer la carte « Validate its screen », le commentaire du chef
// comme ce qu'il faut changer à l'écran.
export const renvoyerLeDesign = (github: GitHubDesGestes, pr: number, commentaire: string, brancheDuTicket: (ticket: number) => string) => renvoyerLaCarte(DESIGN, github, pr, commentaire, brancheDuTicket);

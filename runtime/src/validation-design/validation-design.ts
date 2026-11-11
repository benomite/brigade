// Une livraison design validée par un humain (#3184). Un projet qui le
// demande (`humanValidatesDesigns` dans `.claude/brigade/projet.json`) ne voit
// plus la pass merger seule une livraison qui change ce que l'utilisateur voit
// — un écran de l'app, le site, un visuel : verte, elle attend sa carte.
//
// - La pass, au moment de merger (`brigade-github.ts`, `merger`), demande à
//   `retenirLeDesign` : nul, elle merge comme avant ; un motif, elle ne merge
//   pas. Une livraison design sans ses captures avant/après repart à son cook,
//   qui les prend, sans carte ni chef. Avec, une issue `chef-todo` « Validate
//   its screen » porte la question, les captures en images et le lien de la
//   PR, et son numéro dans un marqueur que l'app lit, avec la tête jugée verte
//   (`<!-- brigade:validation-design pr=<PR> ticket=<ticket> sha=<sha> -->`).
//   Le ticket garde la trace de sa carte (`<!-- brigade:validation-design-carte
//   … -->`) : tant qu'elle est ouverte, sur la même tête, et qu'aucun renvoi ne
//   la suit, la pass n'en pose pas d'autre. Une tête neuve jugée verte à son
//   tour ferme l'ancienne carte et en pose une neuve.
// - Deux gestes, que l'app appelle (`commande.ts`) : `valider` merge la tête de
//   la carte — jamais une autre, ni après un renvoi de la pass — et ferme la
//   carte ; `renvoyerLeDesign` renvoie la livraison à un cook avec le
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
function derniereRetenue(sorte: SorteDeRetenue, commentaires: ReadonlyArray<{ body: string; association: string }>, retient: (carte: number, pr: number) => boolean): { carte: number; sha: string; renvoyee: boolean } | null {
  const marque = new RegExp(`^<!-- brigade:${sorte.mot}-carte carte=([1-9][0-9]*) pr=([1-9][0-9]*) sha=([0-9a-f]{7,40}) -->`);
  const sures = commentaires.filter((c) => DE_CONFIANCE.includes(c.association));
  const rang = sures.findLastIndex((c) => {
    const lu = marque.exec(c.body);
    return lu !== null && retient(Number(lu[1]), Number(lu[2]));
  });
  if (rang === -1) return null;
  const lu = marque.exec(sures[rang]?.body ?? "");
  return { carte: Number(lu?.[1]), sha: lu?.[3] ?? "", renvoyee: sures.slice(rang + 1).some((c) => c.body.startsWith(MARQUE_DE_RENVOI)) };
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

// La carte qui tient encore la PR sur la tête `sha`, d'après le ticket : la
// dernière posée pour elle, si elle porte cette tête, qu'aucun renvoi ne la
// suit et qu'elle est encore ouverte. Une carte qu'un renvoi a dépassée (la CI
// rougie après une mise à jour, une livraison sans captures), ou posée sur une
// tête que la PR n'a plus, est fermée : sa livraison n'est plus celle-là.
async function carteQuiTient(sorte: SorteDeRetenue, github: GitHubDeLaRetenue, ticket: number, pr: number, sha: string): Promise<number | null> {
  const derniere = derniereRetenue(sorte, await github.commentaires(ticket), (_, sienne) => sienne === pr);
  if (derniere === null) return null;
  const { carte } = derniere;
  const lue = github.issue === undefined ? null : await github.issue(carte);
  const ouverte = github.issue === undefined || (lue !== null && lue.state === "open");
  if (!ouverte) return null;
  if (derniere.renvoyee) {
    await fermerLaCarte(github, carte, `Closed by the kitchen: the delivery of PR #${pr} went back to a cook since this card. Its next delivery comes back as a new card.`);
    return null;
  }
  if (derniere.sha === sha) return carte;
  await fermerLaCarte(github, carte, `Closed by the kitchen: the head of PR #${pr} moved from \`${derniere.sha.slice(0, 7)}\` to \`${sha.slice(0, 7)}\`, judged green again — a new card holds it.`);
  return null;
}

// Retient la livraison verte pour le chef, sur une carte de cette sorte : la
// carte qui la tient déjà sur cette tête, sinon une neuve — jamais deux. Rend
// le motif pour lequel la pass ne la merge pas. Le dépôt inconnu, ou une carte
// que GitHub ne crée pas, lèvent : la pass le dit, ne merge pas, et réessaie.
export async function tenirPourLeChef(sorte: SorteDeRetenue, github: GitHubDeLaRetenue, livraison: Pick<LivraisonARetenir, "depot" | "station" | "ticket" | "pr">, suite: readonly string[] = []): Promise<string> {
  const { ticket, pr } = livraison;
  const tenue = await carteQuiTient(sorte, github, ticket.number, pr.number, pr.sha);
  if (tenue !== null) return `${sorte.tenue} (card #${tenue})`;
  if (livraison.depot === undefined) throw new Error(`the station does not know its repository: the card of PR #${pr.number} cannot link it — not merged on this turn`);
  const carte = await github.creerIssue({ titre: sorte.titre, corps: corpsDeLaCarte(sorte, { depot: livraison.depot, ticket, pr: pr.number, sha: pr.sha, suite }), labels: [CHEF_TODO] });
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
  return tenirPourLeChef(DESIGN, github, livraison, livraison.depot === undefined ? [] : direCaptures(livraison.depot, ticket.number, { sha: pr.sha, screens }));
}

// ── Les gestes du chef ──

export type GitHubDesGestes = Pick<GitHub, "ouvertes" | "commentaires" | "commenter" | "delabelliser" | "fermerIssue" | "prDeBranche" | "merger">;

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

// Merger la carte : merge la tête que la pass a jugée verte et que la carte
// porte, puis ferme la carte. Rien ne se merge si la PR a une autre tête (une
// mise à jour que la pass n'a pas encore jugée, un cook qui pousse) : la pass
// pose une carte neuve quand elle la juge verte. Ni si la pass a renvoyé la
// livraison depuis la carte, ou que le ticket ne dit pas la carte : celle-là
// se ferme. Un merge que GitHub refuse laisse la carte ouverte, et le dit.
export async function mergerLaCarte(sorte: SorteDeRetenue, github: GitHubDesGestes, pr: number, brancheDuTicket: (ticket: number) => string): Promise<{ carte: number; ticket: number }> {
  const { carte, ticket, sha } = await carteDeLaPR(sorte, github, pr);
  const lue = await prDeLaCarte(github, pr, ticket, brancheDuTicket);
  if (!lue.merged) {
    if (lue.state !== "open") throw new GesteRefuse(`PR #${pr} is closed without being merged: there is nothing to merge`);
    if (lue.sha !== sha) throw new GesteRefuse(`the head of PR #${pr} moved since card #${carte} (\`${sha.slice(0, 7)}\` judged green, \`${lue.sha.slice(0, 7)}\` now): nothing merged — the pass posts a new card once it judges the new head green`);
    const retenue = derniereRetenue(sorte, await github.commentaires(ticket), (sienne) => sienne === carte);
    if (retenue === null || retenue.renvoyee) {
      const pourquoi = retenue === null ? `ticket #${ticket} does not say card #${carte}` : `the delivery of PR #${pr} went back to a cook since card #${carte}`;
      await fermerLaCarte(github, carte, `Closed by the kitchen: ${pourquoi}. Its next delivery comes back as a new card.`);
      throw new GesteRefuse(`${pourquoi}: nothing merged, card #${carte} closed — its next delivery comes back as a new card`);
    }
    const merge = await github.merger(pr, sha);
    if (!merge.fait) throw new GesteRefuse(`GitHub refused to merge PR #${pr} — ${merge.motif}; card #${carte} stays open`);
  }
  await fermerLaCarte(github, carte, `${sorte.faite}: PR #${pr} is merged.`);
  return { carte, ticket };
}

// Valider : merger la carte « Validate its screen ».
export const valider = (github: GitHubDesGestes, pr: number, brancheDuTicket: (ticket: number) => string) => mergerLaCarte(DESIGN, github, pr, brancheDuTicket);

// Renvoyer la carte : la livraison repart à un cook, la note du chef comme ce
// qu'il faut changer — un renvoi sur sa tête, que le cook lit sur le ticket,
// et `in-pass` retiré —, puis la carte se ferme. Une note vide est refusée.
export async function renvoyerLaCarte(sorte: SorteDeRetenue, github: GitHubDesGestes, pr: number, note: string, brancheDuTicket: (ticket: number) => string): Promise<{ carte: number; ticket: number }> {
  const aChanger = note.trim();
  if (aChanger === "") throw new GesteRefuse(sorte.sansNote);
  const { carte, ticket } = await carteDeLaPR(sorte, github, pr);
  const lue = await prDeLaCarte(github, pr, ticket, brancheDuTicket);
  if (lue.state !== "open" || lue.merged) throw new GesteRefuse(`PR #${pr} is no longer open: there is nothing to send back`);
  const renvois = (await github.commentaires(ticket)).filter((c) => DE_CONFIANCE.includes(c.association) && c.body.startsWith(MARQUE_DE_RENVOI));
  await github.commenter(ticket, `${MARQUE_DE_RENVOI} n=${renvois.length + 1} sha=${lue.sha} -->\n${sorte.renvoi(pr, aChanger)}`);
  await github.delabelliser(ticket, LABEL_IN_PASS);
  await fermerLaCarte(github, carte, `Sent back to a cook by the chef: ${aChanger}`);
  return { carte, ticket };
}

// Renvoyer : renvoyer la carte « Validate its screen », le commentaire du chef
// comme ce qu'il faut changer à l'écran.
export const renvoyerLeDesign = (github: GitHubDesGestes, pr: number, commentaire: string, brancheDuTicket: (ticket: number) => string) => renvoyerLaCarte(DESIGN, github, pr, commentaire, brancheDuTicket);

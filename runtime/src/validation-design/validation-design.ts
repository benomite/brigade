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
//   PR, et son numéro dans un marqueur que l'app lit
//   (`<!-- brigade:validation-design pr=<PR> ticket=<ticket> -->`). Le ticket
//   garde la trace de sa carte (`<!-- brigade:validation-design-carte … -->`) :
//   tant qu'elle est ouverte et qu'aucun renvoi ne la suit, la pass n'en pose
//   pas d'autre.
// - Deux gestes, que l'app appelle (`commande.ts`) : `valider` merge la PR et
//   ferme la carte ; `renvoyerLeDesign` renvoie la livraison à un cook avec le
//   commentaire du chef comme ce qu'il faut changer, et ferme la carte. La
//   livraison suivante revient en carte neuve, avec ses captures neuves.
//
// Réglage absent ou faux : rien ne change, la pass merge.
import { DE_CONFIANCE } from "../alimenter.ts";
import { capturesLivrees, capturesManquantes, direCaptures, dossierDesCaptures, estDInterface, type CapturesDEcran } from "../captures.ts";
import { LABEL_IN_PASS } from "../github-etat/etats.ts";
import { CHEF_TODO, corpsDeCarte } from "../github-seul/carte-todo/carte-todo.ts";
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

// Ce qui, hors de la vue de l'app, se voit : le site et les maquettes.
const VISUELS = ["site", "docs/maquettes"];

// Une livraison design change ce que l'utilisateur voit : la vue de l'app, ou
// un ticket désigné pour le cook design (`estDInterface`), le site, une
// maquette, ou des captures d'écran livrées pour le ticket.
export function estUneLivraisonDesign(ticket: number, fichiers: readonly string[], labels: readonly string[]): boolean {
  return estDInterface({ zone: [...fichiers], labels }) || fichiers.some((fichier) => VISUELS.some((visuel) => possede(visuel, fichier))) || capturesLivrees(ticket, fichiers).length > 0;
}

// ── La carte ──

const MARQUE_DE_CARTE = /^<!-- brigade:validation-design pr=([1-9][0-9]*) ticket=([1-9][0-9]*) -->/;
const marqueDeCarte = (pr: number, ticket: number) => `<!-- brigade:validation-design pr=${pr} ticket=${ticket} -->`;

// La PR et le ticket qu'une carte valide, lus dans son corps ; null si ce
// n'en est pas une.
export function carteDuCorps(corps: string): { pr: number; ticket: number } | null {
  const lu = MARQUE_DE_CARTE.exec(corps);
  return lu === null ? null : { pr: Number(lu[1]), ticket: Number(lu[2]) };
}

const adresseDeLaPR = (depot: string, pr: number) => `https://github.com/${depot}/pull/${pr}`;

// La question de la carte, sur sa première ligne : ce que le TODO du chef montre.
const question = (ticket: number, pr: number) => `Does the screen of #${ticket} look right? Validate it and PR #${pr} is merged; send it back with what to change and a cook takes it up again.`;

type CarteAPoser = { depot: string; ticket: { number: number; title: string }; pr: number; sha: string; screens: CapturesDEcran[] };

// Le corps de l'issue de la carte : le marqueur, la question, le lien de la
// PR, puis chaque écran avant et après, en images (`direCaptures`).
function corpsDeLaCarte({ depot, ticket, pr, sha, screens }: CarteAPoser): string {
  return [
    marqueDeCarte(pr, ticket.number),
    `**${question(ticket.number, pr)}**`,
    "",
    `Ticket: #${ticket.number} — ${ticket.title}`,
    `Pull request: ${adresseDeLaPR(depot, pr)}`,
    "",
    ...direCaptures(depot, ticket.number, { sha, screens }),
  ].join("\n");
}

// ── La pass ──

const MARQUE_DE_RETENUE = /^<!-- brigade:validation-design-carte carte=([1-9][0-9]*) pr=([1-9][0-9]*) -->/;
const marqueDeRetenue = (carte: number, pr: number) => `<!-- brigade:validation-design-carte carte=${carte} pr=${pr} -->`;

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

// La carte qui tient encore la PR, d'après le ticket : la dernière posée pour
// elle, si aucun renvoi ne la suit et qu'elle est encore ouverte. Une carte
// qu'un renvoi a dépassée (la CI rougie après une mise à jour, une livraison
// sans captures) est fermée : sa livraison n'est plus celle-là.
async function carteQuiTient(github: GitHubDeLaRetenue, ticket: number, pr: number): Promise<number | null> {
  const commentaires = (await github.commentaires(ticket)).filter((c) => DE_CONFIANCE.includes(c.association));
  const rang = commentaires.findLastIndex((c) => Number(MARQUE_DE_RETENUE.exec(c.body)?.[2]) === pr);
  if (rang === -1) return null;
  const carte = Number(MARQUE_DE_RETENUE.exec(commentaires[rang]?.body ?? "")?.[1]);
  const lue = github.issue === undefined ? null : await github.issue(carte);
  const ouverte = github.issue === undefined || (lue !== null && lue.state === "open");
  if (!commentaires.slice(rang + 1).some((c) => c.body.startsWith(MARQUE_DE_RENVOI))) return ouverte ? carte : null;
  if (ouverte) await fermerLaCarte(github, carte, `Closed by the kitchen: the delivery of PR #${pr} went back to a cook since this card. Its next delivery comes back as a new card.`);
  return null;
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
  const tenue = await carteQuiTient(github, ticket.number, pr.number);
  if (tenue !== null) return `held for the chef's validation of its screen (card #${tenue})`;
  if (livraison.depot === undefined) throw new Error(`the station does not know its repository: the card of PR #${pr.number} cannot show its captures — not merged on this turn`);
  const carte = await github.creerIssue({ titre: TITRE_DE_CARTE, corps: corpsDeLaCarte({ depot: livraison.depot, ticket, pr: pr.number, sha: pr.sha, screens }), labels: [CHEF_TODO] });
  await github.commenter(carte, corpsDeCarte({ sorte: SORTE_DE_CARTE, texte: `${question(ticket.number, pr.number)}\n\nPull request: ${adresseDeLaPR(livraison.depot, pr.number)}` }));
  await github.commenter(ticket.number, `${marqueDeRetenue(carte, pr.number)}\nStation \`${livraison.station}\`: the delivery is green, and a human validates the designs of this project — held for the chef's validation of its screen, card #${carte}.`);
  return `held for the chef's validation of its screen (card #${carte})`;
}

// ── Les gestes du chef ──

export type GitHubDesGestes = Pick<GitHub, "ouvertes" | "commentaires" | "commenter" | "delabelliser" | "fermerIssue" | "prDeBranche" | "merger">;

// La carte ouverte qui tient la PR, et son ticket ; refusé s'il n'y en a pas.
async function carteDeLaPR(github: Pick<GitHub, "ouvertes">, pr: number): Promise<{ carte: number; ticket: number }> {
  const sondage = await github.ouvertes();
  if (sondage.inchange) throw new Error("GitHub did not return the list of open issues");
  for (const issue of sondage.issues) {
    const lue = DE_CONFIANCE.includes(issue.association) ? carteDuCorps(issue.body) : null;
    if (lue?.pr === pr) return { carte: issue.number, ticket: lue.ticket };
  }
  throw new GesteRefuse(`no open “${TITRE_DE_CARTE}” card holds PR #${pr}`);
}

// La PR de la carte, relue : encore la livraison de son ticket.
async function prDeLaCarte(github: Pick<GitHub, "prDeBranche">, pr: number, ticket: number, brancheDuTicket: (ticket: number) => string): Promise<PR> {
  const lue = await github.prDeBranche(brancheDuTicket(ticket));
  if (lue === null || lue.number !== pr) throw new GesteRefuse(`PR #${pr} is no longer the delivery of #${ticket}`);
  return lue;
}

// Valider : merge la PR, puis ferme la carte. Un merge que GitHub refuse
// laisse la carte ouverte, et le dit.
export async function valider(github: GitHubDesGestes, pr: number, brancheDuTicket: (ticket: number) => string): Promise<{ carte: number; ticket: number }> {
  const { carte, ticket } = await carteDeLaPR(github, pr);
  const lue = await prDeLaCarte(github, pr, ticket, brancheDuTicket);
  if (!lue.merged) {
    if (lue.state !== "open") throw new GesteRefuse(`PR #${pr} is closed without being merged: there is nothing to validate`);
    const merge = await github.merger(pr, lue.sha);
    if (!merge.fait) throw new GesteRefuse(`GitHub refused to merge PR #${pr} — ${merge.motif}; card #${carte} stays open`);
  }
  await fermerLaCarte(github, carte, `Validated by the chef: PR #${pr} is merged.`);
  return { carte, ticket };
}

// Le début de la raison d'un renvoi du chef, sur le ticket.
const RAISON_DU_RENVOI_DU_CHEF = "the chef asks for changes to the screen";

// Renvoyer : la livraison repart à un cook, le commentaire du chef comme ce
// qu'il faut changer — un renvoi sur sa tête, que le cook lit sur le ticket, et
// `in-pass` retiré —, puis la carte se ferme.
export async function renvoyerLeDesign(github: GitHubDesGestes, pr: number, commentaire: string, brancheDuTicket: (ticket: number) => string): Promise<{ carte: number; ticket: number }> {
  const aChanger = commentaire.trim();
  if (aChanger === "") throw new GesteRefuse("the comment says what to change: it cannot be empty");
  const { carte, ticket } = await carteDeLaPR(github, pr);
  const lue = await prDeLaCarte(github, pr, ticket, brancheDuTicket);
  if (lue.state !== "open" || lue.merged) throw new GesteRefuse(`PR #${pr} is no longer open: there is nothing to send back`);
  const renvois = (await github.commentaires(ticket)).filter((c) => DE_CONFIANCE.includes(c.association) && c.body.startsWith(MARQUE_DE_RENVOI));
  await github.commenter(ticket, `${MARQUE_DE_RENVOI} n=${renvois.length + 1} sha=${lue.sha} -->\nThe chef sent the design of PR #${pr} back to a cook — ${RAISON_DU_RENVOI_DU_CHEF}:\n\n${aChanger}\n\nChange the screen as asked, take its before and after captures again, and deliver.`);
  await github.delabelliser(ticket, LABEL_IN_PASS);
  await fermerLaCarte(github, carte, `Sent back to a cook by the chef: ${aChanger}`);
  return { carte, ticket };
}


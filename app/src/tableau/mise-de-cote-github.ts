// Un ticket mis de côté, lu de GitHub, pour un projet GitHub seul (#2075) : la station ou le chef pose sur son issue
// `served-elsewhere` (trop de renvois, trop de cooks sans livraison : un humain décide) ou `blocked-on-human` (la livraison
// touche à ce qui la juge), et la station dit pourquoi dans un commentaire, en posant le label. Le ticket attend le chef :
// sa carte est dans TODO — dans WAITING si le chef l'y a mis —, et dit en une ligne pourquoi, tirée de ce commentaire.
//
// Le commentaire lu est le dernier qui nomme le label que l'issue porte — ou, pour `blocked-on-human`, celui que la station
// écrit en le posant, qui ne le nomme pas (« this delivery changes what judges it ») —, d'un auteur du dépôt
// (`author_association` OWNER, MEMBER ou COLLABORATOR : tout le monde peut commenter une issue publique), hors ceux du
// manager (`<!-- brigade:manager -->`), qui nomment les labels sans en être la raison. Aucun : la carte le dit
// (`SANS_RAISON`), et reste dans TODO.
//
// Ce qui entre dans TODO (#2422) : seul ce qui demande quelque chose au chef. `blocked-on-human` — la livraison touche à ce
// qui la juge : la merger à la main — est une question à lui, avec son bouton (« Merge PR #N by hand? », `Merge PR #N`,
// #3368). `served-elsewhere` n'en est une que si un commentaire marqué `<!-- brigade:todo kind=product-question -->` (#2217,
// todo-github.ts) en pose une ; pour une cause technique (renvois épuisés, cooks sans livraison), le ticket reste sur le rail, dans sa colonne de
// mise de côté, avec sa ligne : c'est le travail du second. Un `kitchen-board` n'est jamais une carte.
//
// Les commentaires de la station (runtime/src/brigade-github.ts, runtime/src/github-seul/renvois/renvois.ts) se disent en
// une ligne courte ; tout autre commentaire, par sa première ligne. Un `#N` de la ligne s'ouvre sur son issue, ou sa PR :
// GitHub mène de l'une à l'autre.

import { carteDuCommentaire, type CarteDuChef } from "./todo-github.ts";

export const SERVED_ELSEWHERE = "served-elsewhere";
export const BLOCKED_ON_HUMAN = "blocked-on-human";
// Dans l'ordre où la carte les nomme quand l'issue porte les deux.
export const LABELS_DE_MISE_DE_COTE = [SERVED_ELSEWHERE, BLOCKED_ON_HUMAN] as const;
// L'issue du tableau de la cuisine : jamais une carte, ni sur le rail ni dans TODO.
export const LABEL_DU_TABLEAU_DE_LA_CUISINE = "kitchen-board";
// La ligne d'un ticket mis de côté sans commentaire qui dise pourquoi : un label posé à la main. Ici, et non dans faits.ts,
// pour que la lecture du rail (vue/rail/github.ts) n'en charge rien d'autre que GitHub.
export const SANS_RAISON = "set aside by hand — no reason on the issue";
const PRODUCT_QUESTION = "product-question";
const DE_CONFIANCE = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);
const MARQUE_DU_MANAGER = "<!-- brigade:manager";
const MARQUE_DE_REPONSE = /^\s*<!--\s*brigade:reponse\b/;
// Au-delà, la ligne s'arrête au mot, d'un « … » : le reste est sur l'issue.
const LONGUEUR_MAX = 160;

// Un `#N` de la ligne, et l'adresse qu'il ouvre.
export type LienDeLigne = { numero: number; url: string };
// Ce que la carte dit d'un ticket mis de côté : le label qui le met de côté, la ligne qui dit pourquoi — nulle quand aucun
// commentaire ne la porte —, et les `#N` qu'elle nomme. `auChef` : le ticket lui pose une question, donc entre dans TODO ;
// `pr` : la PR à merger à la main, quand c'est la question ; `chef` : la question marquée d'un `served-elsewhere`, ou celle
// de la PR à merger, ou celle de la retenue sans PR (#3369), avec ses boutons.
// `complete` : le commentaire de la station en entier, sans ses marques — la carte le garde derrière « details ».
export type MiseDeCote = { label: string; raison: string | null; complete?: string; liens: LienDeLigne[]; auChef?: boolean; pr?: LienDeLigne | null; chef?: CarteDuChef };

type Brut = Record<string, unknown>;

// Le label qui met l'issue de côté, ou rien. `waiting` l'emporte : le chef a mis le ticket en attente d'un tiers.
export function labelDeMiseDeCote(labels: readonly string[]): string | null {
  if (labels.includes("waiting")) return null;
  return LABELS_DE_MISE_DE_COTE.find((label) => labels.includes(label)) ?? null;
}

const nomme = (corps: string, label: string) => new RegExp(`(?<![\\w-])${label}(?![\\w-])`).test(corps);
// Le commentaire de la station qui pose `blocked-on-human` sur une livraison qui touche à ce qui la juge.
const JUGES = /changes what judges it\b[\s\S]*?merge it by hand: PR #(\d+)/;
const ditLaMiseDeCote = (corps: string, label: string) => nomme(corps, label) || (label === BLOCKED_ON_HUMAN && JUGES.test(corps.replace(/`/g, "")));

// Le texte d'un commentaire, sans ses marques, sa mise en forme, ni le « Station `x`: » qui l'ouvre.
const nettoyer = (texte: string) =>
  texte
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\*\*|__|`/g, "")
    .trim();
const sansStation = (texte: string) => texte.replace(/^Station [^:\n]*:\s*/, "");
// Une raison du runtime en une phrase : sa première ligne, jusqu'à son détail — après le premier « : ».
const motif = (raison: string) =>
  (raison.split("\n")[0] ?? "")
    .replace(/:(\s.*)?$/, "")
    .trim();

function couper(ligne: string): string {
  const une = ligne.replace(/\s+/g, " ").trim();
  if (une.length <= LONGUEUR_MAX) return une;
  const coupee = une.slice(0, LONGUEUR_MAX);
  const espace = coupee.lastIndexOf(" ");
  return `${(espace > LONGUEUR_MAX / 2 ? coupee.slice(0, espace) : coupee).replace(/[\s,;:—-]+$/, "")}…`;
}

// La ligne qu'un commentaire de mise de côté donne à la carte.
export function ligneDuCommentaire(corps: string): string | null {
  const texte = sansStation(nettoyer(corps));
  const tete = texte.split(/\n\s*\n/)[0] ?? "";
  // Les renvois épuisés (renvois.ts, brigade-github.ts) : « still not mergeable after 2 sends back — <raison> ».
  const renvois = /^still not mergeable after (\d+) sends? back — ([\s\S]*)$/.exec(tete);
  if (renvois !== null) {
    const pourquoi = motif(renvois[2] as string);
    return couper(`off the kitchen after ${renvois[1]} sends back${pourquoi === "" ? "" : ` — ${pourquoi}`}`);
  }
  // Les cooks sans livraison (brigade-github.ts) : « the cook stopped without a delivery — <échec> », puis leur nombre.
  const echec = /^the cook stopped without a delivery — ([\s\S]*)$/.exec(tete);
  const cooks = /after (\d+) cooks without a delivery/.exec(texte);
  if (echec !== null && cooks !== null) return couper(`off the kitchen after ${cooks[1]} cooks without a delivery — ${(echec[1] as string).split("\n")[0]?.trim()}`);
  // Une livraison qui touche à ce qui la juge (brigade-github.ts) : la merger à la main.
  const juges = JUGES.exec(texte);
  if (juges !== null) return `Merge PR #${juges[1]} by hand? It changes what judges it.`;
  const premiere = texte
    .split("\n")
    .map((ligne) => ligne.replace(/^\s*(?:#+|>|[-*])\s*/, "").trim())
    .find((ligne) => ligne !== "");
  return premiere === undefined ? null : couper(premiere);
}

// La question que le dernier commentaire marqué d'un auteur du dépôt pose au chef — rien si ce n'est pas une
// `product-question`, ni si une réponse du chef la suit (`<!-- brigade:reponse`, #2434, tableau-gestes/reponse-github.ts) :
// répondue, elle n'attend plus rien de lui, quel que soit le geste que la réponse a joué.
function questionDuChef(commentaires: readonly Brut[]): { carte: CarteDuChef; commentaire: Brut } | null {
  const dits = [...commentaires].reverse().filter(({ body, author_association: association }) => typeof body === "string" && typeof association === "string" && DE_CONFIANCE.has(association));
  for (const commentaire of dits) {
    if (MARQUE_DE_REPONSE.test(commentaire.body as string)) return null;
    const carte = carteDuCommentaire(commentaire.body as string);
    if (carte !== null) return carte.sorte === PRODUCT_QUESTION ? { carte, commentaire } : null;
  }
  return null;
}

// Le commentaire qui dit la mise de côté — la question marquée d'un `served-elsewhere`, sinon le dernier qui la nomme —, et la
// question, quand c'en est une.
function sourceDeLaMiseDeCote(label: string, commentaires: readonly Brut[]): { dit: Brut | undefined; question: CarteDuChef | null } {
  const dit =
    [...commentaires]
      .reverse()
      .filter(({ body, author_association: association }) => typeof body === "string" && typeof association === "string" && DE_CONFIANCE.has(association) && !body.includes(MARQUE_DU_MANAGER) && ditLaMiseDeCote(body, label))
      .find(({ body }) => ligneDuCommentaire(body as string) !== null);
  const question = label === SERVED_ELSEWHERE ? questionDuChef(commentaires) : null;
  return { dit: question?.commentaire ?? dit, question: question?.carte ?? null };
}

// La carte du chef d'une livraison qui touche à ce qui la juge (#3368) : sa question, et un seul choix, `Merge PR #N`, que la
// réponse joue sur GitHub (tableau-gestes/reponse-github.ts) — la PR mergée, `blocked-on-human` retiré —, dans l'app comme
// sur le téléphone, qui ne liste que les cartes qui posent une question.
const SORTE_DU_MERGE = "merge-by-hand";
const carteDuMerge = (numero: number, raison: string | null): CarteDuChef => ({ sorte: SORTE_DU_MERGE, texte: `${raison ?? `Merge PR #${numero} by hand?`}\n- [merge] Merge PR #${numero}` });

// La carte du chef d'un ticket que la station a mis de côté sans PR à merger (#3369) : lever la retenue, ou fermer l'issue.
// `resume` retire `blocked-on-human` (tableau-gestes/reponse-github.ts) : le ticket revient sur le rail.
const SORTE_DE_LA_RETENUE = "hold";
const carteDeLaRetenue = (raison: string | null): CarteDuChef => ({ sorte: SORTE_DE_LA_RETENUE, texte: `${raison ?? "Lift the hold?"}\n- [resume] Back to the kitchen\n- [close] Close it` });

// Depuis quand un ticket mis de côté par `label` l'est : l'heure du commentaire qui le dit (ce qui attend le chef,
// attente-du-chef.ts) — nulle quand aucun ne le dit.
export function miseDeCoteLe(label: string, commentaires: readonly Brut[]): string | null {
  const le = sourceDeLaMiseDeCote(label, commentaires).dit?.created_at;
  return typeof le === "string" && !Number.isNaN(Date.parse(le)) ? le : null;
}

// Ce que la carte dit d'un ticket mis de côté par `label`, d'après les commentaires de son issue, du plus ancien au plus
// récent, tels que l'API de GitHub les rend.
export function miseDeCoteDe(depot: string, label: string, commentaires: readonly Brut[]): MiseDeCote {
  const source = sourceDeLaMiseDeCote(label, commentaires);
  const question = source.question;
  const dit = question === null ? source.dit : undefined;
  const raison = question !== null ? couper(question.texte.split("\n")[0] ?? "") || null : dit === undefined ? null : ligneDuCommentaire(dit.body as string);
  const numeros = [...new Set([...(raison ?? "").matchAll(/#(\d+)\b/g)].map((trouve) => Number(trouve[1])))];
  const juges = label === BLOCKED_ON_HUMAN && dit !== undefined ? JUGES.exec((dit.body as string).replace(/`/g, "")) : null;
  const pr = juges === null ? null : { numero: Number(juges[1]), url: `https://github.com/${depot}/pull/${juges[1]}` };
  const liens = numeros.map((numero) => (numero === pr?.numero ? pr : { numero, url: `https://github.com/${depot}/issues/${numero}` }));
  const complete = label !== SERVED_ELSEWHERE || question !== null || dit === undefined ? "" : sansStation(nettoyer(dit.body as string));
  const chef = question ?? (pr !== null ? carteDuMerge(pr.numero, raison) : label === BLOCKED_ON_HUMAN ? carteDeLaRetenue(raison) : null);
  return { label, raison, ...(complete === "" ? {} : { complete }), liens, auChef: label === BLOCKED_ON_HUMAN || question !== null, pr, ...(chef === null ? {} : { chef }) };
}

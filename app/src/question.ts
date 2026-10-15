// La question qui t'attend, posée telle quelle (#681) : sur la fiche d'un ticket de T'attend,
// l'app lit son issue et, si le manager y a posé une question, la montre mot pour mot — ses
// choix (a / b / c) en boutons, un champ pour répondre en une phrase. Ce que le chef choisit
// ou écrit part sur l'issue, en commentaire, à son nom. Ni LLM, ni reformulation : le texte est
// celui du commentaire, et la réponse celle du chef. La demande au second (demande.ts) reste à
// côté, pour les questions qui méritent une explication.
// L'app ne passe pas par la box pour cela : aucun geste de la box ne lit les commentaires d'une
// issue ni n'y écrit. Elle lance le `gh` du poste — celui du chef, connecté à son compte, que le
// second utilise déjà (docs/app.md, « Le poste est une station ») : la réponse est signée par lui.
// Rien ne part sans le clic du chef — ni réponse d'office, ni choix par défaut —, et rien ne part
// sur une question qui n'est plus celle qu'il a lue : l'issue est relue juste avant d'écrire.
import { execFile, type ExecFileException } from "node:child_process";
import { nombre } from "./format.ts";

// Ce qui marque, parmi les commentaires du manager, une question posée au chef : les deux
// marqueurs qu'il écrit en tête (runtime/src/juger.ts, `MARQUEUR_MANAGER` ; runtime/src/decouper.ts,
// `MARQUEUR_QUESTION`). Le runtime ne les écrit qu'en commentaire HTML : invisibles sur GitHub.
export const MARQUEUR_MANAGER = "<!-- brigade:manager -->";
export const MARQUEUR_QUESTION = "<!-- brigade:question -->";

// Ceux dont le manager lit les commentaires (runtime/src/manager.ts, `DE_CONFIANCE`) : une
// question n'est prise que d'eux — le marqueur se recopie, pas le droit d'écrire sur le dépôt.
const DE_CONFIANCE = ["OWNER", "MEMBER", "COLLABORATOR"];

// Le `gh` du poste, et le délai passé lequel il est arrêté.
export type Reglages = { gh: string; delaiMs: number };

// Un commentaire de l'issue, tel que `gh` le rend : qui, quand, son adresse, son texte.
export type Commentaire = { auteur: string; association: string; a: string; url: string; corps: string };
// Un choix que la question propose : sa lettre, telle qu'écrite, et ce qui la suit.
export type Choix = { lettre: string; texte: string };
// La question : le commentaire du manager, sans ses marqueurs — rien d'autre n'en est retiré —,
// ses choix s'il en propose, et ce qui a été écrit sur l'issue depuis.
export type Question = { url: string; auteur: string; a: string; texte: string; choix: Choix[]; depuis: { auteur: string; a: string; corps: string }[] };
// Ce que la lecture de l'issue donne. `aucune` : l'issue est lue, le manager n'y pose pas de
// question — l'entrée garde son geste à elle. `sans` : l'issue n'a pas été lue, et pourquoi.
export type Lue = { a: string } & ({ question: Question } | { aucune: true } | { sans: string });
// Ce que la vue envoie : la question qu'elle montre, par son adresse, et la réponse — la lettre
// d'un choix, ou la phrase du chef. Le texte d'un choix vient de l'issue, jamais de la vue.
export type Reponse = { question: string } & ({ choix: string } | { texte: string });
// Ce qu'il en est advenu. `poste` : le commentaire est sur l'issue — `corps` : ce qui a été écrit,
// `adresse` : la sienne, quand `gh` l'a dite. `refus` : rien n'est parti, et pourquoi ; `lue` : la
// question telle que l'issue la porte maintenant, quand elle a changé sous les yeux du chef.
export type Rendue = { poste: true; corps: string; adresse?: string } | { poste: false; refus: string; lue?: Lue };

// Une ligne qui n'est qu'un commentaire HTML : un marqueur du runtime, invisible sur GitHub.
const MARQUEUR = /^\s*<!--[\s\S]*?-->\s*$/;
// Le texte d'un commentaire tel que GitHub le montre : sans ses lignes de marqueurs, ni les
// lignes vides qu'elles laissent en tête et en fin. Le reste, mot pour mot.
const sansMarqueurs = (corps: string) =>
  corps
    .split("\n")
    .filter((ligne) => !MARQUEUR.test(ligne))
    .join("\n")
    .replace(/^(?:[ \t]*\r?\n)+/, "")
    .trimEnd();

// La dernière question du manager parmi ces commentaires, dans l'ordre de l'issue, et ce qui a
// été écrit après elle. Aucune : il n'en pose pas sur cette issue.
export function questionDe(commentaires: readonly Commentaire[]): Question | undefined {
  const rang = commentaires.findLastIndex(({ corps, association }) => DE_CONFIANCE.includes(association) && corps.includes(MARQUEUR_MANAGER) && corps.includes(MARQUEUR_QUESTION));
  const posee = commentaires[rang];
  if (posee === undefined) return undefined;
  const texte = sansMarqueurs(posee.corps);
  return {
    url: posee.url,
    auteur: posee.auteur,
    a: posee.a,
    texte,
    choix: choixDe(texte),
    depuis: commentaires.slice(rang + 1).map(({ auteur, a, corps }) => ({ auteur, a, corps: sansMarqueurs(corps) })),
  };
}

// Un choix en tête de ligne : une puce ou rien, du gras ou rien, puis `a)`, `(a)`, `a.`, `a :` ou
// `a —`, et son texte.
const EN_TETE = /^[ \t]*(?:[-*+][ \t]+)?(\*\*|__)?(?:\(([a-z])\)|([a-z])(?:\)|\.|[ \t]*:|[ \t]+[—–-]))\1?[ \t]+(\S.*)$/i;
// Un choix dans la phrase : `(a)`, ou `a)` après un blanc.
const DANS_LA_PHRASE = /(?<![\p{L}\p{N}])\(([a-z])\)|(?<=^|[\s«"'“])([a-z])\)(?=\s)/giu;

// Ce qui reste d'un choix une fois ses bords nettoyés : sans gras autour, sans la ponctuation ni
// le « ou » qui le lient au suivant.
function nettoyer(texte: string): string {
  let propre = texte.trim();
  for (let avant = ""; avant !== propre; ) {
    avant = propre;
    propre = propre
      .replace(/^(?:\*\*|__)\s*|\s*(?:\*\*|__)$/g, "")
      .replace(/\s*[,;:]$/, "")
      .replace(/\s+(?:ou|or|et|and)$/i, "")
      .trim();
  }
  return propre;
}

// La première suite de lettres qui se suivent à partir de `a` — `a`, `b`, `c`… —, deux au moins,
// toutes de la même casse. Une lettre seule n'est pas un choix.
function suite<T extends { lettre: string }>(lus: readonly T[]): T[] {
  for (let debut = 0; debut < lus.length; debut++) {
    const premiere = lus[debut]?.lettre ?? "";
    if (premiere !== "a" && premiere !== "A") continue;
    const pris = [lus[debut] as T];
    for (let i = debut + 1; i < lus.length; i++) {
      const attendue = String.fromCharCode(premiere.charCodeAt(0) + pris.length);
      if (lus[i]?.lettre !== attendue) break;
      pris.push(lus[i] as T);
    }
    if (pris.length >= 2) return pris;
  }
  return [];
}

// Les choix que la question propose, dans son ordre : en tête de ligne d'abord — une liste —,
// sinon dans la phrase. Le texte d'un choix est celui de la question, nettoyé de ses bords ; en
// fin de phrase, il s'arrête à son point d'interrogation, à son point ou à la fin de sa ligne.
// Aucun : la question n'en propose pas, ou pas sous une forme que l'app sait lire — elle se
// répond alors par une phrase.
export function choixDe(texte: string): Choix[] {
  const lignes = texte.split("\n").flatMap((ligne) => {
    const [, , entre, seule, suiteDeLigne] = EN_TETE.exec(ligne) ?? [];
    const lettre = entre ?? seule;
    return lettre === undefined || suiteDeLigne === undefined ? [] : [{ lettre, texte: nettoyer(suiteDeLigne) }];
  });
  const enListe = suite(lignes).filter(({ texte: dit }) => dit !== "");
  if (enListe.length >= 2) return enListe;

  const marques = [...texte.matchAll(DANS_LA_PHRASE)].map((trouve) => ({ lettre: trouve[1] ?? trouve[2] ?? "", debut: trouve.index, fin: trouve.index + trouve[0].length }));
  const prises = suite(marques);
  const choix = prises.map(({ lettre, fin }, i) => {
    const suivante = prises[i + 1];
    const brut = suivante === undefined ? (/^[^\n?]*?(?=\?|\.(?:\s|$)|\n|$)/.exec(texte.slice(fin))?.[0] ?? "") : texte.slice(fin, suivante.debut);
    return { lettre, texte: nettoyer(brut.replaceAll("\n", " ")) };
  });
  return choix.length >= 2 && choix.every(({ texte: dit }) => dit !== "") ? choix : [];
}

// Ce que le chef poste : la lettre et le texte du choix, tels que la question les écrit ; ou sa phrase, telle qu'il l'a écrite.
export const corpsDuChoix = ({ lettre, texte }: Choix) => `${lettre}) ${texte}`;

// Ce que `gh` a rendu, brut.
type Rendu = { erreur: ExecFileException | null; sortie: string; erreurs: string };
// `gh` lancé une fois. Sans terminal, il ne demande rien : `GH_PROMPT_DISABLED`.
function lancer(reglages: Reglages, args: string[], entree?: string): Promise<Rendu> {
  return new Promise((resoudre) => {
    const enfant = execFile(reglages.gh, args, { timeout: reglages.delaiMs, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, GH_PROMPT_DISABLED: "1", NO_COLOR: "1" } }, (erreur, sortie, erreurs) =>
      resoudre({ erreur, sortie, erreurs }),
    );
    // Un `gh` absent ferme son entrée avant qu'on y écrive : l'erreur est celle de son lancement.
    enfant.stdin?.on("error", () => {});
    enfant.stdin?.end(entree ?? "");
  });
}

// Ce qu'un `gh` en échec a dit, et la ligne lancée.
function echec(reglages: Reglages, args: string[], { erreur, sortie, erreurs }: Rendu & { erreur: ExecFileException }): string {
  const lance = `$ ${reglages.gh} ${args.join(" ")}`;
  if (erreur.code === "ENOENT") return `${lance} — \`${reglages.gh}\` is not on this machine: the app reads and answers the issue with your own \`gh\``;
  const suite = erreur.killed === true ? `no answer within ${nombre(reglages.delaiMs / 1000)} s: gh stopped` : typeof erreur.code === "number" ? `exit code ${erreur.code}` : erreur.message;
  const dit = `${erreurs}${sortie}`.trim();
  return `${lance}${dit === "" ? "" : `\n${dit}`}\n→ ${suite}`;
}

// Les commentaires de l'issue, tels que `gh` les rend — ou en quoi sa sortie n'en a pas la forme.
function commentairesDe(sortie: string): Commentaire[] | string {
  let lu: unknown;
  try {
    lu = JSON.parse(sortie);
  } catch {
    return "its output is not JSON";
  }
  const commentaires = (lu as { comments?: unknown } | null)?.comments;
  if (!Array.isArray(commentaires)) return "its output has no `comments` list";
  const pris: Commentaire[] = [];
  for (const brut of commentaires as unknown[]) {
    const { author, authorAssociation, createdAt, url, body } = (brut ?? {}) as Record<string, unknown>;
    const auteur = (author as { login?: unknown } | null)?.login;
    if (typeof body !== "string" || typeof createdAt !== "string" || typeof url !== "string") return "a comment lacks its `body`, `createdAt` or `url`";
    pris.push({ auteur: typeof auteur === "string" ? auteur : "ghost", association: typeof authorAssociation === "string" ? authorAssociation : "NONE", a: createdAt, url, corps: body });
  }
  return pris;
}

// L'issue à cette adresse, lue par `gh` : la question du manager qu'elle porte, s'il y en a une.
export async function lireQuestion(reglages: Reglages, adresse: string, maintenant = () => new Date()): Promise<Lue> {
  const args = ["issue", "view", adresse, "--json", "comments"];
  const rendu = await lancer(reglages, args);
  const a = maintenant().toISOString();
  const { erreur } = rendu;
  if (erreur !== null) return { a, sans: echec(reglages, args, { ...rendu, erreur }) };
  const commentaires = commentairesDe(rendu.sortie);
  if (typeof commentaires === "string") return { a, sans: `$ ${reglages.gh} ${args.join(" ")} — ${commentaires}` };
  const question = questionDe(commentaires);
  return question === undefined ? { a, aucune: true } : { a, question };
}

// Ce que le chef répond, lu tel que la vue l'envoie — ou pourquoi rien ne part.
function reponseDe(reponse: unknown): Reponse | { refus: string } {
  const { question, choix, texte } = (reponse ?? {}) as Record<string, unknown>;
  if (typeof question !== "string" || question === "") return { refus: "nothing was posted: the view did not say which question it answers" };
  if (typeof choix === "string" && choix !== "") return { question, choix };
  if (typeof texte === "string") return texte.trim() === "" ? { refus: "nothing was posted: the answer is empty — choose, or write a sentence" } : { question, texte: texte.trim() };
  return { refus: "nothing was posted: the view sent neither a choice nor a sentence" };
}

// Répond à la question de l'issue à cette adresse : relue d'abord — ce qui part répond à la
// question que le chef a lue, et à elle seule —, puis le commentaire, par `gh issue comment`.
export async function repondre(reglages: Reglages, adresse: string, envoyee: unknown): Promise<Rendue> {
  const reponse = reponseDe(envoyee);
  if ("refus" in reponse) return { poste: false, refus: reponse.refus };
  const lue = await lireQuestion(reglages, adresse);
  if ("sans" in lue) return { poste: false, refus: `nothing was posted: the issue was not read again before writing — ${lue.sans}`, lue };
  if (!("question" in lue) || lue.question.url !== reponse.question) return { poste: false, refus: "nothing was posted: the question on the issue is no longer the one you read — here it is as it stands", lue };
  let corps: string;
  if ("choix" in reponse) {
    const choisi = lue.question.choix.find(({ lettre }) => lettre === reponse.choix);
    if (choisi === undefined) return { poste: false, refus: `nothing was posted: the question offers no choice “${reponse.choix}”`, lue };
    corps = corpsDuChoix(choisi);
  } else corps = reponse.texte;
  const args = ["issue", "comment", adresse, "--body-file", "-"];
  const rendu = await lancer(reglages, args, corps);
  const { erreur } = rendu;
  if (erreur !== null) return { poste: false, refus: `nothing was posted — ${echec(reglages, args, { ...rendu, erreur })}` };
  const dite = rendu.sortie.trim().split("\n").at(-1) ?? "";
  return { poste: true, corps, ...(URL.parse(dite)?.protocol === "https:" ? { adresse: dite } : {}) };
}

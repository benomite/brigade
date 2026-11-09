// L'issue d'un auteur sans l'écriture sur le dépôt (#2934) : avant, elle
// attendait qu'un membre de confiance la labellise (#2619), et personne ne le
// savait. Le manager la lit maintenant, et pose dessus UN commentaire de
// proposition de tri, sous l'une de trois formes :
//   - `duplicate` — un doublon de l'issue #N ;
//   - `out-of-scope` — hors du périmètre du projet ;
//   - `ticket` — un ticket, avec la valeur `prio:` qu'il propose.
// Puis une carte de TODO (`product-question`), assignée à l'humain `product`
// du projet (#2760) — au chef s'il n'en déclare pas. Rien de l'issue n'entre
// sur le rail tant que cet humain n'a pas répondu : aucun label que la cuisine
// lit pour prendre du travail n'y est posé, aucun cook ne part.
//
// Sa réponse, un commentaire sur l'issue, de l'humain `product` ou d'un compte
// qui a l'écriture :
//   - `on the rail` — la cuisine pose le `prio:` proposé, ou celui que la
//     réponse écrit (`on the rail prio:3`) ; sans aucun, `fire`. Posé par la
//     cuisine, qui a l'écriture, ce label fait de l'issue celle d'un inconnu
//     qu'un membre de confiance a priorisée (#2619) : le manager la juge et la
//     calibre au tour suivant, comme toute autre ;
//   - `close` — la cuisine ferme l'issue.
// Tout autre commentaire n'est pas une réponse : la carte attend toujours.
//
// L'état est sur GitHub, pas au journal : le commentaire de tri (sa marque),
// la carte, puis le commentaire qui dit la réponse appliquée. Chaque pas se
// relit avant d'écrire : une station qui tombe au milieu laisse au tour
// suivant le pas qui manque, sans rien doubler ni rejuger.
import { aiguiller, type Humain } from "../aiguillage-humains/aiguillage.ts";
import { DE_CONFIANCE } from "../alimenter.ts";
import type { Reponse } from "../decoupage.ts";
import { LABEL, type Commentaire, type GitHub, type IssueOuverte } from "../github.ts";
import { leverCarte, marqueur, poserCarte, type Carte } from "../github-seul/carte-todo/carte-todo.ts";
import { issueEnDonnee, MARQUEUR_MANAGER, objet, parmi, phrase } from "../juger.ts";

// La sorte de la carte : une question de produit, que l'aiguillage donne à
// l'humain `product` (`aiguillage-humains/aiguillage.ts`).
export const SORTE_DE_LA_CARTE = "product-question" as const;

// La première ligne de la consigne : ce qui distingue un tri d'un jugement,
// pour qui lit les lancements.
export const MARQUE_DU_TRI = "<!-- brigade:triage-consigne -->";

export type Triage =
  | { triage: "duplicate"; de: number; motif: string }
  | { triage: "out-of-scope"; motif: string }
  | { triage: "ticket"; prio: number; motif: string };

// Ce que le commentaire de tri dit : la proposition, ou `none` quand la
// réponse du manager ne se lisait pas — l'humain décide alors sans elle.
export type Proposition = Triage | { triage: "none"; motif: string };

// La réponse de l'humain : sur le rail, avec ce `prio:` (nul : aucun n'est
// proposé ni écrit), ou fermée.
export type ReponseDuProduit = { geste: "rail"; prio: number | null; par: string } | { geste: "close"; par: string };

const MARQUE = /^<!-- brigade:triage triage=(duplicate|out-of-scope|ticket|none)(?: of=([1-9][0-9]*))?(?: prio=([1-9]))? -->$/m;
const MARQUE_APPLIQUEE = /^<!-- brigade:triage-applied /m;

const ligneDeMarque = (proposition: Proposition) =>
  `<!-- brigade:triage triage=${proposition.triage}${proposition.triage === "duplicate" ? ` of=${proposition.de}` : ""}${proposition.triage === "ticket" ? ` prio=${proposition.prio}` : ""} -->`;

// La proposition en quelques mots, telle que le commentaire et la carte la disent.
export function direLaProposition(proposition: Proposition): string {
  switch (proposition.triage) {
    case "duplicate":
      return `duplicate of #${proposition.de}`;
    case "out-of-scope":
      return "out of scope";
    case "ticket":
      return `ticket, with \`prio:${proposition.prio}\``;
    case "none":
      return "no proposal";
  }
}

export function consigneDeTriage(mission: { depot: string; issue: Pick<IssueOuverte, "number" | "title" | "body" | "labels">; ouvertes: ReadonlyArray<Pick<IssueOuverte, "number" | "title">> }): string {
  const { depot, issue, ouvertes } = mission;
  const autres = ouvertes.filter((ouverte) => ouverte.number !== issue.number).slice(0, 200);
  return [
    MARQUE_DU_TRI,
    `Tu es le manager de la brigade sur le dépôt ${depot}. Cette issue a été ouverte par quelqu'un qui n'a pas l'écriture sur le dépôt. Elle n'entre pas sur le rail : l'humain \`product\` du projet décidera. Tu lui proposes un tri, une seule chose parmi trois :`,
    "",
    "- `duplicate` — elle demande ce qu'une autre issue demande déjà : tu donnes son numéro ;",
    "- `out-of-scope` — elle demande ce que le projet ne fait pas, ou elle ne demande rien de faisable ;",
    "- `ticket` — un vrai besoin du projet : tu proposes sa priorité, de `1` (la plus haute) à `9`.",
    "",
    "Dans le doute entre `duplicate` et `ticket`, `ticket` : un doublon se ferme, un besoin perdu ne revient pas.",
    "",
    "## Les autres issues ouvertes",
    "",
    ...(autres.length === 0 ? ["(aucune)"] : autres.map((autre) => `- #${autre.number} — ${autre.title}`)),
    "",
    "## Ta réponse",
    "",
    "Un seul objet JSON, et rien après lui :",
    "",
    "```json",
    '{"triage": "ticket", "prio": 3, "motif": "why, in two or three sentences"}',
    "```",
    "",
    'ou `{"triage": "duplicate", "de": 12, "motif": "…"}`, ou `{"triage": "out-of-scope", "motif": "…"}`.',
    "",
    "`motif` est posté sur l'issue, que son auteur lit : en anglais, poli, précis.",
    "",
    ...issueEnDonnee(issue, []),
  ].join("\n");
}

export function lireTriage(message: string | null): { valeur: Triage } | { illisible: string } {
  if (message === null || message.trim() === "") return { illisible: "no answer" };
  const lu = objet(message);
  if (!lu) return { illisible: "no JSON object in the answer" };
  const triage = parmi(lu.triage, ["duplicate", "out-of-scope", "ticket"]);
  if (!triage) return { illisible: `unknown triage: ${JSON.stringify(lu.triage)} — expected duplicate, out-of-scope or ticket` };
  const motif = phrase(lu.motif);
  if (!motif) return { illisible: "no reason given" };
  if (triage === "duplicate") {
    if (typeof lu.de !== "number" || !Number.isSafeInteger(lu.de) || lu.de < 1) return { illisible: `duplicate of no issue: ${JSON.stringify(lu.de)}` };
    return { valeur: { triage, de: lu.de, motif } };
  }
  if (triage === "ticket") {
    if (typeof lu.prio !== "number" || !Number.isInteger(lu.prio) || lu.prio < 1 || lu.prio > 9) return { illisible: `prio out of 1–9: ${JSON.stringify(lu.prio)}` };
    return { valeur: { triage, prio: lu.prio, motif } };
  }
  return { valeur: { triage: "out-of-scope", motif } };
}

// Le commentaire de tri : la marque du manager, celle du tri, puis la proposition et son pourquoi.
export function corpsDuTriage(proposition: Proposition): string {
  const titre =
    proposition.triage === "none"
      ? `**Manager — no triage proposal:** its answer could not be read (${proposition.motif}).`
      : `**Manager's triage proposal: ${direLaProposition(proposition)}.**\n\n${proposition.motif}`;
  return [
    MARQUEUR_MANAGER,
    ligneDeMarque(proposition),
    titre,
    "",
    "This issue was opened by someone without write access to the repository: it stays off the rail until the project's product human answers the TODO card below.",
  ].join("\n");
}

// La proposition qu'un commentaire porte, ou nulle.
export function propositionDu(corps: string): Proposition | null {
  const marque = MARQUE.exec(corps);
  if (marque === null) return null;
  const triage = marque[1] as Proposition["triage"];
  // Après la marque : le titre en gras, puis le motif, puis la phrase fixe qui clôt le commentaire.
  const suite = corps.slice((marque.index ?? 0) + marque[0].length).trim();
  const motif = triage === "none" ? suite : suite.replace(/^\*\*[^\n]*\*\*\s*/, "").replace(/\s*This issue was opened by someone without write access[\s\S]*$/, "").trim();
  if (triage === "duplicate") return marque[2] === undefined ? null : { triage, de: Number(marque[2]), motif };
  if (triage === "ticket") return marque[3] === undefined ? null : { triage, prio: Number(marque[3]), motif };
  return { triage, motif };
}

// Le `prio:` que le second choix pose quand le tri n'en a proposé aucun.
export const PRIO_PAR_DEFAUT = 5;

// GitHub ne distingue pas la casse d'un login.
const meme = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

// Un texte sur une ligne, d'au plus `max` signes.
const uneLigne = (texte: string, max: number): string => {
  const ligne = texte.replace(/[`*_>#\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  return ligne.length <= max ? ligne : `${ligne.slice(0, max - 1).trimEnd()}…`;
};

// Ce que l'issue demande, en une ligne : son titre, puis la première ligne de son corps.
const ceQuElleDemande = ({ title, body }: { title: string; body: string }): string => {
  const debut = uneLigne(body.split("\n").find((ligne) => ligne.trim() !== "") ?? "", 120);
  return debut === "" ? uneLigne(title, 160) : `${uneLigne(title, 80)} — ${debut}`;
};

// La carte : sa question sur sa première ligne, ses deux choix — le premier est
// la recommandation du tri : `rail` avec le `prio:` qu'il propose, sinon `close` —,
// puis ce que l'issue demande, qui l'a ouverte, et pourquoi cette recommandation.
// `declare` : l'auteur est un humain que le projet déclare (`humans`), pas un inconnu.
export function carteDuTriage(numero: number, proposition: Proposition, issue: { title: string; body: string; auteur?: string; declare?: boolean }): Carte {
  const prio = proposition.triage === "ticket" ? proposition.prio : null;
  const sur = (n: number) => `- [rail] Put it on the rail with \`prio:${n}\``;
  const fermer = "- [close] Close it";
  const [recommande, autre] = prio === null ? [fermer, sur(PRIO_PAR_DEFAUT)] : [sur(prio), fermer];
  const declare = issue.declare === true;
  const auteur = issue.auteur === undefined || issue.auteur === "" ? null : `@${issue.auteur}`;
  const qui = declare ? `Opened by ${auteur}, a declared human of the project.` : auteur === null ? "Opened by a stranger." : `Opened by ${auteur}, a stranger.`;
  const pourquoi = proposition.triage === "none" ? "no triage proposal, so closing is the default" : `${direLaProposition(proposition)}. ${uneLigne(proposition.motif, 200)}`;
  return {
    sorte: SORTE_DE_LA_CARTE,
    texte: [
      `${declare ? "Issue" : "Stranger's issue"} #${numero}: put it on the rail, or close it?`,
      "",
      recommande,
      autre,
      "",
      `Asks: ${ceQuElleDemande(issue)}`,
      qui,
      `Recommended: ${prio === null ? "close it" : `rail, \`prio:${prio}\``} — the manager's triage: ${pourquoi}`,
      "",
      `Until you answer, nothing of #${numero} reaches the rail. You can also answer on the issue with one line: \`on the rail\` (or \`on the rail prio:N\`), or \`close\`.`,
    ].join("\n"),
  };
}

// La réponse de l'humain parmi ces commentaires — ceux qui suivent la carte —,
// la plus récente qui se lise. Fait foi : l'humain à qui la carte va, ou un
// compte qui a l'écriture ; jamais un commentaire de la cuisine.
export function reponseDuProduit(commentaires: readonly Commentaire[], humain: string | null): ReponseDuProduit | null {
  for (const { body, author, association } of [...commentaires].reverse()) {
    if (body.includes("<!-- brigade:")) continue;
    if (!DE_CONFIANCE.includes(association) && (humain === null || !meme(author, humain))) continue;
    const ligne = (body.split("\n").find((lue) => lue.trim() !== "") ?? "").replace(/[`*_>]/g, "").trim().toLowerCase();
    if (/^close\b/.test(ligne)) return { geste: "close", par: author };
    if (/^on the rail\b/.test(ligne)) {
      const prio = /\bprio:\s*([1-9])\b/.exec(ligne)?.[1];
      return { geste: "rail", prio: prio === undefined ? null : Number(prio), par: author };
    }
  }
  return null;
}

// Ce que le tri demande au manager.
export type AtelierDuTri = {
  github: Pick<GitHub, "commentaires" | "commenter" | "issue" | "labelliser" | "delabelliser" | "fermerIssue" | "assigner">;
  depotGitHub: string;
  demander: <T>(sujet: { numero: number; prefixe: string; nom: string }, consigne: string, lire: (message: string | null) => { valeur: T } | { illisible: string }) => Promise<Reponse<T> | null>;
  peutJuger: () => boolean;
  arrete: () => boolean;
  avertir: (message: string) => void;
  // Les humains du projet (`humans` de ses réglages), relus à chaque carte.
  humains: () => Humain[];
};

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

export function ouvrirIssuesEtrangeres(atelier: AtelierDuTri) {
  const { github, avertir, arrete } = atelier;
  // Les issues dont la carte attend l'humain, à l'instant de leur dernière
  // modification : tant qu'elle ne change pas, rien n'est à relire. Cache, pas
  // état : le perdre coûte une lecture des commentaires.
  const enAttente = new Map<number, string>();

  // Pose la carte, assignée à l'humain `product` s'il y en a un — avant la
  // carte : un arrêt entre les deux rejoue l'assignation, sans doubler.
  const poser = async (issue: IssueOuverte, proposition: Proposition) => {
    const numero = issue.number;
    const aiguillage = aiguiller(atelier.humains(), SORTE_DE_LA_CARTE);
    if (aiguillage.vers === "humain") await github.assigner?.(numero, [aiguillage.login]);
    // L'auteur : celui que la liste des ouvertes dit, sinon la lecture de l'issue.
    // Une lecture qui échoue fait reprendre le pas au tour suivant.
    const auteur = issue.author ?? (await github.issue(numero))?.author;
    const declare = auteur !== undefined && atelier.humains().some(({ login }) => meme(login, auteur));
    await poserCarte(numero, carteDuTriage(numero, proposition, { title: issue.title, body: issue.body, ...(auteur === undefined ? {} : { auteur }), declare }), github);
  };

  // Applique la réponse : la carte levée d'abord — un arrêt après elle relit la
  // réponse au tour suivant et la rejoue —, puis le label ou la fermeture, puis
  // le commentaire qui le dit, et que le tour suivant lit comme fait.
  const appliquer = async (numero: number, proposition: Proposition, reponse: ReponseDuProduit) => {
    await leverCarte(numero, github, SORTE_DE_LA_CARTE);
    if (reponse.geste === "close") {
      await github.fermerIssue(numero);
      await github.commenter(numero, `<!-- brigade:triage-applied geste=close -->\n**Closed**, as @${reponse.par} answered on the TODO card.`);
      return;
    }
    const prio = reponse.prio ?? (proposition.triage === "ticket" ? proposition.prio : null);
    const label = prio === null ? LABEL : `prio:${prio}`;
    await github.labelliser(numero, [label]);
    await github.commenter(numero, `<!-- brigade:triage-applied geste=rail label=${label} -->\n**On the rail**: \`${label}\` put on #${numero}, as @${reponse.par} answered on the TODO card. The manager judges it like any other issue.`);
  };

  return {
    // Sert l'issue d'un auteur sans l'écriture. `fait` : rien n'y reste à
    // faire avant que l'humain réponde, ou sa réponse est appliquée ;
    // `reste` : un pas a échoué, ou n'a pas pu partir, et se refait au tour
    // suivant.
    async traiter(issue: IssueOuverte, ouvertes: readonly IssueOuverte[]): Promise<"fait" | "reste"> {
      if (enAttente.get(issue.number) === issue.updatedAt) return "fait";
      enAttente.delete(issue.number);
      try {
        const lus = await github.commentaires(issue.number);
        const rang = lus.findLastIndex((lu) => DE_CONFIANCE.includes(lu.association) && propositionDu(lu.body) !== null);
        let proposition = rang === -1 ? null : propositionDu(lus[rang]?.body ?? "");
        if (proposition === null) {
          if (!atelier.peutJuger()) return "reste";
          const reponse = await atelier.demander<Triage>(
            { numero: issue.number, prefixe: "trie", nom: "triage" },
            consigneDeTriage({ depot: atelier.depotGitHub, issue, ouvertes }),
            lireTriage,
          );
          if (reponse === null || arrete()) return "reste";
          if ("illisible" in reponse) avertir(`brigade : tri illisible sur l'issue #${issue.number} (${reponse.illisible}) — la carte part sans proposition`);
          proposition = "valeur" in reponse ? reponse.valeur : { triage: "none", motif: reponse.illisible };
          await github.commenter(issue.number, corpsDuTriage(proposition));
          if (arrete()) return "reste";
          await poser(issue, proposition);
          return "fait";
        }
        const suite = lus.slice(rang + 1);
        // Déjà appliquée : l'issue est au chef, comme toute autre.
        if (suite.some((lu) => DE_CONFIANCE.includes(lu.association) && MARQUE_APPLIQUEE.test(lu.body))) return "fait";
        const carte = suite.findIndex((lu) => DE_CONFIANCE.includes(lu.association) && lu.body.startsWith(marqueur(SORTE_DE_LA_CARTE)));
        if (carte === -1) {
          await poser(issue, proposition);
          return "fait";
        }
        const aiguillage = aiguiller(atelier.humains(), SORTE_DE_LA_CARTE);
        const reponse = reponseDuProduit(suite.slice(carte + 1), aiguillage.vers === "humain" ? aiguillage.login : null);
        if (reponse === null) {
          enAttente.set(issue.number, issue.updatedAt);
          return "fait";
        }
        await appliquer(issue.number, proposition, reponse);
        return "fait";
      } catch (erreur) {
        if (!arrete()) avertir(`brigade : tri de l'issue #${issue.number}, d'un auteur sans l'écriture, repris au tour suivant — ${message(erreur)}`);
        return "reste";
      }
    },
  };
}

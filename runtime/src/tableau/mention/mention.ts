// La mention du chef sur le tableau de la cuisine : quand une décision entre
// dans sa file, la box poste un commentaire sous l'issue « Kitchen board » qui
// le mentionne, nomme la décision et dit son geste. L'app GitHub du téléphone
// le prévient alors. Éditer le corps du tableau ne notifie personne : seul ce
// commentaire le fait.
//
// Une décision n'est mentionnée qu'une fois. Sa clé est son nom (`#18`,
// `breaker`…), la sorte de ce qui l'attend et l'instant où elle a commencé
// d'attendre (`depuis`) : le journal la garde (`board.mention`, sous une clé
// d'unicité), donc un redémarrage ou dix rafraîchissements ne la répètent pas.
// Une décision résolue qui attend de nouveau, pour une autre raison, a un autre
// `depuis` ou une autre sorte : c'est une nouvelle décision, mentionnée de nouveau.
//
// Le commentaire part avant le fait : refusé par GitHub, il repart au passage
// suivant. Il ne commence jamais par `/brigade` : il n'est pas un geste.
import type { Journal } from "../../journal.ts";
import type { ClientDesGestes } from "../gestes/client.ts";
import type { LigneDeLaFile } from "../rendu/bloc.ts";
import { enMarkdown } from "../rendu/rendre.ts";

export type OptionsDesMentions = {
  // Le même client que les gestes : il poste sous le tableau et connaît le compte du chef.
  client: Pick<ClientDesGestes, "repondre" | "compteDuChef">;
  journal: Journal;
  projet: string;
  // Ce qui n'a pas pu se faire sans empêcher le reste : un commentaire refusé.
  avertir?: (ligne: string) => void;
};

export type MentionsDuTableau = {
  // Mentionne le chef pour chaque ligne de la file qu'il n'a pas encore été
  // pour. Rend le nombre de commentaires postés.
  traiter(numero: number, file: LigneDeLaFile[]): Promise<number>;
};

// La clé de la décision que dit cette ligne de la file.
export const cleDeLaDecision = (ligne: Pick<LigneDeLaFile, "nom" | "quoi" | "depuis">) => `${ligne.nom}|${ligne.quoi}|${ligne.depuis}`;

// Le geste que le chef peut poster sous le tableau pour cette ligne, dans la
// grammaire des gestes (gestes/grammaire.ts) ; nul quand la décision n'est à
// aucun ticket ou ne se joue pas de là.
function gesteDuTableau(ligne: LigneDeLaFile): string | null {
  if (ligne.ticket === null) return null;
  switch (ligne.quoi) {
    case "merge":
      return `/brigade merge #${ligne.ticket} · /brigade send-back #${ligne.ticket} [reason]`;
    case "remontee":
    case "fermee":
    case "illisible":
    case "ecartee":
      return `/brigade send-back #${ligne.ticket} [reason] · /brigade set-aside #${ligne.ticket}`;
    case "carte":
      return `/brigade choose #${ligne.ticket} <choice number> · /brigade answer #${ligne.ticket} <answer>`;
    default:
      return null;
  }
}

// Le commentaire : la mention en tête, la décision, puis son geste.
export function direLaMention(chef: string, ligne: LigneDeLaFile): string {
  const geste = gesteDuTableau(ligne);
  const titre = ligne.titre === null || ligne.titre === "" ? "" : ` — ${enMarkdown(ligne.titre)}`;
  return [
    `@${chef} a decision awaits you: **${enMarkdown(ligne.nom)}**${titre}`,
    "",
    enMarkdown(ligne.ligne),
    ...(geste === null ? [] : ["", `On this board: ${geste.split(" · ").map((forme) => `\`${forme}\``).join(" · ")}`]),
  ].join("\n");
}

export function mentionsDuTableau(options: OptionsDesMentions): MentionsDuTableau {
  const { client, journal, projet } = options;
  const avertir = options.avertir ?? ((ligne: string) => console.error(ligne));
  const cle = (decision: string) => `board.mention:${projet}:${decision}`;
  const faite = (decision: string) => journal.base.lire("SELECT 1 FROM events WHERE dedup_key = ?", cle(decision)).length > 0;

  return {
    async traiter(numero, file) {
      const neuves = file.filter((ligne) => !faite(cleDeLaDecision(ligne)));
      if (neuves.length === 0) return 0;
      const chef = await client.compteDuChef();
      let postes = 0;
      for (const ligne of neuves) {
        try {
          await client.repondre(numero, direLaMention(chef, ligne));
        } catch (erreur) {
          avertir(`brigade : mention du chef pour ${ligne.nom} sous le Kitchen board #${numero} non postée, reprise au passage suivant — ${erreur instanceof Error ? erreur.message : String(erreur)}`);
          return postes;
        }
        const decision = cleDeLaDecision(ligne);
        journal.ajouter({ project: projet, ticket: ligne.ticket, author: "runtime", type: "board.mention", payload: { key: decision, board: numero, decision: ligne.nom }, dedupKey: cle(decision) });
        postes += 1;
      }
      return postes;
    },
  };
}

// Le diagramme d'une épique, tel que le runtime l'écrit dans le corps de
// l'issue (#3770) : un flowchart Mermaid d'un nœud par ticket — son titre, son
// état, ce qu'il change — et d'une arête par relation entre deux tickets. Un
// ticket servi se dessine autrement qu'un ticket ouvert. Le bloc vit entre
// deux marqueurs, comme la liste des tickets : le rafraîchir ne réécrit que lui.
// Sans E/S.
import { lignesHorsCode } from "./epique.ts";

export const DEBUT_DIAGRAMME = "<!-- brigade-diagram:start -->";
export const FIN_DIAGRAMME = "<!-- brigade-diagram:end -->";

// `state` : TODO, cooking, served, dropped, ou l'état que la liste montre.
// `changes` : ce que le ticket change, en une phrase ; `zone` : ses fichiers.
export type TicketDiagramme = { ticket: number; title: string; state: string; zone: string[]; changes: string };
export type RelationDiagramme = { from: number; to: number; label: string };

const STYLES: Record<string, string> = {
  served: "fill:#d3f9d8,stroke:#2b8a3e,color:#2b8a3e",
  cooking: "fill:#fff3bf,stroke:#e67700",
  dropped: "fill:#f1f3f5,stroke:#868e96,color:#868e96,stroke-dasharray:4 3",
  open: "fill:#ffffff,stroke:#495057",
};

// La classe d'un état : servi, en cuisson, abandonné, ou ouvert.
function classe(state: string): string {
  const s = state.trim().toLowerCase();
  if (s === "served" || s === "servi") return "served";
  if (s === "cooking" || s === "en cuisson") return "cooking";
  if (s === "dropped" || s === "abandonné") return "dropped";
  return "open";
}

// Un texte sûr dans un libellé Mermaid entre guillemets : sur une ligne, sans
// guillemet ni chevron, qui couperaient le libellé ou feraient une arête.
const libelle = (texte: string) => texte.replace(/\s+/g, " ").trim().replace(/"/g, "#quot;").replace(/</g, "#lt;").replace(/>/g, "#gt;").replace(/\|/g, "#124;");

const noeud = (ticket: number) => `t${ticket}`;

export function diagrammeDEpique(tickets: TicketDiagramme[], relations: RelationDiagramme[]): string {
  const presents = new Set(tickets.map((t) => t.ticket));
  const lignes = ["```mermaid", "flowchart TD"];
  for (const t of tickets) {
    const details = [t.state, t.changes, t.zone.join(", ")].map(libelle).filter(Boolean).join("<br/>");
    lignes.push(`  ${noeud(t.ticket)}["#${t.ticket} ${libelle(t.title)}<br/><small>${details}</small>"]`);
  }
  for (const r of relations) {
    if (!presents.has(r.from) || !presents.has(r.to)) continue;
    const label = libelle(r.label);
    lignes.push(`  ${noeud(r.from)} -->${label ? `|"${label}"|` : ""} ${noeud(r.to)}`);
  }
  const classes = [...new Set(tickets.map((t) => classe(t.state)))];
  for (const c of classes) lignes.push(`  classDef ${c} ${STYLES[c]}`);
  for (const c of classes) lignes.push(`  class ${tickets.filter((t) => classe(t.state) === c).map((t) => noeud(t.ticket)).join(",")} ${c}`);
  lignes.push("```");
  return lignes.join("\n");
}

// Où un bloc commence et finit dans le corps, entre ces deux marqueurs, ou
// null. Un marqueur ne compte que seul sur sa ligne, hors bloc de code ; un
// début sans fin ne possède que sa ligne.
function bornes(corps: string, debut: string, fin: string): [number, number] | null {
  const lignes = lignesHorsCode(corps);
  const i = lignes.findIndex((ligne) => ligne.texte.trim() === debut);
  const ouvre = lignes[i];
  if (!ouvre) return null;
  const ferme = lignes.slice(i + 1).find((ligne) => ligne.texte.trim() === fin) ?? ouvre;
  return [ouvre.debut, ferme.fin];
}

// Le corps, son bloc de diagramme remplacé par celui-ci — ou ajouté une fois à
// la fin s'il n'en portait pas.
export function avecDiagramme(corps: string, diagramme: string): string {
  const bloc = `${DEBUT_DIAGRAMME}\n${diagramme}\n${FIN_DIAGRAMME}`;
  const trouve = bornes(corps, DEBUT_DIAGRAMME, FIN_DIAGRAMME);
  if (trouve) return `${corps.slice(0, trouve[0])}${bloc}${corps.slice(trouve[1])}`;
  return corps.trim() === "" ? bloc : `${corps.trimEnd()}\n\n${bloc}`;
}

// Le corps sans le bloc qu'ouvrent et ferment ces marqueurs : ce que l'humain
// a écrit.
export function sansBloc(corps: string, debut: string, fin: string): string {
  const trouve = bornes(corps, debut, fin);
  return trouve ? `${corps.slice(0, trouve[0]).trimEnd()}${corps.slice(trouve[1])}` : corps;
}

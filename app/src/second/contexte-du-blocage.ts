// Le contexte du second pour « pourquoi on est bloqués ? » / « what is happening » (#4121) : l'état de la vue du
// projet d'abord — chaque bandeau, chaque carte du rail avec son état affiché et son état réel —, les tickets hors
// de la vue ensuite, et le geste qui débloque en dernier. Le module ne lit rien : il met en texte la vue qu'on lui donne.
export type BandeauDeLaVue = { label: string; waitsFor: string; waitsOn: string };
export type CarteDeLaVue = { number: number; title: string; displayed: string; real: string; waitsOn: string };
export type VueDuProjet = {
  banners: readonly BandeauDeLaVue[];
  rail: readonly CarteDeLaVue[];
  offRail?: readonly { number: number; title: string }[];
  gesture?: { what: string; by: string };
};

export function contexteDuBlocage(question: string, vue: VueDuProjet): string {
  const lignes = [`Question: ${question}`, "", "Project view (answer about these first, in this order):"];
  for (const b of vue.banners) lignes.push(`- Banner ${b.label}: it waits for: ${b.waitsFor}; it waits on: ${b.waitsOn}.`);
  for (const c of vue.rail) {
    lignes.push(`- Card #${c.number} ${c.title}: displayed as "${c.displayed}".`);
    if (c.real !== c.displayed) {
      lignes.push(`  #${c.number} is shown as ready but the displayed state contradicts the real state: it cannot start.`);
      lignes.push(`  Real state: ${c.real}`);
    }
    lignes.push(`  It waits on: ${c.waitsOn}.`);
  }
  const hors = vue.offRail ?? [];
  if (hors.length > 0) {
    lignes.push("", "Tickets not on the project view (mention only after the view items, and only if they matter):");
    for (const t of hors) lignes.push(`- #${t.number} ${t.title}`);
  }
  lignes.push("", vue.gesture ? `Gesture that unblocks: ${vue.gesture.what} — made by ${vue.gesture.by}.` : "No gesture is known that unblocks: say so, do not invent one.");
  return lignes.join("\n");
}

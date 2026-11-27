// Le contexte du second pour « pourquoi on est bloqués ? » / « what is happening » (#4121) : l'état de la vue du
// projet d'abord — chaque bandeau, chaque carte du rail avec son état affiché et son état réel —, les tickets hors
// de la vue ensuite, et le geste qui débloque en dernier. Le module ne lit rien : il met en texte la vue qu'on lui donne.
export type BannerOfTheVue = { label: string; waitsFor: string; waitsOn: string };
export type CardOfTheVue = { number: number; title: string; displayed: string; real: string; waitsOn: string };
export type VueOfProject = {
  banners: readonly BannerOfTheVue[];
  rail: readonly CardOfTheVue[];
  offRail?: readonly { number: number; title: string }[];
  gesture?: { what: string; by: string };
};

export function contextOfBlockage(question: string, vue: VueOfProject): string {
  const lines = [`Question: ${question}`, "", "Project view (answer about these first, in this order):"];
  for (const b of vue.banners) lines.push(`- Banner ${b.label}: it waits for: ${b.waitsFor}; it waits on: ${b.waitsOn}.`);
  for (const c of vue.rail) {
    lines.push(`- Card #${c.number} ${c.title}: displayed as "${c.displayed}".`);
    if (c.real !== c.displayed) {
      lines.push(`  #${c.number} is shown as "${c.displayed}" but the displayed state contradicts the real state: it cannot start.`);
      lines.push(`  Real state: ${c.real}`);
    }
    lines.push(`  It waits on: ${c.waitsOn}.`);
  }
  const outside = vue.offRail ?? [];
  if (outside.length > 0) {
    lines.push("", "Tickets not on the project view (mention only after the view items, and only if they matter):");
    for (const t of outside) lines.push(`- #${t.number} ${t.title}`);
  }
  lines.push("", vue.gesture ? `Gesture that unblocks: ${vue.gesture.what} — made by ${vue.gesture.by}.` : "No gesture is known that unblocks: say so, do not invent one.");
  return lines.join("\n");
}

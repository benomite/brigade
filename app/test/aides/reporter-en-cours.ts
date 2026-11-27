// Un reporter pour la CI Windows (ticket 1645) : il écrit une ligne dès qu'un fichier de test ou un
// test COMMENCE, et une dès qu'il finit. Le reporter `spec` n'écrit qu'à la fin d'un test : une suite
// qui pend ne dit alors rien de ce qui tourne. Avec celui-ci, le journal d'un job annulé par son
// plafond se termine sur le dernier `DEBUT` sans `FIN` : c'est le test qui bloque.
export default async function* reporterEnCours(source: AsyncIterable<{ type: string; data: any }>) {
  for await (const { type, data } of source) {
    if (type === "test:start") {
      yield `DEBUT ${data.file ?? ""} › ${data.name}\n`;
    } else if (type === "test:pass" || type === "test:fail") {
      yield `FIN   ${type === "test:fail" ? "ROUGE" : "ok   "} ${data.file ?? ""} › ${data.name}\n`;
    }
  }
}

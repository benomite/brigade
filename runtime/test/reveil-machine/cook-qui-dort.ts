// Un faux cook pour les tests de la veille (#3643), lancé par le node de la
// suite. Au premier lancement dans son répertoire, il dit un tour, attend que
// le test pose REVEIL_FEU — la machine a dormi pendant ce temps —, puis meurt
// en échec. Aux suivants, il note dans REVEIL_TEMOIN où il tourne et ce qu'il
// y trouve de non commité, dit un tour et finit bien.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dire = (objet: unknown) => process.stdout.write(`${JSON.stringify(objet)}\n`);
const tour = () => dire({ type: "assistant", message: { id: `msg_${process.pid}`, usage: { input_tokens: 5, output_tokens: 5 } } });

const premier = join(process.cwd(), ".premier-lancement");
if (!existsSync(premier)) {
  writeFileSync(premier, "");
  tour();
  const feu = process.env.REVEIL_FEU ?? "";
  const garde = setTimeout(() => process.exit(2), 60_000);
  const guetter = setInterval(() => {
    if (!existsSync(feu)) return;
    clearInterval(guetter);
    clearTimeout(garde);
    process.exit(1);
  }, 20);
} else {
  const brouillon = join(process.cwd(), "brouillon.txt");
  writeFileSync(process.env.REVEIL_TEMOIN ?? "", JSON.stringify({ cwd: process.cwd(), brouillon: existsSync(brouillon) ? readFileSync(brouillon, "utf8") : null }));
  tour();
  dire({ type: "result", result: "" });
}

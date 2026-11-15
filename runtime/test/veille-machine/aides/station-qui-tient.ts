// Une station réduite à sa veille (#3642) : un cook cuit, sur un Mac, et le faux `caffeinate` est lancé. Le test la tue.
// Lancée : `node station-qui-tient.ts <racine> <faux caffeinate> <témoin>`.
import { tenirLaVeille } from "../../../src/veille-machine/veille.ts";

const [racine = "", faux = "", temoin = ""] = process.argv.slice(2);
tenirLaVeille({ racine, plateforme: "darwin", cooks: () => 1, dire: () => {}, commande: [process.execPath, faux, temoin] });
// Elle vit jusqu'à ce qu'on la tue.
setInterval(() => {}, 60_000);

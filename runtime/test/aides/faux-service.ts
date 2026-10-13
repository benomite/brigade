// Doublure du service d'un projet : ce que sa commande de service lance. Elle
// écoute sur la boucle locale, sur le port que le setup a attribué au worktree
// ($BRIGADE_PORT), et répond à toute requête par d'où elle sert et ce qu'elle
// y trouve — de quoi prouver qu'un serveur tourne depuis ce worktree-là. Un
// port qu'un autre tient la fait sortir en le disant (code 98).
// FAUX_SERVICE=sourd : elle n'entend pas SIGTERM, comme un serveur qui traîne.
import { readdirSync } from "node:fs";
import { createServer } from "node:http";

const port = Number(process.env.BRIGADE_PORT);
if (process.env.FAUX_SERVICE === "sourd") process.on("SIGTERM", () => {});

const serveur = createServer((_requete, reponse) => {
  reponse.setHeader("content-type", "application/json");
  reponse.setHeader("connection", "close");
  reponse.end(JSON.stringify({ cwd: process.cwd(), port, fichiers: readdirSync(".").sort() }));
});
serveur.on("error", (erreur) => {
  console.error(`faux service : ${erreur.message}`);
  process.exit(98);
});
serveur.listen(port, "127.0.0.1", () => console.log(`faux service : à l'écoute sur ${port}`));

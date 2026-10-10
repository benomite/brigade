// À précharger (`--import`) dans un process lancé par un test : toute connexion
// HTTP qu'il ouvre y est refusée, comme si personne n'écoutait — sans qu'aucun
// port ne soit touché.
import { Agent } from "node:http";
import { connexionRefusee } from "./connexion-refusee.ts";

Agent.prototype.createConnection = (options: { host?: string | null; port?: number | string | null }) => connexionRefusee(String(options.host), Number(options.port));

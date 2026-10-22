#!/usr/bin/env node
// Doublure d'un `gh` dont le git_protocol est ssh : un clone qui ne reçoit pas
// la réécriture HTTPS (`GIT_CONFIG_*`) meurt sur la clé d'hôte, comme le 22
// oct. 2026 ; avec elle, il réussit. `$FAUX_REFUS` : un refus d'accès réel.
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const dossier = args[3] ?? "";
appendFileSync(join(process.env.FAUX_JOURNAL ?? "", "essais"), `${process.env.GIT_CONFIG_COUNT ?? "-"}\n`);
if (process.env.FAUX_REFUS !== undefined) {
  process.stderr.write(`remote: Repository not found.\nfatal: repository 'https://github.com/benomite/parade.git/' not found\nfailed to run git: exit status 128\n`);
  process.exit(1);
}
if (process.env.GIT_CONFIG_KEY_0 === undefined) {
  process.stderr.write("Host key verification failed.\nfatal: Could not read from remote repository.\nfailed to run git: exit status 128\n");
  process.exit(1);
}
mkdirSync(join(dossier, ".git"), { recursive: true });

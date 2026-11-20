// La commande `brigade` d'une station Windows (#3940) : installer-station.ps1 pose brigade.cmd
// sous %LOCALAPPDATA%\brigade-station\bin et met ce dossier sur le PATH du compte (HKCU\Environment,
// la portée utilisateur : sans droit d'administrateur), une seule fois. Rejouée — c'est aussi la mise à
// jour d'une station Windows —, elle réécrit la commande sans rien doubler. Ni Windows ni registre :
// les étapes du script sont jouées par `pwsh`, son registre est une doublure qui note ce qui s'y
// écrit — la commande entière est jouée par installer-station-windows.test.ts. Chaque `pwsh` se lance
// avant les tests, dans leur `before` : le premier démarrage de pwsh sur un runner de CI prend à lui
// seul plus que les 2 s d'un test (#2129), et les tests ne jugent que ce que ces lancements ont rendu.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { before, describe, test } from "node:test";
import { repertoireDuFichier } from "../outils.ts";
import { INSTALLER_PS1, PWSH, commandeWindows, rendu } from "./aides.ts";

const cite = (valeur: string) => `'${valeur.replaceAll("'", "''")}'`;

// Le registre du compte : `Get-Item HKCU:\Environment` lit le PATH, le dernier écrit sinon celui
// qu'on donne ; `Set-ItemProperty` note ce qui s'écrit. Illisible quand on le demande.
const PRELUDE = [
  "function Set-ItemProperty { [CmdletBinding()] param([string]$Path, [string]$Name, $Value) Add-Content -LiteralPath $env:BRIGADE_REGISTRE -Value \"$Path\\$Name=$Value\" }",
  "function Get-Item { [CmdletBinding()] param([string]$LiteralPath)",
  "  if ($env:BRIGADE_REGISTRE_ILLISIBLE) { throw 'Requested registry access is not allowed.' }",
  "  $cle = [pscustomobject]@{ Chemin = $LiteralPath }",
  "  $cle | Add-Member -MemberType ScriptMethod -Name GetValue -Value { param($nom, $defaut, $options)",
  "    if ($options -ne 'DoNotExpandEnvironmentNames') { throw \"lu avec $options\" }",
  "    $lu = @(Get-Content -LiteralPath $env:BRIGADE_REGISTRE -ErrorAction SilentlyContinue | Where-Object { $_ -like \"$($this.Chemin)\\$nom=*\" } | Select-Object -Last 1)",
  "    if ($lu.Count) { return $lu[0].Substring($this.Chemin.Length + $nom.Length + 2) }",
  "    if ($env:BRIGADE_PATH_DU_COMPTE) { return $env:BRIGADE_PATH_DU_COMPTE }",
  "    return $defaut }",
  "  return $cle }",
].join("\n");

// Les fonctions d'installer-station.ps1, chargées telles qu'il les déclare, puis `PoserLaCommande`
// jouée `fois` fois sur la base d'une station.
type Pose = ReturnType<typeof rendu> & { ecrit: string[] };
function poser(base: string, { fois = 1, pathDuCompte = "", illisible = false } = {}): Pose {
  const etat = repertoireDuFichier("brigade-test-commande-windows-");
  const registre = join(etat, "registre");
  writeFileSync(registre, "");
  const script = [
    PRELUDE,
    `$arbre = [System.Management.Automation.Language.Parser]::ParseFile(${cite(INSTALLER_PS1)}, [ref]$null, [ref]$null)`,
    "foreach ($f in $arbre.FindAll({ param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] }, $true)) { . ([scriptblock]::Create($f.Extent.Text)) }",
    `try { for ($i = 0; $i -lt ${fois}; $i++) { PoserLaCommande ${cite(base)} } } catch { [Console]::Error.WriteLine("arret: $_"); exit 1 }`,
  ].join("\n");
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: etat, BRIGADE_REGISTRE: registre, BRIGADE_PATH_DU_COMPTE: pathDuCompte, POWERSHELL_TELEMETRY_OPTOUT: "1", POWERSHELL_UPDATECHECK: "Off", DOTNET_CLI_TELEMETRY_OPTOUT: "1", LOCALAPPDATA: join(base, "..") };
  if (illisible) env.BRIGADE_REGISTRE_ILLISIBLE = "1";
  const r = rendu(spawnSync(PWSH as string, ["-NoProfile", "-NonInteractive", "-NoLogo", "-Command", script], { encoding: "utf8", env }));
  return { ...r, ecrit: readFileSync(registre, "utf8").split(/\r?\n/).filter(Boolean) };
}

function uneBase(): string {
  const base = join(repertoireDuFichier("brigade-test-commande-windows-"), "brigade-station");
  mkdirSync(base);
  return base;
}

describe("sous Windows", { skip: PWSH === undefined && "pwsh is not installed here: the Windows installer is a PowerShell script" }, () => {
  const avant = "%USERPROFILE%\\AppData\\Local\\Microsoft\\WindowsApps;C:\\outils";
  const bases = { deuxFois: "", dejaLa: "", ancienne: "", illisible: "" };
  let poses = {} as Record<keyof typeof bases, Pose>;
  before(() => {
    for (const nom of Object.keys(bases) as (keyof typeof bases)[]) bases[nom] = uneBase();
    mkdirSync(join(bases.ancienne, "bin"));
    writeFileSync(join(bases.ancienne, "bin/brigade.cmd"), "@echo ancienne\r\n");
    poses = {
      deuxFois: poser(bases.deuxFois, { fois: 2, pathDuCompte: avant }),
      dejaLa: poser(bases.dejaLa, { pathDuCompte: `C:\\outils;${join("%LOCALAPPDATA%", "brigade-station", "bin")}` }),
      ancienne: poser(bases.ancienne),
      illisible: poser(bases.illisible, { illisible: true }),
    };
  });

  test("posée deux fois : un seul brigade.cmd, et son dossier une seule fois sur le PATH du compte, après ce qui y était, ses %VARIABLES% gardées", () => {
    const base = bases.deuxFois;
    const r = poses.deuxFois;

    assert.equal(r.code, 0, r.sortie + r.erreur);
    const bin = join(base, "bin");
    assert.deepEqual(r.ecrit, [`HKCU:\\Environment\\Path=${avant};${bin}`]);
    assert.deepEqual(readdirSync(bin), ["brigade.cmd"]);
    assert.equal(readFileSync(join(bin, "brigade.cmd"), "utf8"), commandeWindows());
    assert.equal(r.sortie.split("\n").filter((ligne) => ligne.includes("the brigade command is on the PATH of the terminals you open from now on")).length, 1, r.sortie);
  });

  test("ce que brigade.cmd lance : le geste du runtime de la station, avec son node, son répertoire et le PATH de la station", () => {
    const cmd = commandeWindows();

    assert.ok(cmd.includes('\r\n"%~dp0..\\node\\node.exe" src\\station\\geste.ts %*\r\n'), cmd);
    assert.ok(cmd.includes('\r\npushd "%~dp0..\\runtime" 2>nul || ('), cmd);
    assert.ok(cmd.includes('\r\nset "BRIGADE_STATION_DIR=%USERPROFILE%\\.config\\brigade\\station"\r\n'), cmd);
    assert.ok(cmd.includes('\r\nset "PATH=%~dp0..\\node;%USERPROFILE%\\.local\\bin;%PATH%"\r\n'), cmd);
    assert.ok(cmd.endsWith("\r\nexit /b %code%"), cmd);
  });

  test("déjà sur le PATH du compte, écrit par une variable : rien n'y est réécrit", () => {
    const base = bases.dejaLa;
    const r = poses.dejaLa;

    assert.equal(r.code, 0, r.sortie + r.erreur);
    assert.deepEqual(r.ecrit, []);
    assert.deepEqual(readdirSync(join(base, "bin")), ["brigade.cmd"]);
    assert.doesNotMatch(r.sortie, /PATH/);
  });

  test("une commande d'avant, différente, est remplacée — et rien d'autre ne reste dans son dossier", () => {
    const base = bases.ancienne;
    const r = poses.ancienne;

    assert.equal(r.code, 0, r.sortie + r.erreur);
    assert.deepEqual(readdirSync(join(base, "bin")), ["brigade.cmd"]);
    assert.equal(readFileSync(join(base, "bin/brigade.cmd"), "utf8"), commandeWindows());
  });

  test("le PATH du compte illisible : refusé en le disant, et rien n'y est écrit", () => {
    const r = poses.illisible;

    assert.equal(r.code, 1);
    assert.match(r.erreur, /brigade: installation refused -- the user PATH cannot be read \(HKCU\\Environment\): Requested registry access is not allowed\./);
    assert.deepEqual(r.ecrit, []);
  });
});

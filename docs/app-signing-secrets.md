# App signing secrets

The [`publier-app`](../.github/workflows/publier-app.yml) workflow publishes an `app-v<version>`
release on every merge on `v2` that changes the app ([`app/packaging/README.md`](../app/packaging/README.md),
"Publier"). It only ships signed apps: the Mac `.dmg` is signed with a Developer ID certificate,
notarized by Apple and stapled, so it opens with no Apple warning, and the Windows installer is
signed with a code signing certificate. Installed apps update themselves to every release, so a
signed release is the only one that carries `latest-mac.yml` and `latest.yml`.

While **none** of the six secrets is set, the workflow takes its unsigned path instead of failing: it
builds and publishes `app-v<version>` with the unsigned `.dmg`, Windows `.exe` and Android `.apk`
only (no update metadata, so installed apps do not update to them), and the run log says that the
builds are unsigned. With only some of the secrets set, the signed path runs and refuses, as below.

The certificates and credentials are **repository secrets**. Add each one under the repository's
**Settings > Secrets and variables > Actions > New repository secret**, with the exact name below,
or from a terminal with `gh secret set <NAME> --repo benomite/brigade` (it reads the value from
standard input).

| Secret | What it is | Used by |
|---|---|---|
| [`MACOS_CERTIFICATE`](#macos_certificate) | the Developer ID Application certificate and its private key, a `.p12` in base64 | the `mac` job |
| [`MACOS_CERTIFICATE_PASSWORD`](#macos_certificate_password) | the password of that `.p12` | the `mac` job |
| [`APPLE_ID`](#apple_id) | the Apple Account that notarizes the Mac app | the `mac` job |
| [`APPLE_APP_SPECIFIC_PASSWORD`](#apple_app_specific_password) | an app-specific password of that Apple Account | the `mac` job |
| [`WINDOWS_CERTIFICATE`](#windows_certificate) | the code signing certificate and its private key, a `.pfx` in base64 | the `windows` job |
| [`WINDOWS_CERTIFICATE_PASSWORD`](#windows_certificate_password) | the password of that `.pfx` | the `windows` job |

## When one is missing

Before anything is built, the `verifier-secrets` job checks that all six are set. If one is
missing, nothing is built and no release is created. The pull request whose merge changed the app
receives a comment of one sentence, which names each missing secret and says to add it under the
repository's Settings > Secrets and variables > Actions. The run then ends red. The same sentence
is in the run's summary.

A merge that does not change the app reads no secret: it publishes nothing and posts no comment,
whether the secrets are there or not. A merge that does not change the app itself, but comes after
an app change that has not been published yet, still ends red while a secret is missing. It posts
no comment, because the pull request of that app change already received one. Once the secret is
added, the next merge publishes the change, or re-run the workflow from the Actions tab
(`workflow_dispatch`).

A secret that is set but wrong (a certificate that does not import, a password Apple refuses) also
stops the run before publication, red. The error annotation on the run page names the secret.

## The Mac secrets

They need a membership of the [Apple Developer Program](https://developer.apple.com/programs/)
(paid). Only the team's **Account Holder** can create a Developer ID certificate.

### `MACOS_CERTIFICATE`

The **Developer ID Application** certificate, with its private key, exported as a `.p12` file and
encoded in base64.

1. On a Mac, in [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/certificates/list),
   add a certificate of type **Developer ID Application**. Create its certificate signing request
   with Keychain Access (Certificate Assistant > Request a Certificate From a Certificate
   Authority, saved to disk).
2. Download the certificate and open it: it goes into the login keychain, next to its private key.
3. In Keychain Access, under **My Certificates**, select `Developer ID Application: <name> (<team ID>)`,
   then File > Export Items, as a `.p12`, with a password (that password is
   [`MACOS_CERTIFICATE_PASSWORD`](#macos_certificate_password)).
4. Encode it and set the secret:

   ```sh
   base64 -i DeveloperID.p12 | gh secret set MACOS_CERTIFICATE --repo benomite/brigade
   ```

The workflow imports it into a keychain of its own for the run, deleted at the end, and signs with
the first Developer ID Application identity it holds. The team ID used for notarization is the one
in that identity's name, between the parentheses.

### `MACOS_CERTIFICATE_PASSWORD`

The password chosen when exporting the `.p12` above. It must not be empty.

### `APPLE_ID`

The email address of an Apple Account that is a member of the team that owns the certificate. The
workflow submits the app and the `.dmg` to Apple's notary service with it
(`xcrun notarytool`).

### `APPLE_APP_SPECIFIC_PASSWORD`

An app-specific password of that Apple Account, not its own password. Create it at
[account.apple.com](https://account.apple.com), Sign-In and Security > App-Specific Passwords. It
has the form `abcd-efgh-ijkl-mnop`. Changing the account's main password revokes it: then create a
new one and update the secret.

## The Windows secrets

### `WINDOWS_CERTIFICATE`

A **code signing** certificate (OV or EV) issued by a certificate authority trusted by Windows
(DigiCert, Sectigo, GlobalSign…), with its private key, as a `.pfx` file encoded in base64:

```sh
base64 -w 0 brigade.pfx | gh secret set WINDOWS_CERTIFICATE --repo benomite/brigade
```

On a Mac, use `base64 -i brigade.pfx`. On Windows, in PowerShell:
`[Convert]::ToBase64String([IO.File]::ReadAllBytes("brigade.pfx")) | gh secret set WINDOWS_CERTIFICATE --repo benomite/brigade`.

The workflow signs the installer with `signtool` (SHA-256, timestamped by DigiCert's timestamp
server), checks the signature, then rewrites `latest.yml` for the signed installer, so the installed
apps' update check matches it.

Since June 2023, certificate authorities deliver new code signing keys only on a hardware token or
in a cloud HSM, which usually cannot be exported as a `.pfx`. This workflow signs from a `.pfx`:
a certificate that only lives on a token or in a cloud service (such as Azure Artifact Signing)
needs another signing step in the workflow, and other secrets. SmartScreen also weighs the
certificate's reputation: a new certificate can still show a warning on the first downloads.

### `WINDOWS_CERTIFICATE_PASSWORD`

The password of the `.pfx` above. It must not be empty.

## What the workflow checks before publishing

- **Mac:** `xcrun stapler validate` and
  `spctl --assess --type open --context context:primary-signature` on the `.dmg`; then, inside the
  mounted `.dmg`, `codesign --verify --deep --strict` (what the installed app checks before it
  replaces itself), `xcrun stapler validate` and `spctl --assess --type execute` on `Brigade.app`.
- **Windows:** `signtool verify /pa` on the installer, and its Authenticode status must be `Valid`
  (what its file properties show).

If one of these fails, the release is not created.

What is not signed yet: inside the Windows installer, `Brigade.exe`, `node.exe` and the uninstaller
keep the signature they came with, or none. Signing them happens in the build itself
(`app/packaging/windows.ts`, [`WINDOWS.md`](../app/packaging/WINDOWS.md), "What later tickets plug
in").

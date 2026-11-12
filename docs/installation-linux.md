# Install brigade on Linux

This page covers the Linux x64 app. The rest of the setup (the first project, the first ticket) is the
same as on a Mac or a Windows PC: see [`installation.md`](installation.md).

## Get the AppImage

Everything is on the **[releases page](https://github.com/benomite/brigade/releases/latest)**. Take the
most recent release named **“Brigade `<version>`”** (tag `app-v<version>`), the one marked “Latest”. Its
Linux file is `Brigade-<version>-linux-x64.AppImage`.

## Run it

1. **Download** `Brigade-<version>-linux-x64.AppImage` from the releases page.
2. **Make it executable**, once, in a terminal:

   ```sh
   chmod +x Brigade-<version>-linux-x64.AppImage
   ```

3. **Launch it**:

   ```sh
   ./Brigade-<version>-linux-x64.AppImage
   ```

4. Go on with [Your first ticket](installation.md#your-first-ticket).

To update, download the new AppImage from the releases page and run that one instead.

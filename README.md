# Sola Worship

Sola Worship is a Windows church presentation studio for Bible verses, song lyrics, slides, media, cameras, scene composition, projector outputs, program recording, and OBS-controlled live streaming.

## Install on another computer

1. Download `Sola-Worship-Setup-1.0.0.exe` from the GitHub release.
2. Run the installer and choose an installation folder.
3. Open Sola Worship from the desktop or Start menu.
4. Connect the projector as an extended Windows display.
5. Open **Settings / System Check** before the service.

Windows may show a SmartScreen warning until the installer is code-signed. Choose **More info → Run anyway** only when the installer came from the official project release.

## Projector and cameras

- In Windows Display Settings, select **Extend these displays** rather than Duplicate.
- Open Sola Worship through the installed desktop app for automatic projector-window placement.
- DroidCam, Iriun, USB capture devices, and webcams appear as Windows camera devices after their drivers are installed.
- Phone Camera pairing requires the phone and computer to be on the same local network. Follow the certificate instructions shown by the Camera Manager when secure camera access is required.
- Projector Settings provides Auto, 480p, 720p, and 1080p camera-relay profiles at 10, 15, 25, or 30 FPS. Start with Auto; use 1080p only after a sustained test on the presentation computer.

## Live streaming and virtual camera

Sola Worship controls OBS Studio through OBS WebSocket 5.x. OBS Studio provides the production-grade encoder, RTMP connection, and virtual-camera driver.

1. Install and open OBS Studio.
2. In OBS, open **Tools → WebSocket Server Settings**.
3. Enable the WebSocket server on port `4455` and choose a password.
4. Add the Sola Worship projector window to OBS as a **Window Capture** source.
5. In Sola Worship Scene Studio, open **Live Streaming**.
6. Enter the OBS password, select YouTube/Facebook/Custom RTMP, and enter the stream key.
7. Click **Connect OBS**, then **Go Live** or **Start Virtual Cam**.

Stream passwords and keys are encrypted with the Windows account before they are saved. Always use a private test stream before a live service.

## Media storage

Media imported through the installed desktop app is copied into Sola Worship's application-data media folder. Only file references are saved in projects, preventing large videos from being repeatedly converted and serialized in memory. Browser development mode keeps a data-URL fallback for testing.

## Run from source

Requirements: Node.js 22 or newer, npm, Windows 10/11.

```powershell
npm install
npm run desktop:dev
```

Production-style desktop run:

```powershell
npm run build
npm run desktop
```

## Tests

```powershell
npm run test:release
```

Additional live-service tests are available when their local servers are running:

```powershell
npm run test:song-library
npm run test:camera-protocol
```

## Create the Windows installer

```powershell
npm run release:windows
```

The installer is written to `release/`. Code signing and GitHub automatic release publishing are separate deployment steps.

## Service-day checklist

- Reboot the computer and close unnecessary programs.
- Confirm the projector uses Extended display mode.
- Test every camera and media file.
- Confirm audio meters move and make a short recording.
- Run a private streaming test and confirm sound on another device.
- Keep a backup video or presentation available for emergencies.

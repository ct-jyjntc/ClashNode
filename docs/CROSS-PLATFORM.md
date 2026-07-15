# macOS & Windows support

Linux is **not** a supported target.

## Status

| Feature | macOS | Windows |
|---------|-------|---------|
| System proxy | networksetup | WinINet + RAS + WinHTTP best-effort |
| TUN elevate | osascript setuid on mihomo | **ClashNodeHelperService** (Windows Service) + Wintun |
| Kernel binaries | `mihomo-darwin-*` | `mihomo-windows-*.exe` + `wintun.dll` |
| Tray | painted speed + circle | status_1/2/3 icons |
| Auto-start | Login item | Login item |
| Deep links | `setAsDefaultProtocolClient` | HKCU Classes |
| UWP loopback | — | EnableLoopback.exe (Settings → Auth) |
| Backup zip | system zip / unzip | PowerShell .NET ZipFile (no external zip) |
| Package | dmg | NSIS + zip (kills leftover processes; uninstall deletes helper service) |

## Windows TUN architecture (FlClash-aligned)

```
ClashNode.exe (user)
    │ authorize-tun / enable TUN
    ▼
ClashNodeHelperService (Windows Service, elevated)
    HTTP 127.0.0.1:47891  /ping /start /stop /logs
    │ start { path: mihomo.exe, args: [-d home, -f config] }
    ▼
mihomo.exe (+ wintun.dll beside it)  → TUN / route table
```

- Service name: `ClashNodeHelperService`
- Control port: `47891` (FlClash uses `47890`)
- Release helper is built with `TOKEN=<sha256 of mihomo>` and refuses other binaries
- Dev helper: `npm run build:helper:dev` (empty TOKEN, hash check skipped)

## Prepare (Windows)

```bash
npm run fetch-mihomo          # mihomo-windows-*.exe
npm run fetch-wintun          # wintun.dll + arch-tagged copies
npm run build:helper          # ClashNodeHelperService.exe  (needs Rust)
# or all-in-one:
npm run prepare:win

npm run icons:platform
npm run dist:win
```

### Helper rebuild when mihomo updates

```bash
# TOKEN is auto-derived from resources/bin/mihomo-windows-*.exe
npm run build:helper
```

If `/start` fails with a SHA256 mismatch message, rebuild the helper so TOKEN matches the current mihomo binary, then re-run **Authorize TUN** in the app.

## Data directory

| OS | Path |
|----|------|
| macOS | `~/Library/Application Support/clashnode/` |
| Windows | `%APPDATA%/clashnode/` |

Runtime copies of `mihomo.exe`, `wintun.dll`, and `ClashNodeHelperService.exe` live under `…/bin/`.

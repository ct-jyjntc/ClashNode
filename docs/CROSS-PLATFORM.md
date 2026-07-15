# macOS & Windows support

Linux is **not** a supported target.

## Status

| Feature | macOS | Windows |
|---------|-------|---------|
| System proxy | networksetup | WinINet + RAS + WinHTTP best-effort |
| TUN elevate | osascript setuid | UAC prep + admin detect |
| Kernel binaries | `mihomo-darwin-*` | `mihomo-windows-*.exe` |
| Tray | painted speed + circle | status_1/2/3 icons |
| Auto-start | Login item | Login item |
| Deep links | `setAsDefaultProtocolClient` | HKCU Classes |
| Package | dmg | NSIS + zip |

## Prepare

```bash
npm run fetch-mihomo
npm run icons:platform
npm run dist:mac
npm run dist:win
```

# ClashNode

Quiet multi-platform proxy client powered by **mihomo** (Clash Meta), with a monochrome Quiet Console UI.

## Features

- Start / stop / restart mihomo core
- Profiles: subscription URL, local YAML, clipboard, QR image, camera QR
- Visual overwrite: prepend rules, custom proxy-groups, JS `main(config)` scripts
- Proxy groups, node selection, delay test, providers
- Dashboard with customizable widgets + live traffic chart
- Connections, requests, rules, logs, geo resources
- System proxy: macOS / Windows / Linux (GNOME)
- Optional TUN (setuid elevation on macOS; see `docs/TUN-NETWORK-EXTENSION.md`)
- Ports (mixed / HTTP / SOCKS / redir / tproxy), DNS, on-demand SSID
- Global hotkeys (press-to-record), theme presets, WebDAV backup
- Tray menu, in-app updater hooks (`electron-updater`)
- External controller: `127.0.0.1:9090` + local secret

## Requirements

- Node.js 20+
- Platform-matched mihomo binary under `resources/bin/`:
  - macOS arm64: `mihomo` or `mihomo-darwin-arm64`
  - Windows / Linux: place the matching release binary with platform tag

## Develop

```bash
cd ClashNode
npm install
npm run dev
```

## Build / package

```bash
npm run build
npm run pack:mac    # dir
npm run pack:win
npm run pack:linux
npm run dist:mac    # dmg + zip
npm run dist:win    # nsis + zip
npm run dist:linux  # AppImage + deb
```

Set GitHub `publish` in `package.json` for auto-update releases.

## Data directory

| OS | Path |
|----|------|
| macOS | `~/Library/Application Support/clashnode/` |
| Windows | `%APPDATA%/clashnode/` |
| Linux | `~/.config/clashnode/` |

```
config.yaml
profiles.json
profiles/*.yaml
scripts/*.js
settings.json
secret.txt
```

## Defaults

| Key | Value |
|-----|--------|
| mixed-port | 7890 |
| external-controller | 127.0.0.1:9090 |
| mode | rule |
| system proxy | on |
| TUN | off |

## Reference

UI: Quiet Console. Feature flow inspired by [FlClash](https://github.com/chen08209/FlClash). Kernel: [mihomo](https://github.com/MetaCubeX/mihomo).

## License

Personal / local use. mihomo is subject to its own license.

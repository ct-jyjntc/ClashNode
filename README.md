# ClashNode

Quiet macOS & Windows proxy client powered by **mihomo** (Clash Meta), with a monochrome Quiet Console UI.

## Features

- Start / stop / restart mihomo core
- Profiles: subscription URL, local YAML, clipboard, QR image, camera QR
- Visual overwrite: prepend rules, custom proxy-groups, JS `main(config)` scripts
- Proxy groups, node selection, delay test, providers
- Dashboard with customizable widgets + live traffic chart
- Connections, requests, rules, logs, geo resources
- System proxy: macOS (networksetup) · Windows (WinINet+RAS)
- Optional TUN: macOS setuid elevation; Windows UAC/admin (see `docs/CROSS-PLATFORM.md`)
- Ports (mixed / HTTP / SOCKS / redir / tproxy), DNS, on-demand SSID
- Global hotkeys (press-to-record), theme presets, WebDAV backup
- Tray menu (groups/modes all desktop), in-app updater hooks (`electron-updater`)
- Deep links `clash://` / `clashnode://` (Win registry · macOS)
- External controller: `127.0.0.1:9090` + local secret

<img width="1223" height="926" alt="截屏2026-07-15 04 39 42" src="https://github.com/user-attachments/assets/9bc7054a-c4e0-4475-82bd-3ec3fc33859d" />
<img width="2446" height="1852" alt="pixelated-image_1784061858973" src="https://github.com/user-attachments/assets/2684b71c-a40b-4ec6-97e3-2d1a4fc5179a" />
<img width="2446" height="1852" alt="pixelated-image_1784061781708" src="https://github.com/user-attachments/assets/dadab5ed-decf-4214-9a5f-a150458bd19e" />
<img width="1223" height="926" alt="截屏2026-07-15 04 40 09" src="https://github.com/user-attachments/assets/e298b01b-9f0f-4897-9558-cff26aa22590" />
<img width="2446" height="1852" alt="pixelated-image_1784061831776" src="https://github.com/user-attachments/assets/8a701443-5668-4b77-bed1-907ae82233ed" />
<img width="2446" height="1852" alt="pixelated-image_1784061883939" src="https://github.com/user-attachments/assets/816828af-6a91-43ed-b348-d308170205f4" />
<img width="2446" height="1852" alt="pixelated-image_1784061920390" src="https://github.com/user-attachments/assets/da308d2b-40c5-4866-9926-973d6bfbcdf5" />
<img width="1223" height="926" alt="截屏2026-07-15 04 40 29" src="https://github.com/user-attachments/assets/ad6514b1-e9ee-4874-8dbd-1eb95ab047a5" />
<img width="1223" height="926" alt="截屏2026-07-15 04 40 31" src="https://github.com/user-attachments/assets/2908defe-eb29-4c16-b2b8-30340f8780ca" />
<img width="2446" height="1852" alt="pixelated-image_1784061945321" src="https://github.com/user-attachments/assets/3de68d7a-c8fc-400f-9cc0-9235abea8c90" />
<img width="1223" height="926" alt="截屏2026-07-15 04 40 35" src="https://github.com/user-attachments/assets/5158efd1-ff99-41f9-954b-ab92afecb01b" />

## Requirements

- Node.js 20+
- mihomo under `resources/bin/` (multi-arch names supported)

```bash
npm run fetch-mihomo          # download MetaCubeX release binaries
# produces mihomo-darwin-*, mihomo-windows-*.exe, …
```

## Develop

```bash
cd ClashNode
npm install
npm run fetch-mihomo          # first time / update kernel
npm run dev
```

## Build / package

```bash
npm run icons:platform        # icon.ico for Windows
npm run build
npm run dist:mac              # dmg (arm64 + x64)
npm run dist:win              # nsis + zip (x64 + arm64)
```

Cross-platform notes: `docs/CROSS-PLATFORM.md`.  
Set GitHub `publish` in `package.json` for auto-update releases.

## Data directory

| OS | Path |
|----|------|
| macOS | `~/Library/Application Support/clashnode/` |
| Windows | `%APPDATA%/clashnode/` |

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

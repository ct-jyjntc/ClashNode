# ClashNode

Quiet macOS proxy client powered by **mihomo** (Clash Meta), with a monochrome Quiet Console UI.

## Features

- Start / stop / restart mihomo core
- Profile import (subscription URL or local YAML)
- Proxy groups, node selection, delay test
- Live traffic, connections, rules, logs
- System proxy (macOS `networksetup`)
- Optional TUN (requires elevating the mihomo binary)
- Tray menu, dark/light theme, backup / restore
- External controller API: `127.0.0.1:9090` + local secret

## Requirements

- macOS arm64
- Node.js 20+
- mihomo binary at `resources/bin/mihomo` (bundled from `mihomo-darwin-arm64-v1.19.28`)

## Develop

```bash
cd /Users/luna/Desktop/ClashNode
npm install
npm run dev
```

## Build

```bash
npm run build
npm run pack   # electron-builder dir
# or
npm run dist   # dmg + zip
```

## Data directory

```
~/Library/Application Support/clashnode/
  config.yaml
  profiles.json
  profiles/*.yaml
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

UI aesthetic: Quiet Console (Grok2API-style admin). Feature flow inspired by [FlClash](https://github.com/chen08209/FlClash). Kernel: [mihomo](https://github.com/MetaCubeX/mihomo).

## License

Personal / local use. mihomo is subject to its own license.

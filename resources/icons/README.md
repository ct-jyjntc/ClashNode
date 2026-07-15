# App icons — FlClash grid

Measured from FlClash `AppIcon.appiconset/app_icon_1024.png`:

| Property | FlClash | Ours |
|----------|---------|------|
| Canvas | 1024 | 1024 |
| Opaque plate | ~828–874 (~82%) | **840 (~82%)** |
| Mid-edge alpha | 0 (margin) | 0 |
| Corner alpha | 0 | 0 |
| Sizes | 16…1024 (mac idiom) | same |

## Files
- `icon.icns` / `icon.png` — package (electron-builder `mac.icon`)
- `dock-light.png` / `dock-dark.png` — runtime Dock theme
- `AppIcon.appiconset/` — same Contents.json layout as FlClash

## Regenerate
```bash
./scripts/generate-icons.sh
```

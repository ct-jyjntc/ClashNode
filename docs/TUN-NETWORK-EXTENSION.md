# macOS Network Extension TUN (roadmap)

ClashNode currently enables TUN the same way many open-source clients do on macOS:

1. Write `tun.enable: true` into the mihomo config
2. Elevate the mihomo binary (`chown root:admin` + `chmod +sx`) so the kernel can create a utun device

That path **works for local/dev use** but is **not** the App Store / modern hardened-runtime approach.

## What a production Network Extension needs

| Piece | Notes |
|-------|--------|
| Apple Developer Program | Paid team account |
| App Groups + Network Extension entitlement | `com.apple.developer.networking.networkextension` |
| Packet Tunnel Provider target | Separate extension binary/bundle |
| Provisioning profiles | App + extension both signed |
| Notarization | Required for Gatekeeper distribution |
| IPC to extension | XPC / app group container to push mihomo config or run a userspace stack |

## Recommended architecture (future)

```
ClashNode.app (UI + config merge)
    │ XPC / app group
    ▼
ClashNodeTunnel.appex (NEPacketTunnelProvider)
    │ starts tun fd / network settings
    ▼
mihomo (embedded or linked) OR userspace redirect into extension
```

FlClash / official clients that ship NE typically:

- Keep UI unprivileged
- Put tunnel ownership in the system Network Extension
- Ask the user once for VPN permission (System Settings → VPN)

## What ClashNode ships today

- `system:authorize-tun` AppleScript elevation of `resources/bin/mihomo`
- Runtime config `tun` block with `auto-route`, `dns-hijack`, `stack: mixed`
- UI toggle + tray toggle

## Enabling a stub extension later

1. Create an Xcode multi-target project alongside Electron, **or** migrate the shell to Tauri/SwiftUI for NE hosting
2. Add `PacketTunnelProvider.swift` that:
   - Calls `setTunnelNetworkSettings`
   - Reads config from App Group
3. Replace setuid path with `OSSystemExtensionRequest` / `NETunnelProviderManager`

Until then, TUN remains a **developer / advanced-user** feature with explicit password prompts.

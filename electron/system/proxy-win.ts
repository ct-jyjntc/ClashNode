/**
 * Windows system proxy — FlClash-aligned.
 *
 * 1) WinINet INTERNET_PER_CONN_OPTION for LAN + RAS + browser notify
 * 2) HKCU Internet Settings registry sync
 * 3) WinHTTP proxy (netsh) for services that ignore WinINet
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { DEFAULT_BYPASS } from "../shared/types";

const execFileAsync = promisify(execFile);

function escapePsSingle(s: string) {
  return s.replace(/'/g, "''");
}

function buildScript(enable: boolean, server: string, bypass: string) {
  const enableLit = enable ? "$true" : "$false";
  const serverLit = escapePsSingle(server);
  const bypassLit = escapePsSingle(bypass);

  return `
$ErrorActionPreference = 'Stop'
if (-not ("ClashNodeProxy" -as [type])) {
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class ClashNodeProxy {
  const int INTERNET_OPTION_PER_CONNECTION_OPTION = 75;
  const int INTERNET_OPTION_SETTINGS_CHANGED = 39;
  const int INTERNET_OPTION_REFRESH = 37;
  const int INTERNET_PER_CONN_FLAGS = 1;
  const int INTERNET_PER_CONN_PROXY_SERVER = 2;
  const int INTERNET_PER_CONN_PROXY_BYPASS = 3;
  const int PROXY_TYPE_DIRECT = 0x00000001;
  const int PROXY_TYPE_PROXY = 0x00000002;

  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
  struct INTERNET_PER_CONN_OPTION {
    public int dwOption;
    public INTERNET_PER_CONN_OPTION_UNION Value;
  }

  [StructLayout(LayoutKind.Explicit)]
  struct INTERNET_PER_CONN_OPTION_UNION {
    [FieldOffset(0)] public int dwValue;
    [FieldOffset(0)] public IntPtr pszValue;
    [FieldOffset(0)] public System.Runtime.InteropServices.ComTypes.FILETIME ftValue;
  }

  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
  struct INTERNET_PER_CONN_OPTION_LIST {
    public int dwSize;
    public IntPtr pszConnection;
    public int dwOptionCount;
    public int dwOptionError;
    public IntPtr pOptions;
  }

  [DllImport("wininet.dll", SetLastError = true, CharSet = CharSet.Auto)]
  static extern bool InternetSetOption(IntPtr hInternet, int dwOption, IntPtr lpBuffer, int dwBufferLength);

  [DllImport("rasapi32.dll", SetLastError = true, CharSet = CharSet.Auto)]
  static extern int RasEnumEntries(IntPtr reserved, IntPtr lpszPhonebook, IntPtr lprasentryname, ref int lpcb, ref int lpcEntries);

  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
  struct RASENTRYNAME {
    public int dwSize;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 257)]
    public string szEntryName;
    public int dwFlags;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 261)]
    public string szPhonebookPath;
  }

  static bool Apply(string connection, bool enable, string server, string bypass) {
    int count = enable ? 3 : 1;
    int optSize = Marshal.SizeOf(typeof(INTERNET_PER_CONN_OPTION));
    IntPtr pOptions = Marshal.AllocHGlobal(optSize * count);
    IntPtr pServer = IntPtr.Zero;
    IntPtr pBypass = IntPtr.Zero;
    IntPtr pConn = IntPtr.Zero;
    try {
      INTERNET_PER_CONN_OPTION opt0 = new INTERNET_PER_CONN_OPTION();
      opt0.dwOption = INTERNET_PER_CONN_FLAGS;
      opt0.Value.dwValue = enable ? (PROXY_TYPE_DIRECT | PROXY_TYPE_PROXY) : PROXY_TYPE_DIRECT;
      Marshal.StructureToPtr(opt0, pOptions, false);

      if (enable) {
        pServer = Marshal.StringToHGlobalAuto(server);
        pBypass = Marshal.StringToHGlobalAuto(bypass);
        INTERNET_PER_CONN_OPTION opt1 = new INTERNET_PER_CONN_OPTION();
        opt1.dwOption = INTERNET_PER_CONN_PROXY_SERVER;
        opt1.Value.pszValue = pServer;
        Marshal.StructureToPtr(opt1, (IntPtr)((long)pOptions + optSize), false);

        INTERNET_PER_CONN_OPTION opt2 = new INTERNET_PER_CONN_OPTION();
        opt2.dwOption = INTERNET_PER_CONN_PROXY_BYPASS;
        opt2.Value.pszValue = pBypass;
        Marshal.StructureToPtr(opt2, (IntPtr)((long)pOptions + 2L * optSize), false);
      }

      INTERNET_PER_CONN_OPTION_LIST list = new INTERNET_PER_CONN_OPTION_LIST();
      list.dwSize = Marshal.SizeOf(typeof(INTERNET_PER_CONN_OPTION_LIST));
      pConn = connection == null ? IntPtr.Zero : Marshal.StringToHGlobalAuto(connection);
      list.pszConnection = pConn;
      list.dwOptionCount = count;
      list.dwOptionError = 0;
      list.pOptions = pOptions;

      IntPtr pList = Marshal.AllocHGlobal(list.dwSize);
      try {
        Marshal.StructureToPtr(list, pList, false);
        return InternetSetOption(IntPtr.Zero, INTERNET_OPTION_PER_CONNECTION_OPTION, pList, list.dwSize);
      } finally {
        Marshal.FreeHGlobal(pList);
      }
    } finally {
      if (pConn != IntPtr.Zero) Marshal.FreeHGlobal(pConn);
      if (pServer != IntPtr.Zero) Marshal.FreeHGlobal(pServer);
      if (pBypass != IntPtr.Zero) Marshal.FreeHGlobal(pBypass);
      Marshal.FreeHGlobal(pOptions);
    }
  }

  public static bool SetProxy(bool enable, string server, string bypass) {
    bool ok = Apply(null, enable, server, bypass);

    int cb = 0, entries = 0;
    int ret = RasEnumEntries(IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, ref cb, ref entries);
    if (ret == 603 && entries > 0) {
      IntPtr buf = Marshal.AllocHGlobal(cb);
      try {
        RASENTRYNAME sample = new RASENTRYNAME();
        sample.dwSize = Marshal.SizeOf(typeof(RASENTRYNAME));
        Marshal.StructureToPtr(sample, buf, false);
        ret = RasEnumEntries(IntPtr.Zero, IntPtr.Zero, buf, ref cb, ref entries);
        if (ret == 0) {
          int size = Marshal.SizeOf(typeof(RASENTRYNAME));
          for (int i = 0; i < entries; i++) {
            RASENTRYNAME e = (RASENTRYNAME)Marshal.PtrToStructure(
              (IntPtr)((long)buf + (long)i * size), typeof(RASENTRYNAME));
            if (!string.IsNullOrEmpty(e.szEntryName)) {
              ok = Apply(e.szEntryName, enable, server, bypass) && ok;
            }
          }
        }
      } finally {
        Marshal.FreeHGlobal(buf);
      }
    }

    InternetSetOption(IntPtr.Zero, INTERNET_OPTION_SETTINGS_CHANGED, IntPtr.Zero, 0);
    InternetSetOption(IntPtr.Zero, INTERNET_OPTION_REFRESH, IntPtr.Zero, 0);

    try {
      Microsoft.Win32.RegistryKey key = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(
        @"Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings", true);
      if (key != null) {
        key.SetValue("ProxyEnable", enable ? 1 : 0);
        if (enable) {
          key.SetValue("ProxyServer", server);
          key.SetValue("ProxyOverride", bypass);
        }
        key.Close();
      }
    } catch {}

    return ok;
  }
}
"@
}
[ClashNodeProxy]::SetProxy(${enableLit}, '${serverLit}', '${bypassLit}')
`;
}

async function setWinHttp(enable: boolean, port: number) {
  try {
    if (enable) {
      // WinHTTP: http=host:port;https=host:port
      await execFileAsync(
        "netsh",
        [
          "winhttp",
          "set",
          "proxy",
          `proxy-server=127.0.0.1:${port}`,
          "bypass-list=localhost;127.*;10.*;192.168.*;172.16.*;172.17.*;172.18.*;172.19.*;172.20.*;172.21.*;172.22.*;172.23.*;172.24.*;172.25.*;172.26.*;172.27.*;172.28.*;172.29.*;172.30.*;172.31.*;<local>",
        ],
        { windowsHide: true, timeout: 10_000 },
      );
    } else {
      await execFileAsync(
        "netsh",
        ["winhttp", "reset", "proxy"],
        { windowsHide: true, timeout: 10_000 },
      );
    }
  } catch {
    // WinHTTP often needs admin — best-effort only
  }
}

async function runProxyScript(enable: boolean, port: number, bypass: string[]) {
  const server = `127.0.0.1:${port}`;
  const list = [...bypass];
  if (!list.some((b) => b.toLowerCase() === "<local>")) list.push("<local>");
  const bypassStr = list.join(";");
  const script = buildScript(enable, server, bypassStr);
  const { stdout, stderr } = await execFileAsync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      script,
    ],
    { windowsHide: true, timeout: 30_000, maxBuffer: 2 * 1024 * 1024 },
  );
  const out = `${stdout || ""}${stderr || ""}`.trim();
  if (/False/i.test(out) && !/True/i.test(out)) {
    throw new Error(`Windows system proxy failed: ${out || "unknown"}`);
  }
  await setWinHttp(enable, port);
}

export async function enableSystemProxy(
  port: number,
  bypass: string[] = DEFAULT_BYPASS,
) {
  await runProxyScript(true, port, bypass);
}

export async function disableSystemProxy() {
  await runProxyScript(false, 0, []);
}

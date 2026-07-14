import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { DEFAULT_BYPASS } from "../shared/types";

const execFileAsync = promisify(execFile);

function ps(command: string) {
  return execFileAsync("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    command,
  ]);
}

export async function enableSystemProxy(
  port: number,
  bypass: string[] = DEFAULT_BYPASS,
) {
  const server = `127.0.0.1:${port}`;
  const bypassStr = [...bypass, "<local>"].join(";");
  const cmd = `
$reg = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'
Set-ItemProperty -Path $reg -Name ProxyEnable -Value 1
Set-ItemProperty -Path $reg -Name ProxyServer -Value '${server.replace(/'/g, "''")}'
Set-ItemProperty -Path $reg -Name ProxyOverride -Value '${bypassStr.replace(/'/g, "''")}'
`;
  await ps(cmd);
}

export async function disableSystemProxy() {
  const cmd = `
$reg = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'
Set-ItemProperty -Path $reg -Name ProxyEnable -Value 0
`;
  await ps(cmd);
}

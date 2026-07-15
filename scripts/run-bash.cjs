/**
 * Cross-platform bash launcher for npm scripts.
 * PowerShell often has no `bash` on PATH even when Git for Windows is installed.
 *
 * Usage: node scripts/run-bash.cjs scripts/foo.sh [args...]
 */
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const args = process.argv.slice(2);
if (!args.length) {
  console.error("Usage: node scripts/run-bash.cjs <script.sh> [args...]");
  process.exit(1);
}

function candidates() {
  const list = [];
  if (process.env.BASH) list.push(process.env.BASH);
  // Git for Windows
  const pf = process.env["ProgramFiles"] || "C:\\Program Files";
  const pf86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  const local = process.env.LOCALAPPDATA || "";
  for (const root of [pf, pf86, local]) {
    list.push(path.join(root, "Git", "bin", "bash.exe"));
    list.push(path.join(root, "Git", "usr", "bin", "bash.exe"));
  }
  // MSYS2
  list.push("C:\\msys64\\usr\\bin\\bash.exe");
  list.push("C:\\msys64\\bin\\bash.exe");
  // Already on PATH (Git Bash shell, WSL, etc.)
  list.push("bash");
  return list;
}

function findBash() {
  for (const c of candidates()) {
    if (!c) continue;
    if (c === "bash") return c;
    try {
      if (fs.existsSync(c)) return c;
    } catch {
      /* ignore */
    }
  }
  return null;
}

const bash = findBash();
if (!bash) {
  console.error(
    "bash not found. Install Git for Windows (https://git-scm.com/) or set BASH=C:\\\\Path\\\\to\\\\bash.exe",
  );
  process.exit(1);
}

const script = args[0];
const rest = args.slice(1);
// Prefer login-less for speed; scripts use #!/usr/bin/env bash
const result = spawnSync(bash, [script, ...rest], {
  stdio: "inherit",
  shell: false,
  env: process.env,
  cwd: process.cwd(),
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);

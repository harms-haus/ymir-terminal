import { spawn, type Subprocess } from "bun";

const SERVER_PORT = 3000;
const CLIENT_PORT = 5173;

let server: Subprocess | null = null;
let client: Subprocess | null = null;

function prefixLines(prefix: string, data: Uint8Array): string {
  const text = new TextDecoder().decode(data);
  return text
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => `[${prefix}] ${line}`)
    .join("\n");
}

async function readOutput(
  proc: Subprocess,
  prefix: string,
): Promise<void> {
  const reader = proc.stdout.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const lines = prefixLines(prefix, value);
      if (lines) console.log(lines);
    }
  } catch {
    // Stream closed – process exited
  }
}

async function readErrors(
  proc: Subprocess,
  prefix: string,
): Promise<void> {
  const reader = proc.stderr.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const lines = prefixLines(prefix, value);
      if (lines) console.error(lines);
    }
  } catch {
    // Stream closed
  }
}

function cleanup(): void {
  try {
    server?.kill();
  } catch {
    // already dead
  }
  try {
    client?.kill();
  } catch {
    // already dead
  }
}

process.on("SIGINT", () => {
  console.log("\n[dev] Received SIGINT, shutting down...");
  cleanup();
  process.exit(0);
});

process.on("SIGTERM", () => {
  cleanup();
  process.exit(0);
});

// ── Spawn server ───────────────────────────────────────────────
console.log(
  `[dev] Starting server on port ${SERVER_PORT} and client on port ${CLIENT_PORT}...`,
);

server = spawn({
  cmd: ["bun", "apps/server/src/index.ts", `--password=${process.env.YMIR_PASSWORD || 'dev'}`],
  cwd: import.meta.dir.replace(/\/scripts$/, ""),
  stdout: "pipe",
  stderr: "pipe",
  env: { ...process.env, PORT: String(SERVER_PORT) },
});

client = spawn({
  cmd: ["bun", "run", "--cwd", "apps/client", "dev"],
  cwd: import.meta.dir.replace(/\/scripts$/, ""),
  stdout: "pipe",
  stderr: "pipe",
  env: { ...process.env, PORT: String(CLIENT_PORT) },
});

// ── Pipe output concurrently ───────────────────────────────────
const serverOut = readOutput(server, "server");
const serverErr = readErrors(server, "server");
const clientOut = readOutput(client, "client");
const clientErr = readErrors(client, "client");

// ── Wait for either process to exit ────────────────────────────
const serverExit = server.exited;
const clientExit = client.exited;

Promise.any([serverExit, clientExit]).then((code) => {
  console.error(`[dev] A process exited with code ${code}. Shutting down.`);
  cleanup();
  process.exit(code === 0 ? 0 : 1);
});

// Keep the process alive until outputs finish
await Promise.allSettled([serverOut, serverErr, clientOut, clientErr]);

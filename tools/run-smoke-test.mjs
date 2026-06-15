import { spawn } from "node:child_process";

const port = Number(process.env.PORT || 4174);
const baseUrl = process.env.SMOKE_BASE_URL || `http://127.0.0.1:${port}/`;
let serverProcess = null;

if (!(await isReachable(baseUrl))) {
  serverProcess = spawn(process.execPath, ["tools/dev-server.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "inherit", "inherit"],
    windowsHide: true,
  });
  await waitForServer(baseUrl);
}

const testProcess = spawn(process.execPath, ["wo-ai-shuati-pro/smoke-test.mjs"], {
  cwd: process.cwd(),
  env: { ...process.env, SMOKE_BASE_URL: baseUrl },
  stdio: "inherit",
  windowsHide: true,
});

testProcess.on("exit", (code) => {
  if (serverProcess) serverProcess.kill();
  process.exit(code ?? 1);
});

async function waitForServer(url) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10_000) {
    if (await isReachable(url)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (serverProcess) serverProcess.kill();
  throw new Error(`Dev server did not become reachable: ${url}`);
}

async function isReachable(url) {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

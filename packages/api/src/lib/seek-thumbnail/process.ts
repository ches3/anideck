import { spawn } from "node:child_process";

interface SpawnProcessResult {
  stdout: string;
  stderr: string;
}

export async function spawnProcessWithOutput(
  command: string,
  args: string[],
): Promise<SpawnProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    const stdoutStream = child.stdout;
    const stderrStream = child.stderr;
    let stdout = "";
    let stderr = "";

    stdoutStream.setEncoding("utf8");
    stderrStream.setEncoding("utf8");
    stdoutStream.on("data", (chunk: string) => {
      stdout += chunk;
    });
    stderrStream.on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(new Error(stderr.trim() || `${command} exited with code ${String(code)}`));
    });
  });
}

export async function spawnProcess(command: string, args: string[]): Promise<void> {
  await spawnProcessWithOutput(command, args);
}

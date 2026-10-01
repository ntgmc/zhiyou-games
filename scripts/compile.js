import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

export const root = fileURLToPath(new URL("../", import.meta.url));
export const compiler = fileURLToPath(new URL("../node_modules/typescript/bin/tsc", import.meta.url));

export async function compile() {
  try {
    await promisify(execFile)(process.execPath, [compiler, "-p", "tsconfig.json"], { cwd: root });
  } catch (error) {
    throw new Error(error.stdout || error.stderr || error.message);
  }
}

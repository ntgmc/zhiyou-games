import { spawn } from "node:child_process";
import { compile, compiler, root } from "./compile.js";

await compile();
const children = [
  spawn(process.execPath, [compiler, "-p", "tsconfig.json", "--watch", "--preserveWatchOutput"], { cwd: root, stdio: "inherit" }),
  spawn(process.execPath, ["server.js"], { cwd: root, stdio: "inherit" }),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exitCode = code;
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
for (const child of children) {
  child.on("error", (error) => { console.error(error.message); stop(1); });
  child.on("exit", (code) => stop(code || 0));
}

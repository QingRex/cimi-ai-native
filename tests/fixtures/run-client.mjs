import { dirname } from "node:path";
import { CimiLoopKernel } from "../../packages/kernel/dist/index.js";
import { SqliteProjectStore } from "../../packages/store-sqlite/dist/index.js";
import { LocalRunVerifier } from "../../apps/cli/dist/runs-local.js";

const store = new SqliteProjectStore(process.argv[2]);
process.on("message", ({ command, caller, now, repositoryPath }) => {
  try {
    const result = new CimiLoopKernel({ store, caller, now: () => now, runVerifier: new LocalRunVerifier(repositoryPath, dirname(process.argv[2])) }).execute(command);
    process.send({ result }, () => { store.close(); process.exit(0); });
  } catch (error) { store.close(); process.send({ error: String(error) }, () => process.exit(1)); }
});
process.send({ ready: true });

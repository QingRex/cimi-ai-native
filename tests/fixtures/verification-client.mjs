import { dirname } from "node:path";
import { CimiLoopKernel } from "../../packages/kernel/dist/index.js";
import { SqliteProjectStore } from "../../packages/store-sqlite/dist/index.js";
import { LocalEvidenceVerifier } from "../../apps/cli/dist/evidence-local.js";

const store = new SqliteProjectStore(process.argv[2]);
process.on("message", ({ command, caller, now }) => {
  try {
    const project = store.getProject();
    const evidenceVerifier = new LocalEvidenceVerifier(project.repository_path, dirname(process.argv[2]));
    const result = new CimiLoopKernel({ store, caller, now: () => now, evidenceVerifier }).execute(command);
    process.send({ result }, () => { store.close(); process.exit(0); });
  } catch (error) { store.close(); process.send({ error: String(error) }, () => process.exit(1)); }
});
process.send({ ready: true });

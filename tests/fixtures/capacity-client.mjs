import { SqliteProjectStore } from "../../packages/store-sqlite/dist/index.js";
import { checkWipCapacity } from "../../packages/kernel/dist/flow.js";
const store = new SqliteProjectStore(process.argv[2]);
process.on("message", ({ changeId, correlationId }) => {
  try {
    const result = store.transaction(tx => {
      const project = tx.getCurrentProject(), settings = tx.getSettingsVersion(project.settings_ref.id);
      const change = tx.getChange(changeId);
      const error = checkWipCapacity(tx, project.id, settings.settings.wip_limit, correlationId);
      if (error) return error;
      tx.updateChange({ ...change, lifecycle_state: "Executing", revision: change.revision + 1 }, change.revision);
      return { fixture_capacity_reserved: true, change_id: change.id };
    });
    process.send({ result }, () => { store.close(); process.exit(0); });
  } catch (error) { store.close(); process.send({ error: String(error) }, () => process.exit(1)); }
});
process.send({ ready: true });

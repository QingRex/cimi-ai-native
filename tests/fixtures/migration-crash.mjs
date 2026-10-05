import { MigrationRunner } from "../../packages/store-sqlite/dist/index.js";

const [databasePath, actorId, exitStage] = process.argv.slice(2);
await new MigrationRunner(databasePath).apply({ actorId, onStage(stage) {
  if (stage === exitStage) process.exit(86); // Abrupt exit: no catch, rollback or finally executes.
} });

import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { protocolSchemas } from "./schemas.js";
import { protocolSchemas as v2Schemas } from "./v2/index.js";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const outputDirectory = resolve(currentDirectory, "..", "schemas");
mkdirSync(outputDirectory, { recursive: true });

for (const [version, directory, schemas] of [
  ["v1", outputDirectory, protocolSchemas],
  ["v2", join(outputDirectory, "v2"), v2Schemas]
] as const) {
  mkdirSync(directory, { recursive: true });
  for (const [name, schema] of Object.entries(schemas)) {
    const document = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: `${name}.${version}`,
      ...schema
    };
    writeFileSync(join(directory, `${name}.schema.json`), `${JSON.stringify(document, null, 2)}\n`, "utf8");
  }
}

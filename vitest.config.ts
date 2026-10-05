import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/test/**/*.test.ts", "apps/**/test/**/*.test.ts", "tests/**/*.test.ts"],
    // SQLite/Git fixtures and strict Ajv compilation compete for CPU and memory.
    // Bound file workers; explicit forked CAS tests retain real concurrency.
    maxWorkers: 2,
    testTimeout: 15_000,
    coverage: {
      reporter: ["text", "html"]
    }
  }
});

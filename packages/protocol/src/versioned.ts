import { type Static, type TSchema } from "typebox";
import { compileValidator } from "./validation.js";
import * as v1 from "./v1/index.js";
import * as v2 from "./v2/index.js";

export const CURRENT_SCHEMA_VERSION = v2.SCHEMA_VERSION;
export const SUPPORTED_SCHEMA_VERSIONS = [v1.SCHEMA_VERSION, v2.SCHEMA_VERSION] as const;

export class UnsupportedSchemaVersionError extends Error {
  readonly code = "UNSUPPORTED_SCHEMA_VERSION";
  constructor(readonly schemaVersion: unknown) {
    super("Unsupported or missing CimiLoop schema_version");
    this.name = "UnsupportedSchemaVersionError";
  }
}
export class UnsupportedObjectTypeError extends Error {
  readonly code = "UNSUPPORTED_OBJECT_TYPE";
  constructor(readonly objectType: string, readonly schemaVersion: string) {
    super(`No record schema registered for ${objectType} in protocol ${schemaVersion}`);
    this.name = "UnsupportedObjectTypeError";
  }
}

const schemaVersion = (input: unknown, allowUnversionedLegacy = false) => {
  const version = typeof input === "object" && input !== null && Object.hasOwn(input, "schema_version")
    ? (input as { schema_version: unknown }).schema_version
    : undefined;
  if (allowUnversionedLegacy && version === undefined) return v1.SCHEMA_VERSION;
  if (version !== v1.SCHEMA_VERSION && version !== v2.SCHEMA_VERSION) {
    throw new UnsupportedSchemaVersionError(version);
  }
  return version;
};

// Validation preserves the original payload; it neither migrates nor re-executes it.
export const parseVersionedCommand = (input: unknown): v1.AnyCommand | v2.AnyCommand =>
  schemaVersion(input) === v1.SCHEMA_VERSION ? v1.parseCommand(input) : v2.parseCommand(input);

// M0 success/error results have no version field. Only their exact frozen schemas accept that form.
export const parseVersionedCommandResult = (input: unknown): v1.CommandResult | v2.CommandResult =>
  schemaVersion(input, true) === v1.SCHEMA_VERSION ? v1.parseCommandResult(input) : v2.parseCommandResult(input);
export const parseVersionedErrorResult = (input: unknown): v1.ErrorResult | v2.ErrorResult =>
  schemaVersion(input, true) === v1.SCHEMA_VERSION ? v1.parseErrorResult(input) : v2.parseErrorResult(input);
export const parseVersionedChangeListResult = (input: unknown): v1.ChangeListResult | v2.ChangeListResult =>
  schemaVersion(input, true) === v1.SCHEMA_VERSION ? v1.parseChangeListResult(input) : v2.parseChangeListResult(input);
export const parseVersionedChangeShowResult = (input: unknown): v1.ChangeShowResult | v2.ChangeShowResult =>
  schemaVersion(input, true) === v1.SCHEMA_VERSION ? v1.parseChangeShowResult(input) : v2.parseChangeShowResult(input);

const legacyRecordSchemas = {
  project: v1.ProjectSchema, actor: v1.ActorSchema, role: v1.RoleSchema,
  assignment: v1.AssignmentSchema, change: v1.ChangeSchema,
  transition_record: v1.TransitionRecordSchema, event: v1.EventEnvelopeSchema
} as const;
type LegacyRecord = Static<(typeof legacyRecordSchemas)[keyof typeof legacyRecordSchemas]>;
type CurrentRecord = Static<(typeof v2.recordSchemas)[keyof typeof v2.recordSchemas]>;
export type VersionedRecord = LegacyRecord | CurrentRecord;

const recordReaders = (schemas: Readonly<Record<string, TSchema>>) => {
  const readers = new Map<string, (input: unknown) => VersionedRecord>();
  for (const [objectType, schema] of Object.entries(schemas)) {
    readers.set(objectType, compileValidator<VersionedRecord>(schema));
  }
  return readers;
};
const legacyReaders = recordReaders(legacyRecordSchemas);
const currentReaders = recordReaders(v2.recordSchemas);
// Reuse the same complete strict event branch parser as native writes.
currentReaders.set("event", v2.parseEvent);

export const parseVersionedRecord = (objectType: string, input: unknown): VersionedRecord => {
  const version = schemaVersion(input);
  const reader = (version === v1.SCHEMA_VERSION ? legacyReaders : currentReaders).get(objectType);
  if (!reader) throw new UnsupportedObjectTypeError(objectType, version);
  return reader(input);
};

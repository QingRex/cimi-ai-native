import { Ajv2020, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import type { TSchema } from "typebox";
import {
  AnyCommandSchema,
  ChangeListResultSchema,
  ChangeShowResultSchema,
  CommandResultSchema,
  DoctorResultSchema,
  ErrorResultSchema,
  type AnyCommand,
  type ChangeListResult,
  type ChangeShowResult,
  type CommandResult,
  type DoctorResult,
  type ErrorResult
} from "./schemas.js";

export class ProtocolValidationError extends Error {
  readonly errors: ErrorObject[];

  constructor(errors: ErrorObject[]) {
    super("Protocol validation failed");
    this.name = "ProtocolValidationError";
    this.errors = errors;
  }
}

const validatorCache = new WeakMap<object, (value: unknown) => unknown>();
let sharedAjv: Ajv2020 | undefined;
export const compileValidator = <T>(schema: TSchema): ((value: unknown) => T) => {
  const cached = validatorCache.get(schema);
  if (cached) return cached as (value: unknown) => T;
  let validate: ValidateFunction<T> | undefined;
  // Compile only the schemas actually used by this process and reuse them by identity.
  // Growing command/event unions must not rebuild every validator on CLI startup or each success.
  const parser = (value: unknown): T => {
    sharedAjv ??= new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: false, inlineRefs: false });
    validate ??= sharedAjv.compile(schema as object) as ValidateFunction<T>;
    if (!validate(value)) {
      throw new ProtocolValidationError(validate.errors ? [...validate.errors] : []);
    }
    return value as T;
  };
  validatorCache.set(schema, parser);
  return parser;
};

// Select a literal-discriminated branch before compiling. Each selected branch still
// validates the complete strict schema; unknown discriminators use the full union.
export const compileDiscriminatedValidator = <T>(schema: TSchema, field: string): ((value: unknown) => T) => {
  const branches = new Map<string, (value: unknown) => T>();
  for (const branch of (schema as TSchema & { anyOf?: TSchema[] }).anyOf ?? []) {
    const literal = (branch as TSchema & { properties?: Record<string, { const?: unknown }> }).properties?.[field]?.const;
    if (typeof literal === "string") branches.set(literal, compileValidator<T>(branch));
  }
  const fallback = compileValidator<T>(schema);
  return value => {
    const discriminator = value && typeof value === "object" ? (value as Record<string, unknown>)[field] : undefined;
    return (typeof discriminator === "string" ? branches.get(discriminator) ?? fallback : fallback)(value);
  };
};

export const parseCommand = compileValidator<AnyCommand>(AnyCommandSchema);
export const parseCommandResult = compileValidator<CommandResult>(CommandResultSchema);
export const parseChangeListResult = compileValidator<ChangeListResult>(ChangeListResultSchema);
export const parseChangeShowResult = compileValidator<ChangeShowResult>(ChangeShowResultSchema);
export const parseDoctorResult = compileValidator<DoctorResult>(DoctorResultSchema);
export const parseErrorResult = compileValidator<ErrorResult>(ErrorResultSchema);

export const formatValidationErrors = (errors: readonly ErrorObject[]): string[] =>
  errors.map((error) => `${error.instancePath || "/"} ${error.message ?? "校验失败"}`);

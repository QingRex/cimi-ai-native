import type {
  Actor,
  Assignment,
  Change,
  CommandSuccess,
  CommandResult,
  DomainError,
  EventEnvelope,
  InternalId,
  Project,
  Role,
  TransitionRecord
} from "@cimiloop/protocol/v2";

import type * as v1 from "@cimiloop/protocol/v1";
import type { ProviderDescriptor, ProviderBinding, ProviderEvidence, ProviderEvaluation, ProjectSettingsVersion, TargetVersion, IntentRecordType, IntentRecords } from "@cimiloop/protocol/v2";
export type { OutboxMessage } from "@cimiloop/protocol/v2";
import type { OutboxMessage } from "@cimiloop/protocol/v2";
import type { ExecutionObjectType, ExecutionObjects, ExecutionRecordType, ExecutionRecords } from "@cimiloop/protocol/v2";
import type { VerificationRecordType, VerificationRecords } from "@cimiloop/protocol/v2";
import type { Run, RuntimeRecordType, RuntimeRecords } from "@cimiloop/protocol/v2";
export type HistoricalEvent = v1.EventEnvelope | EventEnvelope;
export type HistoricalTransition = v1.TransitionRecord | TransitionRecord;
export type HistoricalSuccess = v1.CommandSuccess | CommandSuccess;
type WithoutSequence<T> = T extends unknown ? Omit<T, "schema_version" | "event_sequence"> : never;
export type ProposedEvent = WithoutSequence<EventEnvelope>;
export interface CommandReceipt {
  command_id: InternalId;
  request_digest: string;
  result: HistoricalSuccess | DomainError;
  created_at: string;
}
export type NewCommandReceipt = Omit<CommandReceipt, "result"> & { result: CommandResult };
export type OutboxClaim = { attempt_count: number; lease_until: string };
export type ClaimedOutboxMessage = OutboxMessage & { status: "processing"; lease_until: string };
export interface IntentReader {
  getIntentRecord<K extends IntentRecordType>(kind: K, id: InternalId): IntentRecords[K] | undefined;
  listIntentRecords<K extends IntentRecordType>(kind: K, changeId: InternalId): IntentRecords[K][];
}
export interface ExecutionReader {
  getExecutionObject<K extends ExecutionObjectType>(kind: K, id: InternalId): ExecutionObjects[K] | undefined;
  listExecutionObjects<K extends ExecutionObjectType>(kind: K, changeId?: InternalId): ExecutionObjects[K][];
  getExecutionRecord<K extends ExecutionRecordType>(kind: K, id: InternalId): ExecutionRecords[K] | undefined;
  listExecutionRecords<K extends ExecutionRecordType>(kind: K): ExecutionRecords[K][];
}
export interface VerificationReader {
  getVerificationRecord<K extends VerificationRecordType>(kind: K, id: InternalId): VerificationRecords[K] | undefined;
  listVerificationRecords<K extends VerificationRecordType>(kind: K, changeId: InternalId): VerificationRecords[K][];
}
export interface RuntimeReader {
  getRun(id: InternalId): Run | undefined;
  listRuns(changeId: InternalId): Run[];
  getRuntimeRecord<K extends RuntimeRecordType>(kind: K, id: InternalId): RuntimeRecords[K] | undefined;
  listRuntimeRecords<K extends RuntimeRecordType>(kind: K, changeId: InternalId): RuntimeRecords[K][];
}
export interface ProviderReader {
  getProviderEvidence(id: InternalId): ProviderEvidence | undefined;
  listProviderEvidence(): ProviderEvidence[];
  getProviderEvaluation(id: InternalId): ProviderEvaluation | undefined;
  listProviderEvaluations(): ProviderEvaluation[];
  getProviderDescriptor(id: InternalId): ProviderDescriptor | undefined;
  listProviderDescriptors(): ProviderDescriptor[];
  getProviderBinding(id: InternalId): ProviderBinding | undefined;
  listProviderBindings(): ProviderBinding[];
}
export interface PlanningReader extends IntentReader, ExecutionReader, VerificationReader, RuntimeReader, ProviderReader {
  getSettingsVersion(id: InternalId): ProjectSettingsVersion | undefined;
  getTargetVersion(id: InternalId): TargetVersion | undefined;
  listTargetVersions(): TargetVersion[];
}
export interface ProjectReader extends PlanningReader {
  getProject(): Project | undefined;
  getActor(actorId: InternalId): Actor | undefined;
  listActors(): Actor[];
  listAssignments(actorId?: InternalId): Assignment[];
  getChange(idOrKey: string): Change | undefined;
  listChanges(): Change[];
  listEvents(): HistoricalEvent[];
  listOutbox(status?: OutboxMessage["status"]): OutboxMessage[];
}
export interface StoreTransaction extends PlanningReader {
  insertProviderEvidence(value: ProviderEvidence): void;
  insertProviderEvaluation(value: ProviderEvaluation): void;
  insertRun(value: Run): void;
  updateRun(value: Run, expectedRevision: number): void;
  insertRuntimeRecord<K extends RuntimeRecordType>(kind: K, value: RuntimeRecords[K]): void;
  insertVerificationRecord<K extends VerificationRecordType>(kind: K, value: VerificationRecords[K]): void;
  insertExecutionObject<K extends ExecutionObjectType>(kind: K, value: ExecutionObjects[K]): void;
  updateExecutionObject<K extends ExecutionObjectType>(kind: K, value: ExecutionObjects[K], expectedRevision: number): void;
  insertExecutionRecord<K extends ExecutionRecordType>(kind: K, value: ExecutionRecords[K]): void;
  insertIntentRecord<K extends IntentRecordType>(kind: K, record: IntentRecords[K]): void;
  getCommandReceipt(commandId: InternalId): CommandReceipt | undefined;
  saveCommandReceipt(receipt: NewCommandReceipt): void;

  getCurrentProject(): Project | undefined;
  getProject(projectId: InternalId): Project | undefined;
  insertProject(project: Project): void;
  updateProject(project: Project, expectedRevision: number): void;
  getActor(actorId: InternalId): Actor | undefined;
  listActors(): Actor[];
  listAssignments(actorId?: InternalId): Assignment[];
  getAssignment(id: InternalId): Assignment | undefined;
  insertActor(actor: Actor): void;
  insertRole(role: Role): void;
  insertAssignment(assignment: Assignment): void;
  endAssignment(assignment: Assignment, expectedRevision: number): void;

  getChange(idOrKey: string): Change | undefined;
  listChanges(): Change[];
  insertSettingsVersion(record: ProjectSettingsVersion): void;
  insertTargetVersion(target: TargetVersion): void;
  updateTargetVersion(target: TargetVersion, expectedRevision: number): void;
  nextChangeDisplayKey(projectId: InternalId): string;
  insertChange(change: Change): void;
  updateChange(change: Change, expectedRevision: number): void;
  insertTransition(record: TransitionRecord): void;
  getProviderDescriptor(id: InternalId): ProviderDescriptor | undefined;
  insertProviderDescriptor(record: ProviderDescriptor): void;
  getProviderBinding(id: InternalId): ProviderBinding | undefined;
  insertProviderBinding(record: ProviderBinding): void;

  appendEvent(event: ProposedEvent): EventEnvelope;
  enqueueOutbox(message: OutboxMessage): void;
}

export interface ProjectStore extends PlanningReader {
  transaction<T>(work: (transaction: StoreTransaction) => T): T;
  readSnapshot<T>(work: (reader: ProjectReader) => T): { value: T; as_of_event_sequence: number };
  getProject(): Project | undefined;
  getChange(idOrKey: string): Change | undefined;
  listChanges(): Change[];
  listTransitions(): HistoricalTransition[];
  asOfEventSequence(): number;
  listEvents(): HistoricalEvent[];
  listOutbox(status?: OutboxMessage["status"]): OutboxMessage[];
  claimOutbox(now: string, leaseUntil: string): ClaimedOutboxMessage | undefined;
  markOutboxDelivered(messageId: InternalId, deliveredAt: string, claim: OutboxClaim): void;
  releaseOutbox(messageId: InternalId, availableAt: string, claim: OutboxClaim): void;
  close(): void;
}

export interface RegistryProject {
  project_id: InternalId;
  repository_path: string;
  database_path: string;
  last_opened_at: string;
}

export interface ProjectRegistry {
  register(project: RegistryProject): void;
  findByRepository(repositoryPath: string): RegistryProject | undefined;
  list(): RegistryProject[];
  close(): void;
}

export class StoreConflictError extends Error {
  constructor(
    message: string,
    readonly currentRevision?: number
  ) {
    super(message);
    this.name = "StoreConflictError";
  }
}

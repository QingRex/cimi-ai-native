import {SCHEMA_VERSION,type AnyCommand,type Change,type ContractVersion,type PlanBody,type PlanProposal,type PlanVersion,type Project} from '@cimiloop/protocol/v2';
import type {StoreTransaction} from '@cimiloop/store';
import {IntentFailure,contentDigest} from './intent.js';

export type PlanningCommand=Extract<AnyCommand,{command_type:'SubmitPlanProposal'|'ConfirmPlan'|'InitializePlanTasks'}>;
export interface PlanningClarificationBasis {
 command:PlanningCommand;project:Project;change:Change;contract:ContractVersion;body:PlanBody;
 proposal?:PlanProposal;plan?:PlanVersion;
}
// Trusted code installation, historical read only. No default Matt authority,
// model call, imported ALLOW or caller-supplied evidence. Receipts precede it.
export interface PlanningClarificationPort {verifyOriginal(basis:PlanningClarificationBasis):void}
export class MattClarificationUnavailable extends Error {}
export function verifyPlanningClarification(tx:StoreTransaction,command:PlanningCommand,project:Project,change:Change,body:PlanBody,
 port?:PlanningClarificationPort,proposal?:PlanProposal,plan?:PlanVersion){
 // Compatibility with established manual mode; strict launchers install a port.
 if(!port)return;
 const deny=(missingMatt=false):never=>{throw new IntentFailure({schema_version:SCHEMA_VERSION,correlation_id:command.correlation_id,
  code:missingMatt?'CAPABILITY_UNAVAILABLE':'EVIDENCE_MISSING',message:missingMatt?'真实 Matt 前置澄清核验尚未安装':'原 Human / Matt 前置澄清与计划基准无法核对',category:'conflict',retryable:false,details:{}});};
 const contract=change.contract_ref?tx.getIntentRecord('contract_version',change.contract_ref.id):undefined;
 if(!contract||contract.project_id!==project.id||contract.change_id!==change.id||contract.version!==change.contract_ref?.domain_version||contentDigest(contract.body).value!==contract.content_digest.value||
  contentDigest(body.contract_ref).value!==contentDigest(change.contract_ref).value)deny();
 const basis={command,project,change,contract:contract!,body,...(proposal?{proposal}:{}),...(plan?{plan}:{})};
 try {const result:unknown=port.verifyOriginal(structuredClone(basis));if(result!==undefined){
  // void callbacks can accidentally be async. Fail closed without awaiting a
  // transaction-external verdict, but consume rejection to keep private errors
  // from escaping into stderr or terminating the trusted host.
  void Promise.resolve(result).catch(()=>undefined);deny();
 }}
 catch(error){deny(error instanceof MattClarificationUnavailable);}
}

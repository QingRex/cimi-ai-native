import {isDeepStrictEqual} from 'node:util';
import {MattClarificationUnavailable,type PlanningClarificationBasis,type PlanningClarificationPort} from '@cimiloop/kernel';
import {readOriginalHumanPlanClarification,type OriginalHumanPlanClarification} from './clarification-local.js';

// Code-only historical verifier: check the actual pinned Matt method, complete
// Human transcript, approved harness, no unresolved questions and exact Plan /
// Contract contents on EVERY new command. Must not invoke a model during the
// Kernel transaction. No JSON verdict, default verifier or qualification here.
export interface MattPlanClarificationVerification {
 verifyOriginal(basis:PlanningClarificationBasis,human:OriginalHumanPlanClarification):void;
}
export interface LocalPlanningClarificationOptions {matt?:MattPlanClarificationVerification}
export class LocalPlanningClarificationAdmission implements PlanningClarificationPort {
 constructor(private readonly dataDirectory:string,private readonly options:LocalPlanningClarificationOptions){}
 verifyOriginal(basis:PlanningClarificationBasis){
  const human=readOriginalHumanPlanClarification(this.dataDirectory,basis),original=structuredClone(human);
  if(!this.options.matt||typeof this.options.matt.verifyOriginal!=='function')throw new MattClarificationUnavailable();
  const result:unknown=this.options.matt.verifyOriginal(structuredClone(basis),structuredClone(human));
  if(result!==undefined){void Promise.resolve(result).catch(()=>undefined);throw Error('Synchronous original verification required');}
  if(!isDeepStrictEqual(original,readOriginalHumanPlanClarification(this.dataDirectory,basis)))throw Error('Original pre-plan clarification changed');
 }
}

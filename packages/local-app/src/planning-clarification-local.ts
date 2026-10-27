import {isDeepStrictEqual} from 'node:util';
import {MattClarificationUnavailable,type PlanningClarificationBasis,type PlanningClarificationPort} from '@cimiloop/kernel';
import {readOriginalHumanPlanClarification,readOriginalMattPlanClarification,type OriginalHumanPlanClarification} from './clarification-local.js';
import type {MattClarificationHost,MattClarificationInput,MattClarificationOriginal} from './clarification-matt-local.js';

// Code-only historical verifier: check the actual pinned Matt method, complete
// Human transcript, approved harness, no unresolved questions and exact Plan /
// Contract contents on EVERY new command. Must not invoke a model during the
// Kernel transaction. No JSON verdict, default verifier or qualification here.
export interface MattPlanClarificationVerification {
 verifyOriginal(basis:PlanningClarificationBasis,human:OriginalHumanPlanClarification):void;
}
export interface LocalPlanningClarificationOptions {matt?:MattPlanClarificationVerification}
// Trusted original-source verification. A method execution flag, model output,
// stored ALLOW or application/HTTP JSON is not an implementation of this port.
export interface MattPlanningQualification {
 verifyOriginal(basis:PlanningClarificationBasis,input:MattClarificationInput,original:MattClarificationOriginal):void;
}
const deny=():never=>{throw Error('Original qualified Matt planning review unavailable');};
const synchronous=(value:unknown)=>{if(value!==undefined){try{void Promise.prototype.then.call(value,undefined,()=>{});}catch{/* Never execute arbitrary thenables. */}deny();}};
export class LocalMattPlanClarificationVerification implements MattPlanClarificationVerification {
 private readonly verifyMethod:MattClarificationHost['verifyOriginal'];
 private readonly verifyQualification:MattPlanningQualification['verifyOriginal'];
 constructor(private readonly dataDirectory:string,private readonly host:MattClarificationHost,private readonly qualification:MattPlanningQualification){
  this.verifyMethod=host.verifyOriginal;this.verifyQualification=qualification.verifyOriginal;
  if(typeof this.verifyMethod!=='function'||typeof this.verifyQualification!=='function')deny();
 }
 verifyOriginal(basis:PlanningClarificationBasis,human:OriginalHumanPlanClarification):void{
  const guard=()=>{if(this.host.verifyOriginal!==this.verifyMethod||this.qualification.verifyOriginal!==this.verifyQualification)deny();};guard();
  const packet=readOriginalMattPlanClarification(this.dataDirectory,basis),final=packet.methods.at(-1);
  if(!isDeepStrictEqual(packet.human,human)||!final||final.input.request.expected_head!==human.candidate.expected_head-1||
   !isDeepStrictEqual(final.input.request.review_plan,{body:basis.body,contract:basis.contract})||
   final.input.questions.some(question=>question.answer===undefined)||final.original.output.questions.length||final.original.output.unresolved.length)deny();
  for(const method of packet.methods){
   if(method.original.origin!=='external_model')deny();guard();
   synchronous(this.verifyQualification.call(this.qualification,structuredClone(basis),structuredClone(method.input),structuredClone(method.original)));guard();
   synchronous(this.verifyMethod.call(this.host,structuredClone(method.input),structuredClone(method.original)));guard();
  }
  if(!isDeepStrictEqual(packet,readOriginalMattPlanClarification(this.dataDirectory,basis)))deny();guard();
 }
}
export class LocalPlanningClarificationAdmission implements PlanningClarificationPort {
 private scoped:MattPlanClarificationVerification|undefined;
 constructor(private readonly dataDirectory:string,private readonly options:LocalPlanningClarificationOptions){}
 get needsInstalledMatt(){return !this.options.matt&&!this.scoped;}
 withOriginalVerifier<T>(verifier:MattPlanClarificationVerification,run:()=>T):T{
  if(this.scoped||typeof verifier?.verifyOriginal!=='function')deny();
  this.scoped=verifier;
  try{const result=run();if(result instanceof Promise){void Promise.prototype.then.call(result,undefined,()=>{});deny();}return result;}
  finally{this.scoped=undefined;}
 }
 verifyOriginal(basis:PlanningClarificationBasis){
  const human=readOriginalHumanPlanClarification(this.dataDirectory,basis),original=structuredClone(human);
  const matt=this.options.matt??this.scoped;
  if(!matt||typeof matt.verifyOriginal!=='function')throw new MattClarificationUnavailable();
  const result:unknown=matt.verifyOriginal(structuredClone(basis),structuredClone(human));
  if(result!==undefined){void Promise.resolve(result).catch(()=>undefined);throw Error('Synchronous original verification required');}
  if(!isDeepStrictEqual(original,readOriginalHumanPlanClarification(this.dataDirectory,basis)))throw Error('Original pre-plan clarification changed');
 }
}

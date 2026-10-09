import type {WorkspaceCheckRecipe} from "./workspace-checks.js";
import type {readWorkspaceFileRunOriginals} from "./workspace-tool-host.js";
import {digest,RuntimeAdapterError} from "./files.js";
type Calls=ReturnType<typeof readWorkspaceFileRunOriginals>["calls"];
// Receives independently verified original Native records, never model claims.
// A conservative unique digest chain avoids inventing order from SDK IDs.
export function resolveWorkspaceCheckSourceBasis(recipe:WorkspaceCheckRecipe,calls:Calls) {
 const deny=():never=>{throw new RuntimeAdapterError("workspace_check_source_unproven");};
 const ids=new Set<string>(),original_file_calls:{call_id:string;receipt_digest:string}[]=[];
 for(const call of calls) {
  if(ids.has(call.input.call_id))deny();ids.add(call.input.call_id);
  if(["reserved","executing","unknown"].includes(call.state))deny();
 }
 const sources=recipe.inputs.map(source=>{
  const writes=calls.filter(call=>call.input.tool==="replace_file"&&call.input.path.toUpperCase()===source.path.toUpperCase()&&call.state!=="not_started");
  if(writes.length&&!recipe.editable_inputs?.includes(source.path))deny();
  for(const call of writes) {
   if(!call.receipt||call.state!=="completed"||call.receipt.call_id!==call.input.call_id||call.receipt.native.before_digest!==call.input.expected_digest)deny();
   original_file_calls.push({call_id:call.input.call_id,receipt_digest:digest(JSON.stringify(call.receipt)).value});
  }
  let current=source.expected_digest;
  const remaining=[...writes],visited=new Set([current]);
  while(remaining.length) {
   const next=remaining.filter(call=>call.input.expected_digest===current);
   if(next.length!==1)deny();
   const call=next[0]!,after=call.receipt!.native.after_digest;
   if(!/^[a-f0-9]{64}$/.test(after)||visited.has(after))deny();
   visited.add(after);current=after;remaining.splice(remaining.indexOf(call),1);
  }
  return {path:source.path,digest:current};
 });
 original_file_calls.sort((a,b)=>a.call_id<b.call_id?-1:a.call_id>b.call_id?1:0);
 return {sources,original_file_calls};
}
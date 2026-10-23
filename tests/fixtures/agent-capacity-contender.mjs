import { AgentStartLedger } from '../../packages/runtime-adapter/dist/agent-start-ledger.js';
const [root,hostJson,policyJson,id]=process.argv.slice(2),ledger=AgentStartLedger.open(root,JSON.parse(hostJson));
process.once('message',()=>{try{const result=ledger.reserveCapacity(JSON.parse(policyJson),id,{model_calls:1,output_tokens:2048},{request:id});process.send({created:result.created});}catch(error){process.send({error:error.message});}finally{ledger.close();process.disconnect();}});
process.send('ready');

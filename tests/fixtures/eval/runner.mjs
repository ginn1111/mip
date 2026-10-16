// Fixture runner: canned outputs, one task crashes. Not an agent.
export default async ({task})=>{
 if(task.id==='T03')throw new Error('fixture crash');
 return {text:'rotate over 2 seconds, ease-in-out; magnetic focal pull then reveal',
  glossary:[{phrase:'magnetic',classification:'ambiguous'},{phrase:'ease-in-out',classification:'resolved'}],
  ambiguities:['magnetic'],gateViolations:task.id==='T05'?['NOT_LOCKED']:[],revisions:1,
  tokens:100,costUsd:0.01,abandonedAttempts:0};
};

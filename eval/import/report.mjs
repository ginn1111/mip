// AGE-40 B3: render docs/reports/AGE-40.md from evaluate() results. Prints only measured values; absent data prints MISSING.
const fmt=(m,pick)=>m?pick(m):'not measured';
const pct=r=>r===null?'n/a':`${(r*100).toFixed(1)}%`;
const HEAD='| Reference | Kind | Pipeline | Concept coverage | Timing fidelity | Missed transitions | Ambiguities raised | Human time |\n| --- | --- | --- | --- | --- | --- | --- | --- |';
const CAVEATS=`- Small sample: few references and participants; no statistical power is claimed.
- Participants must be comparable across arms (skill, familiarity); assignment is an open decision.
- Same model, environment and task framing for both arms; order effects (learning from the first arm) are not controlled here.
- Ground truth is human-authored; metrics measure fidelity to it, not design quality.
- Human time is timed by the human; code never starts, stops or approves a session.
- AGE-39 alignment decisions are human review acts in the web reviewer and have no machine output to read here, so no alignment-based metric is reported.
- A hypothesis is not a result: unmeasured targets stay hypotheses.`;

export function renderReport(results,{toleranceMs=100}={}){
 const row=r=>[r.reference.id,r.reference.kind,r.arm==='manual'?'n/a (manual briefing)':r.failed?`FAILED at ${r.failedStage}: ${r.error}`:'ok',
  fmt(r.concepts,c=>`${c.found}/${c.total} (${pct(c.ratio)})`),
  fmt(r.timing,t=>`${t.withinTolerance}/${t.total} within ${toleranceMs} ms (${pct(t.ratio)})`),
  fmt(r.transitions,t=>`${t.missed}/${t.total}`),
  r.ambiguities===null?'not measured':String(r.ambiguities),
  r.humanMs===null?'MISSING':`${r.humanMs} ms`];
 const byArm=a=>results.filter(r=>r.arm===a);
 const section=a=>`## Arm: ${a}\n\n${HEAD}\n${byArm(a).map(r=>`| ${row(r).join(' | ')} |`).join('\n')}\n`;
 const pairs=[...new Set(results.map(r=>r.reference.id))].map(id=>[id,byArm('manual').find(r=>r.reference.id===id),byArm('import').find(r=>r.reference.id===id)])
  .filter(([,m,i])=>m?.humanMs!=null&&i?.humanMs!=null);
 const absent=['manual','import'].filter(a=>!byArm(a).length);
 const comparison=pairs.length?pairs.map(([id,m,i])=>`- ${id}: manual ${m.humanMs} ms, import ${i.humanMs} ms`).join('\n')
  :`No comparison: ${absent.length?absent.map(a=>`${a} arm missing`).join(', '):'no reference has human time for both arms'}.`;
 const missing=results.length?results.flatMap(r=>r.missing.map(m=>`- ${r.reference.id} (${r.arm}): ${m} not provided`))
  :['- all references: none supplied (video, local site, storyboard); no human sessions']; // ponytail: no real references given to this card; table stays empty until the human supplies them.
 return `---
status: draft
scope: eval/import, docs/reports
owner: ginb
---

# Report — AGE-40 import pipeline evaluation

Manual briefing versus reference-first import. Only measured values appear; everything else is marked not measured or MISSING.

${section('manual')}
${section('import')}
## Comparison

${comparison}

## Missing inputs

${missing.length?missing.join('\n'):'- none'}

Human participants and their sessions must come from the human (open decision, owner: user). No effort comparison versus manual briefing is claimed without them.

## RFC 0006 caveats

${CAVEATS}
`;
}

// AGE-40 B3: render docs/reports/AGE-40.md from evaluate() results. Prints only measured values; absent data prints MISSING.
const fmt=(m,pick)=>m?pick(m):'not measured';
const pct=r=>r===null?'n/a':`${(r*100).toFixed(1)}%`;

export function renderReport(results,{toleranceMs=100}={}){
 const rows=results.map(r=>[r.reference.id,r.reference.kind,r.failed?`FAILED at ${r.failedStage}: ${r.error}`:'ok',
  fmt(r.concepts,c=>`${c.found}/${c.total} (${pct(c.ratio)})`),
  fmt(r.timing,t=>`${t.withinTolerance}/${t.total} within ${toleranceMs} ms (${pct(t.ratio)})`),
  fmt(r.transitions,t=>`${t.missed}/${t.total}`),
  r.ambiguities===null?'not measured':String(r.ambiguities),
  r.humanMs===null?'MISSING':`${r.humanMs} ms`]);
 const missing=results.length?results.flatMap(r=>r.missing.map(m=>`- ${r.reference.id}: ${m} not provided`))
  :['- all references: none supplied (video, local site, storyboard); no human sessions']; // ponytail: no real references given to this card; table stays empty until the human supplies them.
 return `---
status: draft
scope: eval/import, docs/reports
owner: ginb
---

# Report — AGE-40 import pipeline evaluation

Manual briefing versus reference-first import. Only measured values appear; everything else is marked not measured or MISSING.

| Reference | Kind | Pipeline | Concept coverage | Timing fidelity | Missed transitions | Ambiguities raised | Human time |
| --- | --- | --- | --- | --- | --- | --- | --- |
${rows.map(r=>`| ${r.join(' | ')} |`).join('\n')}

## Missing inputs

${missing.length?missing.join('\n'):'- none'}

Human participants and their sessions must come from the human (open decision, owner: user). No effort comparison versus manual briefing is claimed without them.
`;
}

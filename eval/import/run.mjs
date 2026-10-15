// Usage: node eval/import/run.mjs <config.json> > docs/reports/AGE-40.md
// config: {toleranceMs?, references:[{id,kind,input,projectId,truth?,session?}]}. kind video|storyboard runs AGE-35 extract; then AGE-38 drafts.
import {readFileSync} from 'node:fs';
import {parseStrictJson} from '../../packages/artifacts/index.mjs';
import {extractEvidence} from '../../packages/extract-video/index.mjs';
import {buildDrafts} from '../../packages/draft-artifacts/index.mjs';
import {stage,evaluate} from './metrics.mjs';
import {renderReport} from './report.mjs';

const cfg=parseStrictJson(readFileSync(process.argv[2],'utf8'));
const results=[];
for(const r of cfg.references){
 const extract=await stage(()=>extractEvidence(r.input));
 const draft=extract.ok?await stage(()=>buildDrafts(extract.value.pack,{projectId:r.projectId})):{ok:false,error:'skipped: extract failed'};
 results.push(evaluate({reference:{id:r.id,kind:r.kind},stages:{extract,draft},truth:r.truth,session:r.session,toleranceMs:cfg.toleranceMs}));
}
process.stdout.write(renderReport(results,{toleranceMs:cfg.toleranceMs}));

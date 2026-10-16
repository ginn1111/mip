// Usage: node eval/import/run.mjs <config.json> > docs/reports/AGE-40.md
// config: {toleranceMs?, allowlistFile?, references:[{id,kind,input,projectId,truth?,sessions?:[{arm:'manual'|'import',humanMs}]}]}.
// kind site runs AGE-36 captureWeb (input = scenario object or file); video|storyboard run AGE-35 extract; then AGE-38 drafts.
import {readFileSync} from 'node:fs';
import {loadConfig,runAll} from './pipeline.mjs';
import {renderReport} from './report.mjs';

const cfg=loadConfig(readFileSync(process.argv[2],'utf8'));
process.stdout.write(renderReport(await runAll(cfg),{toleranceMs:cfg.toleranceMs}));

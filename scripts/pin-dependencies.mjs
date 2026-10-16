import {readFile,writeFile} from 'node:fs/promises';
const pkg=JSON.parse(await readFile('package.json','utf8')),lock=JSON.parse(await readFile('package-lock.json','utf8'));
for(const group of ['dependencies','devDependencies'])for(const name of Object.keys(pkg[group]||{})){const installed=lock.packages[`node_modules/${name}`]?.version;if(!installed)throw new Error(`Missing lock version for ${name}`);pkg[group][name]=installed;lock.packages[''][group][name]=installed;}
pkg.scripts['db:migrate']='node --env-file-if-exists=.env.local --import tsx scripts/migrate.ts';
pkg.scripts['audit:a11y']='node scripts/a11y-scan.mjs';
await writeFile('package.json',JSON.stringify(pkg,null,2)+'\n');await writeFile('package-lock.json',JSON.stringify(lock,null,2)+'\n');

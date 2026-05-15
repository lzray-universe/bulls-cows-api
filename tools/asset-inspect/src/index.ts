import {readFileSync,statSync} from "node:fs";
import {join} from "node:path";

const root=process.argv[2]||"apps/worker/public/assets/bc/v1";
const mf=JSON.parse(readFileSync(join(root,"manifest.json"),"utf8"));
console.log(`format=${mf.format} version=${mf.version}`);
for (const [k,v] of Object.entries<Record<string,unknown>>(mf.ns)) {
	console.log(`${k} ${JSON.stringify(v)}`);
}
for (const [k,v] of Object.entries<any>(mf.trees)) {
	let size=0;
	for (const p of v.parts) size+=statSync(p).size;
	console.log(`${k} nodes=${v.nodeCount} parts=${v.parts.length} size=${size} hash=${v.hash}`);
}

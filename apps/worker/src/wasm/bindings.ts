import type {Engine,Feedback,HistItem,N,SolveOptions,Strategy} from "../types";
import {ApiError} from "../errors";
import wasm_init,{initSync as wasm_init_sync,next_dynamic_packed as wasm_next_dynamic_packed} from "./pkg/bc_worker_wasm.js";

interface CandData {
	idx:number;
	packed:number;
	mask:number;
	text:string;
}

export interface DynamicResult {
	nextGuess:string;
	nextGuessIndex:number;
	remaining:number;
	solved:boolean;
	answer?:string;
	diagnostics:{usedFallback:boolean;maxBucket:number;candidateCount:number;engine?:Engine};
}

const cand_cache=new Map<N,CandData[]>();
const fb_count_cache=new Map<N,number>();
const fb_table_cache=new Map<N,Int16Array>();
let wasm_ready:Promise<void>|null=null;

interface WasmGlobal {
	BC_WORKER_WASM_MODULE?:BufferSource|WebAssembly.Module;
}

const strategy_ids:Record<Exclude<Strategy,"optimal">,number>={
	first_remaining:1,
	minimax_worst_bucket:2,
	expected_size:3,
	feedback_count:4
};

async function ensure_wasm() {
	wasm_ready??=(async()=>{
		try {
			const injected=(globalThis as unknown as WasmGlobal).BC_WORKER_WASM_MODULE;
			if (injected) {
				wasm_init_sync({module:injected});
			}else{
				const mod=await import("./pkg/bc_worker_wasm_bg.wasm");
				wasm_init_sync({module:mod.default});
			}
		}catch {
			await wasm_init();
		}
	})();
	await wasm_ready;
}

function wasm_error(e:unknown):ApiError {
	const msg=e instanceof Error?e.message:String(e);
	if (msg.includes("invalid n")) return new ApiError("INVALID_N",msg);
	if (msg.includes("invalid guess")) return new ApiError("INVALID_GUESS",msg);
	if (msg.includes("invalid feedback")) return new ApiError("INVALID_FEEDBACK",msg);
	if (msg.includes("inconsistent history")) return new ApiError("INCONSISTENT_HISTORY",msg);
	if (msg.includes("strategy not found")) return new ApiError("STRATEGY_NOT_FOUND",msg);
	if (msg.includes("need tree or approximation")) return new ApiError("NEED_TREE_OR_APPROX",msg);
	if (msg.includes("bad request")) return new ApiError("BAD_REQUEST",msg);
	return new ApiError("INTERNAL_ERROR",msg,500);
}

export function pack(s:string):number {
	let x=0;
	for (let i=0;i<s.length;i++) x|=(s.charCodeAt(i)-48)<<(i*4);
	return x>>>0;
}

function mask_packed(n:N,x:number):number {
	let m=0;
	for (let i=0;i<n;i++) m|=1<<((x>>>(i*4))&15);
	return m;
}

export function unpack(n:N,x:number):string {
	let s="";
	for (let i=0;i<n;i++) s+=String((x>>>(i*4))&15);
	return s;
}

export function enum_candidates(n:N) {
	const hit=cand_cache.get(n);
	if (hit) return hit;
	const out:CandData[]=[];
	const buf:number[]=[];
	const rec=(pos:number,used:number)=>{
		if (pos===n) {
			const text=buf.join("");
			out.push({idx:out.length,packed:pack(text),mask:used,text});
			return;
		}
		for (let d=0;d<10;d++) {
			const bit=1<<d;
			if ((used&bit)===0) {
				buf[pos]=d;
				rec(pos+1,used|bit);
			}
		}
	};
	rec(0,0);
	cand_cache.set(n,out);
	return out;
}

function calc_fb_raw(n:N,secret:number,secretMask:number,guess:number,guessMask:number):[number,number] {
	let a=0;
	for (let i=0;i<n;i++) {
		if (((secret>>>(i*4))&15)===((guess>>>(i*4))&15)) a++;
	}
	return [a,popcnt(secretMask&guessMask)-a];
}

export function calc_feedback(n:N,secret:string,guess:string):Feedback {
	const sp=pack(secret);
	const gp=pack(guess);
	const [a,b]=calc_fb_raw(n,sp,mask_packed(n,sp),gp,mask_packed(n,gp));
	return {a,b,text:`${a}A${b}B`};
}

function popcnt(x:number):number {
	let c=0;
	while (x) {
		x&=x-1;
		c++;
	}
	return c;
}

export function feedback_pairs(n:N):Feedback[] {
	const hit=fb_count_cache.get(n);
	if (hit!==undefined) {
		const ps:Feedback[]=[];
		for (let a=0;a<=n;a++) {
			for (let b=0;b<=n-a;b++) {
				if (!(a===n-1&&b===1)) ps.push({a,b,text:`${a}A${b}B`});
			}
		}
		return ps;
	}
	const ps:Feedback[]=[];
	for (let a=0;a<=n;a++) {
		for (let b=0;b<=n-a;b++) {
			if (!(a===n-1&&b===1)) ps.push({a,b,text:`${a}A${b}B`});
		}
	}
	fb_count_cache.set(n,ps.length);
	return ps;
}

function fb_table(n:N):Int16Array {
	let table=fb_table_cache.get(n);
	if (!table) {
		table=new Int16Array((n+1)*(n+1));
		table.fill(-1);
		for (const [idx,fb] of feedback_pairs(n).entries()) table[fb.a*(n+1)+fb.b]=idx;
		fb_table_cache.set(n,table);
	}
	return table;
}

export function encode_feedback(n:N,a:number,b:number):number {
	const idx=fb_table(n)[a*(n+1)+b];
	if (idx===undefined||idx<0) throw new ApiError("INVALID_FEEDBACK","invalid feedback");
	return idx;
}

export function filter_candidates(n:N,history:HistItem[]) {
	const all=enum_candidates(n);
	const hist=history.map(h=>{
		const packed=pack(h.guess);
		return {packed,mask:mask_packed(n,packed),a:h.a,b:h.b};
	});
	const rem=all.filter(c=>hist.every(h=>{
		const [a,b]=calc_fb_raw(n,c.packed,c.mask,h.packed,h.mask);
		return a===h.a&&b===h.b;
	}));
	if (rem.length===0) throw new ApiError("INCONSISTENT_HISTORY","history has no possible secret");
	return {all,rem};
}

export function next_dynamic(n:N,strategy:Strategy,history:HistItem[],options:SolveOptions={}):DynamicResult {
	const {all,rem}=filter_candidates(n,history);
	if (rem.length===1) {
		const idx=all.findIndex(c=>c.text===rem[0]!.text);
		return {
			nextGuess:rem[0]!.text,
			nextGuessIndex:idx,
			remaining:1,
			solved:true,
			answer:rem[0]!.text,
			diagnostics:{usedFallback:false,maxBucket:1,candidateCount:all.length}
		};
	}
	if (strategy==="first_remaining") {
		const idx=all.findIndex(c=>c.text===rem[0]!.text);
		return {
			nextGuess:rem[0]!.text,
			nextGuessIndex:idx,
			remaining:rem.length,
			solved:false,
			diagnostics:{usedFallback:false,maxBucket:0,candidateCount:all.length}
		};
	}
	const threshold=options.exactThreshold??3000;
	if (rem.length>threshold) {
		if (!options.allowFallback) throw new ApiError("NEED_TREE_OR_APPROX","exact minimax exceeds threshold");
		const idx=all.findIndex(c=>c.text===rem[0]!.text);
		return {
			nextGuess:rem[0]!.text,
			nextGuessIndex:idx,
			remaining:rem.length,
			solved:false,
			diagnostics:{usedFallback:true,maxBucket:0,candidateCount:all.length}
		};
	}
	const r=fb_count_cache.get(n)??feedback_pairs(n).length;
	const in_rem=new Uint8Array(all.length);
	for (const c of rem) in_rem[c.idx]=1;
	const codeTable=fb_table(n);
	const buckets=new Uint32Array(r);
	let bestIdx=-1,bestMax=Number.MAX_SAFE_INTEGER,bestSq=Number.MAX_SAFE_INTEGER,bestParts=-1,bestIn=false;
	for (let i=0;i<all.length;i++) {
		const g=all[i]!;
		buckets.fill(0);
		for (const s of rem) {
			const [a,b]=calc_fb_raw(n,s.packed,s.mask,g.packed,g.mask);
			const code=codeTable[a*(n+1)+b]!;
			buckets[code]=(buckets[code]??0)+1;
		}
		let max=0,sq=0,parts=0;
		for (let j=0;j<r;j++) {
			const x=buckets[j]!;
			if (x>max) max=x;
			if (x>0) parts++;
			sq+=x*x;
		}
		const isin=in_rem[i]===1;
		let better=false;
		if (strategy==="minimax_worst_bucket") {
			better=max<bestMax||
				(max===bestMax&&isin&&!bestIn)||
				(max===bestMax&&isin===bestIn&&sq<bestSq)||
				(max===bestMax&&isin===bestIn&&sq===bestSq&&i<bestIdx);
		}else if (strategy==="expected_size") {
			better=sq<bestSq||
				(sq===bestSq&&isin&&!bestIn)||
				(sq===bestSq&&isin===bestIn&&max<bestMax)||
				(sq===bestSq&&isin===bestIn&&max===bestMax&&i<bestIdx);
		}else if (strategy==="feedback_count") {
			better=parts>bestParts||
				(parts===bestParts&&isin&&!bestIn)||
				(parts===bestParts&&isin===bestIn&&max<bestMax)||
				(parts===bestParts&&isin===bestIn&&max===bestMax&&sq<bestSq)||
				(parts===bestParts&&isin===bestIn&&max===bestMax&&sq===bestSq&&i<bestIdx);
		}else{
			throw new ApiError("STRATEGY_NOT_FOUND","strategy is not available in dynamic mode");
		}
		if (better) {
			bestIdx=i;
			bestMax=max;
			bestSq=sq;
			bestParts=parts;
			bestIn=isin;
		}
	}
	return {
		nextGuess:all[bestIdx]!.text,
		nextGuessIndex:bestIdx,
		remaining:rem.length,
		solved:false,
		diagnostics:{usedFallback:false,maxBucket:bestMax,candidateCount:all.length}
	};
}

export async function next_dynamic_engine(n:N,strategy:Exclude<Strategy,"optimal">,history:HistItem[],options:SolveOptions={},engine:Engine="js"):Promise<DynamicResult> {
	if (engine==="js") return next_dynamic(n,strategy,history,options);
	await ensure_wasm();
	const guesses=new Uint32Array(history.length);
	const as=new Uint8Array(history.length);
	const bs=new Uint8Array(history.length);
	for (let i=0;i<history.length;i++) {
		const h=history[i]!;
		guesses[i]=pack(h.guess);
		as[i]=h.a;
		bs[i]=h.b;
	}
	try {
		const text=wasm_next_dynamic_packed(
			n,
			strategy_ids[strategy],
			guesses,
			as,
			bs,
			Number(options.exactThreshold??3000),
			options.allowFallback===true
		);
		return JSON.parse(text) as DynamicResult;
	}catch(e) {
		throw wasm_error(e);
	}
}

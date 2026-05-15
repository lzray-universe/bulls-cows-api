import type {Feedback,HistItem,N,SolveOptions,Strategy} from "../types";
import {ApiError} from "../errors";

export function pack(s:string):number {
	let x=0;
	for (let i=0;i<s.length;i++) x|=(s.charCodeAt(i)-48)<<(i*4);
	return x>>>0;
}

export function unpack(n:N,x:number):string {
	let s="";
	for (let i=0;i<n;i++) s+=String((x>>>(i*4))&15);
	return s;
}

export function enum_candidates(n:N) {
	const out:{packed:number;text:string}[]=[];
	const buf:number[]=[];
	const rec=(pos:number,used:number)=>{
		if (pos===n) {
			const text=buf.join("");
			out.push({packed:pack(text),text});
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
	return out;
}

export function calc_feedback(n:N,secret:string,guess:string):Feedback {
	let a=0,sm=0,gm=0;
	for (let i=0;i<n;i++) {
		const sd=secret.charCodeAt(i)-48;
		const gd=guess.charCodeAt(i)-48;
		if (sd===gd) a++;
		sm|=1<<sd;
		gm|=1<<gd;
	}
	const b=popcnt(sm&gm)-a;
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
	const ps:Feedback[]=[];
	for (let a=0;a<=n;a++) {
		for (let b=0;b<=n-a;b++) {
			if (!(a===n-1&&b===1)) ps.push({a,b,text:`${a}A${b}B`});
		}
	}
	return ps;
}

export function encode_feedback(n:N,a:number,b:number):number {
	const ps=feedback_pairs(n);
	const idx=ps.findIndex(p=>p.a===a&&p.b===b);
	if (idx<0) throw new ApiError("INVALID_FEEDBACK","invalid feedback");
	return idx;
}

export function filter_candidates(n:N,history:HistItem[]) {
	const all=enum_candidates(n);
	const rem=all.filter(c=>history.every(h=>{
		const fb=calc_feedback(n,c.text,h.guess);
		return fb.a===h.a&&fb.b===h.b;
	}));
	if (rem.length===0) throw new ApiError("INCONSISTENT_HISTORY","history has no possible secret");
	return {all,rem};
}

export function next_dynamic(n:N,strategy:Strategy,history:HistItem[],options:SolveOptions={}) {
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
	const r=feedback_pairs(n).length;
	const in_rem=new Set(rem.map(c=>c.text));
	let bestIdx=-1,bestMax=Number.MAX_SAFE_INTEGER,bestSq=Number.MAX_SAFE_INTEGER,bestIn=false;
	for (let i=0;i<all.length;i++) {
		const g=all[i]!;
		const buckets=new Array<number>(r).fill(0);
		for (const s of rem) {
			const fb=calc_feedback(n,s.text,g.text);
			const code=encode_feedback(n,fb.a,fb.b);
			buckets[code]=(buckets[code]??0)+1;
		}
		const max=Math.max(...buckets);
		const sq=buckets.reduce((acc,x)=>acc+x*x,0);
		const isin=in_rem.has(g.text);
		const better=max<bestMax||
			(max===bestMax&&isin&&!bestIn)||
			(max===bestMax&&isin===bestIn&&sq<bestSq)||
			(max===bestMax&&isin===bestIn&&sq===bestSq&&i<bestIdx);
		if (better) {
			bestIdx=i;
			bestMax=max;
			bestSq=sq;
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

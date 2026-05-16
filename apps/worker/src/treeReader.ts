import type {Env,HistItem,N,Strategy} from "./types";
import {ApiError} from "./errors";
import {fetch_asset,load_manifest} from "./assetStore";
import {enum_candidates,filter_candidates} from "./wasm/bindings";

const U32_MAX=0xffffffff;

interface TreeHeader {
	n:N;
	strategyId:number;
	nodeCount:number;
	candidateCount:number;
	feedbackCount:number;
	childBase:number;
	nodeBase:number;
}

function read_header(buf:ArrayBuffer):TreeHeader {
	const dv=new DataView(buf);
	const magic=String.fromCharCode(...new Uint8Array(buf,0,4));
	if (magic!=="BCST") throw new ApiError("TREE_NOT_FOUND","bad tree magic");
	const ver=dv.getUint16(4,true);
	if (ver!==1) throw new ApiError("TREE_NOT_FOUND","unsupported tree version");
	return {
		n:dv.getUint8(6) as N,
		strategyId:dv.getUint16(8,true),
		nodeCount:dv.getUint32(10,true),
		candidateCount:dv.getUint32(14,true),
		feedbackCount:dv.getUint8(18),
		childBase:64,
		nodeBase:64
	};
}

function sid(strategy:Strategy):number {
	if (strategy==="first_remaining") return 1;
	if (strategy==="minimax_worst_bucket") return 2;
	if (strategy==="expected_size") return 3;
	if (strategy==="feedback_count") return 4;
	return 100;
}

async function read_tree(env:Env,n:N,strategy:Strategy):Promise<{buf:ArrayBuffer;hdr:TreeHeader}> {
	const mf=await load_manifest(env);
	const k=`n${n}:${strategy}`;
	const ent=mf.trees[k];
	if (!ent||ent.parts.length===0) throw new ApiError("TREE_NOT_FOUND",`tree asset not found: ${k}`,404);
	const parts=[];
	let len=0;
	for (const p of ent.parts) {
		const b=await fetch_asset(env,p);
		parts.push(new Uint8Array(b));
		len+=b.byteLength;
	}
	const all=new Uint8Array(len);
	let pos=0;
	for (const p of parts) {
		all.set(p,pos);
		pos+=p.byteLength;
	}
	const hdr=read_header(all.buffer);
	if (hdr.n!==n||hdr.strategyId!==sid(strategy)) throw new ApiError("TREE_NOT_FOUND","tree header mismatch");
	return {buf:all.buffer,hdr};
}

export async function solve_tree(env:Env,n:N,strategy:Strategy,history:HistItem[]) {
	const {buf,hdr}=await read_tree(env,n,strategy);
	const all=enum_candidates(n);
	const rem=filter_candidates(n,history).rem;
	if (rem.length===1) {
		return {
			nextGuess:rem[0]!.text,
			nextGuessIndex:all.findIndex(c=>c.text===rem[0]!.text),
			remaining:1,
			solved:true,
			answer:rem[0]!.text,
			diagnostics:{usedFallback:false,maxBucket:1,treeNodes:hdr.nodeCount}
		};
	}
	let node=0;
	const dv=new DataView(buf);
	const rec_size=13;
	const child_base=64+hdr.nodeCount*rec_size;
	for (const h of history) {
		const off=64+node*rec_size;
		if (dv.getUint8(off+8)===1) break;
		const guess_idx=dv.getUint32(off,true);
		const guess=all[guess_idx]?.text;
		if (guess!==h.guess) throw new ApiError("BAD_REQUEST","tree mode history must follow fixed tree guesses");
		const code=feedback_code(n,h.a,h.b);
		const child_pos=child_base+(dv.getUint32(off+4,true)+code)*4;
		const next=dv.getUint32(child_pos,true);
		if (next===U32_MAX) throw new ApiError("INCONSISTENT_HISTORY","history branch absent in tree");
		node=next;
	}
	const off=64+node*rec_size;
	const guess_idx=dv.getUint32(off,true);
	const guess=all[guess_idx]?.text;
	if (!guess) throw new ApiError("TREE_NOT_FOUND","tree guess index out of range");
	return {
		nextGuess:guess,
		nextGuessIndex:guess_idx,
		remaining:rem.length,
		solved:false,
		diagnostics:{usedFallback:false,treeNodes:hdr.nodeCount}
	};
}

function feedback_code(n:N,a:number,b:number):number {
	let idx=0;
	for (let x=0;x<=n;x++) {
		for (let y=0;y<=n-x;y++) {
			if (x===n-1&&y===1) continue;
			if (x===a&&y===b) return idx;
			idx++;
		}
	}
	throw new ApiError("INVALID_FEEDBACK","invalid feedback");
}

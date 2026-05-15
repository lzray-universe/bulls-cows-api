import type {Env,Manifest,N} from "./types";
import {ApiError} from "./errors";

const cache=new Map<string,ArrayBuffer|Manifest>();

export async function fetch_asset(env:Env,path:string):Promise<ArrayBuffer> {
	const key=`buf:${path}`;
	const hit=cache.get(key);
	if (hit instanceof ArrayBuffer) return hit;
	const url=new URL(`https://assets.local/${path.replace(/^\/+/,"")}`);
	const res=await env.ASSETS.fetch(new Request(url));
	if (!res.ok) throw new ApiError("TREE_NOT_FOUND",`asset not found: ${path}`,404);
	const buf=await res.arrayBuffer();
	cache.set(key,buf);
	return buf;
}

export async function load_manifest(env:Env):Promise<Manifest> {
	const key="manifest";
	const hit=cache.get(key);
	if (hit&&!(hit instanceof ArrayBuffer)) return hit;
	try {
		const res=await env.ASSETS.fetch(new Request("https://assets.local/assets/bc/v1/manifest.json"));
		if (!res.ok) throw new Error("missing");
		const m=await res.json() as Manifest;
		cache.set(key,m);
		return m;
	}catch{
		const m:Manifest={
			version:1,
			format:"bc-assets-v1",
			generatedAt:null,
			ns:{
				n3:{candidateCount:720,feedbackCount:9,files:[]},
				n4:{candidateCount:5040,feedbackCount:14,files:[]},
				n5:{candidateCount:30240,feedbackCount:20,files:[]},
				n6:{candidateCount:151200,feedbackCount:27,files:[]}
			},
			trees:{}
		};
		cache.set(key,m);
		return m;
	}
}

export function n_key(n:N):"n3"|"n4"|"n5"|"n6" {
	return `n${n}` as "n3"|"n4"|"n5"|"n6";
}

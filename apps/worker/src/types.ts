export type N=3|4|5|6;
export type Mode="tree"|"dynamic";
export type Engine="js"|"wasm";
export type Strategy="first_remaining"|"minimax_worst_bucket"|"expected_size"|"feedback_count"|"optimal";

export interface Env {
	ASSETS:Fetcher;
	SESSION_SECRET:string;
	CORS_ORIGIN?:string;
	TOKEN_TTL_SEC?:string;
	EXACT_THRESHOLD?:string;
	MINIMAX_FALLBACK?:string;
}

export interface Feedback {
	a:number;
	b:number;
	text?:string;
}

export interface HistItem {
	guess:string;
	a:number;
	b:number;
}

export interface SolveOptions {
	allowFallback?:boolean;
	exactThreshold?:number;
	sampleSize?:number;
	engine?:Engine;
}

export interface SolveReq {
	n:N;
	mode:Mode;
	engine?:Engine;
	strategy:Strategy;
	history:HistItem[];
	options?:SolveOptions;
}

export interface RouteCtx {
	req:Request;
	env:Env;
	params:Record<string,string>;
}

export interface Candidate {
	n:N;
	packed:number;
	mask:number;
	text:string;
}

export interface Manifest {
	version:number;
	format:"bc-assets-v1";
	generatedAt:string|null;
	ns:Record<string,{candidateCount:number;feedbackCount:number;files:string[]}>;
	trees:Record<string,{n:N;strategy:Strategy;parts:string[];nodeCount:number;hash:string}>;
}

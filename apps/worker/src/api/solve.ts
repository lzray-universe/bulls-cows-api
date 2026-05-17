import type {Engine,HistItem,Mode,N,RouteCtx,SolveOptions,Strategy} from "../types";
import {ApiError} from "../errors";
import {read_json,ok} from "../json";
import {assert_engine,assert_guess,assert_history,assert_n,assert_strategy,first_guess} from "../validation";
import {calc_feedback,next_dynamic_engine} from "../wasm/bindings";
import {solve_tree} from "../treeReader";

function opt(body:Record<string,unknown>,env:RouteCtx["env"]):SolveOptions {
	const raw=(body.options&&typeof body.options==="object"?body.options:{}) as Record<string,unknown>;
	return {
		allowFallback:raw.allowFallback===true,
		exactThreshold:Number(raw.exactThreshold??env.EXACT_THRESHOLD??3000),
		sampleSize:Number(raw.sampleSize??0)
	};
}

function engine(body:Record<string,unknown>):Engine {
	const raw=(body.options&&typeof body.options==="object"?body.options:{}) as Record<string,unknown>;
	return assert_engine(body.engine??raw.engine);
}

function max_steps(v:unknown):number {
	const n=Number(v??32);
	if (!Number.isInteger(n)||n<1||n>128) throw new ApiError("BAD_REQUEST","maxSteps must be an integer from 1 to 128");
	return n;
}

function checked_history(n:N,secret:string,history:HistItem[]) {
	return history.map((h,idx)=>{
		const fb=calc_feedback(n,secret,h.guess);
		if (fb.a!==h.a||fb.b!==h.b) throw new ApiError("INVALID_FEEDBACK",`history[${idx}] feedback does not match secret`);
		return {turn:idx+1,source:"history" as const,guess:h.guess,a:h.a,b:h.b,text:`${h.a}A${h.b}B`,solved:h.a===n};
	});
}

async function run_tree(ctx:RouteCtx,n:N,secret:string,strategy:Strategy,history:HistItem[],limit:number) {
	if (history.length>0&&history[0]!.guess!==first_guess(n)) {
		throw new ApiError("BAD_REQUEST","tree mode history must start with fixed first guess");
	}
	const given=checked_history(n,secret,history);
	if (given.some(s=>s.solved)) return {steps:[],givenSteps:given,allSteps:given,attempts:given.length,solved:true,answer:secret};
	const hist=[...history];
	const steps=[];
	for (let i=0;i<limit;i++) {
		const nx=await solve_tree(ctx.env,n,strategy,hist);
		const fb=calc_feedback(n,secret,nx.nextGuess);
		const step={
			turn:hist.length+1,
			source:"computed" as const,
			guess:nx.nextGuess,
			guessIndex:nx.nextGuessIndex,
			a:fb.a,
			b:fb.b,
			text:fb.text,
			remaining:nx.remaining,
			solved:fb.a===n,
			diagnostics:nx.diagnostics
		};
		steps.push(step);
		hist.push({guess:nx.nextGuess,a:fb.a,b:fb.b});
		if (fb.a===n) break;
	}
	const all=[...given,...steps];
	const solved=all.length>0&&all[all.length-1]!.solved;
	return {steps,givenSteps:given,allSteps:all,attempts:all.length,solved,answer:solved?secret:undefined};
}

async function run_dynamic(ctx:RouteCtx,n:N,secret:string,strategy:Exclude<Strategy,"optimal">,history:HistItem[],options:SolveOptions,eg:Engine,limit:number) {
	const given=checked_history(n,secret,history);
	if (given.some(s=>s.solved)) return {steps:[],givenSteps:given,allSteps:given,attempts:given.length,solved:true,answer:secret};
	const hist=[...history];
	const steps=[];
	for (let i=0;i<limit;i++) {
		const nx=await next_dynamic_engine(n,strategy,hist,options,eg);
		const fb=calc_feedback(n,secret,nx.nextGuess);
		const step={
			turn:hist.length+1,
			source:"computed" as const,
			guess:nx.nextGuess,
			guessIndex:nx.nextGuessIndex,
			a:fb.a,
			b:fb.b,
			text:fb.text,
			remaining:nx.remaining,
			solved:fb.a===n,
			diagnostics:nx.diagnostics
		};
		steps.push(step);
		hist.push({guess:nx.nextGuess,a:fb.a,b:fb.b});
		if (fb.a===n) break;
	}
	const all=[...given,...steps];
	const solved=all.length>0&&all[all.length-1]!.solved;
	return {steps,givenSteps:given,allSteps:all,attempts:all.length,solved,answer:solved?secret:undefined};
}

export async function solve_next_route(ctx:RouteCtx):Promise<Response> {
	const body=await read_json<Record<string,unknown>>(ctx.req);
	const n=assert_n(body.n);
	const mode=body.mode as Mode;
	if (mode!=="tree"&&mode!=="dynamic") throw new ApiError("BAD_REQUEST","mode must be tree or dynamic");
	const strategy=assert_strategy(body.strategy);
	const history=assert_history(n,body.history??[]);
	if (mode==="tree") {
		if (history.length>0&&history[0]!.guess!==first_guess(n)) {
			throw new ApiError("BAD_REQUEST","tree mode history must start with fixed first guess");
		}
		const data=await solve_tree(ctx.env,n,strategy,history);
		return ok({n,mode,strategy,...data},ctx.env);
	}
	if (strategy==="optimal") throw new ApiError("STRATEGY_NOT_FOUND","optimal is tree-only");
	const eg=engine(body);
	const data=await next_dynamic_engine(n,strategy,history,opt(body,ctx.env),eg);
	return ok({n,mode,engine:eg,strategy,...data},ctx.env);
}

export async function solve_run_tree_route(ctx:RouteCtx):Promise<Response> {
	const body=await read_json<Record<string,unknown>>(ctx.req);
	const n=assert_n(body.n);
	const secret=assert_guess(n,body.secret,"secret");
	const strategy=assert_strategy(body.strategy);
	const history=assert_history(n,body.history??[]);
	const data=await run_tree(ctx,n,secret,strategy,history,max_steps(body.maxSteps));
	return ok({n,mode:"tree",strategy,secret,...data},ctx.env);
}

export async function solve_run_dynamic_route(ctx:RouteCtx):Promise<Response> {
	const body=await read_json<Record<string,unknown>>(ctx.req);
	const n=assert_n(body.n);
	const secret=assert_guess(n,body.secret,"secret");
	const strategy=assert_strategy(body.strategy);
	if (strategy==="optimal") throw new ApiError("STRATEGY_NOT_FOUND","optimal is tree-only");
	const history=assert_history(n,body.history??[]);
	const eg=engine(body);
	const data=await run_dynamic(ctx,n,secret,strategy,history,opt(body,ctx.env),eg,max_steps(body.maxSteps));
	return ok({n,mode:"dynamic",engine:eg,strategy,secret,...data},ctx.env);
}

import type {PvpToken,SessionToken} from "../cryptoToken";
import type {Mode,RouteCtx} from "../types";
import {ApiError} from "../errors";
import {read_json,ok} from "../json";
import {assert_feedback,assert_guess,assert_n,assert_strategy,first_guess} from "../validation";
import {calc_feedback,enum_candidates,next_dynamic} from "../wasm/bindings";
import {open_token,seal} from "../cryptoToken";
import {solve_tree} from "../treeReader";

function rand_int(max:number):number {
	const x=new Uint32Array(1);
	crypto.getRandomValues(x);
	return x[0]!%max;
}

function random_secret(n:3|4|5|6):string {
	const c=enum_candidates(n);
	return c[rand_int(c.length)]!.text;
}

async function next_guess(ctx:RouteCtx,st:PvpToken) {
	if (st.computerMode==="tree") {
		return solve_tree(ctx.env,st.n,st.computerStrategy,st.computerHistory);
	}
	if (st.computerStrategy==="optimal") throw new ApiError("STRATEGY_NOT_FOUND","optimal is tree-only");
	return next_dynamic(st.n,st.computerStrategy,st.computerHistory,{allowFallback:true,exactThreshold:Number(ctx.env.EXACT_THRESHOLD||3000)});
}

export async function pvp_start_route(ctx:RouteCtx):Promise<Response> {
	const body=await read_json<Record<string,unknown>>(ctx.req);
	const n=assert_n(body.n);
	const humanSecret=assert_guess(n,body.humanSecret,"humanSecret");
	const strategy=assert_strategy(body.computerStrategy);
	const mode=body.computerMode as Mode;
	if (mode!=="tree"&&mode!=="dynamic") throw new ApiError("BAD_REQUEST","computerMode must be tree or dynamic");
	if (mode==="dynamic"&&strategy==="optimal") throw new ApiError("STRATEGY_NOT_FOUND","optimal is tree-only");
	const first=first_guess(n);
	const st:PvpToken={
		kind:"pvp",
		n,
		serverSecret:random_secret(n),
		humanSecret,
		computerStrategy:strategy,
		computerMode:mode,
		humanAttempts:0,
		computerAttempts:1,
		computerHistory:[],
		lastComputerGuess:first,
		createdAt:Math.floor(Date.now()/1000)
	};
	return ok({
		sessionToken:await seal(ctx.env,st as SessionToken),
		firstComputerGuess:first,
		humanAttempts:0,
		computerAttempts:1
	},ctx.env);
}

export async function pvp_turn_route(ctx:RouteCtx):Promise<Response> {
	const body=await read_json<Record<string,unknown>>(ctx.req);
	const token=typeof body.sessionToken==="string"?body.sessionToken:"";
	const st=await open_token<PvpToken>(ctx.env,token,"pvp");
	const humanGuess=assert_guess(st.n,body.humanGuess,"humanGuess");
	const cf_src=(body.computerFeedback&&typeof body.computerFeedback==="object"?body.computerFeedback:{}) as Record<string,unknown>;
	const cf=assert_feedback(st.n,cf_src.a,cf_src.b);
	const real=calc_feedback(st.n,st.humanSecret,st.lastComputerGuess);
	if (real.a!==cf.a||real.b!==cf.b) {
		throw new ApiError("INVALID_FEEDBACK","computerFeedback does not match humanSecret");
	}
	st.computerHistory.push({guess:st.lastComputerGuess,a:cf.a,b:cf.b});
	const humanFb=calc_feedback(st.n,st.serverSecret,humanGuess);
	st.humanAttempts++;
	const humanSolved=humanFb.a===st.n;
	let computerSolved=cf.a===st.n;
	let nextComputerGuess:string|null=null;
	if (!computerSolved) {
		const nx=await next_guess(ctx,st);
		nextComputerGuess=nx.nextGuess;
		st.lastComputerGuess=nextComputerGuess;
		st.computerAttempts++;
		computerSolved=Boolean(nx.solved);
	}
	let winner:null|"human"|"computer"|"tie"=null;
	if (humanSolved&&computerSolved) winner=st.humanAttempts<=st.computerAttempts?"tie":"computer";
	else if (humanSolved) winner="human";
	else if (computerSolved) winner="computer";
	return ok({
		sessionToken:await seal(ctx.env,st),
		humanFeedback:humanFb,
		nextComputerGuess,
		humanSolved,
		computerSolved,
		winner,
		humanAttempts:st.humanAttempts,
		computerAttempts:st.computerAttempts
	},ctx.env);
}

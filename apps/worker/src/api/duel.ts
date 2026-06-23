import type {DuelToken,SessionToken} from "../cryptoToken";
import type {RouteCtx} from "../types";
import {ApiError} from "../errors";
import {read_json,ok} from "../json";
import {assert_guess,assert_n} from "../validation";
import {calc_feedback} from "../wasm/bindings";
import {open_token,seal} from "../cryptoToken";

type Player="playerA"|"playerB";
type Winner=Player|"tie"|null;

function name(v:unknown,def:string):string {
	if (v===undefined||v===null) return def;
	if (typeof v!=="string") throw new ApiError("BAD_REQUEST",`${def}Name must be string`);
	const s=v.trim();
	if (s.length<1||s.length>40) throw new ApiError("BAD_REQUEST",`${def}Name must be 1 to 40 characters`);
	return s;
}

function winner(st:DuelToken):Winner {
	if (st.playerASolved&&st.playerBSolved) {
		if (st.playerAAttempts===st.playerBAttempts) return "tie";
		return st.playerAAttempts<st.playerBAttempts?"playerA":"playerB";
	}
	if (st.playerASolved&&st.playerBAttempts>=st.playerAAttempts) return "playerA";
	if (st.playerBSolved&&st.playerAAttempts>=st.playerBAttempts) return "playerB";
	return null;
}

function summary(st:DuelToken) {
	const w=winner(st);
	return {
		n:st.n,
		playerAName:st.playerAName??"playerA",
		playerBName:st.playerBName??"playerB",
		playerAAttempts:st.playerAAttempts,
		playerBAttempts:st.playerBAttempts,
		playerASolved:st.playerASolved,
		playerBSolved:st.playerBSolved,
		winner:w,
		finished:w!==null,
		round:Math.max(st.playerAAttempts,st.playerBAttempts)
	};
}

function guess_present(v:unknown):boolean {
	return v!==undefined&&v!==null;
}

function play(st:DuelToken,player:Player,raw:unknown) {
	if (winner(st)!==null) throw new ApiError("BAD_REQUEST","duel is already finished");
	const guess=assert_guess(st.n,raw,`${player}Guess`);
	if (player==="playerA") {
		if (st.playerASolved) throw new ApiError("BAD_REQUEST","playerA has already solved");
		const fb=calc_feedback(st.n,st.playerBSecret,guess);
		st.playerAAttempts++;
		st.playerASolved=fb.a===st.n;
		st.history.push({player,guess,a:fb.a,b:fb.b,round:st.playerAAttempts});
		return {guess,a:fb.a,b:fb.b,text:fb.text,attempts:st.playerAAttempts,solved:st.playerASolved};
	}
	if (st.playerBSolved) throw new ApiError("BAD_REQUEST","playerB has already solved");
	const fb=calc_feedback(st.n,st.playerASecret,guess);
	st.playerBAttempts++;
	st.playerBSolved=fb.a===st.n;
	st.history.push({player,guess,a:fb.a,b:fb.b,round:st.playerBAttempts});
	return {guess,a:fb.a,b:fb.b,text:fb.text,attempts:st.playerBAttempts,solved:st.playerBSolved};
}

export async function duel_start_route(ctx:RouteCtx):Promise<Response> {
	const body=await read_json<Record<string,unknown>>(ctx.req);
	const n=assert_n(body.n);
	const st:DuelToken={
		kind:"duel",
		n,
		playerASecret:assert_guess(n,body.playerASecret,"playerASecret"),
		playerBSecret:assert_guess(n,body.playerBSecret,"playerBSecret"),
		playerAName:name(body.playerAName,"playerA"),
		playerBName:name(body.playerBName,"playerB"),
		playerAAttempts:0,
		playerBAttempts:0,
		playerASolved:false,
		playerBSolved:false,
		createdAt:Math.floor(Date.now()/1000),
		history:[]
	};
	return ok({sessionToken:await seal(ctx.env,st as SessionToken),...summary(st)},ctx.env);
}

export async function duel_turn_route(ctx:RouteCtx):Promise<Response> {
	const body=await read_json<Record<string,unknown>>(ctx.req);
	const token=typeof body.sessionToken==="string"?body.sessionToken:"";
	const st=await open_token<DuelToken>(ctx.env,token,"duel");
	const hasA=guess_present(body.playerAGuess);
	const hasB=guess_present(body.playerBGuess);
	if (!hasA&&!hasB) throw new ApiError("BAD_REQUEST","at least one player guess is required");
	const playerAFeedback=hasA?play(st,"playerA",body.playerAGuess):null;
	const playerBFeedback=hasB?play(st,"playerB",body.playerBGuess):null;
	return ok({
		sessionToken:await seal(ctx.env,st),
		playerAFeedback,
		playerBFeedback,
		history:st.history,
		...summary(st)
	},ctx.env);
}

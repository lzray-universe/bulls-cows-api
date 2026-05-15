import type {HumanToken,SessionToken} from "../cryptoToken";
import type {RouteCtx} from "../types";
import {read_json,ok} from "../json";
import {assert_guess,assert_n} from "../validation";
import {calc_feedback,enum_candidates} from "../wasm/bindings";
import {open_token,seal} from "../cryptoToken";

function rand_int(max:number):number {
	const x=new Uint32Array(1);
	crypto.getRandomValues(x);
	return x[0]!%max;
}

function random_secret(n:3|4|5|6):string {
	const c=enum_candidates(n);
	return c[rand_int(c.length)]!.text;
}

export async function human_start_route(ctx:RouteCtx):Promise<Response> {
	const body=await read_json<Record<string,unknown>>(ctx.req);
	const n=assert_n(body.n);
	const tok:HumanToken={
		kind:"human",
		n,
		secret:random_secret(n),
		attempts:0,
		createdAt:Math.floor(Date.now()/1000),
		history:[]
	};
	return ok({sessionToken:await seal(ctx.env,tok as SessionToken),n,attempts:0},ctx.env);
}

export async function human_guess_route(ctx:RouteCtx):Promise<Response> {
	const body=await read_json<Record<string,unknown>>(ctx.req);
	const token=typeof body.sessionToken==="string"?body.sessionToken:"";
	const st=await open_token<HumanToken>(ctx.env,token,"human");
	const guess=assert_guess(st.n,body.guess);
	const fb=calc_feedback(st.n,st.secret,guess);
	st.attempts++;
	st.history.push({guess,a:fb.a,b:fb.b});
	const solved=fb.a===st.n;
	return ok({
		sessionToken:await seal(ctx.env,st),
		a:fb.a,
		b:fb.b,
		text:fb.text,
		attempts:st.attempts,
		solved
	},ctx.env);
}

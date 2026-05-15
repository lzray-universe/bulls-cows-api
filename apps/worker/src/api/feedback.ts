import {read_json,ok} from "../json";
import {assert_guess,assert_n} from "../validation";
import {calc_feedback} from "../wasm/bindings";
import type {RouteCtx} from "../types";

export async function feedback_route(ctx:RouteCtx):Promise<Response> {
	const body=await read_json<Record<string,unknown>>(ctx.req);
	const n=assert_n(body.n);
	const secret=assert_guess(n,body.secret,"secret");
	const guess=assert_guess(n,body.guess,"guess");
	const fb=calc_feedback(n,secret,guess);
	return ok(fb,ctx.env);
}

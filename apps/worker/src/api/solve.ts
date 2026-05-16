import type {Engine,Mode,RouteCtx,SolveOptions} from "../types";
import {ApiError} from "../errors";
import {read_json,ok} from "../json";
import {assert_engine,assert_history,assert_n,assert_strategy,first_guess} from "../validation";
import {next_dynamic_engine} from "../wasm/bindings";
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

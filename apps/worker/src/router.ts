import type {Env,RouteCtx} from "./types";
import {ApiError} from "./errors";
import {cors_headers,fail} from "./json";
import {meta_route,strategies_route} from "./api/meta";
import {feedback_route} from "./api/feedback";
import {solve_next_route} from "./api/solve";
import {human_guess_route,human_start_route} from "./api/human";
import {pvp_start_route,pvp_turn_route} from "./api/pvp";
import {errors_route} from "./api/errorsInfo";
import {websocket_route} from "./ws";

type Handler=(ctx:RouteCtx)=>Promise<Response>;

const routes:Record<string,Handler>={
	"GET /api/meta":meta_route,
	"GET /api/strategies":strategies_route,
	"GET /api/errors":errors_route,
	"POST /api/feedback":feedback_route,
	"POST /api/solve/next":solve_next_route,
	"POST /api/human/start":human_start_route,
	"POST /api/human/guess":human_guess_route,
	"POST /api/pvp/start":pvp_start_route,
	"POST /api/pvp/turn":pvp_turn_route
};

export async function route(req:Request,env:Env):Promise<Response> {
	const url=new URL(req.url);
	const ws=websocket_route(req,env,url);
	if (ws) return ws;
	if (req.method==="OPTIONS") return new Response(null,{status:204,headers:cors_headers(env)});
	const key=`${req.method} ${url.pathname}`;
	const h=routes[key];
	if (!h) {
		if (url.pathname.startsWith("/api/")) {
			return fail(new ApiError("BAD_REQUEST","route not found",404),env);
		}
		return env.ASSETS.fetch(req);
	}
	try {
		return await h({req,env,params:{}});
	}catch(e) {
		if (e instanceof ApiError) return fail(e,env);
		const msg=e instanceof Error?e.message:String(e);
		return fail(new ApiError("INTERNAL_ERROR",msg,500),env);
	}
}

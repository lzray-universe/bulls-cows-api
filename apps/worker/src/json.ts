import {ApiError} from "./errors";
import type {Env} from "./types";

export function cors_headers(env:Env):HeadersInit {
	return {
		"access-control-allow-origin":env.CORS_ORIGIN||"*",
		"access-control-allow-methods":"GET,POST,OPTIONS",
		"access-control-allow-headers":"content-type,authorization",
		"access-control-max-age":"86400"
	};
}

export function ok(data:unknown,env:Env,status=200):Response {
	return Response.json({ok:true,data},{status,headers:cors_headers(env)});
}

export function fail(err:ApiError,env:Env):Response {
	return Response.json({
		ok:false,
		error:{code:err.code,message:err.message,details:err.details}
	},{status:err.status,headers:cors_headers(env)});
}

export async function read_json<T>(req:Request):Promise<T> {
	try {
		return await req.json() as T;
	}catch{
		throw new ApiError("BAD_REQUEST","invalid json");
	}
}

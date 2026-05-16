import type {RouteCtx} from "../types";
import {load_manifest} from "../assetStore";
import {ok} from "../json";
import {list_strategies} from "../strategies";

export async function meta_route(ctx:RouteCtx):Promise<Response> {
	const mf=await load_manifest(ctx.env);
	return ok({
		version:"0.1.0",
		n:[3,4,5,6],
		engines:["js","wasm"],
		defaultFirstGuess:{3:"012",4:"0123",5:"01234",6:"012345"},
		strategies:list_strategies(),
		assetManifest:mf
	},ctx.env);
}

export async function strategies_route(ctx:RouteCtx):Promise<Response> {
	return ok({engines:["js","wasm"],strategies:list_strategies()},ctx.env);
}

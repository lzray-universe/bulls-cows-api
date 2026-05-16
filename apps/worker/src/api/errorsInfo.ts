import type {RouteCtx} from "../types";
import {ok} from "../json";

export const error_info=[
	{code:"BAD_REQUEST",desc:"request shape, method, mode, or route is invalid"},
	{code:"INVALID_N",desc:"n must be one of 3,4,5,6"},
	{code:"INVALID_GUESS",desc:"guess or secret must be n unique decimal digits"},
	{code:"INVALID_FEEDBACK",desc:"A/B feedback is outside the legal feedback set"},
	{code:"INCONSISTENT_HISTORY",desc:"history leaves no possible secret"},
	{code:"TREE_NOT_FOUND",desc:"requested precomputed tree asset is unavailable"},
	{code:"STRATEGY_NOT_FOUND",desc:"strategy is unknown or not available for this mode"},
	{code:"NEED_TREE_OR_APPROX",desc:"exact dynamic strategy exceeds configured threshold"},
	{code:"TOKEN_INVALID",desc:"session token cannot be decrypted or has wrong shape"},
	{code:"TOKEN_EXPIRED",desc:"session token exceeded configured TTL"},
	{code:"INTERNAL_ERROR",desc:"unexpected server error"}
];

export async function errors_route(ctx:RouteCtx):Promise<Response> {
	return ok({errors:error_info},ctx.env);
}

export type ErrorCode=
	"BAD_REQUEST"|"INVALID_N"|"INVALID_GUESS"|"INVALID_FEEDBACK"|
	"INCONSISTENT_HISTORY"|"TREE_NOT_FOUND"|"STRATEGY_NOT_FOUND"|
	"NEED_TREE_OR_APPROX"|"TOKEN_INVALID"|"TOKEN_EXPIRED"|"INTERNAL_ERROR";

export class ApiError extends Error {
	code:ErrorCode;
	status:number;
	details:unknown;

	constructor(code:ErrorCode,message:string,status=400,details:unknown=null) {
		super(message);
		this.code=code;
		this.status=status;
		this.details=details;
	}
}

export function map_core_error(e:unknown):ApiError {
	const msg=e instanceof Error?e.message:String(e);
	if (msg.includes("invalid n")) return new ApiError("INVALID_N",msg);
	if (msg.includes("invalid guess")) return new ApiError("INVALID_GUESS",msg);
	if (msg.includes("invalid feedback")) return new ApiError("INVALID_FEEDBACK",msg);
	if (msg.includes("inconsistent")) return new ApiError("INCONSISTENT_HISTORY",msg);
	if (msg.includes("strategy")) return new ApiError("STRATEGY_NOT_FOUND",msg);
	if (msg.includes("need tree")) return new ApiError("NEED_TREE_OR_APPROX",msg);
	return new ApiError("BAD_REQUEST",msg);
}

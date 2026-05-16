import {ApiError} from "./errors";
import type {Engine,Feedback,HistItem,N,Strategy} from "./types";

export function is_n(v:unknown):v is N {
	return v===3||v===4||v===5||v===6;
}

export function assert_n(v:unknown):N {
	if (!is_n(v)) throw new ApiError("INVALID_N","n must be 3,4,5,or 6");
	return v;
}

export function assert_strategy(v:unknown):Strategy {
	if (v==="first_remaining"||
		v==="minimax_worst_bucket"||
		v==="expected_size"||
		v==="feedback_count"||
		v==="optimal") return v;
	throw new ApiError("STRATEGY_NOT_FOUND","unknown strategy");
}

export function assert_engine(v:unknown,def:Engine="js"):Engine {
	if (v===undefined||v===null) return def;
	if (v==="js"||v==="wasm") return v;
	throw new ApiError("BAD_REQUEST","engine must be js or wasm");
}

export function valid_guess(n:N,s:unknown):s is string {
	if (typeof s!=="string"||s.length!==n) return false;
	let mask=0;
	for (let i=0;i<s.length;i++) {
		const c=s.charCodeAt(i)-48;
		if (c<0||c>9) return false;
		const bit=1<<c;
		if (mask&bit) return false;
		mask|=bit;
	}
	return true;
}

export function assert_guess(n:N,s:unknown,name="guess"):string {
	if (!valid_guess(n,s)) throw new ApiError("INVALID_GUESS",`${name} must be ${n} unique digits`);
	return s;
}

export function is_valid_feedback(n:N,a:unknown,b:unknown):a is number {
	return Number.isInteger(a)&&Number.isInteger(b)&&
		(a as number)>=0&&(b as number)>=0&&
		(a as number)<=n&&(b as number)<=n&&
		(a as number)+(b as number)<=n&&
		!((a as number)===n-1&&(b as number)===1);
}

export function assert_feedback(n:N,a:unknown,b:unknown):Feedback {
	if (!is_valid_feedback(n,a,b)) throw new ApiError("INVALID_FEEDBACK","invalid A/B feedback");
	return {a:a as number,b:b as number,text:`${a}A${b}B`};
}

export function assert_history(n:N,v:unknown):HistItem[] {
	if (!Array.isArray(v)) throw new ApiError("BAD_REQUEST","history must be array");
	return v.map((x,idx)=>{
		if (!x||typeof x!=="object") throw new ApiError("BAD_REQUEST",`history[${idx}] must be object`);
		const r=x as Record<string,unknown>;
		const guess=assert_guess(n,r.guess,`history[${idx}].guess`);
		const fb=assert_feedback(n,r.a,r.b);
		return {guess,a:fb.a,b:fb.b};
	});
}

export function first_guess(n:N):string {
	return "012345".slice(0,n);
}

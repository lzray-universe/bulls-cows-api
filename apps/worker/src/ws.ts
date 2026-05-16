import type {Engine,Env,Feedback,HistItem,Mode,N,SolveOptions,Strategy} from "./types";
import type {PvpToken,SessionToken} from "./cryptoToken";
import {ApiError} from "./errors";
import {assert_engine,assert_feedback,assert_guess,assert_history,assert_n,assert_strategy,first_guess} from "./validation";
import {calc_feedback,enum_candidates,next_dynamic_engine} from "./wasm/bindings";
import {open_token,seal} from "./cryptoToken";
import {solve_tree} from "./treeReader";
import {list_strategies} from "./strategies";

type WsMsg={id?:unknown;type?:unknown;payload?:unknown};

function send(ws:WebSocket,msg:unknown) {
	ws.send(JSON.stringify(msg));
}

function send_ok(ws:WebSocket,id:unknown,data:unknown) {
	send(ws,{ok:true,id:id??null,data});
}

function send_err(ws:WebSocket,id:unknown,e:unknown) {
	if (e instanceof ApiError) {
		send(ws,{ok:false,id:id??null,error:{code:e.code,message:e.message,details:e.details}});
		return;
	}
	const msg=e instanceof Error?e.message:String(e);
	send(ws,{ok:false,id:id??null,error:{code:"INTERNAL_ERROR",message:msg,details:null}});
}

function parse_mode(v:unknown):Mode {
	if (v==="tree"||v==="dynamic") return v;
	throw new ApiError("BAD_REQUEST","mode must be tree or dynamic");
}

function parse_options(v:unknown,env:Env):SolveOptions {
	const r=(v&&typeof v==="object"?v:{}) as Record<string,unknown>;
	return {
		allowFallback:r.allowFallback===true,
		exactThreshold:Number(r.exactThreshold??env.EXACT_THRESHOLD??3000),
		sampleSize:Number(r.sampleSize??0)
	};
}

function parse_engine(payload:Record<string,unknown>,def:Engine="js"):Engine {
	const opt=(payload.options&&typeof payload.options==="object"?payload.options:{}) as Record<string,unknown>;
	return assert_engine(payload.engine??opt.engine,def);
}

async function solve_next(env:Env,payload:unknown) {
	const r=(payload&&typeof payload==="object"?payload:{}) as Record<string,unknown>;
	const n=assert_n(r.n);
	const mode=parse_mode(r.mode);
	const strategy=assert_strategy(r.strategy);
	const history=assert_history(n,r.history??[]);
	if (mode==="tree") {
		if (history.length>0&&history[0]!.guess!==first_guess(n)) {
			throw new ApiError("BAD_REQUEST","tree mode history must start with fixed first guess");
		}
		return {n,mode,strategy,...await solve_tree(env,n,strategy,history)};
	}
	if (strategy==="optimal") throw new ApiError("STRATEGY_NOT_FOUND","optimal is tree-only");
	const eg=parse_engine(r);
	return {n,mode,engine:eg,strategy,...await next_dynamic_engine(n,strategy,history,parse_options(r.options,env),eg)};
}

function feedback_payload(payload:unknown):Feedback {
	const r=(payload&&typeof payload==="object"?payload:{}) as Record<string,unknown>;
	const n=assert_n(r.n);
	const secret=assert_guess(n,r.secret,"secret");
	const guess=assert_guess(n,r.guess,"guess");
	return calc_feedback(n,secret,guess);
}

function rand_int(max:number):number {
	const x=new Uint32Array(1);
	crypto.getRandomValues(x);
	return x[0]!%max;
}

function random_secret(n:N):string {
	const c=enum_candidates(n);
	return c[rand_int(c.length)]!.text;
}

async function pvp_next(env:Env,st:PvpToken,eg:Engine) {
	if (st.computerMode==="tree") return solve_tree(env,st.n,st.computerStrategy,st.computerHistory);
	if (st.computerStrategy==="optimal") throw new ApiError("STRATEGY_NOT_FOUND","optimal is tree-only");
	return next_dynamic_engine(st.n,st.computerStrategy,st.computerHistory,{allowFallback:true,exactThreshold:Number(env.EXACT_THRESHOLD||3000)},eg);
}

async function pvp_start(env:Env,payload:unknown) {
	const r=(payload&&typeof payload==="object"?payload:{}) as Record<string,unknown>;
	const n=assert_n(r.n);
	const humanSecret=assert_guess(n,r.humanSecret,"humanSecret");
	const strategy=assert_strategy(r.computerStrategy);
	const mode=parse_mode(r.computerMode);
	const eg=assert_engine(r.computerEngine??r.engine);
	if (mode==="dynamic"&&strategy==="optimal") throw new ApiError("STRATEGY_NOT_FOUND","optimal is tree-only");
	const first=first_guess(n);
	const st:PvpToken={
		kind:"pvp",
		n,
		serverSecret:random_secret(n),
		humanSecret,
		computerStrategy:strategy,
		computerMode:mode,
		computerEngine:eg,
		humanAttempts:0,
		computerAttempts:1,
		computerHistory:[],
		lastComputerGuess:first,
		createdAt:Math.floor(Date.now()/1000)
	};
	return {
		token:await seal(env,st as SessionToken),
		data:{sessionToken:"",firstComputerGuess:first,computerEngine:eg,humanAttempts:0,computerAttempts:1}
	};
}

async function pvp_turn(env:Env,token:string,payload:unknown) {
	const r=(payload&&typeof payload==="object"?payload:{}) as Record<string,unknown>;
	const st=await open_token<PvpToken>(env,token,"pvp");
	const eg=assert_engine(r.computerEngine??r.engine,st.computerEngine??"js");
	const humanGuess=assert_guess(st.n,r.humanGuess,"humanGuess");
	const cf_src=(r.computerFeedback&&typeof r.computerFeedback==="object"?r.computerFeedback:{}) as Record<string,unknown>;
	const cf=assert_feedback(st.n,cf_src.a,cf_src.b);
	const real=calc_feedback(st.n,st.humanSecret,st.lastComputerGuess);
	if (real.a!==cf.a||real.b!==cf.b) throw new ApiError("INVALID_FEEDBACK","computerFeedback does not match humanSecret");
	st.computerHistory.push({guess:st.lastComputerGuess,a:cf.a,b:cf.b});
	const humanFeedback=calc_feedback(st.n,st.serverSecret,humanGuess);
	st.humanAttempts++;
	const humanSolved=humanFeedback.a===st.n;
	let computerSolved=cf.a===st.n;
	let nextComputerGuess:string|null=null;
	if (!computerSolved) {
		const nx=await pvp_next(env,st,eg);
		nextComputerGuess=nx.nextGuess;
		st.lastComputerGuess=nextComputerGuess;
		st.computerAttempts++;
		computerSolved=Boolean(nx.solved);
	}
	st.computerEngine=eg;
	let winner:null|"human"|"computer"|"tie"=null;
	if (humanSolved&&computerSolved) winner=st.humanAttempts<=st.computerAttempts?"tie":"computer";
	else if (humanSolved) winner="human";
	else if (computerSolved) winner="computer";
	return {
		token:await seal(env,st),
		data:{sessionToken:"",humanFeedback,nextComputerGuess,computerEngine:eg,humanSolved,computerSolved,winner,humanAttempts:st.humanAttempts,computerAttempts:st.computerAttempts}
	};
}

function parse_msg(data:unknown):WsMsg {
	if (typeof data!=="string") throw new ApiError("BAD_REQUEST","websocket message must be text json");
	const msg=JSON.parse(data) as WsMsg;
	if (!msg||typeof msg!=="object") throw new ApiError("BAD_REQUEST","websocket message must be object");
	return msg;
}

function setup_solve(ws:WebSocket,env:Env) {
	ws.addEventListener("message",ev=>{
		void (async()=>{
			let msg:WsMsg={};
			try {
				msg=parse_msg(ev.data);
				if (msg.type==="ping") send_ok(ws,msg.id,{pong:true});
				else if (msg.type==="strategies") send_ok(ws,msg.id,{strategies:list_strategies()});
				else if (msg.type==="feedback") send_ok(ws,msg.id,feedback_payload(msg.payload));
				else if (msg.type==="next") send_ok(ws,msg.id,await solve_next(env,msg.payload));
				else throw new ApiError("BAD_REQUEST","unknown websocket message type");
			}catch(e) {
				send_err(ws,msg.id,e);
			}
		})();
	});
	send_ok(ws,null,{ready:true,endpoint:"solve",types:["ping","strategies","feedback","next"]});
}

function setup_pvp(ws:WebSocket,env:Env) {
	let sessionToken:string|null=null;
	ws.addEventListener("message",ev=>{
		void (async()=>{
			let msg:WsMsg={};
			try {
				msg=parse_msg(ev.data);
				if (msg.type==="ping") {
					send_ok(ws,msg.id,{pong:true});
				}else if (msg.type==="start") {
					const res=await pvp_start(env,msg.payload);
					sessionToken=res.token;
					send_ok(ws,msg.id,{...res.data,sessionToken});
				}else if (msg.type==="turn") {
					const r=(msg.payload&&typeof msg.payload==="object"?msg.payload:{}) as Record<string,unknown>;
					const tok=typeof r.sessionToken==="string"?r.sessionToken:sessionToken;
					if (!tok) throw new ApiError("TOKEN_INVALID","pvp session has not started");
					const res=await pvp_turn(env,tok,msg.payload);
					sessionToken=res.token;
					send_ok(ws,msg.id,{...res.data,sessionToken});
				}else{
					throw new ApiError("BAD_REQUEST","unknown websocket message type");
				}
			}catch(e) {
				send_err(ws,msg.id,e);
			}
		})();
	});
	send_ok(ws,null,{ready:true,endpoint:"pvp",types:["ping","start","turn"]});
}

export function websocket_route(req:Request,env:Env,url:URL):Response|null {
	if (req.headers.get("upgrade")?.toLowerCase()!=="websocket") return null;
	if (url.pathname!=="/ws/solve"&&url.pathname!=="/ws/pvp") return null;
	const pair=new WebSocketPair();
	const client=pair[0];
	const server=pair[1];
	server.accept();
	if (url.pathname==="/ws/solve") setup_solve(server,env);
	else setup_pvp(server,env);
	return new Response(null,{status:101,webSocket:client});
}

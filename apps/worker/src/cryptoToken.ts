import {ApiError} from "./errors";
import type {Engine,Env,HistItem,N,Strategy,Mode} from "./types";

export interface HumanToken {
	kind:"human";
	n:N;
	secret:string;
	attempts:number;
	createdAt:number;
	history:{guess:string;a:number;b:number}[];
}

export interface PvpToken {
	kind:"pvp";
	n:N;
	serverSecret:string;
	humanSecret:string;
	computerStrategy:Strategy;
	computerMode:Mode;
	computerEngine?:Engine;
	humanAttempts:number;
	computerAttempts:number;
	computerHistory:HistItem[];
	lastComputerGuess:string;
	createdAt:number;
}

export type SessionToken=HumanToken|PvpToken;

const enc=new TextEncoder();
const dec=new TextDecoder();

function b64url(buf:ArrayBuffer|Uint8Array):string {
	const bytes=buf instanceof Uint8Array?buf:new Uint8Array(buf);
	let s="";
	for (const b of bytes) s+=String.fromCharCode(b);
	return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}

function unb64url(s:string):Uint8Array {
	const pad="=".repeat((4-s.length%4)%4);
	const b64=(s+pad).replace(/-/g,"+").replace(/_/g,"/");
	const bin=atob(b64);
	const out=new Uint8Array(bin.length);
	for (let i=0;i<bin.length;i++) out[i]=bin.charCodeAt(i);
	return out;
}

async function key(secret:string):Promise<CryptoKey> {
	const hash=await crypto.subtle.digest("SHA-256",enc.encode(secret));
	return crypto.subtle.importKey("raw",hash,{name:"AES-GCM"},false,["encrypt","decrypt"]);
}

export function ttl(env:Env):number {
	const n=Number(env.TOKEN_TTL_SEC||"86400");
	return Number.isFinite(n)&&n>0?n:86400;
}

export async function seal(env:Env,data:SessionToken):Promise<string> {
	if (!env.SESSION_SECRET) throw new ApiError("INTERNAL_ERROR","SESSION_SECRET is not configured",500);
	const iv=crypto.getRandomValues(new Uint8Array(12));
	const k=await key(env.SESSION_SECRET);
	const plain=enc.encode(JSON.stringify(data));
	const ct=await crypto.subtle.encrypt({name:"AES-GCM",iv},k,plain);
	return `${b64url(iv)}.${b64url(ct)}`;
}

export async function open_token<T extends SessionToken>(env:Env,token:string,kind:T["kind"]):Promise<T> {
	try {
		const [iv_s,ct_s]=token.split(".");
		if (!iv_s||!ct_s) throw new Error("shape");
		const k=await key(env.SESSION_SECRET);
		const plain=await crypto.subtle.decrypt({name:"AES-GCM",iv:unb64url(iv_s)},k,unb64url(ct_s));
		const data=JSON.parse(dec.decode(plain)) as SessionToken;
		if (data.kind!==kind) throw new ApiError("TOKEN_INVALID","wrong token kind");
		if (Date.now()/1000-data.createdAt>ttl(env)) throw new ApiError("TOKEN_EXPIRED","session token expired");
		return data as T;
	}catch(e) {
		if (e instanceof ApiError) throw e;
		throw new ApiError("TOKEN_INVALID","invalid session token");
	}
}

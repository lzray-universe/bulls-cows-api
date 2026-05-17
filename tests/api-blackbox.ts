type Dict<T=unknown>=Record<string,T>;
type ReqOpt={method?:string;headers?:Dict<string>;body?:string;binary?:boolean};
type TestRec={name:string;ok:boolean;ms:number;error?:string;[k:string]:unknown};

const node_crypto=require("node:crypto");
const tls=require("node:tls");
const net=require("node:net");

const args=parse_args(process.argv.slice(2));
const cfg={
	base:norm_base(args.base||process.env.BASE_URL||"https://bulls-cows-api.lzray.cloud"),
	timeoutMs:num(args.timeoutMs||process.env.TEST_TIMEOUT_MS,15000),
	json:args.json==="1",
	noWs:args.noWs==="1"
};
const tests:TestRec[]=[];

main().catch(err=>{
	process.stderr.write((err&&err.stack?err.stack:String(err))+"\n");
	process.exitCode=1;
});

async function main(){
	if(args.help==="1"){
		usage();
		return;
	}
	if(!cfg.json)log(`base ${cfg.base}`);
	await run_all();
	const fail=tests.filter(t=>!t.ok);
	const ok=tests.filter(t=>t.ok);
	const ms=ok.map(t=>t.ms).sort((a,b)=>a-b);
	const summary={
		base:cfg.base,
		passed:ok.length,
		failed:fail.length,
		total:tests.length,
		minMs:ms[0]??0,
		p50Ms:ms[Math.floor(ms.length/2)]??0,
		p95Ms:ms[Math.floor(ms.length*0.95)]??ms[ms.length-1]??0,
		maxMs:ms[ms.length-1]??0,
		failures:fail,
		tests
	};
	if(cfg.json)process.stdout.write(JSON.stringify(summary,null,2)+"\n");
	else{
		log("");
		log(`passed ${summary.passed}/${summary.total}`);
		log(`latency min=${summary.minMs}ms p50=${summary.p50Ms}ms p95=${summary.p95Ms}ms max=${summary.maxMs}ms`);
		if(fail.length){
			log("failures:");
			for(const f of fail)log(`  ${f.name}: ${f.error}`);
		}
	}
	if(fail.length)process.exitCode=1;
}

async function run_all(){
	await run("homepage html",async()=>{
		const {r,txt,ct}=await req("/");
		assert(r.status===200,`status ${r.status}`);
		assert(ct.includes("text/html"),`content-type ${ct}`);
		assert(txt.includes("Bulls Cows API"),"missing title");
		assert(txt.includes("/api/solve/run-tree"),"missing run-tree docs");
		assert(txt.includes("/ws/solve"),"missing websocket docs");
		assert(!/[\u4e00-\u9fff]/.test(txt),"contains non-English CJK text");
		return {bytes:txt.length};
	});
	await run("favicon svg",async()=>{
		const {r,txt,ct}=await req("/favicon.svg");
		assert(r.status===200,`status ${r.status}`);
		assert(ct.includes("image/svg+xml"),`content-type ${ct}`);
		assert(txt.trim().startsWith("<svg"),"not svg");
		return {bytes:txt.length};
	});
	await run("asset manifest static",async()=>{
		const {r,j}=await req("/assets/bc/v1/manifest.json");
		assert(r.status===200,`status ${r.status}`);
		const m=as_obj(j);
		assert(m.version===1,"manifest version");
		assert(Boolean(as_obj(m.trees)["n4:optimal"]),"missing n4 optimal tree");
		return {trees:Object.keys(as_obj(m.trees)).length};
	});
	await run("n4 tree asset header",async()=>{
		const {r,buf,ct}=await req("/assets/bc/v1/n4/tree.optimal.part000.bin",{binary:true});
		assert(r.status===200,`status ${r.status}`);
		assert(buf&&buf.length>4,"empty tree");
		assert(buf![0]===0x42&&buf![1]===0x43&&buf![2]===0x53&&buf![3]===0x54,"bad BCST magic");
		return {bytes:buf!.length,contentType:ct};
	});
	await run("cors options",async()=>{
		const {r}=await req("/api/solve/next",{
			method:"OPTIONS",
			headers:{origin:"https://example.com","access-control-request-method":"POST"}
		});
		assert(r.status===204,`status ${r.status}`);
		assert(r.headers.get("access-control-allow-origin")==="*","missing cors origin");
		return {};
	});
	await run("meta",async()=>{
		const {r,j}=await req("/api/meta");
		assert(r.status===200,`status ${r.status}`);
		const d=data_obj(j);
		assert(arr(d.engines).includes("wasm"),"missing wasm engine");
		assert(as_obj(as_obj(d.assetManifest).ns).n6&&as_obj(as_obj(as_obj(d.assetManifest).ns).n6).candidateCount===151200,"bad n6 candidate count");
		assert(as_obj(as_obj(as_obj(d.assetManifest).trees)["n4:optimal"]).nodeCount===6569,"bad n4 optimal node count");
		return {version:d.version,engines:arr(d.engines).join(","),n4Nodes:6569};
	});
	await run("strategies",async()=>{
		const {r,j}=await req("/api/strategies");
		assert(r.status===200,`status ${r.status}`);
		const d=data_obj(j);
		const names=arr(d.strategies).map(s=>String(as_obj(s).name));
		for(const s of ["first_remaining","minimax_worst_bucket","expected_size","feedback_count","optimal"])assert(names.includes(s),`missing ${s}`);
		return {count:names.length,engines:arr(d.engines).join(",")};
	});
	await run("errors",async()=>{
		const {r,j}=await req("/api/errors");
		assert(r.status===200,`status ${r.status}`);
		const codes=arr(data_obj(j).errors).map(e=>String(as_obj(e).code));
		assert(codes.includes("NEED_TREE_OR_APPROX"),"missing NEED_TREE_OR_APPROX");
		assert(codes.includes("TOKEN_INVALID"),"missing TOKEN_INVALID");
		return {count:codes.length};
	});
	await run("feedback 2A2B",async()=>{
		const {r,j}=await post("/api/feedback",{n:4,secret:"1234",guess:"1324"});
		assert(r.status===200,`status ${r.status}`);
		const d=data_obj(j);
		assert(d.a===2&&d.b===2&&d.text==="2A2B",`wrong feedback ${JSON.stringify(d)}`);
		return d;
	});
	await run("feedback n6 exact",async()=>{
		const {r,j}=await post("/api/feedback",{n:6,secret:"012345",guess:"543210"});
		assert(r.status===200,`status ${r.status}`);
		const d=data_obj(j);
		assert(d.a===0&&d.b===6&&d.text==="0A6B",`wrong feedback ${JSON.stringify(d)}`);
		return d;
	});
	const expect:Dict<string>={
		first_remaining:"0245",
		minimax_worst_bucket:"0145",
		expected_size:"0145",
		feedback_count:"0245"
	};
	for(const strategy of Object.keys(expect)){
		for(const engine of ["js","wasm"]){
			await run(`solve next ${strategy} ${engine}`,async()=>{
				const {r,j}=await post("/api/solve/next",{
					n:4,
					mode:"dynamic",
					strategy,
					engine,
					history:[{guess:"0123",a:1,b:1}],
					options:{allowFallback:true,exactThreshold:3000,sampleSize:512}
				});
				assert(r.status===200,`status ${r.status}`);
				const d=data_obj(j);
				assert(d.nextGuess===expect[strategy],`next ${d.nextGuess}`);
				assert(d.remaining===720,`remaining ${d.remaining}`);
				return {next:d.nextGuess,remaining:d.remaining,usedEngine:as_obj(d.diagnostics).engine||engine};
			});
		}
	}
	await run("solve tree optimal",async()=>{
		const {r,j}=await post("/api/solve/next",{n:4,mode:"tree",strategy:"optimal",history:[{guess:"0123",a:0,b:3}]});
		assert(r.status===200,`status ${r.status}`);
		const d=data_obj(j);
		assert(d.nextGuess==="1435",`next ${d.nextGuess}`);
		return {next:d.nextGuess,remaining:d.remaining};
	});
	await run("solve tree missing strategy asset",async()=>{
		const {r,j}=await post("/api/solve/next",{n:4,mode:"tree",strategy:"first_remaining",history:[{guess:"0123",a:1,b:1}]});
		return expect_err(r,j,404,"TREE_NOT_FOUND");
	});
	await run("tree history must start first guess",async()=>{
		const {r,j}=await post("/api/solve/next",{n:4,mode:"tree",strategy:"optimal",history:[{guess:"9876",a:0,b:0}]});
		return expect_err(r,j,400,"BAD_REQUEST");
	});
	await run("n5 exact guard",async()=>{
		const {r,j}=await post("/api/solve/next",{
			n:5,
			mode:"dynamic",
			strategy:"expected_size",
			engine:"wasm",
			history:[{guess:"01234",a:1,b:1}],
			options:{allowFallback:false,exactThreshold:1000}
		});
		return expect_err(r,j,400,"NEED_TREE_OR_APPROX");
	});
	await run("n5 sampled fallback wasm",async()=>{
		const {r,j}=await post("/api/solve/next",{
			n:5,
			mode:"dynamic",
			strategy:"expected_size",
			engine:"wasm",
			history:[{guess:"01234",a:1,b:1}],
			options:{allowFallback:true,exactThreshold:1000,sampleSize:128}
		});
		assert(r.status===200,`status ${r.status}`);
		const d=data_obj(j);
		assert(as_obj(d.diagnostics).usedFallback===true,"fallback flag missing");
		assert(typeof d.nextGuess==="string","missing nextGuess");
		return {next:d.nextGuess,remaining:d.remaining};
	});
	await run("n6 solved wasm",async()=>{
		const {r,j}=await post("/api/solve/next",{n:6,mode:"dynamic",strategy:"first_remaining",engine:"wasm",history:[{guess:"012345",a:6,b:0}]});
		assert(r.status===200,`status ${r.status}`);
		const d=data_obj(j);
		assert(d.solved===true&&d.answer==="012345",`wrong solved ${JSON.stringify(d)}`);
		return {answer:d.answer};
	});
	await run("inconsistent history",async()=>{
		const {r,j}=await post("/api/solve/next",{n:3,mode:"dynamic",strategy:"first_remaining",history:[{guess:"012",a:3,b:0},{guess:"345",a:3,b:0}]});
		return expect_err(r,j,400,"INCONSISTENT_HISTORY");
	});
	await run("run tree optimal",async()=>{
		const {r,j}=await post("/api/solve/run-tree",{n:4,secret:"1234",strategy:"optimal",maxSteps:16});
		assert(r.status===200,`status ${r.status}`);
		const d=data_obj(j);
		const path=arr(d.steps).map(s=>String(as_obj(s).guess)).join(",");
		assert(d.solved===true,"not solved");
		assert(path==="0123,1435,1234",`path ${path}`);
		return {attempts:d.attempts,path};
	});
	await run("run dynamic wasm with seed history",async()=>{
		const {r,j}=await post("/api/solve/run-dynamic",{
			n:4,
			secret:"1234",
			strategy:"expected_size",
			engine:"wasm",
			history:[{guess:"0123",a:0,b:3}],
			options:{allowFallback:true,exactThreshold:3000},
			maxSteps:16
		});
		assert(r.status===200,`status ${r.status}`);
		const d=data_obj(j);
		const path=arr(d.steps).map(s=>String(as_obj(s).guess)).join(",");
		assert(d.solved===true,"not solved");
		assert(path==="1435,1234",`path ${path}`);
		return {attempts:d.attempts,path};
	});
	await run("run dynamic invalid history vs secret",async()=>{
		const {r,j}=await post("/api/solve/run-dynamic",{n:4,secret:"1234",strategy:"first_remaining",history:[{guess:"0123",a:1,b:2}],maxSteps:16});
		return expect_err(r,j,400,"INVALID_FEEDBACK");
	});
	let humanTok="";
	await run("human start",async()=>{
		const {r,j}=await post("/api/human/start",{n:4});
		assert(r.status===200,`status ${r.status}`);
		const d=data_obj(j);
		assert(typeof d.sessionToken==="string"&&d.sessionToken.length>50,"bad token");
		humanTok=String(d.sessionToken);
		return {attempts:d.attempts,tokenLen:humanTok.length};
	});
	await run("human guess",async()=>{
		const {r,j}=await post("/api/human/guess",{sessionToken:humanTok,guess:"0123"});
		assert(r.status===200,`status ${r.status}`);
		const d=data_obj(j);
		assert(d.attempts===1,`attempts ${d.attempts}`);
		assert(typeof d.sessionToken==="string","missing rotated token");
		humanTok=String(d.sessionToken);
		return {feedback:d.text,attempts:d.attempts,solved:d.solved};
	});
	await run("human token tamper",async()=>{
		const bad=humanTok.slice(0,-2)+(humanTok.endsWith("aa")?"bb":"aa");
		const {r,j}=await post("/api/human/guess",{sessionToken:bad,guess:"0123"});
		return expect_err(r,j,400,"TOKEN_INVALID");
	});
	let pvpTok="";
	let pvpFirst="";
	await run("pvp start dynamic wasm",async()=>{
		const {r,j}=await post("/api/pvp/start",{n:4,humanSecret:"1234",computerStrategy:"expected_size",computerMode:"dynamic",computerEngine:"wasm"});
		assert(r.status===200,`status ${r.status}`);
		const d=data_obj(j);
		assert(d.firstComputerGuess==="0123",`first ${d.firstComputerGuess}`);
		pvpTok=String(d.sessionToken);
		pvpFirst=String(d.firstComputerGuess);
		return {first:pvpFirst,computerAttempts:d.computerAttempts};
	});
	await run("pvp wrong computer feedback rejected",async()=>{
		const {r,j}=await post("/api/pvp/turn",{sessionToken:pvpTok,humanGuess:"5678",computerFeedback:{a:4,b:0}});
		return expect_err(r,j,400,"INVALID_FEEDBACK");
	});
	await run("pvp turn dynamic wasm",async()=>{
		const {r,j}=await post("/api/pvp/turn",{sessionToken:pvpTok,humanGuess:"5678",computerFeedback:fb("1234",pvpFirst)});
		assert(r.status===200,`status ${r.status}`);
		const d=data_obj(j);
		assert(d.humanAttempts===1&&d.computerAttempts===2,"bad attempts");
		return {humanFeedback:as_obj(d.humanFeedback).text,next:d.nextComputerGuess,winner:d.winner};
	});
	await run("bad duplicate guess",async()=>{
		const {r,j}=await post("/api/feedback",{n:4,secret:"1123",guess:"1324"});
		return expect_err(r,j,400,"INVALID_GUESS");
	});
	await run("malformed json",async()=>{
		const {r,j}=await post_raw("/api/feedback","{");
		return expect_err(r,j,400,"BAD_REQUEST");
	});
	await run("unknown route",async()=>{
		const {r,j}=await req("/api/nope");
		return expect_err(r,j,404,"BAD_REQUEST");
	});
	if(!cfg.noWs){
		await run("websocket solve",ws_solve);
		await run("websocket solve bad input",ws_solve_bad);
		await run("websocket pvp",ws_pvp);
	}
}

async function run(name:string,fn:()=>Promise<Dict>){
	const t0=performance.now();
	try{
		const data=await fn();
		const ms=Math.round(performance.now()-t0);
		const rec={name,ok:true,ms,...data};
		tests.push(rec);
		if(!cfg.json)log(`PASS ${pad(ms)}ms ${name}`);
	}catch(err){
		const ms=Math.round(performance.now()-t0);
		const rec={name,ok:false,ms,error:err instanceof Error?err.message:String(err)};
		tests.push(rec);
		if(!cfg.json)log(`FAIL ${pad(ms)}ms ${name}: ${rec.error}`);
	}
}

async function req(path:string,opt:ReqOpt={}){
	const ctl=new AbortController();
	const tm=setTimeout(()=>ctl.abort(),cfg.timeoutMs);
	try{
		const r=await fetch(new URL(path,cfg.base).toString(),{
			method:opt.method||"GET",
			headers:opt.headers as HeadersInit|undefined,
			body:opt.body,
			signal:ctl.signal
		});
		const ct=r.headers.get("content-type")||"";
		let j:unknown=null;
		let txt="";
		let buf:Uint8Array|null=null;
		if(opt.binary)buf=new Uint8Array(await r.arrayBuffer());
		else if(ct.includes("json"))j=await r.json();
		else txt=await r.text();
		return {r,j,txt,buf,ct};
	}finally{
		clearTimeout(tm);
	}
}

function post(path:string,body:unknown){
	return req(path,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
}

function post_raw(path:string,body:string){
	return req(path,{method:"POST",headers:{"content-type":"application/json"},body});
}

function expect_err(r:Response,j:unknown,status:number,code:string){
	assert(r.status===status,`status ${r.status}`);
	const e=as_obj(as_obj(j).error);
	assert(as_obj(j).ok===false&&e.code===code,`wrong error ${JSON.stringify(j)}`);
	return {code};
}

function data_obj(j:unknown){
	const o=as_obj(j);
	assert(o.ok===true,`not ok ${JSON.stringify(j)}`);
	return as_obj(o.data);
}

function as_obj(v:unknown):Dict{
	if(v&&typeof v==="object")return v as Dict;
	return {};
}

function arr(v:unknown):unknown[]{
	return Array.isArray(v)?v:[];
}

function assert(cond:unknown,msg:string):asserts cond{
	if(!cond)throw new Error(msg);
}

function fb(secret:string,guess:string){
	let a=0,b=0;
	for(let i=0;i<secret.length;i++){
		if(secret[i]===guess[i])a++;
		else if(secret.includes(guess[i]))b++;
	}
	return {a,b};
}

async function ws_solve(){
	const ws=await MiniWs.connect(ws_url("/ws/solve"),cfg.timeoutMs);
	try{
		const p=ws.wait("s1");
		ws.send_json({
			id:"s1",
			type:"next",
			payload:{
				n:4,
				mode:"dynamic",
				strategy:"feedback_count",
				engine:"wasm",
				history:[{guess:"0123",a:1,b:1}],
				options:{allowFallback:true,exactThreshold:3000}
			}
		});
		const msg=await timeout(p,cfg.timeoutMs,"ws solve timeout");
		assert(as_obj(msg).ok===true,`ws solve not ok ${JSON.stringify(msg)}`);
		const d=as_obj(as_obj(msg).data);
		assert(d.nextGuess==="0245",`next ${d.nextGuess}`);
		return {next:d.nextGuess};
	}finally{
		ws.close();
	}
}

async function ws_solve_bad(){
	const ws=await MiniWs.connect(ws_url("/ws/solve"),cfg.timeoutMs);
	try{
		const p=ws.wait("bad");
		ws.send_json({id:"bad",type:"next",payload:{n:9,mode:"dynamic",strategy:"first_remaining",history:[]}});
		const msg=await timeout(p,cfg.timeoutMs,"ws bad timeout");
		assert(as_obj(msg).ok===false,`ws bad unexpectedly ok ${JSON.stringify(msg)}`);
		const e=as_obj(as_obj(msg).error);
		assert(e.code==="INVALID_N",`code ${JSON.stringify(msg)}`);
		return {code:e.code};
	}finally{
		ws.close();
	}
}

async function ws_pvp(){
	const ws=await MiniWs.connect(ws_url("/ws/pvp"),cfg.timeoutMs);
	try{
		const p0=ws.wait("p0");
		ws.send_json({id:"p0",type:"start",payload:{n:3,humanSecret:"012",computerStrategy:"first_remaining",computerMode:"dynamic",computerEngine:"wasm"}});
		const m0=await timeout(p0,cfg.timeoutMs,"ws pvp start timeout");
		assert(as_obj(m0).ok===true,`ws pvp start not ok ${JSON.stringify(m0)}`);
		const first=String(as_obj(as_obj(m0).data).firstComputerGuess);
		const p1=ws.wait("p1");
		ws.send_json({id:"p1",type:"turn",payload:{humanGuess:"345",computerFeedback:fb("012",first)}});
		const m1=await timeout(p1,cfg.timeoutMs,"ws pvp turn timeout");
		assert(as_obj(m1).ok===true,`ws pvp turn not ok ${JSON.stringify(m1)}`);
		const d=as_obj(as_obj(m1).data);
		assert(d.computerSolved===true,"computer not solved");
		return {first,next:d.nextComputerGuess||null,winner:d.winner};
	}finally{
		ws.close();
	}
}

class MiniWs{
	private sock:any;
	private buf:any=Buffer.alloc(0);
	private waiters=new Map<string,(v:unknown)=>void>();
	private closed=false;

	private constructor(sock:any){
		this.sock=sock;
		this.sock.on("data",(chunk:any)=>this.on_data(chunk));
		this.sock.on("error",(err:unknown)=>this.reject_all(err));
		this.sock.on("close",()=>this.reject_all(new Error("websocket closed")));
	}

	static connect(raw:string,timeoutMs:number):Promise<MiniWs>{
		return new Promise((resolve,reject)=>{
			const u=new URL(raw);
			const secure=u.protocol==="wss:";
			const port=Number(u.port||(secure?443:80));
			const host=u.hostname;
			const key=node_crypto.randomBytes(16).toString("base64");
			let hs=Buffer.alloc(0);
			let done=false;
			const finish=(err?:unknown,ws?:MiniWs)=>{
				if(done)return;
				done=true;
				clearTimeout(tm);
				if(err)reject(err);
				else resolve(ws!);
			};
			const tm=setTimeout(()=>finish(new Error("websocket connect timeout")),timeoutMs);
			const sock=(secure?tls:net).connect(secure?{host,port,servername:host}:{host,port},()=>{
				const path=(u.pathname||"/")+u.search;
				sock.write([
					`GET ${path} HTTP/1.1`,
					`Host: ${u.host}`,
					"Upgrade: websocket",
					"Connection: Upgrade",
					`Sec-WebSocket-Key: ${key}`,
					"Sec-WebSocket-Version: 13",
					"",
					""
				].join("\r\n"));
			});
			sock.on("error",(err:unknown)=>finish(err));
			sock.on("data",(chunk:any)=>{
				if(done)return;
				hs=Buffer.concat([hs,chunk]);
				const idx=hs.indexOf("\r\n\r\n");
				if(idx<0)return;
				const head=hs.subarray(0,idx).toString("utf8");
				const rest=hs.subarray(idx+4);
				if(!head.startsWith("HTTP/1.1 101")&&!head.startsWith("HTTP/1.0 101")){
					finish(new Error(`websocket upgrade failed: ${head.split("\r\n")[0]}`));
					return;
				}
				const accept=node_crypto.createHash("sha1").update(key+"258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
				if(!head.toLowerCase().includes(`sec-websocket-accept: ${accept.toLowerCase()}`)){
					finish(new Error("websocket accept mismatch"));
					return;
				}
				sock.removeAllListeners("data");
				const ws=new MiniWs(sock);
				if(rest.length)ws.on_data(rest);
				finish(undefined,ws);
			});
		});
	}

	send_json(v:unknown){
		this.send_text(JSON.stringify(v));
	}

	wait(id:string):Promise<unknown>{
		return new Promise(resolve=>this.waiters.set(id,resolve));
	}

	close(){
		if(this.closed)return;
		this.closed=true;
		try{this.send_frame(8,Buffer.alloc(0));}catch{}
		try{this.sock.end();}catch{}
	}

	private send_text(s:string){
		this.send_frame(1,Buffer.from(s,"utf8"));
	}

	private send_frame(op:number,payload:any){
		const len=payload.length;
		let head:any;
		if(len<126){
			head=Buffer.alloc(2);
			head[1]=0x80|len;
		}else if(len<65536){
			head=Buffer.alloc(4);
			head[1]=0x80|126;
			head.writeUInt16BE(len,2);
		}else{
			head=Buffer.alloc(10);
			head[1]=0x80|127;
			head.writeBigUInt64BE(BigInt(len),2);
		}
		head[0]=0x80|op;
		const mask=node_crypto.randomBytes(4);
		const out=Buffer.alloc(len);
		for(let i=0;i<len;i++)out[i]=payload[i]^mask[i&3];
		this.sock.write(Buffer.concat([head,mask,out]));
	}

	private on_data(chunk:any){
		this.buf=Buffer.concat([this.buf,chunk]);
		for(;;){
			if(this.buf.length<2)return;
			const b0=this.buf[0];
			const b1=this.buf[1];
			const op=b0&15;
			const masked=(b1&128)!==0;
			let len=b1&127;
			let off=2;
			if(len===126){
				if(this.buf.length<4)return;
				len=this.buf.readUInt16BE(2);
				off=4;
			}else if(len===127){
				if(this.buf.length<10)return;
				len=Number(this.buf.readBigUInt64BE(2));
				off=10;
			}
			let mask:any=null;
			if(masked){
				if(this.buf.length<off+4)return;
				mask=this.buf.subarray(off,off+4);
				off+=4;
			}
			if(this.buf.length<off+len)return;
			let payload=this.buf.subarray(off,off+len);
			this.buf=this.buf.subarray(off+len);
			if(masked){
				const out=Buffer.alloc(len);
				for(let i=0;i<len;i++)out[i]=payload[i]^mask[i&3];
				payload=out;
			}
			if(op===1)this.on_text(payload.toString("utf8"));
			else if(op===8){this.close();return;}
			else if(op===9)this.send_frame(10,payload);
		}
	}

	private on_text(s:string){
		let msg:unknown;
		try{msg=JSON.parse(s);}catch{return;}
		const id=as_obj(msg).id;
		if(typeof id!=="string")return;
		const cb=this.waiters.get(id);
		if(!cb)return;
		this.waiters.delete(id);
		cb(msg);
	}

	private reject_all(err:unknown){
		if(this.closed)return;
		this.closed=true;
		for(const [id,cb] of this.waiters){
			this.waiters.delete(id);
			cb({id,ok:false,error:{code:"WS_CLOSED",message:err instanceof Error?err.message:String(err)}});
		}
	}
}

function timeout<T>(p:Promise<T>,ms:number,msg:string):Promise<T>{
	return new Promise((resolve,reject)=>{
		const tm=setTimeout(()=>reject(new Error(msg)),ms);
		p.then(v=>{clearTimeout(tm);resolve(v);},err=>{clearTimeout(tm);reject(err);});
	});
}

function ws_url(path:string){
	const u=new URL(path,cfg.base);
	u.protocol=u.protocol==="https:"?"wss:":"ws:";
	return u.toString();
}

function parse_args(argv:string[]){
	const out:Dict<string>={};
	for(let i=0;i<argv.length;i++){
		const a=argv[i];
		if(a==="--help"||a==="-h")out.help="1";
		else if(a==="--json")out.json="1";
		else if(a==="--no-ws")out.noWs="1";
		else if(a==="--base")out.base=argv[++i];
		else if(a.startsWith("--base="))out.base=a.slice(7);
		else if(a==="--timeout-ms")out.timeoutMs=argv[++i];
		else if(a.startsWith("--timeout-ms="))out.timeoutMs=a.slice(13);
		else if(!out.base)out.base=a;
		else throw new Error(`unknown argument ${a}`);
	}
	return out;
}

function norm_base(s:unknown){
	const raw=String(s||"").trim();
	if(!raw)throw new Error("base url is empty");
	const u=new URL(raw);
	return `${u.protocol}//${u.host}`;
}

function num(s:unknown,def:number){
	const n=Number(s);
	return Number.isFinite(n)&&n>0?n:def;
}

function pad(n:number){
	return String(n).padStart(5," ");
}

function log(s:string){
	process.stdout.write(s+"\n");
}

function usage(){
	log("Usage:");
	log("  pnpm test:api -- https://bulls-cows-api.lzray.cloud");
	log("  BASE_URL=http://localhost:8787 pnpm test:api");
	log("");
	log("Options:");
	log("  --base <url>        API base URL");
	log("  --json              print machine-readable JSON only");
	log("  --no-ws             skip WebSocket tests");
	log("  --timeout-ms <n>    per-request timeout, default 15000");
}

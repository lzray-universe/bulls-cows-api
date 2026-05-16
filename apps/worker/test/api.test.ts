import {describe,it,expect} from "vitest";
import {route} from "../src/router";
import type {Env} from "../src/types";

const manifest={
	version:1,
	format:"bc-assets-v1",
	generatedAt:null,
	ns:{
		n3:{candidateCount:720,feedbackCount:9,files:[]},
		n4:{candidateCount:5040,feedbackCount:14,files:[]},
		n5:{candidateCount:30240,feedbackCount:20,files:[]},
		n6:{candidateCount:151200,feedbackCount:27,files:[]}
	},
	trees:{}
};

const env:Env={
	SESSION_SECRET:"test-secret",
	CORS_ORIGIN:"*",
	ASSETS:{
		fetch:async(req:Request)=>{
			const url=new URL(req.url);
			if (url.pathname.endsWith("/manifest.json")) return Response.json(manifest);
			return new Response("not found",{status:404});
		}
	} as Fetcher
};

function req(path:string,body:unknown) {
	return new Request(`https://x.test${path}`,{
		method:"POST",
		headers:{"content-type":"application/json"},
		body:JSON.stringify(body)
	});
}

describe("api",()=>{
	it("feedback",async()=>{
		const res=await route(req("/api/feedback",{n:4,secret:"1234",guess:"1324"}),env);
		const json=await res.json() as any;
		expect(json.ok).toBe(true);
		expect(json.data).toMatchObject({a:2,b:2,text:"2A2B"});
	});

	it("dynamic first remaining",async()=>{
		const res=await route(req("/api/solve/next",{
			n:4,
			mode:"dynamic",
			strategy:"first_remaining",
			history:[{guess:"0123",a:4,b:0}]
		}),env);
		const json=await res.json() as any;
		expect(json.ok).toBe(true);
		expect(json.data.solved).toBe(true);
		expect(json.data.answer).toBe("0123");
	});

	it("strategies endpoint includes new metrics",async()=>{
		const res=await route(new Request("https://x.test/api/strategies"),env);
		const json=await res.json() as any;
		expect(json.ok).toBe(true);
		expect(json.data.strategies.map((x:any)=>x.name)).toContain("expected_size");
		expect(json.data.strategies.map((x:any)=>x.name)).toContain("feedback_count");
	});

	it("dynamic expected size and feedback count",async()=>{
		const cases=[
			["expected_size","0145"],
			["feedback_count","0245"]
		];
		for (const [strategy,nextGuess] of cases) {
			const res=await route(req("/api/solve/next",{
				n:4,
				mode:"dynamic",
				strategy,
				history:[{guess:"0123",a:1,b:1}],
				options:{exactThreshold:1000}
			}),env);
			const json=await res.json() as any;
			expect(json.ok).toBe(true);
			expect(json.data.nextGuess).toBe(nextGuess);
			expect(json.data.remaining).toBe(720);
		}
	});

	it("bad input",async()=>{
		const res=await route(req("/api/feedback",{n:4,secret:"1123",guess:"1324"}),env);
		const json=await res.json() as any;
		expect(json.ok).toBe(false);
		expect(json.error.code).toBe("INVALID_GUESS");
	});

	it("token start guess",async()=>{
		const start=await route(req("/api/human/start",{n:3}),env);
		const sj=await start.json() as any;
		expect(sj.ok).toBe(true);
		const guess=await route(req("/api/human/guess",{sessionToken:sj.data.sessionToken,guess:"012"}),env);
		const gj=await guess.json() as any;
		expect(gj.ok).toBe(true);
		expect(gj.data.attempts).toBe(1);
		expect(typeof gj.data.text).toBe("string");
	});

	it("pvp basic flow dynamic",async()=>{
		const start=await route(req("/api/pvp/start",{
			n:3,
			humanSecret:"012",
			computerStrategy:"first_remaining",
			computerMode:"dynamic"
		}),env);
		const sj=await start.json() as any;
		const turn=await route(req("/api/pvp/turn",{
			sessionToken:sj.data.sessionToken,
			humanGuess:"345",
			computerFeedback:{a:3,b:0}
		}),env);
		const tj=await turn.json() as any;
		expect(tj.ok).toBe(true);
		expect(tj.data.computerSolved).toBe(true);
	});
});

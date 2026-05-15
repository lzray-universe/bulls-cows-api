import {describe,it,expect} from "vitest";
import {solve_tree} from "../src/treeReader";
import type {Env} from "../src/types";

describe("treeReader",()=>{
	it("reports missing tree",async()=>{
		const env:Env={
			SESSION_SECRET:"x",
			ASSETS:{fetch:async()=>Response.json({version:1,format:"bc-assets-v1",generatedAt:null,ns:{},trees:{}})} as unknown as Fetcher
		};
		await expect(solve_tree(env,4,"first_remaining",[])).rejects.toThrow(/tree asset not found/);
	});
});

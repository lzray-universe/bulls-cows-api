import type {Strategy} from "../types";

export const strategies:Record<Strategy,{id:number;dynamic:boolean;tree:boolean;desc:string}>={
	first_remaining:{id:1,dynamic:true,tree:true,desc:"pick the lowest indexed remaining candidate"},
	minimax_worst_bucket:{id:2,dynamic:true,tree:true,desc:"minimize largest feedback bucket with deterministic tie-breaks"},
	expected_size:{id:3,dynamic:true,tree:true,desc:"Irving 1978: minimize expected remaining set size"},
	feedback_count:{id:4,dynamic:true,tree:true,desc:"Kooi 2005: maximize the number of possible feedback partitions"},
	optimal:{id:100,dynamic:false,tree:true,desc:"precomputed optimal 4-digit decision tree"}
};

export function list_strategies() {
	return Object.entries(strategies).map(([name,v])=>({name,...v}));
}

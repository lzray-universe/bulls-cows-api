declare const Buffer:any;
declare const process:{
	argv:string[];
	env:Record<string,string|undefined>;
	exitCode?:number;
	stdout:{write(s:string):void};
	stderr:{write(s:string):void};
};
declare function require(id:string):any;


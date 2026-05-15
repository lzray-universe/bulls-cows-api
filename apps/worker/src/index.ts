import type {Env} from "./types";
import {route} from "./router";

export default {
	fetch(req:Request,env:Env):Promise<Response> {
		return route(req,env);
	}
};

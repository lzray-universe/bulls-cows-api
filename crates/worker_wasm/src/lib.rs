use wasm_bindgen::prelude::*;
use bc_core::*;

fn err(e:BcError)->JsValue {
	JsValue::from_str(&e.to_string())
}

#[wasm_bindgen]
pub fn validate_guess(n:u8,guess:&str)->Result<bool,JsValue> {
	parse_guess(n,guess).map(|_| true).map_err(err)
}

#[wasm_bindgen]
pub fn feedback(n:u8,secret:&str,guess:&str)->Result<String,JsValue> {
	let s=parse_guess(n,secret).map_err(err)?;
	let g=parse_guess(n,guess).map_err(err)?;
	let fb=bc_core::feedback(n,s,g);
	Ok(serde_json::json!({"a":fb.a,"b":fb.b,"text":feedback_text(fb)}).to_string())
}

#[wasm_bindgen]
pub fn filter_candidates(n:u8,history_json:&str)->Result<String,JsValue> {
	let hist:Vec<HistItem>=serde_json::from_str(history_json).map_err(|e| JsValue::from_str(&e.to_string()))?;
	let rem=bc_core::filter_candidates(n,&hist).map_err(err)?;
	let data:Vec<String>=rem.iter().map(|c| packed_to_string(n,c.packed)).collect();
	Ok(serde_json::json!({"remaining":data.len(),"candidates":data}).to_string())
}

#[wasm_bindgen]
pub fn next_dynamic(n:u8,strategy:&str,history_json:&str,options_json:&str)->Result<String,JsValue> {
	let st=Strategy::parse(strategy).ok_or_else(|| JsValue::from_str("strategy not found"))?;
	let hist:Vec<HistItem>=serde_json::from_str(history_json).map_err(|e| JsValue::from_str(&e.to_string()))?;
	let opt:SolveOptions=serde_json::from_str(options_json).map_err(|e| JsValue::from_str(&e.to_string()))?;
	let res=bc_core::next_dynamic(n,st,&hist,opt).map_err(err)?;
	serde_json::to_string(&res).map_err(|e| JsValue::from_str(&e.to_string()))
}

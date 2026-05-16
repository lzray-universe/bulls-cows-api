use wasm_bindgen::prelude::*;
use bc_core::*;
use std::cell::RefCell;

#[derive(Clone)]
struct FastCand {
	packed:u32,
	mask:u16,
	text:String,
}

struct FastData {
	cands:Vec<FastCand>,
	fb_code:Vec<i16>,
	fb_count:usize,
}

thread_local! {
	static FAST_CACHE:RefCell<Vec<Option<FastData>>>=RefCell::new((0..7).map(|_| None).collect());
}

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

fn fb_table(n:u8)->(Vec<i16>,usize) {
	let mut table=vec![-1i16;((n+1)*(n+1)) as usize];
	let pairs=feedback_pairs(n).unwrap();
	for (i,fb) in pairs.iter().enumerate() {
		table[(fb.a*(n+1)+fb.b) as usize]=i as i16;
	}
	(table,pairs.len())
}

fn fast_data(n:u8)->Result<FastData,BcError> {
	let cands=enumerate(n)?.into_iter().map(|c| FastCand{
		packed:c.packed,
		mask:c.mask,
		text:packed_to_string(n,c.packed),
	}).collect::<Vec<_>>();
	let (fb_code,fb_count)=fb_table(n);
	Ok(FastData{cands,fb_code,fb_count})
}

fn with_fast_data<R>(n:u8,f:impl FnOnce(&FastData)->Result<R,BcError>)->Result<R,BcError> {
	if !valid_n(n) {
		return Err(BcError::InvalidN);
	}
	FAST_CACHE.with(|cache| {
		let mut cache=cache.borrow_mut();
		let idx=n as usize;
		if cache[idx].is_none() {
			cache[idx]=Some(fast_data(n)?);
		}
		f(cache[idx].as_ref().unwrap())
	})
}

fn raw_feedback(n:u8,secret:u32,secret_mask:u16,guess:u32,guess_mask:u16)->(u8,u8) {
	let mut a=0u8;
	for i in 0..n {
		if ((secret>>(i*4))&15)==((guess>>(i*4))&15) {
			a+=1;
		}
	}
	let both=(secret_mask&guess_mask).count_ones() as u8;
	(a,both-a)
}

fn packed_mask(n:u8,packed:u32)->u16 {
	let mut mask=0u16;
	for i in 0..n {
		mask|=1u16<<((packed>>(i*4))&15);
	}
	mask
}

fn checked_packed_mask(n:u8,packed:u32)->Result<u16,BcError> {
	let mut mask=0u16;
	for i in 0..n {
		let d=(packed>>(i*4))&15;
		if d>9 {
			return Err(BcError::InvalidGuess);
		}
		let bit=1u16<<d;
		if mask&bit!=0 {
			return Err(BcError::InvalidGuess);
		}
		mask|=bit;
	}
	if mask.count_ones()!=n as u32 {
		return Err(BcError::InvalidGuess);
	}
	Ok(mask)
}

fn strategy_by_id(id:u8)->Option<Strategy> {
	match id {
		1=>Some(Strategy::FirstRemaining),
		2=>Some(Strategy::MinimaxWorstBucket),
		3=>Some(Strategy::ExpectedSize),
		4=>Some(Strategy::FeedbackCount),
		_=>None,
	}
}

fn solve_fast_core(n:u8,st:Strategy,hs:&[(u32,u16,u8,u8)],exact_threshold:usize,allow_fallback:bool)->Result<String,BcError> {
	with_fast_data(n,|data| {
		let mut rem=Vec::new();
		'cand: for (idx,c) in data.cands.iter().enumerate() {
			for &(gp,gm,a,b) in hs {
				let fb=raw_feedback(n,c.packed,c.mask,gp,gm);
				if fb.0!=a || fb.1!=b {
					continue 'cand;
				}
			}
			rem.push(idx);
		}
		if rem.is_empty() {
			return Err(BcError::InconsistentHistory);
		}
		if rem.len()==1 {
			let idx=rem[0];
			let ans=&data.cands[idx].text;
			return Ok(serde_json::json!({
				"nextGuess":ans,
				"nextGuessIndex":idx,
				"remaining":1,
				"solved":true,
				"answer":ans,
				"diagnostics":{"usedFallback":false,"maxBucket":1,"candidateCount":data.cands.len(),"engine":"wasm"}
			}).to_string());
		}
		if st==Strategy::FirstRemaining {
			let idx=rem[0];
			return Ok(serde_json::json!({
				"nextGuess":data.cands[idx].text,
				"nextGuessIndex":idx,
				"remaining":rem.len(),
				"solved":false,
				"diagnostics":{"usedFallback":false,"maxBucket":0,"candidateCount":data.cands.len(),"engine":"wasm"}
			}).to_string());
		}
		if st!=Strategy::MinimaxWorstBucket && st!=Strategy::ExpectedSize && st!=Strategy::FeedbackCount {
			return Err(BcError::StrategyNotFound);
		}
		if rem.len()>exact_threshold {
			if !allow_fallback {
				return Err(BcError::NeedTreeOrApprox);
			}
			let idx=rem[0];
			return Ok(serde_json::json!({
				"nextGuess":data.cands[idx].text,
				"nextGuessIndex":idx,
				"remaining":rem.len(),
				"solved":false,
				"diagnostics":{"usedFallback":true,"maxBucket":0,"candidateCount":data.cands.len(),"engine":"wasm"}
			}).to_string());
		}
		let mut in_rem=vec![0u8;data.cands.len()];
		for &idx in &rem {
			in_rem[idx]=1;
		}
		let mut buckets=vec![0usize;data.fb_count];
		let mut best_idx=usize::MAX;
		let mut best_max=usize::MAX;
		let mut best_sq=u64::MAX;
		let mut best_parts=0usize;
		let mut best_in=false;
		for (idx,g) in data.cands.iter().enumerate() {
			buckets.fill(0);
			let mut maxb=0usize;
			let mut sq=0u64;
			let mut parts=0usize;
			match st {
				Strategy::MinimaxWorstBucket=>{
					for &si in &rem {
						let s=&data.cands[si];
						let (a,b)=raw_feedback(n,s.packed,s.mask,g.packed,g.mask);
						let code=data.fb_code[(a*(n+1)+b) as usize] as usize;
						let old=buckets[code];
						let next=old+1;
						if next>best_max {
							maxb=next;
							break;
						}
						buckets[code]=next;
						if next>maxb {
							maxb=next;
						}
						sq+=(2*old+1) as u64;
					}
					if maxb>best_max {
						continue;
					}
				}
				Strategy::ExpectedSize=>{
					for &si in &rem {
						let s=&data.cands[si];
						let (a,b)=raw_feedback(n,s.packed,s.mask,g.packed,g.mask);
						let code=data.fb_code[(a*(n+1)+b) as usize] as usize;
						let old=buckets[code];
						let next=old+1;
						buckets[code]=next;
						if next>maxb {
							maxb=next;
						}
						sq+=(2*old+1) as u64;
						if sq>best_sq {
							break;
						}
					}
					if sq>best_sq {
						continue;
					}
				}
				Strategy::FeedbackCount=>{
					for &si in &rem {
						let s=&data.cands[si];
						let (a,b)=raw_feedback(n,s.packed,s.mask,g.packed,g.mask);
						let code=data.fb_code[(a*(n+1)+b) as usize] as usize;
						let old=buckets[code];
						if old==0 {
							parts+=1;
						}
						let next=old+1;
						buckets[code]=next;
						if next>maxb {
							maxb=next;
						}
						sq+=(2*old+1) as u64;
					}
				}
				_=>{}
			}
			let isin=in_rem[idx]!=0;
			let better=match st {
				Strategy::MinimaxWorstBucket=>maxb<best_max ||
					(maxb==best_max && isin && !best_in) ||
					(maxb==best_max && isin==best_in && sq<best_sq) ||
					(maxb==best_max && isin==best_in && sq==best_sq && idx<best_idx),
				Strategy::ExpectedSize=>sq<best_sq ||
					(sq==best_sq && isin && !best_in) ||
					(sq==best_sq && isin==best_in && maxb<best_max) ||
					(sq==best_sq && isin==best_in && maxb==best_max && idx<best_idx),
				Strategy::FeedbackCount=>parts>best_parts ||
					(parts==best_parts && isin && !best_in) ||
					(parts==best_parts && isin==best_in && maxb<best_max) ||
					(parts==best_parts && isin==best_in && maxb==best_max && sq<best_sq) ||
					(parts==best_parts && isin==best_in && maxb==best_max && sq==best_sq && idx<best_idx),
				_=>false,
			};
			if better {
				best_idx=idx;
				best_max=maxb;
				best_sq=sq;
				best_parts=parts;
				best_in=isin;
			}
		}
		Ok(serde_json::json!({
			"nextGuess":data.cands[best_idx].text,
			"nextGuessIndex":best_idx,
			"remaining":rem.len(),
			"solved":false,
			"diagnostics":{"usedFallback":false,"maxBucket":best_max,"candidateCount":data.cands.len(),"engine":"wasm"}
		}).to_string())
	})
}

#[wasm_bindgen]
pub fn next_dynamic_fast(n:u8,strategy:&str,history_json:&str,exact_threshold:usize,allow_fallback:bool)->Result<String,JsValue> {
	let st=Strategy::parse(strategy).ok_or_else(|| JsValue::from_str("strategy not found"))?;
	let hist:Vec<HistItem>=serde_json::from_str(history_json).map_err(|e| JsValue::from_str(&e.to_string()))?;
	let mut hs=Vec::with_capacity(hist.len());
	for h in &hist {
		let gp=parse_guess(n,&h.guess).map_err(err)?;
		if !is_valid_feedback(n,h.a,h.b) {
			return Err(err(BcError::InvalidFeedback));
		}
		let mask=packed_mask(n,gp);
		hs.push((gp,mask,h.a,h.b));
	}
	solve_fast_core(n,st,&hs,exact_threshold,allow_fallback).map_err(err)
}

#[wasm_bindgen]
pub fn next_dynamic_packed(n:u8,strategy_id:u8,guesses:&[u32],as_:&[u8],bs:&[u8],exact_threshold:usize,allow_fallback:bool)->Result<String,JsValue> {
	let st=strategy_by_id(strategy_id).ok_or_else(|| JsValue::from_str("strategy not found"))?;
	if guesses.len()!=as_.len() || guesses.len()!=bs.len() {
		return Err(err(BcError::BadRequest("history arrays length mismatch".into())));
	}
	let mut hs=Vec::with_capacity(guesses.len());
	for i in 0..guesses.len() {
		let a=as_[i];
		let b=bs[i];
		if !is_valid_feedback(n,a,b) {
			return Err(err(BcError::InvalidFeedback));
		}
		let mask=checked_packed_mask(n,guesses[i]).map_err(err)?;
		hs.push((guesses[i],mask,a,b));
	}
	solve_fast_core(n,st,&hs,exact_threshold,allow_fallback).map_err(err)
}

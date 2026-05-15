use crate::{candidate::*,error::BcError,feedback::*,strategy::Strategy};
use serde::{Deserialize,Serialize};

#[derive(Debug,Clone,Serialize,Deserialize)]
pub struct HistItem {
	pub guess:String,
	pub a:u8,
	pub b:u8,
}

#[derive(Debug,Clone,Serialize,Deserialize,Default)]
pub struct SolveOptions {
	#[serde(default="default_exact")]
	pub exact_threshold:usize,
	#[serde(default)]
	pub allow_fallback:bool,
	#[serde(default)]
	pub sample_size:usize,
}

fn default_exact()->usize { 3000 }

#[derive(Debug,Clone,Serialize,Deserialize)]
pub struct SolveDiag {
	pub used_fallback:bool,
	pub max_bucket:Option<usize>,
	pub candidate_count:usize,
}

#[derive(Debug,Clone,Serialize,Deserialize)]
pub struct SolveResult {
	pub next_guess:String,
	pub next_guess_index:usize,
	pub remaining:usize,
	pub solved:bool,
	pub answer:Option<String>,
	pub diagnostics:SolveDiag,
}

pub fn filter_candidates(n:u8,hist:&[HistItem])->Result<Vec<Candidate>,BcError> {
	let cands=enumerate(n)?;
	let mut rem=Vec::new();
	let mut hs=Vec::with_capacity(hist.len());
	for h in hist {
		let gp=parse_guess(n,&h.guess)?;
		if !is_valid_feedback(n,h.a,h.b) {
			return Err(BcError::InvalidFeedback);
		}
		hs.push((gp,Feedback{a:h.a,b:h.b}));
	}
	'cand: for c in cands {
		for &(gp,fb) in &hs {
			if feedback(n,c.packed,gp)!=fb {
				continue 'cand;
			}
		}
		rem.push(c);
	}
	if rem.is_empty() {
		return Err(BcError::InconsistentHistory);
	}
	Ok(rem)
}

fn first_remaining(n:u8,rem:&[Candidate])->Result<(usize,usize),BcError> {
	let all=enumerate(n)?;
	let p=rem[0].packed;
	let idx=find_index(&all,p).ok_or_else(|| BcError::BadRequest("candidate missing".into()))?;
	Ok((idx,0))
}

fn minimax(n:u8,rem:&[Candidate])->Result<(usize,usize),BcError> {
	let all=enumerate(n)?;
	let r=feedback_pairs(n)?.len();
	let mut in_rem=vec![false;all.len()];
	for c in rem {
		let idx=find_index(&all,c.packed).ok_or_else(|| BcError::BadRequest("candidate missing".into()))?;
		in_rem[idx]=true;
	}
	let mut best_idx=usize::MAX;
	let mut best_max=usize::MAX;
	let mut best_sq=u128::MAX;
	let mut best_in=false;
	for (idx,g) in all.iter().enumerate() {
		let mut bucket=vec![0usize;r];
		for s in rem {
			let fb=feedback(n,s.packed,g.packed);
			let code=encode_feedback(n,fb.a,fb.b)? as usize;
			bucket[code]+=1;
		}
		let maxb=*bucket.iter().max().unwrap_or(&0);
		let sq=bucket.iter().map(|&x| (x as u128)*(x as u128)).sum::<u128>();
		let isin=in_rem[idx];
		let better=maxb<best_max ||
			(maxb==best_max && isin && !best_in) ||
			(maxb==best_max && isin==best_in && sq<best_sq) ||
			(maxb==best_max && isin==best_in && sq==best_sq && idx<best_idx);
		if better {
			best_idx=idx;
			best_max=maxb;
			best_sq=sq;
			best_in=isin;
		}
	}
	Ok((best_idx,best_max))
}

pub fn next_dynamic(n:u8,strategy:Strategy,hist:&[HistItem],opt:SolveOptions)->Result<SolveResult,BcError> {
	let rem=filter_candidates(n,hist)?;
	let all=enumerate(n)?;
	if rem.len()==1 {
		let p=rem[0].packed;
		let idx=find_index(&all,p).ok_or_else(|| BcError::BadRequest("candidate missing".into()))?;
		return Ok(SolveResult{
			next_guess:packed_to_string(n,p),
			next_guess_index:idx,
			remaining:1,
			solved:true,
			answer:Some(packed_to_string(n,p)),
			diagnostics:SolveDiag{used_fallback:false,max_bucket:Some(1),candidate_count:all.len()},
		});
	}
	let (idx,maxb,used_fb)=match strategy {
		Strategy::FirstRemaining=>{
			let (idx,mb)=first_remaining(n,&rem)?;
			(idx,mb,false)
		}
		Strategy::MinimaxWorstBucket=>{
			if rem.len()>opt.exact_threshold {
				if opt.allow_fallback {
					let (idx,mb)=first_remaining(n,&rem)?;
					(idx,mb,true)
				}else{
					return Err(BcError::NeedTreeOrApprox);
				}
			}else{
				let (idx,mb)=minimax(n,&rem)?;
				(idx,mb,false)
			}
		}
	};
	let p=all[idx].packed;
	Ok(SolveResult{
		next_guess:packed_to_string(n,p),
		next_guess_index:idx,
		remaining:rem.len(),
		solved:false,
		answer:None,
		diagnostics:SolveDiag{used_fallback:used_fb,max_bucket:Some(maxb),candidate_count:all.len()},
	})
}

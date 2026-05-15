use crate::{candidate::unpack_digits,error::BcError};
use serde::{Deserialize,Serialize};

#[derive(Debug,Clone,Copy,PartialEq,Eq,Serialize,Deserialize)]
pub struct Feedback {
	pub a:u8,
	pub b:u8,
}

pub fn is_valid_feedback(n:u8,a:u8,b:u8)->bool {
	(3..=6).contains(&n) && a<=n && b<=n && a+b<=n && !(a==n-1 && b==1)
}

pub fn feedback_pairs(n:u8)->Result<Vec<Feedback>,BcError> {
	if !(3..=6).contains(&n) {
		return Err(BcError::InvalidN);
	}
	let mut v=Vec::new();
	for a in 0..=n {
		for b in 0..=n-a {
			if is_valid_feedback(n,a,b) {
				v.push(Feedback{a,b});
			}
		}
	}
	Ok(v)
}

pub fn encode_feedback(n:u8,a:u8,b:u8)->Result<u8,BcError> {
	if !is_valid_feedback(n,a,b) {
		return Err(BcError::InvalidFeedback);
	}
	for (i,fb) in feedback_pairs(n)?.iter().enumerate() {
		if fb.a==a && fb.b==b {
			return Ok(i as u8);
		}
	}
	Err(BcError::InvalidFeedback)
}

pub fn decode_feedback(n:u8,code:u8)->Result<Feedback,BcError> {
	let ps=feedback_pairs(n)?;
	ps.get(code as usize).copied().ok_or(BcError::InvalidFeedback)
}

pub fn feedback(n:u8,secret:u32,guess:u32)->Feedback {
	let s=unpack_digits(n,secret);
	let g=unpack_digits(n,guess);
	let mut a=0u8;
	let mut sm=0u16;
	let mut gm=0u16;
	for i in 0..n as usize {
		if s[i]==g[i] {
			a+=1;
		}
		sm|=1u16<<s[i];
		gm|=1u16<<g[i];
	}
	let both=(sm&gm).count_ones() as u8;
	Feedback{a,b:both-a}
}

pub fn feedback_text(fb:Feedback)->String {
	format!("{}A{}B",fb.a,fb.b)
}

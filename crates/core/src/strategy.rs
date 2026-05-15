use serde::{Deserialize,Serialize};

#[derive(Debug,Clone,Copy,PartialEq,Eq,Serialize,Deserialize)]
#[serde(rename_all="snake_case")]
pub enum Strategy {
	FirstRemaining,
	MinimaxWorstBucket,
}

impl Strategy {
	pub fn parse(s:&str)->Option<Self> {
		match s {
			"first_remaining"=>Some(Self::FirstRemaining),
			"minimax_worst_bucket"=>Some(Self::MinimaxWorstBucket),
			_=>None,
		}
	}

	pub fn id(self)->u16 {
		match self {
			Self::FirstRemaining=>1,
			Self::MinimaxWorstBucket=>2,
		}
	}
}

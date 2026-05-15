use std::fmt::{Display,Formatter};

#[derive(Debug,Clone,PartialEq,Eq)]
pub enum BcError {
	InvalidN,
	InvalidGuess,
	InvalidFeedback,
	InconsistentHistory,
	StrategyNotFound,
	NeedTreeOrApprox,
	BadRequest(String),
}

impl Display for BcError {
	fn fmt(&self,f:&mut Formatter<'_>)->std::fmt::Result {
		match self {
			Self::InvalidN=>write!(f,"invalid n"),
			Self::InvalidGuess=>write!(f,"invalid guess"),
			Self::InvalidFeedback=>write!(f,"invalid feedback"),
			Self::InconsistentHistory=>write!(f,"inconsistent history"),
			Self::StrategyNotFound=>write!(f,"strategy not found"),
			Self::NeedTreeOrApprox=>write!(f,"need tree or approximation"),
			Self::BadRequest(s)=>write!(f,"bad request: {s}"),
		}
	}
}

impl std::error::Error for BcError {}

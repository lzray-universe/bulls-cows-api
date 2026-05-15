use bc_core::*;

#[test]
fn feedback_cases() {
	let s=parse_guess(4,"1234").unwrap();
	let g=parse_guess(4,"1324").unwrap();
	assert_eq!(feedback(4,s,g),Feedback{a:2,b:2});
	let g=parse_guess(4,"5678").unwrap();
	assert_eq!(feedback(4,s,g),Feedback{a:0,b:0});
}

#[test]
fn feedback_code_roundtrip() {
	for n in 3..=6 {
		let ps=feedback_pairs(n).unwrap();
		for (i,fb) in ps.iter().enumerate() {
			assert_eq!(encode_feedback(n,fb.a,fb.b).unwrap(),i as u8);
			assert_eq!(decode_feedback(n,i as u8).unwrap(),*fb);
		}
		assert!(!is_valid_feedback(n,n-1,1));
	}
}

#[test]
fn candidate_counts() {
	assert_eq!(enumerate(3).unwrap().len(),720);
	assert_eq!(enumerate(4).unwrap().len(),5040);
	assert_eq!(enumerate(5).unwrap().len(),30240);
	assert_eq!(enumerate(6).unwrap().len(),151200);
}

#[test]
fn history_filtering() {
	let hist=vec![HistItem{guess:"0123".into(),a:4,b:0}];
	let rem=filter_candidates(4,&hist).unwrap();
	assert_eq!(rem.len(),1);
	assert_eq!(packed_to_string(4,rem[0].packed),"0123");
}

#[test]
fn inconsistent_history() {
	let hist=vec![
		HistItem{guess:"0123".into(),a:4,b:0},
		HistItem{guess:"0123".into(),a:3,b:0},
	];
	assert_eq!(filter_candidates(4,&hist).unwrap_err(),BcError::InconsistentHistory);
}

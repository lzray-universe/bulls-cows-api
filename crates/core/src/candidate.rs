use crate::error::BcError;

#[derive(Debug,Clone,Copy,PartialEq,Eq)]
pub struct Candidate {
	pub n:u8,
	pub packed:u32,
	pub mask:u16,
}

pub fn valid_n(n:u8)->bool {
	(3..=6).contains(&n)
}

pub fn pack_digits(ds:&[u8])->u32 {
	let mut x=0u32;
	for (i,&d) in ds.iter().enumerate() {
		x|=(d as u32)<<(i*4);
	}
	x
}

pub fn unpack_digits(n:u8,packed:u32)->Vec<u8> {
	let mut ds=Vec::with_capacity(n as usize);
	for i in 0..n {
		ds.push(((packed>>(i*4))&15) as u8);
	}
	ds
}

pub fn mask_digits(ds:&[u8])->u16 {
	let mut m=0u16;
	for &d in ds {
		m|=1u16<<d;
	}
	m
}

pub fn parse_guess(n:u8,s:&str)->Result<u32,BcError> {
	if !valid_n(n) || s.len()!=n as usize {
		return Err(BcError::InvalidGuess);
	}
	let mut ds=Vec::with_capacity(n as usize);
	let mut m=0u16;
	for b in s.bytes() {
		if !b.is_ascii_digit() {
			return Err(BcError::InvalidGuess);
		}
		let d=b-b'0';
		let bit=1u16<<d;
		if m&bit!=0 {
			return Err(BcError::InvalidGuess);
		}
		m|=bit;
		ds.push(d);
	}
	Ok(pack_digits(&ds))
}

pub fn packed_to_string(n:u8,packed:u32)->String {
	let mut s=String::with_capacity(n as usize);
	for d in unpack_digits(n,packed) {
		s.push(char::from(b'0'+d));
	}
	s
}

fn enum_rec(n:u8,pos:u8,used:u16,buf:&mut [u8],out:&mut Vec<Candidate>) {
	if pos==n {
		out.push(Candidate{n,packed:pack_digits(&buf[..n as usize]),mask:used});
		return;
	}
	for d in 0..10u8 {
		let bit=1u16<<d;
		if used&bit==0 {
			buf[pos as usize]=d;
			enum_rec(n,pos+1,used|bit,buf,out);
		}
	}
}

pub fn enumerate(n:u8)->Result<Vec<Candidate>,BcError> {
	if !valid_n(n) {
		return Err(BcError::InvalidN);
	}
	let mut out=Vec::new();
	let mut buf=[0u8;6];
	enum_rec(n,0,0,&mut buf,&mut out);
	Ok(out)
}

pub fn find_index(cands:&[Candidate],packed:u32)->Option<usize> {
	cands.iter().position(|c| c.packed==packed)
}

pub fn first_guess(n:u8)->Result<u32,BcError> {
	if !valid_n(n) {
		return Err(BcError::InvalidN);
	}
	let ds:Vec<u8>=(0..n).collect();
	Ok(pack_digits(&ds))
}

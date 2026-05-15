#[derive(Debug,Clone,PartialEq,Eq)]
pub struct BitSet {
	words:Vec<u64>,
	len:usize,
}

impl BitSet {
	pub fn new(len:usize)->Self {
		Self{words:vec![0;(len+63)/64],len}
	}

	pub fn full(len:usize)->Self {
		let mut s=Self{words:vec![!0u64;(len+63)/64],len};
		let rem=len&63;
		if rem!=0 {
			let last=s.words.len()-1;
			s.words[last]=(1u64<<rem)-1;
		}
		s
	}

	pub fn set(&mut self,idx:usize,val:bool) {
		let w=idx>>6;
		let b=idx&63;
		if val {
			self.words[w]|=1u64<<b;
		}else{
			self.words[w]&=!(1u64<<b);
		}
	}

	pub fn get(&self,idx:usize)->bool {
		(self.words[idx>>6]>>(idx&63))&1!=0
	}

	pub fn count(&self)->usize {
		self.words.iter().map(|w| w.count_ones() as usize).sum()
	}

	pub fn iter(&self)->impl Iterator<Item=usize>+'_ {
		(0..self.len).filter(|&i| self.get(i))
	}
}

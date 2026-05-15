#pragma once
#include<cstdint>
#include<vector>

class Bitset{
	std::vector<uint64_t> w_;
	size_t len_{};

  public:
	explicit Bitset(size_t len=0) : w_((len+63)/64),len_(len){}
	static Bitset full(size_t len){
		Bitset b(len);
		for(auto&x : b.w_)
			x=~0ull;
		if(len&63)
			b.w_.back()=(1ull<<(len&63))-1;
		return b;
	}
	void set(size_t idx,bool val=true){
		if(val)
			w_[idx>>6]|=1ull<<(idx&63);
		else
			w_[idx>>6]&=~(1ull<<(idx&63));
	}
	bool get(size_t idx) const{ return (w_[idx>>6]>>(idx&63))&1ull; }
	size_t size() const{ return len_; }
	std::vector<size_t> indices() const{
		std::vector<size_t> v;
		for(size_t i=0;i<len_;++i)
			if(get(i))
				v.push_back(i);
		return v;
	}
};

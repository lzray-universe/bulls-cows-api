#pragma once
#include<array>
#include<cstdint>
#include<stdexcept>
#include<string>
#include<vector>

struct Candidate{
	uint8_t n{};
	uint32_t packed{};
	uint16_t mask{};
};

inline bool valid_n(int n){ return n>=3&&n<=6; }

inline uint32_t pack_digits(const std::vector<uint8_t>&ds){
	uint32_t x=0;
	for(size_t i=0;i<ds.size();++i)
		x|=uint32_t(ds[i])<<(i*4);
	return x;
}

inline std::string unpack_digits(int n,uint32_t x){
	std::string s;
	s.reserve(n);
	for(int i=0;i<n;++i)
		s.push_back(char('0'+((x>>(i*4))&15)));
	return s;
}

inline uint32_t parse_guess(int n,const std::string&s){
	if(!valid_n(n)||int(s.size())!=n)
		throw std::runtime_error("invalid guess");
	uint16_t mask=0;
	std::vector<uint8_t> ds;
	for(char ch : s){
		if(ch<'0'||ch>'9')
			throw std::runtime_error("invalid guess");
		uint8_t d=uint8_t(ch-'0');
		uint16_t bit=uint16_t(1u<<d);
		if(mask&bit)
			throw std::runtime_error("invalid guess");
		mask|=bit;
		ds.push_back(d);
	}
	return pack_digits(ds);
}

inline void enum_rec(int n,int pos,uint16_t used,std::array<uint8_t,6>&buf,
					 std::vector<Candidate>&out){
	if(pos==n){
		std::vector<uint8_t> ds(buf.begin(),buf.begin()+n);
		out.push_back(Candidate{uint8_t(n),pack_digits(ds),used});
		return;
	}
	for(uint8_t d=0;d<10;++d){
		uint16_t bit=uint16_t(1u<<d);
		if(!(used&bit)){
			buf[pos]=d;
			enum_rec(n,pos+1,uint16_t(used|bit),buf,out);
		}
	}
}

inline std::vector<Candidate> enumerate_candidates(int n){
	if(!valid_n(n))
		throw std::runtime_error("invalid n");
	std::vector<Candidate> out;
	std::array<uint8_t,6> buf{};
	enum_rec(n,0,0,buf,out);
	return out;
}

inline int candidate_index(const std::vector<Candidate>&cs,uint32_t packed){
	for(size_t i=0;i<cs.size();++i)
		if(cs[i].packed==packed)
			return int(i);
	return -1;
}

inline uint32_t first_guess_packed(int n){
	std::vector<uint8_t> ds;
	for(int i=0;i<n;++i)
		ds.push_back(uint8_t(i));
	return pack_digits(ds);
}

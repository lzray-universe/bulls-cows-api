#pragma once
#include "candidate.hpp"
#include<bit>
#include<cstdint>
#include<stdexcept>
#include<vector>

struct Feedback{
	uint8_t a{};
	uint8_t b{};
	bool operator==(const Feedback&o) const{ return a==o.a&&b==o.b; }
};

inline bool valid_feedback(int n,int a,int b){
	return valid_n(n)&&a>=0&&b>=0&&a<=n&&b<=n&&a+b<=n&&!(a==n-1&&b==1);
}

inline std::vector<Feedback> feedback_pairs(int n){
	if(!valid_n(n))
		throw std::runtime_error("invalid n");
	std::vector<Feedback> v;
	for(int a=0;a<=n;++a)
		for(int b=0;b<=n-a;++b){
			if(valid_feedback(n,a,b))
				v.push_back(Feedback{uint8_t(a),uint8_t(b)});
		}
	return v;
}

inline int encode_feedback(int n,int a,int b){
	if(!valid_feedback(n,a,b))
		throw std::runtime_error("invalid feedback");
	auto ps=feedback_pairs(n);
	for(size_t i=0;i<ps.size();++i)
		if(ps[i].a==a&&ps[i].b==b)
			return int(i);
	throw std::runtime_error("invalid feedback");
}

inline Feedback calc_feedback(int n,uint32_t secret,uint32_t guess){
	uint8_t a=0;
	uint16_t sm=0,gm=0;
	for(int i=0;i<n;++i){
		uint8_t sd=uint8_t((secret>>(i*4))&15);
		uint8_t gd=uint8_t((guess>>(i*4))&15);
		if(sd==gd)
			++a;
		sm|=uint16_t(1u<<sd);
		gm|=uint16_t(1u<<gd);
	}
	uint8_t both=uint8_t(std::popcount(uint16_t(sm&gm)));
	return Feedback{a,uint8_t(both-a)};
}

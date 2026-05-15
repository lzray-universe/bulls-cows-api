#include "candidate.hpp"
#include "feedback.hpp"
#include<cassert>

int main(){
	assert(enumerate_candidates(3).size()==720);
	assert(enumerate_candidates(4).size()==5040);
	assert(enumerate_candidates(5).size()==30240);
	assert(enumerate_candidates(6).size()==151200);
	auto s=parse_guess(4,"1234");
	auto g=parse_guess(4,"1324");
	auto fb=calc_feedback(4,s,g);
	assert(fb.a==2&&fb.b==2);
	assert(!valid_feedback(4,3,1));
	for(int n=3;n<=6;++n){
		auto ps=feedback_pairs(n);
		for(size_t i=0;i<ps.size();++i)
			assert(encode_feedback(n,ps[i].a,ps[i].b)==int(i));
	}
}

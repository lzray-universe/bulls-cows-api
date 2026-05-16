#pragma once
#include "feedback.hpp"
#include "strategy.hpp"
#include "tree_pack.hpp"
#include<algorithm>
#include<atomic>
#include<iostream>
#include<limits>
#include<queue>
#include<thread>
#include<unordered_map>

struct BuildOptions{
	size_t max_nodes=0;
	int threads=std::max(1u,std::thread::hardware_concurrency());
	std::string probe_space="candidates";
	size_t approx_sample=0;
};

struct BuildStats{
	size_t max_depth{};
	double avg_depth{};
};

struct BuildNode{
	std::vector<uint32_t> rem;
	size_t depth{};
};

struct BestGuess{
	uint32_t idx=0;
	size_t max_bucket=std::numeric_limits<size_t>::max();
	unsigned long long sq=std::numeric_limits<unsigned long long>::max();
	size_t parts=0;
	bool in_rem=false;
};

inline bool better_best(const BestGuess&a,const BestGuess&b,Strategy st){
	if(st==Strategy::minimax_worst_bucket){
		if(a.max_bucket!=b.max_bucket)
			return a.max_bucket<b.max_bucket;
		if(a.in_rem!=b.in_rem)
			return a.in_rem&&!b.in_rem;
		if(a.sq!=b.sq)
			return a.sq<b.sq;
		return a.idx<b.idx;
	}
	if(st==Strategy::expected_size){
		if(a.sq!=b.sq)
			return a.sq<b.sq;
		if(a.in_rem!=b.in_rem)
			return a.in_rem&&!b.in_rem;
		if(a.max_bucket!=b.max_bucket)
			return a.max_bucket<b.max_bucket;
		return a.idx<b.idx;
	}
	if(st==Strategy::feedback_count){
		if(a.parts!=b.parts)
			return a.parts>b.parts;
		if(a.in_rem!=b.in_rem)
			return a.in_rem&&!b.in_rem;
		if(a.max_bucket!=b.max_bucket)
			return a.max_bucket<b.max_bucket;
		if(a.sq!=b.sq)
			return a.sq<b.sq;
		return a.idx<b.idx;
	}
	return a.idx<b.idx;
}

inline std::vector<uint32_t> probe_indices(Strategy st,
										   const std::vector<uint32_t>&rem,
										   size_t all_count,
										   const BuildOptions&opt){
	std::vector<uint32_t> v;
	if(st==Strategy::first_remaining){
		v.push_back(*std::min_element(rem.begin(),rem.end()));
		return v;
	}
	if(opt.probe_space=="universe"){
		v.resize(all_count);
		for(size_t i=0;i<all_count;++i)
			v[i]=uint32_t(i);
	}else{
		v=rem;
		std::sort(v.begin(),v.end());
	}
	if(opt.approx_sample&&v.size()>opt.approx_sample){
		std::vector<uint32_t> s;
		s.reserve(opt.approx_sample);
		for(size_t i=0;i<opt.approx_sample;++i)
			s.push_back(v[i*v.size()/opt.approx_sample]);
		v.swap(s);
	}
	return v;
}

inline uint32_t choose_guess(int n,Strategy st,const std::vector<Candidate>&all,
							 const std::vector<uint32_t>&rem,
							 const BuildOptions&opt,size_t&out_max_bucket){
	if(st==Strategy::first_remaining){
		out_max_bucket=0;
		return *std::min_element(rem.begin(),rem.end());
	}
	auto probes=probe_indices(st,rem,all.size(),opt);
	std::vector<char> in_rem(all.size());
	for(uint32_t idx : rem)
		in_rem[idx]=1;
	auto ps=feedback_pairs(n);
	int th=std::max(1,opt.threads);
	std::vector<BestGuess> bests(th);
	auto work=[&](int tid){
		BestGuess best;
		for(size_t pi=tid;pi<probes.size();pi+=th){
			uint32_t gi=probes[pi];
			std::vector<size_t> buckets(ps.size());
			for(uint32_t si : rem){
				auto fb=calc_feedback(n,all[si].packed,all[gi].packed);
				buckets[encode_feedback(n,fb.a,fb.b)]++;
			}
			size_t maxb=0;
			unsigned long long sq=0;
			size_t parts=0;
			for(size_t x : buckets){
				maxb=std::max(maxb,x);
				if(x)
					parts++;
				sq+=static_cast<unsigned long long>(x)*
					static_cast<unsigned long long>(x);
			}
			BestGuess cur{gi,maxb,sq,parts,bool(in_rem[gi])};
			if(better_best(cur,best,st))
				best=cur;
		}
		bests[tid]=best;
	};
	std::vector<std::thread> ts;
	for(int t=0;t<th;++t)
		ts.emplace_back(work,t);
	for(auto&t : ts)
		t.join();
	BestGuess best;
	for(auto&b : bests)
		if(better_best(b,best,st))
			best=b;
	out_max_bucket=best.max_bucket;
	return best.idx;
}

inline PackedTree build_tree(int n,Strategy st,const BuildOptions&opt,
							 BuildStats*stats=nullptr){
	auto all=enumerate_candidates(n);
	auto ps=feedback_pairs(n);
	PackedTree out;
	out.n=n;
	out.strategy=st;
	out.candidate_count=uint32_t(all.size());
	out.feedback_count=uint8_t(ps.size());
	std::queue<uint32_t> q;
	std::vector<BuildNode> work;
	BuildNode root;
	root.rem.resize(all.size());
	for(size_t i=0;i<all.size();++i)
		root.rem[i]=uint32_t(i);
	work.push_back(std::move(root));
	q.push(0);
	size_t term_depth_sum=0,term_count=0,max_depth=0;
	while(!q.empty()){
		uint32_t id=q.front();
		q.pop();
		if(opt.max_nodes&&out.nodes.size()>=opt.max_nodes)
			throw std::runtime_error("max nodes reached");
		auto cur=std::move(work[id]);
		TreeNode node;
		if(cur.rem.size()==1){
			node.terminal=1;
			node.answer_index=cur.rem[0];
			node.guess_index=cur.rem[0];
			node.child_base=uint32_t(out.children.size());
			term_depth_sum+=cur.depth;
			term_count++;
			max_depth=std::max(max_depth,cur.depth);
			out.nodes.push_back(node);
			continue;
		}
		size_t maxb=0;
		if(id==0)
			node.guess_index=
				uint32_t(candidate_index(all,first_guess_packed(n)));
		else
			node.guess_index=choose_guess(n,st,all,cur.rem,opt,maxb);
		node.child_base=uint32_t(out.children.size());
		out.children.resize(out.children.size()+ps.size(),0xffffffffu);
		uint32_t node_pos=uint32_t(out.nodes.size());
		out.nodes.push_back(node);
		std::vector<std::vector<uint32_t>> bucket(ps.size());
		for(uint32_t si : cur.rem){
			auto fb=
				calc_feedback(n,all[si].packed,all[node.guess_index].packed);
			bucket[encode_feedback(n,fb.a,fb.b)].push_back(si);
		}
		for(size_t code=0;code<bucket.size();++code){
			if(bucket[code].empty())
				continue;
			uint32_t child_id=uint32_t(work.size());
			out.children[out.nodes[node_pos].child_base+code]=child_id;
			work.push_back(BuildNode{std::move(bucket[code]),cur.depth+1});
			q.push(child_id);
		}
		if(out.nodes.size()%1000==0){
			std::cerr<<"nodes="<<out.nodes.size()<<" queue="<<q.size()
					 <<" depth="<<cur.depth<<"\n";
		}
	}
	if(stats){
		stats->max_depth=max_depth;
		stats->avg_depth=
			term_count?double(term_depth_sum)/double(term_count):0.0;
	}
	return out;
}

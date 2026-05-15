#include "manifest_writer.hpp"
#include "tree_builder.hpp"
#include "verify.hpp"
#include<chrono>
#include<iostream>
#include<sstream>

struct Args{
	bool all=false;
	bool verify=false;
	bool candidates_only=false;
	int n=0;
	std::string strategies="first_remaining";
	std::filesystem::path out="assets/bc/v1";
	BuildOptions opt;
};

static std::vector<std::string> split(const std::string&s,char sep){
	std::vector<std::string> v;
	std::stringstream ss(s);
	std::string x;
	while(std::getline(ss,x,sep))
		if(!x.empty())
			v.push_back(x);
	return v;
}

static Args parse(int argc,char**argv){
	Args a;
	for(int i=1;i<argc;++i){
		std::string k=argv[i];
		auto need=[&]() -> std::string{
			if(i+1>=argc)
				throw std::runtime_error("missing value for "+k);
			return argv[++i];
		};
		if(k=="--all")
			a.all=true;
		else if(k=="--candidates-only")
			a.candidates_only=true;
		else if(k=="--verify"){
			a.verify=true;
			a.out=need();
		}else if(k=="--n")
			a.n=std::stoi(need());
		else if(k=="--strategy")
			a.strategies=need();
		else if(k=="--strategies")
			a.strategies=need();
		else if(k=="--out")
			a.out=need();
		else if(k=="--threads")
			a.opt.threads=std::stoi(need());
		else if(k=="--max-nodes")
			a.opt.max_nodes=std::stoull(need());
		else if(k=="--probe-space")
			a.opt.probe_space=need();
		else if(k=="--approx-sample")
			a.opt.approx_sample=std::stoull(need());
		else if(k=="--resume"||k=="--checkpoint"||k=="--strategy-params"){
			need();
		}else
			throw std::runtime_error("unknown arg "+k);
	}
	return a;
}

int main(int argc,char**argv){
	try{
		auto args=parse(argc,argv);
		if(args.verify)
			return verify_assets(args.out);
		std::vector<int> ns;
		if(args.all)
			ns={3,4,5,6};
		else if(valid_n(args.n))
			ns={args.n};
		else
			throw std::runtime_error("pass --n 3..6 or --all");
		std::vector<Strategy> sts;
		for(auto&s : split(args.strategies,','))
			sts.push_back(parse_strategy(s));
		for(int n : ns)
			write_candidates(args.out/("n"+std::to_string(n)),n,
							 enumerate_candidates(n));
		if(args.candidates_only){
			std::vector<PackedTree> empty_trees;
			std::vector<std::vector<std::string>> empty_parts;
			std::vector<uint64_t> empty_hashes;
			write_manifest(args.out,empty_trees,empty_parts,empty_hashes);
			return 0;
		}
		std::vector<PackedTree> trees;
		std::vector<std::vector<std::string>> parts;
		std::vector<uint64_t> hashes;
		for(int n : ns){
			for(auto st : sts){
				auto start=std::chrono::steady_clock::now();
				std::cerr<<"build n="<<n<<" strategy="<<strategy_name(st)<<"\n";
				BuildStats stats;
				auto tree=build_tree(n,st,args.opt,&stats);
				auto bytes=pack_tree(tree);
				auto hash=fnv1a64(bytes);
				auto dir=args.out/("n"+std::to_string(n));
				auto base="tree."+strategy_name(st);
				auto fs=write_sliced(dir,base,bytes);
				auto dt=std::chrono::duration<double>(
							std::chrono::steady_clock::now()-start)
							.count();
				std::cerr<<"done nodes="<<tree.nodes.size()
						 <<" max_depth="<<stats.max_depth
						 <<" avg_depth="<<stats.avg_depth
						 <<" bytes="<<bytes.size()<<" hash="<<hex64(hash)
						 <<" sec="<<dt<<"\n";
				trees.push_back(std::move(tree));
				parts.push_back(std::move(fs));
				hashes.push_back(hash);
			}
		}
		write_manifest(args.out,trees,parts,hashes);
		return 0;
	}catch(const std::exception&e){
		std::cerr<<"error: "<<e.what()<<"\n";
		return 1;
	}
}

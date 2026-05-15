#pragma once
#include "tree_pack.hpp"
#include<filesystem>
#include<fstream>
#include<sstream>

inline std::string hex64(uint64_t x){
	const char*dig="0123456789abcdef";
	std::string s(16,'0');
	for(int i=15;i>=0;--i){
		s[i]=dig[x&15];
		x>>=4;
	}
	return s;
}

inline void write_candidates(const std::filesystem::path&dir,int n,
							 const std::vector<Candidate>&cs){
	std::filesystem::create_directories(dir);
	std::ofstream f(dir/"candidates.bin",std::ios::binary);
	for(auto&c : cs){
		uint32_t x=c.packed;
		for(int i=0;i<4;++i)
			f.put(char((x>>(i*8))&255));
	}
}

inline void write_manifest(const std::filesystem::path&root,
						   const std::vector<PackedTree>&trees,
						   const std::vector<std::vector<std::string>>&parts,
						   const std::vector<uint64_t>&hashes){
	std::filesystem::create_directories(root);
	std::ofstream f(root/"manifest.json");
	f<<"{\n\t\"version\":1,\n\t\"format\":\"bc-assets-v1\",\n\t\"generatedAt\":"
	   "null,\n\t\"ns\":{\n";
	for(int n=3;n<=6;++n){
		auto cs=enumerate_candidates(n);
		auto ps=feedback_pairs(n);
		f<<"\t\t\"n"<<n<<"\":{\"candidateCount\":"<<cs.size()
		 <<",\"feedbackCount\":"<<ps.size()<<",\"files\":[\"assets/bc/v1/n"<<n
		 <<"/candidates.bin\"]}";
		f<<(n==6?"\n":",\n");
	}
	f<<"\t},\n\t\"trees\":{\n";
	for(size_t i=0;i<trees.size();++i){
		auto&t=trees[i];
		f<<"\t\t\"n"<<t.n<<":"<<strategy_name(t.strategy)<<"\":{\"n\":"<<t.n
		 <<",\"strategy\":\""<<strategy_name(t.strategy)
		 <<"\",\"nodeCount\":"<<t.nodes.size()<<",\"hash\":\""<<hex64(hashes[i])
		 <<"\",\"parts\":[";
		for(size_t j=0;j<parts[i].size();++j){
			auto p=
				std::filesystem::relative(
					parts[i][j],root.parent_path().parent_path().parent_path())
					.generic_string();
			f<<"\""<<p<<"\""<<(j+1==parts[i].size()?"":",");
		}
		f<<"]}";
		f<<(i+1==trees.size()?"\n":",\n");
	}
	f<<"\t}\n}\n";
}

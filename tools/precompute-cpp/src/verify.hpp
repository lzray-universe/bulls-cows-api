#pragma once
#include "tree_pack.hpp"
#include<filesystem>
#include<fstream>
#include<iostream>

inline std::vector<uint8_t> read_file(const std::filesystem::path&p){
	std::ifstream f(p,std::ios::binary);
	if(!f)
		throw std::runtime_error("cannot open "+p.string());
	return std::vector<uint8_t>((std::istreambuf_iterator<char>(f)),
								std::istreambuf_iterator<char>());
}

inline int verify_assets(const std::filesystem::path&root){
	if(!std::filesystem::exists(root/"manifest.json"))
		throw std::runtime_error("manifest missing");
	for(int n=3;n<=6;++n){
		auto p=root/("n"+std::to_string(n))/"candidates.bin";
		if(!std::filesystem::exists(p)){
			std::cerr<<"warn: missing "<<p<<"\n";
			continue;
		}
		auto sz=std::filesystem::file_size(p);
		auto exp=enumerate_candidates(n).size()*4;
		if(sz!=exp)
			throw std::runtime_error("candidate size mismatch "+p.string());
	}
	return 0;
}

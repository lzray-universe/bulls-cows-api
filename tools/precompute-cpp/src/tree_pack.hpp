#pragma once
#include "feedback.hpp"
#include "strategy.hpp"
#include<cstdint>
#include<filesystem>
#include<fstream>
#include<stdexcept>
#include<string>
#include<vector>

struct TreeNode{
	uint32_t guess_index{};
	uint32_t child_base{};
	uint8_t terminal{};
	uint32_t answer_index{};
};

struct PackedTree{
	int n{};
	Strategy strategy{};
	uint32_t candidate_count{};
	uint8_t feedback_count{};
	std::vector<TreeNode> nodes;
	std::vector<uint32_t> children;
};

inline void put_u16(std::vector<uint8_t>&b,size_t p,uint16_t x){
	b[p]=uint8_t(x&255);
	b[p+1]=uint8_t(x>>8);
}

inline void put_u32(std::vector<uint8_t>&b,size_t p,uint32_t x){
	for(int i=0;i<4;++i)
		b[p+i]=uint8_t((x>>(i*8))&255);
}

inline uint32_t get_u32(const std::vector<uint8_t>&b,size_t p){
	uint32_t x=0;
	for(int i=0;i<4;++i)
		x|=uint32_t(b[p+i])<<(i*8);
	return x;
}

inline std::vector<uint8_t> pack_tree(const PackedTree&t){
	const size_t rec=13;
	const size_t hdr=64;
	std::vector<uint8_t> b(hdr+t.nodes.size()*rec+t.children.size()*4);
	b[0]='B';
	b[1]='C';
	b[2]='S';
	b[3]='T';
	put_u16(b,4,1);
	b[6]=uint8_t(t.n);
	put_u16(b,8,uint16_t(t.strategy));
	put_u32(b,10,uint32_t(t.nodes.size()));
	put_u32(b,14,t.candidate_count);
	b[18]=t.feedback_count;
	for(size_t i=0;i<t.nodes.size();++i){
		size_t p=hdr+i*rec;
		put_u32(b,p,t.nodes[i].guess_index);
		put_u32(b,p+4,t.nodes[i].child_base);
		b[p+8]=t.nodes[i].terminal;
		put_u32(b,p+9,t.nodes[i].answer_index);
	}
	size_t base=hdr+t.nodes.size()*rec;
	for(size_t i=0;i<t.children.size();++i)
		put_u32(b,base+i*4,t.children[i]);
	return b;
}

inline PackedTree unpack_tree(const std::vector<uint8_t>&b){
	if(b.size()<64||b[0]!='B'||b[1]!='C'||b[2]!='S'||b[3]!='T')
		throw std::runtime_error("bad magic");
	PackedTree t;
	t.n=b[6];
	t.strategy=Strategy(uint16_t(b[8])|(uint16_t(b[9])<<8));
	uint32_t nodes=get_u32(b,10);
	t.candidate_count=get_u32(b,14);
	t.feedback_count=b[18];
	const size_t rec=13,hdr=64;
	t.nodes.resize(nodes);
	for(size_t i=0;i<nodes;++i){
		size_t p=hdr+i*rec;
		t.nodes[i].guess_index=get_u32(b,p);
		t.nodes[i].child_base=get_u32(b,p+4);
		t.nodes[i].terminal=b[p+8];
		t.nodes[i].answer_index=get_u32(b,p+9);
	}
	size_t child_bytes=b.size()-(hdr+nodes*rec);
	t.children.resize(child_bytes/4);
	size_t base=hdr+nodes*rec;
	for(size_t i=0;i<t.children.size();++i)
		t.children[i]=get_u32(b,base+i*4);
	return t;
}

inline uint64_t fnv1a64(const std::vector<uint8_t>&b){
	uint64_t h=1469598103934665603ull;
	for(uint8_t x : b){
		h^=x;
		h*=1099511628211ull;
	}
	return h;
}

inline std::vector<std::string>
write_sliced(const std::filesystem::path&dir,const std::string&base,
			 const std::vector<uint8_t>&b,
			 size_t max_part=25ull*1024ull*1024ull){
	std::filesystem::create_directories(dir);
	std::vector<std::string> files;
	for(size_t off=0,part=0;off<b.size();off+=max_part,++part){
		size_t len=std::min(max_part,b.size()-off);
		char name[64];
		snprintf(name,sizeof(name),"%s.part%03zu.bin",base.c_str(),part);
		auto path=dir/name;
		std::ofstream f(path,std::ios::binary);
		f.write(reinterpret_cast<const char*>(b.data()+off),
				std::streamsize(len));
		files.push_back(path.generic_string());
	}
	return files;
}

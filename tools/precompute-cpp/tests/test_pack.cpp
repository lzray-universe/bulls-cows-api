#include "tree_pack.hpp"
#include<cassert>

int main(){
	PackedTree t;
	t.n=4;
	t.strategy=Strategy::first_remaining;
	t.candidate_count=5040;
	t.feedback_count=14;
	t.nodes.push_back(TreeNode{0,0,0,0});
	t.nodes.push_back(TreeNode{1,14,1,1});
	t.children.resize(14,0xffffffffu);
	t.children[0]=1;
	auto b=pack_tree(t);
	auto u=unpack_tree(b);
	assert(u.n==4);
	assert(u.nodes.size()==2);
	assert(u.children[0]==1);
	assert(u.nodes[1].terminal==1);
}

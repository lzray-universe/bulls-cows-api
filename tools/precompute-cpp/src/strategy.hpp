#pragma once
#include<cstdint>
#include<stdexcept>
#include<string>

enum class Strategy : uint16_t{
	first_remaining=1,
	minimax_worst_bucket=2,
};

inline Strategy parse_strategy(const std::string&s){
	if(s=="first_remaining")
		return Strategy::first_remaining;
	if(s=="minimax_worst_bucket")
		return Strategy::minimax_worst_bucket;
	throw std::runtime_error("unknown strategy");
}

inline std::string strategy_name(Strategy s){
	switch(s){
	case Strategy::first_remaining:
		return "first_remaining";
	case Strategy::minimax_worst_bucket:
		return "minimax_worst_bucket";
	}
	return "unknown";
}

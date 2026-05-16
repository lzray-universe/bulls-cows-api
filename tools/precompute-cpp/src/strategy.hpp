#pragma once
#include<cstdint>
#include<stdexcept>
#include<string>

enum class Strategy : uint16_t{
	first_remaining=1,
	minimax_worst_bucket=2,
	expected_size=3,
	feedback_count=4,
};

inline Strategy parse_strategy(const std::string&s){
	if(s=="first_remaining")
		return Strategy::first_remaining;
	if(s=="minimax_worst_bucket")
		return Strategy::minimax_worst_bucket;
	if(s=="expected_size")
		return Strategy::expected_size;
	if(s=="feedback_count")
		return Strategy::feedback_count;
	throw std::runtime_error("unknown strategy");
}

inline std::string strategy_name(Strategy s){
	switch(s){
	case Strategy::first_remaining:
		return "first_remaining";
	case Strategy::minimax_worst_bucket:
		return "minimax_worst_bucket";
	case Strategy::expected_size:
		return "expected_size";
	case Strategy::feedback_count:
		return "feedback_count";
	}
	return "unknown";
}

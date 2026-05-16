/* tslint:disable */
/* eslint-disable */

export function feedback(n: number, secret: string, guess: string): string;

export function filter_candidates(n: number, history_json: string): string;

export function next_dynamic(n: number, strategy: string, history_json: string, options_json: string): string;

export function next_dynamic_fast(n: number, strategy: string, history_json: string, exact_threshold: number, allow_fallback: boolean): string;

export function next_dynamic_packed(n: number, strategy_id: number, guesses: Uint32Array, as_: Uint8Array, bs: Uint8Array, exact_threshold: number, allow_fallback: boolean): string;

export function validate_guess(n: number, guess: string): boolean;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly feedback: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly filter_candidates: (a: number, b: number, c: number) => [number, number, number, number];
    readonly next_dynamic: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number, number, number];
    readonly next_dynamic_fast: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number, number, number];
    readonly next_dynamic_packed: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => [number, number, number, number];
    readonly validate_guess: (a: number, b: number, c: number) => [number, number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;

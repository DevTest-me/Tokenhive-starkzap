/**
 * Token Hive — StarkZap Browser Helpers
 * 
 * Loaded in index.html BEFORE app.js. Provides Amount formatting and
 * address utilities powered by the StarkZap SDK (browser ESM build).
 *
 * StarkZap docs: https://docs.starknet.io/build/starkzap
 *
 * Why StarkZap here?
 *   - Amount.parse / toFormatted  → safe decimal-aware math (no float errors)
 *   - fromAddress / isValidAddress → normalises Starknet felt addresses
 *   - mainnetTokens / sepoliaTokens → canonical token metadata without manual JSON
 */

//  StarkZap ESM import (loaded via importmap or bundler) 
// In production (bundled): imported by the build tool.
// For CDN / vanilla HTML: add to index.html before this script:
//   <script type="importmap">
//     { "imports": { "starkzap": "https://esm.sh/starkzap@latest" } }
//   </script>
//   <script type="module" src="starkzap-browser.js"></script>

import {
  Amount,
  fromAddress,
  isValidAddress,
  mainnetTokens,
  sepoliaTokens,
} from 'starkzap';

//  Amount helpers 

/**
 * Format a raw on-chain amount to a readable string.
 * Replaces the raw hex math previously scattered across app.js.
 *
 * @param {bigint|string|number} rawAmount
 * @param {number}               decimals   - token decimal places (default 18)
 * @param {string}               [symbol]   - optional ticker to append
 * @returns {string}  e.g. "1.500000 STRK"
 *
 * @example
 *   formatAmount('1000000000000000000', 18, 'STRK') // → "1.000000 STRK"
 */
export function formatAmount(rawAmount, decimals = 18, symbol = '') {
  try {
    const a = Amount.fromRaw(BigInt(rawAmount), { decimals });
    const s = a.toFormatted();
    return symbol ? `${s} ${symbol}` : s;
  } catch {
    // Graceful fallback — should never be reached with valid inputs
    const value = (Number(rawAmount) / 10 ** decimals).toFixed(6);
    return symbol ? `${value} ${symbol}` : value;
  }
}

/**
 * Parse a human-readable amount to a raw BigInt.
 * Used before passing values to wallet_addInvokeTransaction calldata.
 *
 * @param {string} human      - e.g. "1.5"
 * @param {number} decimals
 * @returns {bigint}
 *
 * @example
 *   parseAmount('1.5', 18) // → 1500000000000000000n
 */
export function parseAmount(human, decimals = 18) {
  try {
    return Amount.parse(human, { decimals }).raw;
  } catch {
    return BigInt(Math.round(parseFloat(human) * 10 ** decimals));
  }
}

/**
 * Compare two amounts safely.
 * @param {bigint} a
 * @param {bigint} b
 * @returns {'gt'|'lt'|'eq'}
 */
export function compareAmounts(a, b) {
  if (a > b) return 'gt';
  if (a < b) return 'lt';
  return 'eq';
}

//  Address helpers 

/**
 * Validate and normalise a Starknet address using StarkZap's fromAddress.
 * Replaces the manual regex check in registry.js.
 *
 * @param {string} raw
 * @returns {{ valid: boolean, normalised: string|null }}
 *
 * @example
 *   normaliseAddress('0x049d36...')
 *   // → { valid: true, normalised: '0x049d36...' }
 */
export function normaliseAddress(raw) {
  try {
    if (!isValidAddress(raw)) return { valid: false, normalised: null };
    const addr = fromAddress(raw);
    return { valid: true, normalised: addr.toString() };
  } catch {
    return { valid: false, normalised: null };
  }
}

//  Token preset lookup 

/**
 * Look up a token from StarkZap's canonical preset list.
 * Returns null if the token isn't in the preset registry.
 *
 * @param {string} symbol   - e.g. 'STRK', 'ETH', 'USDC'
 * @param {string} network  - 'mainnet' | 'testnet'
 * @returns {object|null}   - StarkZap token object with address, decimals, etc.
 *
 * @example
 *   getPresetToken('STRK', 'mainnet')
 *   // → { symbol: 'STRK', decimals: 18, address: '0x04718…', … }
 */
export function getPresetToken(symbol, network = 'mainnet') {
  try {
    const presets = network === 'mainnet' ? mainnetTokens : sepoliaTokens;
    return presets[symbol.toUpperCase()] ?? null;
  } catch {
    return null;
  }
}

/**
 * Get the canonical contract address for a well-known token symbol.
 * Useful for pre-populating the registry's seed tokens.
 *
 * @param {string} symbol
 * @param {string} network
 * @returns {string|null}
 */
export function getPresetTokenAddress(symbol, network = 'mainnet') {
  const token = getPresetToken(symbol, network);
  return token ? token.address.toString() : null;
}

//  Verification fee display 

/**
 * Compute the STRK verification fee given a USD price.
 * Uses Amount to avoid floating-point drift.
 *
 * @param {number} strkUsdPrice
 * @returns {string}  e.g. "0.3750"
 */
export function computeFeeStrk(strkUsdPrice) {
  if (!strkUsdPrice || strkUsdPrice <= 0) return '—';
  try {
    const raw = (0.75 / strkUsdPrice).toFixed(8);
    return Amount.parse(raw, { decimals: 18 }).toFormatted(4);
  } catch {
    return (0.75 / strkUsdPrice).toFixed(4);
  }
}

//  Expose on window for app.js (vanilla JS compat) 
window.StarkZapHelpers = {
  formatAmount,
  parseAmount,
  compareAmounts,
  normaliseAddress,
  getPresetToken,
  getPresetTokenAddress,
  computeFeeStrk,
};

console.log('🐝 StarkZap browser helpers ready — window.StarkZapHelpers');

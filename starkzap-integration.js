/**
 * Token Hive — StarkZap SDK Integration
 * 
 * This module wraps StarkZap's wallet + token primitives for use on the
 * server side (Node.js). It is imported by api/server.js to:
 *   1. Resolve on-chain token metadata via StarkZap's ERC20 helpers
 *   2. Format/parse token amounts using StarkZap's Amount type
 *   3. Check STRK balance of the treasury wallet
 *
 * StarkZap docs: https://docs.starknet.io/build/starkzap
 */

import { StarkZap, StarkSigner, Amount, fromAddress } from 'starkzap';

//  SDK instances (one per network) 
let _sdkMainnet = null;
let _sdkSepolia = null;

function getSdk(network) {
  if (network === 'mainnet') {
    if (!_sdkMainnet) {
      _sdkMainnet = new StarkZap({
        network: 'mainnet',
        // Optionally supply a custom RPC:
        // rpcUrl: process.env.STARKNET_MAINNET_RPC,
      });
    }
    return _sdkMainnet;
  } else {
    if (!_sdkSepolia) {
      _sdkSepolia = new StarkZap({ network: 'sepolia' });
    }
    return _sdkSepolia;
  }
}

//  Treasury wallet (read-only, used for balance checks) 
let _treasuryWallet = null;

async function getTreasuryWallet() {
  if (_treasuryWallet) return _treasuryWallet;

  const privateKey = process.env.TREASURY_PRIVATE_KEY;
  const address    = process.env.TREASURY_WALLET;

  if (!privateKey || !address) {
    // No treasury key configured — skip balance operations
    return null;
  }

  try {
    const sdk    = getSdk('mainnet');
    const signer = new StarkSigner(privateKey);
    _treasuryWallet = await sdk.connectWallet({ account: { signer } });
    return _treasuryWallet;
  } catch (err) {
    console.warn('[StarkZap] Treasury wallet init failed:', err.message);
    return null;
  }
}

//  Token metadata resolution 
/**
 * Resolve on-chain ERC20 metadata (name, symbol, decimals) for a given
 * contract address using StarkZap's built-in token helpers.
 *
 * Falls back gracefully if StarkZap cannot reach the contract.
 *
 * @param {string} address  - Starknet contract address (0x…)
 * @param {string} network  - 'mainnet' | 'testnet'
 * @returns {{ name: string, symbol: string, decimals: number, found: boolean }}
 */
export async function resolveTokenMetadata(address, network) {
  try {
    const sdk = getSdk(network === 'mainnet' ? 'mainnet' : 'sepolia');

    // StarkZap exposes getTokenMetadata() on the SDK — it handles both
    // felt252-encoded names (OZ ≤ v0.14) and ByteArray names (OZ v0.20+).
    const meta = await sdk.getTokenMetadata(fromAddress(address));

    return {
      name:     meta.name     || 'Unknown Token',
      symbol:   meta.symbol   || '???',
      decimals: meta.decimals ?? 18,
      found:    true,
    };
  } catch (err) {
    console.warn(`[StarkZap] resolveTokenMetadata failed for ${address}:`, err.message);
    return { name: 'Unknown Token', symbol: '???', decimals: 18, found: false };
  }
}

//  Amount formatting helpers 
/**
 * Parse a human-readable amount string ("1.5") into a raw BigInt
 * using StarkZap's Amount.parse — respects token decimals correctly.
 *
 * @param {string} humanAmount  - e.g. "1.5"
 * @param {number} decimals     - token decimal places
 * @returns {bigint}
 */
export function parseTokenAmount(humanAmount, decimals = 18) {
  try {
    // Amount.parse expects a token-like object with { decimals }
    const parsed = Amount.parse(humanAmount, { decimals });
    return parsed.raw;
  } catch {
    // Fallback: manual shift
    return BigInt(Math.round(parseFloat(humanAmount) * 10 ** decimals));
  }
}

/**
 * Format a raw on-chain amount (BigInt or string) into a human-readable
 * string using StarkZap's Amount helpers.
 *
 * @param {bigint|string} rawAmount
 * @param {number}        decimals
 * @param {string}        symbol   - e.g. "STRK"
 * @returns {string}               - e.g. "1.5 STRK"
 */
export function formatTokenAmount(rawAmount, decimals = 18, symbol = '') {
  try {
    const amount = Amount.fromRaw(BigInt(rawAmount), { decimals });
    const formatted = amount.toFormatted();      // "1.500000"
    return symbol ? `${formatted} ${symbol}` : formatted;
  } catch {
    // Fallback
    const divisor = 10 ** decimals;
    const value   = (Number(rawAmount) / divisor).toFixed(6);
    return symbol ? `${value} ${symbol}` : value;
  }
}

//  Treasury STRK balance 
/**
 * Fetch the STRK balance of the treasury wallet using StarkZap's
 * wallet.balanceOf() — returns a formatted string or null if unavailable.
 *
 * @returns {Promise<string|null>}  e.g. "42.50 STRK"
 */
export async function getTreasuryStrkBalance() {
  try {
    const wallet = await getTreasuryWallet();
    if (!wallet) return null;

    // StarkZap mainnet token preset for STRK
    const { mainnetTokens } = await import('starkzap');
    const STRK = mainnetTokens.STRK;

    const balance = await wallet.balanceOf(STRK);
    return balance.toFormatted() + ' STRK';
  } catch (err) {
    console.warn('[StarkZap] getTreasuryStrkBalance failed:', err.message);
    return null;
  }
}

//  Verification fee computation 
/**
 * Compute how many STRK tokens equal $0.75 USD given a live price.
 * Uses StarkZap's Amount to produce a precise, decimal-safe result.
 *
 * @param {number} strkUsdPrice  - current STRK/USD price
 * @returns {string}             - e.g. "0.3750"
 */
export function computeVerificationFeeStrk(strkUsdPrice) {
  if (!strkUsdPrice || strkUsdPrice <= 0) return null;
  try {
    const feeUsd  = 0.75;
    const rawStrk = feeUsd / strkUsdPrice;
    // Use Amount to normalise to 4 dp
    const amount  = Amount.parse(rawStrk.toFixed(8), { decimals: 18 });
    return amount.toFormatted(4);   // "0.3750"
  } catch {
    return (0.75 / strkUsdPrice).toFixed(4);
  }
}

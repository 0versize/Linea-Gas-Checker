#!/usr/bin/env node
/**
 * Simple Linea gas checker (no external deps)
 *
 * Usage:
 *   RPC_URL=https://rpc.linea.build node index.js
 *   or
 *   node index.js --rpc https://rpc.linea.build --interval 10
 *
 * The script calls:
 *  - eth_getBlockByNumber latest
 *  - eth_feeHistory (if supported)
 *
 * Outputs baseFee, suggested priority fee and suggested maxFee (in Gwei).
 */

import process from 'process';
import { argv } from 'process';

const DEFAULT_RPC = process.env.RPC_URL || ''; // leave empty by default

function parseArgs() {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if ((a === '--rpc' || a === '-r') && argv[i + 1]) {
      args.rpc = argv[++i];
    } else if ((a === '--interval' || a === '-i') && argv[i + 1]) {
      args.interval = Number(argv[++i]);
    } else if (a === '--help' || a === '-h') {
      args.help = true;
    }
  }
  return args;
}

function hexToBigInt(hex) {
  if (!hex) return 0n;
  return BigInt(hex);
}

function formatGwei(weiBigInt) {
  // Return string with up to 2 decimals
  const G = 10n ** 9n;
  const integer = weiBigInt / G;
  const remainder = weiBigInt % G;
  const decimals = Number((remainder * 100n) / G); // two decimals
  return `${integer.toString()}.${decimals.toString().padStart(2, '0')} gwei`;
}

async function rpcCall(rpc, method, params = []) {
  const body = {
    jsonrpc: '2.0',
    id: 1,
    method,
    params,
  };
  const res = await fetch(rpc, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`RPC call failed: ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  if (json.error) {
    throw new Error(`RPC error: ${JSON.stringify(json.error)}`);
  }
  return json.result;
}

function median(arr) {
  if (!arr.length) return 0n;
  const sorted = [...arr].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  // average of two middle values (integer)
  return (sorted[mid - 1] + sorted[mid]) / 2n;
}

async function getFeeEstimates(rpc) {
  // Get latest block
  const block = await rpcCall(rpc, 'eth_getBlockByNumber', ['latest', false]);

  const baseFeeHex = block?.baseFeePerGas || block?.baseFee; // some nodes
  const baseFee = hexToBigInt(baseFeeHex);

  // Try eth_feeHistory for priority fee estimates
  let suggestedPriorityFee = 0n;
  try {
    // use last 20 blocks; rewardPercentiles empty -> returns full reward arrays per block
    const blockCount = 20;
    const feeHistory = await rpcCall(rpc, 'eth_feeHistory', [
      '0x' + blockCount.toString(16),
      'latest',
      [],
    ]);
    // feeHistory.reward is array of arrays of hex strings (per block)
    const rewards = [];
    if (feeHistory && Array.isArray(feeHistory.reward)) {
      for (const rArr of feeHistory.reward) {
        if (Array.isArray(rArr)) {
          for (const rHex of rArr) {
            if (rHex != null) {
              rewards.push(hexToBigInt(rHex));
            }
          }
        }
      }
    }
    if (rewards.length > 0) {
      // take median reward across all returned rewards
      const med = median(rewards);
      // apply safety multiplier (e.g., 1.25)
      suggestedPriorityFee = (med * 125n) / 100n;
    }
  } catch (e) {
    // eth_feeHistory not supported or failed; fallback to eth_gasPrice / heuristics
    // fallback: assume priority fee of 1.5 gwei
    const fallbackGwei = 1.5;
    suggestedPriorityFee = BigInt(Math.round(fallbackGwei * 1e9));
  }

  // Ensure minimal priority fee of 1.0 gwei
  const minPriority = 1n * 10n ** 9n;
  if (suggestedPriorityFee < minPriority) suggestedPriorityFee = minPriority;

  // Suggested maxFeePerGas: baseFee * 2 + priority
  // (common heuristic to tolerate baseFee increase up to 2x)
  const maxFee = baseFee * 2n + suggestedPriorityFee;

  return {
    baseFee,
    suggestedPriorityFee,
    suggestedMaxFee: maxFee,
    blockNumber: block?.number || null,
    gasLimit: block?.gasLimit || null,
    gasUsed: block?.gasUsed || null,
  };
}

async function main() {
  const args = parseArgs();
  if (args.help) {
    console.log('Usage: node index.js --rpc <RPC_URL> [--interval seconds]');
    console.log('You can also set RPC_URL environment variable.');
    process.exit(0);
  }

  const rpc = args.rpc || process.env.RPC_URL || DEFAULT_RPC;
  if (!rpc) {
    console.error('RPC URL is required. Provide it via --rpc or RPC_URL env var.');
    console.error('Example: RPC_URL=https://rpc.linea.build node index.js');
    process.exit(1);
  }

  const interval = args.interval && Number.isFinite(args.interval) && args.interval > 0 ? args.interval : null;

  async function doCheck() {
    try {
      const e = await getFeeEstimates(rpc);
      console.log('--- Linea gas check ---');
      console.log(`RPC: ${rpc}`);
      if (e.blockNumber) console.log(`Block: ${e.blockNumber}`);
      if (e.baseFee != null) console.log(`Base fee: ${formatGwei(e.baseFee)}`);
      console.log(`Suggested priority fee (tip): ${formatGwei(e.suggestedPriorityFee)}`);
      console.log(`Suggested maxFeePerGas: ${formatGwei(e.suggestedMaxFee)}`);
      console.log('');
    } catch (err) {
      console.error('Error while fetching gas info:', err.message || err);
    }
  }

  await doCheck();
  if (interval) {
    console.log(`Entering monitor mode: polling every ${interval}s`);
    setInterval(doCheck, interval * 1000);
  }
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});

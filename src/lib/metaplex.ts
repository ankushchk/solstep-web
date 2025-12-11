"use client";

import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { mplTokenMetadata } from "@metaplex-foundation/mpl-token-metadata";
import { mplBubblegum } from "@metaplex-foundation/mpl-bubblegum";
import { Connection } from "@solana/web3.js";
import type { WalletContextState } from "@solana/wallet-adapter-react";
import { signerIdentity } from "@metaplex-foundation/umi";
import { fromWeb3JsPublicKey } from "@metaplex-foundation/umi-web3js-adapters";
import type { Signer, Umi, Transaction } from "@metaplex-foundation/umi";
import { toWeb3JsTransaction } from "@metaplex-foundation/umi-web3js-adapters";

/**
 * Create a custom signer that uses wallet adapter
 * This signer bridges UMI transactions to wallet adapter's transaction signing
 */
function createWalletAdapterSigner(
  wallet: WalletContextState,
  connection: Connection
): Signer {
  if (!wallet.publicKey) {
    throw new Error("Wallet not connected");
  }

  const publicKey = fromWeb3JsPublicKey(wallet.publicKey);

  return {
    publicKey,
    signMessage: async (message: Uint8Array) => {
      if (!wallet.signMessage) {
        throw new Error("Wallet does not support message signing");
      }
      const signature = await wallet.signMessage(message);
      return new Uint8Array(signature);
    },
    signTransaction: async (transaction: Transaction) => {
      if (!wallet.signTransaction) {
        throw new Error("Wallet does not support transaction signing");
      }
      // Convert UMI transaction to Web3.js transaction
      const web3jsTx = toWeb3JsTransaction(transaction);
      // Sign with wallet adapter
      const signed = await wallet.signTransaction(web3jsTx);
      // The signed transaction is already in Web3.js format
      // UMI will handle the conversion internally when sending
      return transaction as any;
    },
    signAllTransactions: async (transactions: Transaction[]) => {
      if (!wallet.signAllTransactions) {
        throw new Error("Wallet does not support signing multiple transactions");
      }
      const web3jsTxs = transactions.map(toWeb3JsTransaction);
      const signed = await wallet.signAllTransactions(web3jsTxs);
      return transactions as any;
    },
  };
}

/**
 * Create UMI instance with wallet adapter integration
 * This bridges the wallet adapter with UMI for Metaplex operations
 */
export function createUmiInstance(
  connection: Connection,
  wallet: WalletContextState
): Umi {
  if (!wallet.publicKey || !wallet.signTransaction || !wallet.signAllTransactions) {
    throw new Error("Wallet not connected or missing required methods");
  }

  // Create UMI instance with RPC endpoint
  const umi = createUmi(connection.rpcEndpoint);

  // Create custom signer from wallet adapter
  const signer = createWalletAdapterSigner(wallet, connection);

  // Set the signer identity
  umi.use(signerIdentity(signer));

  // Add token metadata plugin
  umi.use(mplTokenMetadata());

  // Add Bubblegum plugin for compressed NFTs
  umi.use(mplBubblegum());

  return umi;
}

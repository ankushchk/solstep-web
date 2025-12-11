"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";

/**
 * Custom hook to abstract wallet adapter functionality from your app.
 */
export function useSolana() {
  const { connection } = useConnection();
  const wallet = useWallet();

  return {
    connection,
    wallet,
    publicKey: wallet.publicKey,
    connected: wallet.connected,
    connecting: wallet.connecting,
    disconnecting: wallet.disconnecting,
    disconnect: wallet.disconnect,
    sendTransaction: wallet.sendTransaction,
  };
}

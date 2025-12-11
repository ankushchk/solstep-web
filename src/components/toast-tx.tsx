"use client";

import toast from "react-hot-toast";

/**
 * Shows a toast notification with a transaction signature
 * Includes a link to view the transaction on Solana Explorer
 * 
 * @param signature - Transaction signature
 * @param title - Toast title (default: "Transaction confirmed!")
 * @param cluster - Solana cluster (default: "devnet")
 */
export function toastTx(
  signature: string,
  title: string = "Transaction confirmed!",
  cluster: string = "devnet"
) {
  const explorerUrl = `https://explorer.solana.com/tx/${signature}?cluster=${cluster}`;

  toast.success(
    (t) => (
      <div className="flex flex-col gap-1">
        <p className="font-medium">{title}</p>
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-emerald-400 hover:text-emerald-300 underline text-sm"
          onClick={() => toast.dismiss(t.id)}
        >
          View on Explorer →
        </a>
      </div>
    ),
    {
      duration: 6000,
      id: `tx-${signature.slice(0, 8)}`,
    }
  );
}


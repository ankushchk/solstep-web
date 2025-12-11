"use client";

import { ExternalLink } from "lucide-react";
import type { Avatar } from "@/utils/types";
import { getIPFSGatewayUrl } from "@/services/ipfsUpload";

interface NFTCardProps {
  avatar: Avatar;
  mintAddress: string;
}

export function NFTCard({ avatar, mintAddress }: NFTCardProps) {
  const imageUrl = avatar.imageDataUrl || "";
  const solscanUrl = `https://solscan.io/token/${mintAddress}?cluster=devnet`;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 overflow-hidden hover:border-purple-500/50 transition-all group">
      {/* Image */}
      <div className="aspect-square relative overflow-hidden bg-slate-800">
        <img
          src={imageUrl}
          alt={avatar.checkpointName}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />
        <div className="absolute top-2 right-2">
          <span className="px-2 py-1 rounded-full bg-purple-500/90 text-white text-[0.65rem] font-semibold">
            NFT
          </span>
        </div>
      </div>

      {/* Info */}
      <div className="p-3 space-y-2">
        <div>
          <p className="text-xs font-semibold text-slate-50 line-clamp-1">
            {avatar.checkpointName}
          </p>
          <p className="text-[0.65rem] text-slate-400 mt-0.5">
            {new Date(avatar.collectedAt).toLocaleDateString()}
          </p>
        </div>

        {/* Mint Address */}
        <div className="flex items-center gap-2">
          <p className="text-[0.65rem] font-mono text-slate-400 truncate flex-1">
            {mintAddress.slice(0, 8)}...{mintAddress.slice(-6)}
          </p>
          <a
            href={solscanUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-purple-400 hover:text-purple-300 transition-colors"
            title="View on Solscan"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        {/* Location */}
        <div className="flex items-center gap-1 text-[0.65rem] text-slate-500">
          <span>📍</span>
          <span>
            {avatar.location.lat.toFixed(4)}, {avatar.location.lng.toFixed(4)}
          </span>
        </div>
      </div>
    </div>
  );
}


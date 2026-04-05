"use client";

import { useState, useCallback } from "react";
import {
  createWalletClient,
  createPublicClient,
  http,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { localAnvil } from "@/lib/arc/market-client";
import { ANVIL_ACCOUNTS, LOCAL_CONTRACT_ADDRESS, LOCAL_USDC_ADDRESS, shortAddr } from "@/lib/arc/anvil";
import { Wallet, CheckCircle2, LogOut } from "lucide-react";

export interface LocalWalletState {
  walletClient: WalletClient;
  publicClient: PublicClient;
  address: string;
  accountIndex: number;
  contractAddress: string;
  usdcAddress: string;
}

interface LocalWalletConnectProps {
  onConnect: (state: LocalWalletState) => void;
  onDisconnect?: () => void;
  className?: string;
}

export function LocalWalletConnect({ onConnect, onDisconnect, className }: LocalWalletConnectProps) {
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [connected, setConnected] = useState(false);

  const handleConnect = useCallback(() => {
    try {
      const account = ANVIL_ACCOUNTS[selectedIndex];
      const pk = privateKeyToAccount(account.privateKey);
      const walletClient = createWalletClient({
        account: pk,
        chain: localAnvil,
        transport: http(),
      });
      const publicClient = createPublicClient({
        chain: localAnvil,
        transport: http(),
      });

      setConnected(true);
      onConnect({
        walletClient,
        publicClient,
        address: account.address,
        accountIndex: selectedIndex,
        contractAddress: LOCAL_CONTRACT_ADDRESS,
        usdcAddress: LOCAL_USDC_ADDRESS,
      });
    } catch (err) {
      console.error("[LocalWalletConnect] handleConnect error:", err);
    }
  }, [selectedIndex, onConnect]);

  const handleDisconnect = useCallback(() => {
    setConnected(false);
    onDisconnect?.();
  }, [onDisconnect]);

  if (connected) {
    const account = ANVIL_ACCOUNTS[selectedIndex];
    return (
      <div
        className={`flex items-center gap-3 rounded-lg border border-[#26A69A]/40 bg-[#26A69A]/10 px-4 py-2.5 ${className ?? ""}`}
      >
        <CheckCircle2 className="h-4 w-4 shrink-0 text-[#26A69A]" />
        <div className="min-w-0">
          <p className="text-xs text-[#B0BEC5]">{account.label}</p>
          <p className="text-sm font-mono text-[#E1F5FE]">{shortAddr(account.address)}</p>
        </div>
        <button
          onClick={handleDisconnect}
          className="ml-auto shrink-0 rounded p-1 text-[#B0BEC5] hover:bg-[#1A3C50] hover:text-[#EF5350] transition-colors"
          title="Disconnect"
        >
          <LogOut className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      <select
        value={selectedIndex}
        onChange={(e) => setSelectedIndex(Number(e.target.value))}
        className="rounded-lg border border-[#1A3C50] bg-[#0E1B27] px-3 py-2.5 text-sm text-[#E1F5FE]"
      >
        {ANVIL_ACCOUNTS.map((acct) => (
          <option key={acct.index} value={acct.index}>
            #{acct.index} {acct.label} ({shortAddr(acct.address)})
          </option>
        ))}
      </select>
      <button
        onClick={handleConnect}
        className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors"
        style={{ backgroundColor: "#00A8B5", color: "#081216" }}
      >
        <Wallet className="h-4 w-4" />
        Connect
      </button>
    </div>
  );
}

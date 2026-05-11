'use client'

import { useState, useEffect, useCallback } from 'react'
import { engine } from '@/lib/engine-api'
import { getUsdcBalance, transferUsdc, type PrivyEmbeddedWallet } from '@/lib/polygon-wallet'

interface FundVaultDialogProps {
  vaultId: string
  isOpen: boolean
  onClose: () => void
  wallet?: PrivyEmbeddedWallet | null
}

export function FundVaultDialog({ vaultId, isOpen, onClose, wallet }: FundVaultDialogProps) {
  const [agentAddress, setAgentAddress] = useState<string | null>(null)
  const [balance, setBalance] = useState<string | null>(null)
  const [depositAmount, setDepositAmount] = useState('')
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [withdrawRecipient, setWithdrawRecipient] = useState(wallet?.address ?? '')
  const [loading, setLoading] = useState(false)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    try {
      const address = await engine.getAgentAddress(vaultId)
      setAgentAddress(address)
      const { balance: bal } = await engine.getOnChainBalance(vaultId)
      setBalance(bal)
    } catch {
      // Vault may not have a keypair yet
    }
  }, [vaultId])

  useEffect(() => {
    if (isOpen) {
      loadData()
      setTxHash(null)
      setError(null)
    }
  }, [isOpen, loadData])

  if (!isOpen) return null

  const handleDeposit = async () => {
    if (!wallet || !agentAddress || !depositAmount) return
    setLoading(true)
    setError(null)
    try {
      const hash = await transferUsdc(wallet, agentAddress, depositAmount)
      setTxHash(hash)
      setDepositAmount('')
      await loadData()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Deposit failed')
    } finally {
      setLoading(false)
    }
  }

  const handleWithdraw = async () => {
    if (!withdrawAmount || !withdrawRecipient) return
    setLoading(true)
    setError(null)
    try {
      const { tx_hash } = await engine.requestWithdrawal(vaultId, withdrawRecipient, withdrawAmount)
      setTxHash(tx_hash)
      setWithdrawAmount('')
      await loadData()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Withdrawal failed')
    } finally {
      setLoading(false)
    }
  }

  const copyAddress = () => {
    if (agentAddress) navigator.clipboard.writeText(agentAddress)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-[#1A3C50] bg-[#0E1B27] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-heading text-lg text-[#E1F5FE]">Fund Vault</h2>
          <button onClick={onClose} className="text-[#B0BEC5] hover:text-[#E1F5FE]">✕</button>
        </div>

        {/* Agent Address */}
        {agentAddress && (
          <div className="mb-4 rounded-lg bg-[#081216] p-3">
            <div className="mb-1 text-xs text-[#B0BEC5]">Agent Address (deposit target)</div>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate text-sm text-[#4DD0E1]">{agentAddress}</code>
              <button
                onClick={copyAddress}
                className="rounded px-2 py-1 text-xs text-[#B0BEC5] hover:bg-[#1A3C50] hover:text-[#E1F5FE]"
              >
                Copy
              </button>
            </div>
          </div>
        )}

        {/* Balance */}
        {balance !== null && (
          <div className="mb-4 rounded-lg bg-[#081216] p-3">
            <div className="text-xs text-[#B0BEC5]">On-chain USDC Balance</div>
            <div className="text-xl font-bold text-[#26A69A]">{balance} USDC</div>
          </div>
        )}

        {/* Deposit */}
        {wallet && agentAddress && (
          <div className="mb-4">
            <label className="mb-1 block text-sm text-[#B0BEC5]">Deposit USDC (from your wallet)</label>
            <div className="flex gap-2">
              <input
                type="number"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                placeholder="0.00"
                className="flex-1 rounded-lg border border-[#1A3C50] bg-[#081216] px-3 py-2 text-sm text-[#E1F5FE] placeholder-[#B0BEC5]/50"
              />
              <button
                onClick={handleDeposit}
                disabled={loading || !depositAmount}
                className="rounded-lg bg-[#00A8B5] px-4 py-2 text-sm font-medium text-white hover:bg-[#008C97] disabled:opacity-50"
              >
                Deposit
              </button>
            </div>
          </div>
        )}

        {/* Withdraw */}
        <div className="mb-4">
          <label className="mb-1 block text-sm text-[#B0BEC5]">Withdraw USDC (agent → your wallet)</label>
          <div className="flex gap-2">
            <input
              type="number"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              placeholder="0.00"
              className="w-24 rounded-lg border border-[#1A3C50] bg-[#081216] px-3 py-2 text-sm text-[#E1F5FE] placeholder-[#B0BEC5]/50"
            />
            <input
              type="text"
              value={withdrawRecipient}
              onChange={(e) => setWithdrawRecipient(e.target.value)}
              placeholder="0x..."
              className="flex-1 rounded-lg border border-[#1A3C50] bg-[#081216] px-3 py-2 text-sm text-[#E1F5FE] placeholder-[#B0BEC5]/50"
            />
            <button
              onClick={handleWithdraw}
              disabled={loading || !withdrawAmount || !withdrawRecipient}
              className="rounded-lg bg-[#FF8F00] px-4 py-2 text-sm font-medium text-white hover:bg-[#E65100] disabled:opacity-50"
            >
              Withdraw
            </button>
          </div>
        </div>

        {/* Status */}
        {txHash && (
          <div className="mb-2 rounded-lg bg-[#081216] p-3 text-sm">
            <span className="text-[#26A69A]">Tx:</span>{' '}
            <code className="text-[#4DD0E1]">{txHash.slice(0, 10)}...{txHash.slice(-8)}</code>
          </div>
        )}
        {error && (
          <div className="rounded-lg bg-[#EF5350]/10 p-3 text-sm text-[#EF5350]">{error}</div>
        )}

        {loading && (
          <div className="mt-2 text-center text-sm text-[#B0BEC5]">Processing transaction...</div>
        )}
      </div>
    </div>
  )
}

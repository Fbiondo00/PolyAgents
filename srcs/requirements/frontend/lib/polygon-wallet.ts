import { createWalletClient, createPublicClient, custom, http, formatUnits, parseUnits } from 'viem'
import { polygon } from 'viem/chains'

const USDC_POLYGON = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359' as const
const USDC_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const

export interface PrivyEmbeddedWallet {
  address: string
  getEthereumProvider: () => Promise<unknown>
}

export function getPublicClient() {
  return createPublicClient({
    chain: polygon,
    transport: http(),
  })
}

export async function getWalletClient(privyWallet: PrivyEmbeddedWallet) {
  const provider = await privyWallet.getEthereumProvider()
  return createWalletClient({
    account: privyWallet.address as `0x${string}`,
    chain: polygon,
    transport: custom(provider as any),
  })
}

export async function getUsdcBalance(address: string): Promise<string> {
  const client = getPublicClient()
  const balance = await client.readContract({
    address: USDC_POLYGON,
    abi: USDC_ABI,
    functionName: 'balanceOf',
    args: [address as `0x${string}`],
  })
  return formatUnits(balance as bigint, 6)
}

export async function transferUsdc(
  privyWallet: PrivyEmbeddedWallet,
  to: string,
  amountUsdc: string,
): Promise<string> {
  const walletClient = await getWalletClient(privyWallet)
  const amount = parseUnits(amountUsdc, 6)

  const hash = await walletClient.writeContract({
    address: USDC_POLYGON,
    abi: USDC_ABI,
    functionName: 'transfer',
    args: [to as `0x${string}`, amount],
    account: privyWallet.address as `0x${string}`,
    chain: polygon,
  })

  return hash
}

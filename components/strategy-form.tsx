'use client'

import { useState } from 'react'
import { Vault } from '@/lib/types'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

type Strategy = Vault['strategy']

interface StrategyFormProps {
  value: Strategy
  onChange: (s: Strategy) => void
  className?: string
}

export function StrategyForm({ value, onChange, className }: StrategyFormProps) {
  function update(key: keyof Strategy, val: number | boolean) {
    onChange({ ...value, [key]: val })
  }

  return (
    <div className={cn('space-y-6', className)}>
      {/* Prices */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-xs text-[#B0BEC5]">Bid Price (USDC)</Label>
          <Input
            type="number"
            step="0.001"
            min="0.001"
            max="0.5"
            value={value.bidPrice}
            onChange={e => update('bidPrice', parseFloat(e.target.value) || 0.01)}
            className="bg-[#081216] border-[#1A3C50] text-[#E1F5FE] font-mono"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs text-[#B0BEC5]">Sell Price (USDC)</Label>
          <Input
            type="number"
            step="0.001"
            min="0.001"
            max="0.999"
            value={value.sellPrice}
            onChange={e => update('sellPrice', parseFloat(e.target.value) || 0.02)}
            className="bg-[#081216] border-[#1A3C50] text-[#E1F5FE] font-mono"
          />
        </div>
      </div>

      {/* Max Capital */}
      <div className="space-y-3">
        <div className="flex justify-between">
          <Label className="text-xs text-[#B0BEC5]">Max Capital</Label>
          <span className="text-xs font-mono text-[#00A8B5]">${value.maxCapital}</span>
        </div>
        <Slider
          min={10}
          max={1000}
          step={10}
          value={[value.maxCapital]}
          onValueChange={([v]) => update('maxCapital', v)}
          className="[&_[role=slider]]:bg-[#00A8B5] [&_[role=slider]]:border-[#00A8B5]"
        />
      </div>

      {/* Tranche Size */}
      <div className="space-y-3">
        <div className="flex justify-between">
          <Label className="text-xs text-[#B0BEC5]">Tranche Size (shares)</Label>
          <span className="text-xs font-mono text-[#00A8B5]">{value.trancheSize}</span>
        </div>
        <Slider
          min={1}
          max={100}
          step={1}
          value={[value.trancheSize]}
          onValueChange={([v]) => update('trancheSize', v)}
          className="[&_[role=slider]]:bg-[#00A8B5] [&_[role=slider]]:border-[#00A8B5]"
        />
      </div>

      {/* No New Entries */}
      <div className="space-y-3">
        <div className="flex justify-between">
          <Label className="text-xs text-[#B0BEC5]">No New Entries Last (sec)</Label>
          <span className="text-xs font-mono text-[#00A8B5]">{value.noNewEntriesLast}s</span>
        </div>
        <Slider
          min={5}
          max={120}
          step={5}
          value={[value.noNewEntriesLast]}
          onValueChange={([v]) => update('noNewEntriesLast', v)}
          className="[&_[role=slider]]:bg-[#00A8B5] [&_[role=slider]]:border-[#00A8B5]"
        />
      </div>

      {/* Keep Sells After */}
      <div className="space-y-3">
        <div className="flex justify-between">
          <Label className="text-xs text-[#B0BEC5]">Keep Sells After (sec)</Label>
          <span className="text-xs font-mono text-[#00A8B5]">{value.keepSellAfter}s</span>
        </div>
        <Slider
          min={1}
          max={60}
          step={1}
          value={[value.keepSellAfter]}
          onValueChange={([v]) => update('keepSellAfter', v)}
          className="[&_[role=slider]]:bg-[#00A8B5] [&_[role=slider]]:border-[#00A8B5]"
        />
      </div>

      {/* AI Toggle */}
      <div className="flex items-center justify-between rounded-lg border border-[#1A3C50] bg-[#081216] p-4">
        <div>
          <p className="text-sm font-medium text-[#E1F5FE]">AI Analysis</p>
          <p className="text-xs text-[#B0BEC5]">Let the AI agent guide entry decisions</p>
        </div>
        <Switch
          checked={value.aiEnabled}
          onCheckedChange={v => update('aiEnabled', v)}
          className="data-[state=checked]:bg-[#00A8B5]"
        />
      </div>
    </div>
  )
}

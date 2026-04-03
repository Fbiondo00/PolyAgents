'use client'

import { LineChart, Line, ResponsiveContainer, Tooltip, YAxis } from 'recharts'

interface PnLSparklineProps {
  data: number[]
  height?: number
  showTooltip?: boolean
}

export function PnLSparkline({ data, height = 60, showTooltip = false }: PnLSparklineProps) {
  const chartData = data.map((value, i) => ({ i, value }))
  const isPositive = data.length > 1 ? data[data.length - 1] >= data[0] : true

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartData}>
        <YAxis domain={['auto', 'auto']} hide />
        {showTooltip && (
          <Tooltip
            contentStyle={{
              background: '#0E1B27',
              border: '1px solid #1A3C50',
              borderRadius: '6px',
              fontSize: '11px',
              color: '#E1F5FE',
            }}
            formatter={(v: number) => [`${v.toFixed(4)} USDC`, 'PnL']}
            labelFormatter={() => ''}
          />
        )}
        <Line
          type="monotone"
          dataKey="value"
          stroke={isPositive ? '#26A69A' : '#EF5350'}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 3, fill: isPositive ? '#26A69A' : '#EF5350' }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

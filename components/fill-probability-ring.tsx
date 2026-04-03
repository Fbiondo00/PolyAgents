'use client'

import { RadialBarChart, RadialBar, ResponsiveContainer } from 'recharts'

interface FillProbabilityRingProps {
  probability: number // 0–1
  label?: string
}

export function FillProbabilityRing({ probability, label = 'Fill Probability' }: FillProbabilityRingProps) {
  const pct = Math.round(probability * 100)
  const color = pct >= 70 ? '#26A69A' : pct >= 40 ? '#FF8F00' : '#EF5350'

  const data = [
    { value: pct, fill: color },
    { value: 100 - pct, fill: '#1A3C50' },
  ]

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative h-28 w-28">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            cx="50%"
            cy="50%"
            innerRadius="70%"
            outerRadius="100%"
            data={data}
            startAngle={90}
            endAngle={-270}
            barSize={10}
          >
            <RadialBar dataKey="value" cornerRadius={5} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-mono font-bold" style={{ color }}>{pct}%</span>
        </div>
      </div>
      <p className="text-xs text-[#B0BEC5]">{label}</p>
    </div>
  )
}

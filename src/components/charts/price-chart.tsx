'use client';

import { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts';
import { format } from 'date-fns';

interface PricePoint {
  date: string | Date;
  price: number;
  volume?: number;
}

interface PriceChartProps {
  data: PricePoint[];
  type?: 'line' | 'area';
  height?: number;
  showGrid?: boolean;
  showVolume?: boolean;
  color?: string;
}

export function PriceChart({
  data,
  type = 'area',
  height = 300,
  showGrid = true,
  color = '#2563eb',
}: PriceChartProps) {
  const formattedData = useMemo(() => {
    return data.map((point) => ({
      ...point,
      date: typeof point.date === 'string' ? point.date : format(point.date, 'MMM dd'),
      formattedPrice: `$${point.price.toFixed(2)}`,
    }));
  }, [data]);

  const minPrice = useMemo(() => {
    const min = Math.min(...data.map((d) => d.price));
    return min * 0.98; // 2% padding below
  }, [data]);

  const maxPrice = useMemo(() => {
    const max = Math.max(...data.map((d) => d.price));
    return max * 1.02; // 2% padding above
  }, [data]);

  const priceChange = useMemo(() => {
    if (data.length < 2) return 0;
    const first = data[0].price;
    const last = data[data.length - 1].price;
    return ((last - first) / first) * 100;
  }, [data]);

  const chartColor = priceChange >= 0 ? '#22c55e' : '#ef4444';
  const finalColor = color === '#2563eb' ? chartColor : color;

  if (type === 'line') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={formattedData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
          {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />}
          <XAxis
            dataKey="date"
            tick={{ fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: '#e5e7eb' }}
          />
          <YAxis
            domain={[minPrice, maxPrice]}
            tick={{ fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: '#e5e7eb' }}
            tickFormatter={(value) => `$${value.toFixed(0)}`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
            }}
            formatter={(value: number) => [`$${value.toFixed(2)}`, 'Price']}
          />
          <Line
            type="monotone"
            dataKey="price"
            stroke={finalColor}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: finalColor }}
          />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={formattedData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
        {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />}
        <XAxis
          dataKey="date"
          tick={{ fontSize: 12 }}
          tickLine={false}
          axisLine={{ stroke: '#e5e7eb' }}
        />
        <YAxis
          domain={[minPrice, maxPrice]}
          tick={{ fontSize: 12 }}
          tickLine={false}
          axisLine={{ stroke: '#e5e7eb' }}
          tickFormatter={(value) => `$${value.toFixed(0)}`}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
          }}
          formatter={(value: number) => [`$${value.toFixed(2)}`, 'Price']}
        />
        <defs>
          <linearGradient id={`gradient-${finalColor.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={finalColor} stopOpacity={0.3} />
            <stop offset="95%" stopColor={finalColor} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="price"
          stroke={finalColor}
          strokeWidth={2}
          fill={`url(#gradient-${finalColor.replace('#', '')})`}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// Mini sparkline chart for tables/cards
export function SparklineChart({
  data,
  width = 100,
  height = 40,
}: {
  data: number[];
  width?: number;
  height?: number;
}) {
  const chartData = data.map((price, index) => ({ index, price }));
  const priceChange = data.length >= 2 ? data[data.length - 1] - data[0] : 0;
  const color = priceChange >= 0 ? '#22c55e' : '#ef4444';

  return (
    <ResponsiveContainer width={width} height={height}>
      <LineChart data={chartData}>
        <Line type="monotone" dataKey="price" stroke={color} strokeWidth={1.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

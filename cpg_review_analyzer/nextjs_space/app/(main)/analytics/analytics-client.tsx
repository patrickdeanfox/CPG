'use client';

import { useState, useEffect, useCallback } from 'react';
import { BarChart3, TrendingUp, Package, MessageSquare, Loader2, Calendar } from 'lucide-react';
import { motion } from 'framer-motion';
import dynamic from 'next/dynamic';

const AnalyticsCharts = dynamic(() => import('./analytics-charts'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center py-20">
      <Loader2 size={32} className="animate-spin text-sky-500" />
    </div>
  ),
});

interface AnalyticsData {
  totalProducts: number;
  totalReviews: number;
  avgSentimentScore: number;
  sentimentDistribution: { sentiment: string; count: number }[];
  productsByBrand: { brand: string; count: number }[];
  reviewsBySource: { source: string; count: number }[];
  avgSentimentByBrand: { brand: string; avgSentiment: number; reviewCount: number }[];
  sentimentTrends: { month: string; positive: number; negative: number; neutral: number; avgScore: number }[];
  pendingTriage: number;
}

export default function AnalyticsClient() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      let url = '/api/analytics';
      const params = new URLSearchParams();
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      const qs = params?.toString?.() ?? '';
      if (qs) url += '?' + qs;

      const res = await fetch(url);
      const d = await res?.json?.();
      setData(d ?? null);
    } catch (err: any) {
      console.error('Analytics error:', err);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BarChart3 className="text-sky-500" size={28} />
            Analytics
          </h1>
          <p className="text-sm text-gray-500 mt-1">Review intelligence and sentiment insights</p>
        </div>
        <div className="flex items-center gap-2">
          <Calendar size={16} className="text-gray-400" />
          <input
            type="date"
            value={startDate}
            onChange={(e: any) => setStartDate(e?.target?.value ?? '')}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
          />
          <span className="text-gray-400">—</span>
          <input
            type="date"
            value={endDate}
            onChange={(e: any) => setEndDate(e?.target?.value ?? '')}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
          />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Products', value: data?.totalProducts ?? 0, icon: Package, color: 'text-sky-500 bg-sky-50' },
          { label: 'Total Reviews', value: data?.totalReviews ?? 0, icon: MessageSquare, color: 'text-purple-500 bg-purple-50' },
          { label: 'Avg Sentiment', value: ((data?.avgSentimentScore ?? 0) * 100)?.toFixed?.(0) + '%', icon: TrendingUp, color: 'text-green-500 bg-green-50' },
          { label: 'Pending Triage', value: data?.pendingTriage ?? 0, icon: BarChart3, color: 'text-amber-500 bg-amber-50' },
        ]?.map?.((card: any, i: number) => (
          <motion.div
            key={card?.label ?? i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="bg-white rounded-2xl shadow-sm p-5"
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${card?.color ?? ''}`}>
              <card.icon size={20} />
            </div>
            <p className="text-2xl font-bold text-gray-900">{loading ? '-' : card?.value}</p>
            <p className="text-xs text-gray-500 mt-1">{card?.label ?? ''}</p>
          </motion.div>
        ))}
      </div>

      {/* Charts */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={32} className="animate-spin text-sky-500" />
        </div>
      ) : data ? (
        <AnalyticsCharts data={data} />
      ) : (
        <div className="bg-white rounded-2xl shadow-sm p-12 text-center text-gray-400">
          No data available
        </div>
      )}
    </div>
  );
}

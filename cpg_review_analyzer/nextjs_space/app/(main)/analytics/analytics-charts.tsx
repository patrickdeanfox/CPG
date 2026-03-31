'use client';

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line
} from 'recharts';

const COLORS = ['#60B5FF', '#FF9149', '#FF9898', '#FF90BB', '#FF6363', '#80D8C3', '#A19AD3', '#72BF78'];
const SENTIMENT_COLORS: Record<string, string> = {
  positive: '#72BF78',
  negative: '#FF6363',
  neutral: '#A19AD3',
  pending: '#FFB84D',
  unknown: '#D1D5DB',
};

const SOURCE_LABELS: Record<string, string> = {
  amazon: 'Amazon',
  walmart: 'Walmart',
  target: 'Target',
  google_shopping: 'Google',
  manual: 'Manual',
};

interface AnalyticsChartsProps {
  data: {
    sentimentDistribution: { sentiment: string; count: number }[];
    productsByBrand: { brand: string; count: number }[];
    reviewsBySource: { source: string; count: number }[];
    avgSentimentByBrand: { brand: string; avgSentiment: number; reviewCount: number }[];
    sentimentTrends: { month: string; positive: number; negative: number; neutral: number; avgScore: number }[];
  };
}

export default function AnalyticsCharts({ data }: AnalyticsChartsProps) {
  const sentimentData = (data?.sentimentDistribution ?? [])?.map?.((d: any) => ({
    name: d?.sentiment?.charAt?.(0)?.toUpperCase?.() + (d?.sentiment?.slice?.(1) ?? ''),
    value: d?.count ?? 0,
    fill: SENTIMENT_COLORS[d?.sentiment ?? 'unknown'] ?? '#D1D5DB',
  })) ?? [];

  const brandData = (data?.productsByBrand ?? [])?.map?.((d: any) => ({
    name: d?.brand || 'Unknown',
    count: d?.count ?? 0,
  })) ?? [];

  const sourceData = (data?.reviewsBySource ?? [])?.map?.((d: any) => ({
    name: SOURCE_LABELS[d?.source ?? ''] ?? d?.source ?? 'Unknown',
    count: d?.count ?? 0,
  })) ?? [];

  const brandSentimentData = (data?.avgSentimentByBrand ?? [])?.map?.((d: any) => ({
    name: d?.brand || 'Unknown',
    sentiment: parseFloat(((d?.avgSentiment ?? 0) * 100)?.toFixed?.(1) ?? '0'),
    reviews: d?.reviewCount ?? 0,
  })) ?? [];

  const trendData = (data?.sentimentTrends ?? [])?.map?.((d: any) => ({
    month: d?.month ?? '',
    Positive: d?.positive ?? 0,
    Negative: d?.negative ?? 0,
    Neutral: d?.neutral ?? 0,
  })) ?? [];

  const hasNoData = (sentimentData?.length ?? 0) === 0 && (brandData?.length ?? 0) === 0;

  if (hasNoData) {
    return (
      <div className="bg-white rounded-2xl shadow-sm p-12 text-center text-gray-400">
        Add products and analyze reviews to see charts
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Sentiment Distribution */}
      {(sentimentData?.length ?? 0) > 0 && (
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Sentiment Distribution</h3>
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={sentimentData}
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  dataKey="value"
                  label={({ name, percent }: any) => `${name ?? ''} ${((percent ?? 0) * 100)?.toFixed?.(0)}%`}
                >
                  {(sentimentData ?? [])?.map?.((entry: any, index: number) => (
                    <Cell key={index} fill={entry?.fill ?? COLORS[index % (COLORS?.length ?? 1)]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 11 }} />
                <Legend verticalAlign="top" wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Products by Brand */}
      {(brandData?.length ?? 0) > 0 && (
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Products by Brand</h3>
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={brandData} margin={{ top: 5, right: 20, left: 10, bottom: 40 }}>
                <XAxis
                  dataKey="name"
                  tickLine={false}
                  tick={{ fontSize: 10 }}
                  angle={-45}
                  textAnchor="end"
                  interval="preserveStartEnd"
                  height={50}
                />
                <YAxis tickLine={false} tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ fontSize: 11 }} />
                <Bar dataKey="count" fill="#60B5FF" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Reviews by Source */}
      {(sourceData?.length ?? 0) > 0 && (
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Reviews by Source</h3>
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sourceData} margin={{ top: 5, right: 20, left: 10, bottom: 40 }}>
                <XAxis
                  dataKey="name"
                  tickLine={false}
                  tick={{ fontSize: 10 }}
                  angle={-45}
                  textAnchor="end"
                  interval="preserveStartEnd"
                  height={50}
                />
                <YAxis tickLine={false} tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ fontSize: 11 }} />
                <Bar dataKey="count" fill="#FF9149" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Avg Sentiment by Brand */}
      {(brandSentimentData?.length ?? 0) > 0 && (
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Avg Sentiment by Brand (%)</h3>
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={brandSentimentData} margin={{ top: 5, right: 20, left: 10, bottom: 40 }}>
                <XAxis
                  dataKey="name"
                  tickLine={false}
                  tick={{ fontSize: 10 }}
                  angle={-45}
                  textAnchor="end"
                  interval="preserveStartEnd"
                  height={50}
                />
                <YAxis tickLine={false} tick={{ fontSize: 10 }} domain={[0, 100]} />
                <Tooltip contentStyle={{ fontSize: 11 }} />
                <Bar dataKey="sentiment" fill="#80D8C3" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Sentiment Trends */}
      {(trendData?.length ?? 0) > 0 && (
        <div className="bg-white rounded-2xl shadow-sm p-5 lg:col-span-2">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Sentiment Trends Over Time</h3>
          <div style={{ width: '100%', height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 5, right: 20, left: 10, bottom: 15 }}>
                <XAxis
                  dataKey="month"
                  tickLine={false}
                  tick={{ fontSize: 10 }}
                  interval="preserveStartEnd"
                />
                <YAxis tickLine={false} tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ fontSize: 11 }} />
                <Legend verticalAlign="top" wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="Positive" stroke="#72BF78" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="Negative" stroke="#FF6363" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="Neutral" stroke="#A19AD3" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

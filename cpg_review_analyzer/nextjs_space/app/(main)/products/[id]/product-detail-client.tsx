'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Package, Star, MessageSquare, Brain, RefreshCw, Globe,
  Loader2, ExternalLink, TrendingUp, TrendingDown, Minus,
  Lightbulb, ShoppingCart, Search, ChevronDown, ChevronUp, Plus, Languages, Check
} from 'lucide-react';
import toast from 'react-hot-toast';

interface Product {
  id: string;
  name: string;
  brand: string;
  price: number | null;
  size: string | null;
  imageUrl: string | null;
  sourceUrl: string;
  source: string;
  category: string | null;
  description: string | null;
  aiProductAnalysis: string | null;
  variantGroupId: string | null;
  createdAt: string;
}

interface Review {
  id: string;
  reviewText: string;
  originalText: string | null;
  originalLanguage: string | null;
  isTranslated: boolean;
  rating: number | null;
  reviewDate: string | null;
  source: string;
  reviewerName: string | null;
  sentiment: string | null;
  sentimentScore: number | null;
  aiAnalysis: string | null;
  analyzed: boolean;
}

interface ProductAnalysis {
  overallSentiment: string;
  sentimentScore: number;
  totalReviews: number;
  sentimentBreakdown: { positive: number; negative: number; neutral: number };
  themes: { theme: string; count: number; sentiment: string; examples: string[] }[];
  actionableInsights: { category: string; priority: string; insight: string; evidence: string[] }[];
  summary: string;
}

const SOURCE_COLORS: Record<string, string> = {
  amazon: 'bg-orange-100 text-orange-700 border-orange-200',
  walmart: 'bg-blue-100 text-blue-700 border-blue-200',
  target: 'bg-red-100 text-red-700 border-red-200',
  google_shopping: 'bg-green-100 text-green-700 border-green-200',
  manual: 'bg-gray-100 text-gray-600 border-gray-200',
  unknown: 'bg-gray-100 text-gray-600 border-gray-200',
};
const SOURCE_LABELS: Record<string, string> = {
  amazon: 'Amazon', walmart: 'Walmart', target: 'Target',
  google_shopping: 'Google Shopping', manual: 'Manual', unknown: 'Unknown',
};

const SENTIMENT_ICONS: Record<string, any> = {
  positive: TrendingUp,
  negative: TrendingDown,
  neutral: Minus,
};
const SENTIMENT_COLORS: Record<string, string> = {
  positive: 'text-green-600 bg-green-50',
  negative: 'text-red-600 bg-red-50',
  neutral: 'text-gray-500 bg-gray-100',
};

const PRIORITY_COLORS: Record<string, string> = {
  high: 'bg-red-100 text-red-700 border-red-200',
  medium: 'bg-amber-100 text-amber-700 border-amber-200',
  low: 'bg-blue-100 text-blue-700 border-blue-200',
};

// Progress Bar Component
function ProgressBar({ progress, message, steps }: { progress: number; message: string; steps?: { store: string; label: string; status: string }[] }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-5 space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-700 font-medium">{message}</span>
        <span className="text-gray-400">{Math.min(progress, 100)}%</span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
        <motion.div
          className="bg-gradient-to-r from-sky-400 to-sky-600 h-full rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(progress, 100)}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>
      {steps && steps.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {steps.map((s, i) => (
            <span key={i} className={`px-2 py-0.5 rounded-full text-xs font-medium border ${
              s.status === 'success' ? 'bg-green-50 text-green-600 border-green-200' :
              s.status === 'error' || s.status === 'not_found' ? 'bg-red-50 text-red-600 border-red-200' :
              s.status === 'pending' ? 'bg-gray-50 text-gray-400 border-gray-200' :
              'bg-sky-50 text-sky-600 border-sky-200'
            }`}>
              {s.status === 'success' ? '\u2713 ' : s.status === 'error' || s.status === 'not_found' ? '\u2717 ' : s.status === 'pending' ? '' : '\u27f3 '}
              {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ProductDetailClient({ productId }: { productId: string }) {
  const router = useRouter();
  const [product, setProduct] = useState<Product | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [analysis, setAnalysis] = useState<ProductAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [scraping, setScraping] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [crossSearching, setCrossSearching] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [activeTab, setActiveTab] = useState<'reviews' | 'analysis' | 'cross-store'>('reviews');
  const [expandedReviews, setExpandedReviews] = useState<Set<string>>(new Set());
  const [showOriginal, setShowOriginal] = useState<Set<string>>(new Set());
  const [crossSearchResults, setCrossSearchResults] = useState<any[]>([]);
  const [reviewFilter, setReviewFilter] = useState<string>('all');
  const [newReviewText, setNewReviewText] = useState('');
  const [newReviewRating, setNewReviewRating] = useState(5);
  const [addingReview, setAddingReview] = useState(false);
  const [showAddReview, setShowAddReview] = useState(false);

  // Progress states
  const [analyzeProgress, setAnalyzeProgress] = useState({ progress: 0, message: '' });
  const [crossSearchProgress, setCrossSearchProgress] = useState({ progress: 0, message: '', steps: [] as any[] });

  // Diagnostics
  const [diagnosticLogs, setDiagnosticLogs] = useState<any[]>([]);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  const fetchProduct = useCallback(async () => {
    try {
      const res = await fetch(`/api/products/${productId}`);
      if (!res.ok) throw new Error('Product not found');
      const data = await res.json();
      setProduct(data);
      if (data?.aiProductAnalysis) {
        try { setAnalysis(JSON.parse(data.aiProductAnalysis)); } catch { /* skip */ }
      }
    } catch (err: any) {
      toast.error('Failed to load product');
      router.push('/');
    }
  }, [productId, router]);

  const fetchReviews = useCallback(async () => {
    try {
      const res = await fetch(`/api/products/${productId}/reviews`);
      const data = await res.json();
      setReviews(data?.reviews ?? data ?? []);
    } catch { /* skip */ }
  }, [productId]);

  useEffect(() => {
    Promise.all([fetchProduct(), fetchReviews()]).finally(() => setLoading(false));
  }, [fetchProduct, fetchReviews]);

  const handleScrape = async () => {
    setScraping(true);
    try {
      const res = await fetch(`/api/products/${productId}/scrape`, { method: 'POST' });
      const data = await res.json();
      if (data?.success) {
        toast.success(data?.message ?? 'Scraping complete');
        await fetchReviews();
      } else {
        toast.error(data?.error ?? 'Scraping failed');
      }
    } catch { toast.error('Scraping failed'); }
    finally { setScraping(false); }
  };

  const handleAnalyze = async () => {
    setAnalyzing(true);
    setAnalyzeProgress({ progress: 5, message: 'Starting AI analysis...' });
    try {
      const res = await fetch(`/api/products/${productId}/analyze`, { method: 'POST' });
      if (!res.ok) {
        const errData = await res.json();
        toast.error(errData?.error ?? 'Analysis failed');
        setAnalyzing(false);
        setAnalyzeProgress({ progress: 0, message: '' });
        return;
      }
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let partialRead = '';
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        partialRead += decoder.decode(value, { stream: true });
        const lines = partialRead.split('\n');
        partialRead = lines.pop() ?? '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const parsed = JSON.parse(line.slice(6));
              if (parsed?.status === 'progress') {
                const pct = parsed?.percentage ?? Math.round(((parsed?.step ?? 0) / (parsed?.totalSteps ?? 3)) * 100);
                setAnalyzeProgress({ progress: pct, message: parsed?.message ?? 'Processing...' });
              } else if (parsed?.status === 'completed') {
                setAnalyzeProgress({ progress: 100, message: 'Analysis complete!' });
                toast.success(`Analysis complete! ${parsed?.result?.updatedCount ?? 0} reviews analyzed`);
                if (parsed?.result?.productAnalysis) {
                  setAnalysis(parsed.result.productAnalysis);
                }
                await fetchProduct();
                await fetchReviews();
                setActiveTab('analysis');
              } else if (parsed?.status === 'error') {
                toast.error(parsed?.message ?? 'Analysis failed');
              }
            } catch { /* skip */ }
          }
        }
      }
    } catch (err: any) { toast.error('Analysis failed'); }
    finally {
      setAnalyzing(false);
      setTimeout(() => setAnalyzeProgress({ progress: 0, message: '' }), 2000);
    }
  };

  const handleCrossSearch = async () => {
    setCrossSearching(true);
    setCrossSearchResults([]);
    setDiagnosticLogs([]);
    setShowDiagnostics(true);
    setCrossSearchProgress({ progress: 5, message: 'Starting cross-store search...', steps: [] });
    try {
      const res = await fetch(`/api/products/${productId}/cross-search`, { method: 'POST' });
      if (!res.ok) {
        const errData = await res.json();
        toast.error(errData?.error ?? 'Cross-store search failed');
        setCrossSearching(false);
        setCrossSearchProgress({ progress: 0, message: '', steps: [] });
        return;
      }
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let partialRead = '';
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        partialRead += decoder.decode(value, { stream: true });
        const lines = partialRead.split('\n');
        partialRead = lines.pop() ?? '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const parsed = JSON.parse(line.slice(6));
              if (parsed?.status === 'diagnostic') {
                setDiagnosticLogs(prev => [...prev, parsed.entry]);
              } else if (parsed?.status === 'progress') {
                const pct = parsed?.step != null && parsed?.totalSteps
                  ? Math.round((parsed.step / parsed.totalSteps) * 100)
                  : crossSearchProgress.progress + 5;
                setCrossSearchProgress(prev => ({
                  progress: Math.max(prev.progress, pct),
                  message: parsed?.message ?? prev.message,
                  steps: parsed?.storeProgress ?? prev.steps.map((s: any) =>
                    s.store === parsed?.currentStore ? { ...s, status: parsed?.storeStatus ?? s.status } : s
                  ),
                }));
              } else if (parsed?.status === 'completed') {
                setCrossSearchProgress({ progress: 100, message: 'Search complete!', steps: [] });
                setCrossSearchResults(parsed?.results ?? []);
                if (parsed?.diagnostics) {
                  setDiagnosticLogs(parsed.diagnostics);
                }
                toast.success(`Found ${parsed?.totalNewReviews ?? 0} new reviews across stores`);
                await fetchReviews();
              } else if (parsed?.status === 'error') {
                toast.error(parsed?.message ?? 'Cross-store search failed');
                if (parsed?.diagnostics) {
                  setDiagnosticLogs(parsed.diagnostics);
                }
              }
            } catch { /* skip */ }
          }
        }
      }
    } catch { toast.error('Cross-store search failed'); }
    finally {
      setCrossSearching(false);
      setTimeout(() => setCrossSearchProgress({ progress: 0, message: '', steps: [] }), 2000);
    }
  };

  const handleTranslate = async () => {
    setTranslating(true);
    try {
      const res = await fetch(`/api/products/${productId}/translate`, { method: 'POST' });
      if (!res.ok) {
        const errData = await res.json();
        toast.error(errData?.error ?? 'Translation failed');
        setTranslating(false);
        return;
      }
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let partialRead = '';
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        partialRead += decoder.decode(value, { stream: true });
        const lines = partialRead.split('\n');
        partialRead = lines.pop() ?? '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const parsed = JSON.parse(line.slice(6));
              if (parsed?.status === 'completed') {
                toast.success(parsed?.message ?? 'Translation complete');
                await fetchReviews();
              } else if (parsed?.status === 'error') {
                toast.error(parsed?.message ?? 'Translation failed');
              }
            } catch { /* skip */ }
          }
        }
      }
    } catch { toast.error('Translation failed'); }
    finally { setTranslating(false); }
  };

  const handleAddReview = async () => {
    if (!newReviewText.trim()) return;
    setAddingReview(true);
    try {
      const res = await fetch(`/api/products/${productId}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewText: newReviewText, rating: newReviewRating, source: 'manual' }),
      });
      if (res.ok) {
        toast.success('Review added');
        setNewReviewText('');
        setNewReviewRating(5);
        setShowAddReview(false);
        await fetchReviews();
      } else {
        toast.error('Failed to add review');
      }
    } catch { toast.error('Failed to add review'); }
    finally { setAddingReview(false); }
  };

  const filteredReviews = reviews.filter(r => {
    if (reviewFilter === 'all') return true;
    if (reviewFilter === 'analyzed') return r.analyzed;
    if (reviewFilter === 'unanalyzed') return !r.analyzed;
    if (reviewFilter === 'translated') return r.isTranslated;
    return r.sentiment === reviewFilter;
  });

  const toggleReview = (id: string) => {
    setExpandedReviews(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const toggleOriginal = (id: string) => {
    setShowOriginal(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 size={36} className="animate-spin text-sky-500" />
      </div>
    );
  }

  if (!product) return null;

  const sentimentCounts = reviews.reduce(
    (acc, r) => {
      if (r.sentiment === 'positive') acc.positive++;
      else if (r.sentiment === 'negative') acc.negative++;
      else if (r.sentiment === 'neutral') acc.neutral++;
      return acc;
    },
    { positive: 0, negative: 0, neutral: 0 }
  );

  const translatedCount = reviews.filter(r => r.isTranslated).length;
  const ratedReviews = reviews.filter(r => r.rating != null);
  const avgRating = ratedReviews.length > 0 ? ratedReviews.reduce((sum, r) => sum + (r.rating ?? 0), 0) / ratedReviews.length : 0;

  return (
    <div className="space-y-6">
      {/* Back button */}
      <button
        onClick={() => router.push('/')}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors"
      >
        <ArrowLeft size={16} /> Back to Products
      </button>

      {/* Product Header */}
      <div className="bg-white rounded-2xl shadow-sm p-6">
        <div className="flex flex-col md:flex-row gap-6">
          <div className="w-full md:w-32 h-32 bg-gray-100 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center">
            {product.imageUrl ? (
              <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
            ) : (
              <Package size={36} className="text-gray-300" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{product.name}</h1>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  {product.brand && <span className="text-sm font-medium text-gray-600">{product.brand}</span>}
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${SOURCE_COLORS[product.source] ?? SOURCE_COLORS.unknown}`}>
                    {SOURCE_LABELS[product.source] ?? product.source}
                  </span>
                  {(product.price ?? 0) > 0 && <span className="text-sm text-gray-500">${product.price?.toFixed(2)}</span>}
                  {product.size && <span className="text-xs text-gray-400">{product.size}</span>}
                  {product.variantGroupId && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-600 border border-purple-200">
                      Variant Group
                    </span>
                  )}
                </div>
                {product.description && (
                  <p className="text-sm text-gray-500 mt-2 line-clamp-2">{product.description}</p>
                )}
              </div>
              {product.sourceUrl && (
                <a href={product.sourceUrl} target="_blank" rel="noopener noreferrer"
                  className="flex-shrink-0 p-2 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-all" title="Visit Source">
                  <ExternalLink size={18} />
                </a>
              )}
            </div>

            {/* Stats row */}
            <div className="flex flex-wrap items-center gap-4 mt-4">
              <div className="flex items-center gap-1.5 text-sm">
                <MessageSquare size={15} className="text-gray-400" />
                <span className="font-medium text-gray-700">{reviews.length}</span>
                <span className="text-gray-400">reviews</span>
              </div>
              {ratedReviews.length > 0 && (
                <div className="flex items-center gap-1.5 text-sm">
                  <Star size={15} className="text-amber-400 fill-amber-400" />
                  <span className="font-medium text-gray-700">{avgRating.toFixed(1)}</span>
                  <span className="text-gray-400">avg rating</span>
                </div>
              )}
              {sentimentCounts.positive > 0 && (
                <span className="text-xs px-2 py-0.5 bg-green-50 text-green-600 rounded-full font-medium">
                  +{sentimentCounts.positive} positive
                </span>
              )}
              {sentimentCounts.negative > 0 && (
                <span className="text-xs px-2 py-0.5 bg-red-50 text-red-600 rounded-full font-medium">
                  -{sentimentCounts.negative} negative
                </span>
              )}
              {translatedCount > 0 && (
                <span className="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full font-medium">
                  <Languages size={11} className="inline mr-0.5" />{translatedCount} translated
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2 mt-5 pt-5 border-t border-gray-100">
          <button onClick={handleScrape} disabled={scraping}
            className="px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 transition-all disabled:opacity-50 flex items-center gap-2">
            {scraping ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Scrape Reviews
          </button>
          <button onClick={handleAnalyze} disabled={analyzing}
            className="px-4 py-2 bg-purple-600 text-white rounded-xl text-sm font-medium hover:bg-purple-700 transition-all disabled:opacity-50 flex items-center gap-2">
            {analyzing ? <Loader2 size={16} className="animate-spin" /> : <Brain size={16} />}
            AI Analyze
          </button>
          <button onClick={handleCrossSearch} disabled={crossSearching}
            className="px-4 py-2 bg-sky-600 text-white rounded-xl text-sm font-medium hover:bg-sky-700 transition-all disabled:opacity-50 flex items-center gap-2">
            {crossSearching ? <Loader2 size={16} className="animate-spin" /> : <Globe size={16} />}
            Cross-Store Search
          </button>
          <button onClick={handleTranslate} disabled={translating}
            className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center gap-2">
            {translating ? <Loader2 size={16} className="animate-spin" /> : <Languages size={16} />}
            Translate Reviews
          </button>
        </div>
      </div>

      {/* Progress bars */}
      {analyzing && analyzeProgress.progress > 0 && (
        <ProgressBar progress={analyzeProgress.progress} message={analyzeProgress.message} />
      )}
      {crossSearching && crossSearchProgress.progress > 0 && (
        <ProgressBar progress={crossSearchProgress.progress} message={crossSearchProgress.message} steps={crossSearchProgress.steps} />
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
        {(['reviews', 'analysis', 'cross-store'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {tab === 'reviews' && <><MessageSquare size={14} className="inline mr-1.5" />Reviews ({reviews.length})</>}
            {tab === 'analysis' && <><Brain size={14} className="inline mr-1.5" />AI Analysis</>}
            {tab === 'cross-store' && <><Globe size={14} className="inline mr-1.5" />Cross-Store</>}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'reviews' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2 flex-wrap">
              {['all', 'positive', 'negative', 'neutral', 'translated', 'analyzed', 'unanalyzed'].map(f => (
                <button key={f} onClick={() => setReviewFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    reviewFilter === f ? 'bg-sky-100 text-sky-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}>
                  {f === 'translated' ? <><Languages size={11} className="inline mr-0.5" />Translated</> : f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
            <button onClick={() => setShowAddReview(!showAddReview)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-sky-500 text-white hover:bg-sky-600 flex items-center gap-1">
              <Plus size={14} /> Add Review
            </button>
          </div>

          <AnimatePresence>
            {showAddReview && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="bg-white rounded-xl shadow-sm p-4 space-y-3">
                  <textarea value={newReviewText} onChange={e => setNewReviewText(e.target.value)}
                    placeholder="Enter review text..." rows={3}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-200" />
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500">Rating:</span>
                      <select value={newReviewRating} onChange={e => setNewReviewRating(Number(e.target.value))}
                        className="px-2 py-1 border border-gray-200 rounded-lg text-sm">
                        {[1,2,3,4,5].map(n => <option key={n} value={n}>{n} star{n > 1 ? 's' : ''}</option>)}
                      </select>
                    </div>
                    <button onClick={handleAddReview} disabled={addingReview || !newReviewText.trim()}
                      className="px-4 py-2 bg-sky-500 text-white rounded-lg text-sm font-medium hover:bg-sky-600 disabled:opacity-50 flex items-center gap-1">
                      {addingReview ? <Loader2 size={14} className="animate-spin" /> : null}
                      Add
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {filteredReviews.length === 0 ? (
            <div className="bg-white rounded-xl p-8 text-center text-gray-400">
              <MessageSquare size={32} className="mx-auto mb-2" />
              <p>No reviews match the current filter</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredReviews.map((review, idx) => {
                const isExpanded = expandedReviews.has(review.id);
                const showingOriginal = showOriginal.has(review.id);
                const SentIcon = SENTIMENT_ICONS[review.sentiment ?? ''] ?? Minus;
                const sentColor = SENTIMENT_COLORS[review.sentiment ?? ''] ?? SENTIMENT_COLORS.neutral;
                return (
                  <motion.div key={review.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(idx * 0.02, 0.5) }}
                    className="bg-white rounded-xl shadow-sm p-4 hover:shadow-md transition-all">
                    <div className="flex items-start gap-3">
                      <div className={`p-1.5 rounded-lg flex-shrink-0 ${sentColor}`}>
                        <SentIcon size={14} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-gray-800">{review.reviewerName ?? 'Anonymous'}</span>
                          {review.rating != null && (
                            <span className="flex items-center gap-0.5 text-xs text-amber-500">
                              <Star size={11} className="fill-amber-400" /> {review.rating}
                            </span>
                          )}
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${SOURCE_COLORS[review.source] ?? SOURCE_COLORS.unknown}`}>
                            {SOURCE_LABELS[review.source] ?? review.source}
                          </span>
                          {review.analyzed && review.sentiment && (
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              review.sentiment === 'positive' ? 'bg-green-50 text-green-600' :
                              review.sentiment === 'negative' ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-500'
                            }`}>
                              {review.sentiment} ({((review.sentimentScore ?? 0) * 100).toFixed(0)}%)
                            </span>
                          )}
                          {review.isTranslated && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-600">
                              <Languages size={10} className="inline mr-0.5" />
                              Translated from {review.originalLanguage}
                            </span>
                          )}
                        </div>
                        <p className={`text-sm text-gray-600 mt-1.5 ${isExpanded ? '' : 'line-clamp-2'}`}>
                          {showingOriginal && review.originalText ? review.originalText : review.reviewText}
                        </p>
                        <div className="flex items-center gap-3 mt-1">
                          {review.reviewText.length > 150 && (
                            <button onClick={() => toggleReview(review.id)}
                              className="text-xs text-sky-500 hover:text-sky-700 flex items-center gap-0.5">
                              {isExpanded ? <><ChevronUp size={12} /> Show less</> : <><ChevronDown size={12} /> Show more</>}
                            </button>
                          )}
                          {review.isTranslated && review.originalText && (
                            <button onClick={() => toggleOriginal(review.id)}
                              className="text-xs text-indigo-500 hover:text-indigo-700 flex items-center gap-0.5">
                              <Languages size={12} />
                              {showingOriginal ? 'Show translation' : 'Show original'}
                            </button>
                          )}
                        </div>
                        {review.aiAnalysis && (
                          <p className="text-xs text-gray-400 mt-1.5 italic border-l-2 border-gray-200 pl-2">
                            {review.aiAnalysis}
                          </p>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'analysis' && (
        <div className="space-y-4">
          {!analysis ? (
            <div className="bg-white rounded-xl p-8 text-center">
              <Brain size={36} className="mx-auto text-gray-300 mb-3" />
              <h3 className="text-lg font-semibold text-gray-700">No analysis yet</h3>
              <p className="text-sm text-gray-400 mt-1 mb-4">Run AI Analysis to get actionable insights from all reviews</p>
              <button onClick={handleAnalyze} disabled={analyzing || reviews.length === 0}
                className="px-5 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-medium hover:bg-purple-700 disabled:opacity-50 inline-flex items-center gap-2">
                {analyzing ? <Loader2 size={16} className="animate-spin" /> : <Brain size={16} />}
                Run AI Analysis
              </button>
            </div>
          ) : (
            <>
              {/* Summary card */}
              <div className="bg-white rounded-xl shadow-sm p-5">
                <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Brain size={18} className="text-purple-500" /> Analysis Summary
                </h3>
                <p className="text-sm text-gray-600 leading-relaxed">{analysis.summary}</p>
                <div className="flex flex-wrap gap-4 mt-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-400">Overall:</span>
                    <span className={`px-2.5 py-1 rounded-lg text-sm font-semibold ${
                      analysis.overallSentiment === 'positive' ? 'bg-green-100 text-green-700' :
                      analysis.overallSentiment === 'negative' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {analysis.overallSentiment?.toUpperCase()} ({(analysis.sentimentScore * 100).toFixed(0)}%)
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-green-600 font-medium">+{analysis.sentimentBreakdown?.positive ?? 0}</span>
                    <span className="text-red-600 font-medium">-{analysis.sentimentBreakdown?.negative ?? 0}</span>
                    <span className="text-gray-400 font-medium">~{analysis.sentimentBreakdown?.neutral ?? 0}</span>
                  </div>
                </div>
              </div>

              {/* Actionable Insights */}
              {(analysis.actionableInsights?.length ?? 0) > 0 && (
                <div className="bg-white rounded-xl shadow-sm p-5">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Lightbulb size={18} className="text-amber-500" /> Actionable Insights
                  </h3>
                  <div className="space-y-3">
                    {analysis.actionableInsights.map((insight, i) => (
                      <div key={i} className="border border-gray-100 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium border ${PRIORITY_COLORS[insight.priority] ?? PRIORITY_COLORS.low}`}>
                            {insight.priority?.toUpperCase()}
                          </span>
                          <span className="text-sm font-semibold text-gray-800">{insight.category}</span>
                        </div>
                        <p className="text-sm text-gray-600">{insight.insight}</p>
                        {(insight.evidence?.length ?? 0) > 0 && (
                          <div className="mt-2 space-y-1">
                            {insight.evidence.map((e, j) => (
                              <p key={j} className="text-xs text-gray-400 italic border-l-2 border-gray-200 pl-2">{e}</p>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Themes */}
              {(analysis.themes?.length ?? 0) > 0 && (
                <div className="bg-white rounded-xl shadow-sm p-5">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <TrendingUp size={18} className="text-sky-500" /> Key Themes
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {analysis.themes.map((theme, i) => (
                      <div key={i} className="border border-gray-100 rounded-lg p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-gray-800">{theme.theme}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-400">{theme.count} mentions</span>
                            <span className={`w-2 h-2 rounded-full ${
                              theme.sentiment === 'positive' ? 'bg-green-400' :
                              theme.sentiment === 'negative' ? 'bg-red-400' : 'bg-gray-300'
                            }`} />
                          </div>
                        </div>
                        {(theme.examples?.length ?? 0) > 0 && (
                          <p className="text-xs text-gray-400 mt-1 line-clamp-2 italic">{theme.examples[0]}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="text-center">
                <button onClick={handleAnalyze} disabled={analyzing || reviews.length === 0}
                  className="px-5 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-medium hover:bg-purple-700 disabled:opacity-50 inline-flex items-center gap-2">
                  {analyzing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                  Re-run Analysis
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {activeTab === 'cross-store' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl shadow-sm p-5">
            <h3 className="text-lg font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <Globe size={18} className="text-sky-500" /> Cross-Store Search
            </h3>
            <p className="text-sm text-gray-500 mb-2">
              Search for &ldquo;{product.name}&rdquo; across Amazon, Walmart, and Target to find reviews from other retailers.
            </p>
            <p className="text-xs text-gray-400 mb-4 flex items-center gap-1.5">
              <span className="inline-block w-1.5 h-1.5 bg-green-400 rounded-full" />
              Amazon &amp; Walmart use structured data APIs for reliable results. Target uses generic scraping + AI extraction.
            </p>
            <button onClick={handleCrossSearch} disabled={crossSearching}
              className="px-5 py-2.5 bg-sky-600 text-white rounded-xl text-sm font-medium hover:bg-sky-700 disabled:opacity-50 inline-flex items-center gap-2">
              {crossSearching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
              {crossSearching ? 'Searching stores...' : 'Search All Stores'}
            </button>
          </div>

          {crossSearchResults.length > 0 && (
            <div className="space-y-3">
              {crossSearchResults.map((result, i) => (
                <div key={i} className="bg-white rounded-xl shadow-sm p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${SOURCE_COLORS[result.source] ?? SOURCE_COLORS.unknown}`}>
                      {SOURCE_LABELS[result.source] ?? result.source}
                    </span>
                    {result.error ? (
                      <span className="text-xs text-red-500">{result.error}</span>
                    ) : (
                      <span className="text-sm font-medium text-gray-700">
                        {result.newReviews ?? 0} new review{(result.newReviews ?? 0) !== 1 ? 's' : ''} imported
                      </span>
                    )}
                  </div>
                  {result.url && (
                    <a href={result.url} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-sky-500 hover:text-sky-700 inline-flex items-center gap-1">
                      <ExternalLink size={12} /> View product page
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}

          {crossSearchResults.length === 0 && !crossSearching && diagnosticLogs.length === 0 && (
            <div className="bg-white rounded-xl p-8 text-center text-gray-400">
              <ShoppingCart size={32} className="mx-auto mb-2" />
              <p>Click &ldquo;Search All Stores&rdquo; to find this product across retailers</p>
            </div>
          )}

          {/* Diagnostics Panel */}
          {diagnosticLogs.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <button
                onClick={() => setShowDiagnostics(prev => !prev)}
                className="w-full px-4 py-3 flex items-center justify-between text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400"><path d="M12 20h9"/><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.855z"/></svg>
                  Search Diagnostics ({diagnosticLogs.length} entries)
                </span>
                {showDiagnostics ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              <AnimatePresence>
                {showDiagnostics && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="border-t border-gray-100 max-h-96 overflow-y-auto">
                      {diagnosticLogs.map((log, i) => (
                        <div
                          key={i}
                          className={`px-4 py-2 text-xs border-b border-gray-50 font-mono ${
                            log.level === 'error' ? 'bg-red-50 text-red-700' :
                            log.level === 'warn' ? 'bg-amber-50 text-amber-700' :
                            log.level === 'success' ? 'bg-green-50 text-green-700' :
                            'bg-gray-50 text-gray-600'
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <span className="text-[10px] text-gray-400 whitespace-nowrap mt-0.5">
                              {log.ts ? new Date(log.ts).toLocaleTimeString() : ''}
                            </span>
                            <span className={`px-1.5 py-0 rounded text-[10px] font-semibold uppercase ${
                              log.store === 'amazon' ? 'bg-orange-100 text-orange-600' :
                              log.store === 'walmart' ? 'bg-blue-100 text-blue-600' :
                              log.store === 'target' ? 'bg-red-100 text-red-600' :
                              'bg-gray-100 text-gray-500'
                            }`}>
                              {log.store}
                            </span>
                            <span className="flex-1 break-all">
                              {log.message}
                              {log.detail && (
                                <span className="block mt-0.5 text-[10px] opacity-70">
                                  {typeof log.detail === 'string' ? log.detail : JSON.stringify(log.detail, null, 0).substring(0, 300)}
                                </span>
                              )}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

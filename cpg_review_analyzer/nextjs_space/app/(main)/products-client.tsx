'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Package, Plus, Search, RefreshCw, Trash2, Edit3, ExternalLink,
  Star, MessageSquare, Brain, Filter, ChevronDown, X, Loader2, Globe, ShoppingCart, ChevronRight,
  Check, XCircle, Link2, AlertTriangle
} from 'lucide-react';
import toast from 'react-hot-toast';
import ProductModal from '../components/product-modal';
import ReviewsPanel from '../components/reviews-panel';

interface Product {
  id: string;
  name: string;
  brand: string;
  upc: string | null;
  price: number | null;
  size: string | null;
  imageUrl: string | null;
  sourceUrl: string;
  source: string;
  createdAt: string;
  reviewCount: number;
  sourceCounts: Record<string, number>;
  sentimentCounts: { positive: number; negative: number; neutral: number };
}

interface MatchProduct {
  id: string;
  name: string;
  brand: string;
  size: string | null;
  price: number | null;
  source: string;
  imageUrl: string | null;
}

interface MatchResult {
  id: string;
  productAId: string;
  productBId: string;
  matchType: string;
  confidence: number;
  reason: string;
  isVariant: boolean;
  productA?: MatchProduct;
  productB?: MatchProduct;
  existing?: boolean;
}

const SOURCE_COLORS: Record<string, string> = {
  amazon: 'bg-orange-100 text-orange-700',
  walmart: 'bg-blue-100 text-blue-700',
  target: 'bg-red-100 text-red-700',
  google_shopping: 'bg-green-100 text-green-700',
  manual: 'bg-gray-100 text-gray-600',
  unknown: 'bg-gray-100 text-gray-600',
};

const SOURCE_LABELS: Record<string, string> = {
  amazon: 'Amazon',
  walmart: 'Walmart',
  target: 'Target',
  google_shopping: 'Google Shopping',
  manual: 'Manual',
  unknown: 'Unknown',
};

export default function ProductsPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [scrapingId, setScrapingId] = useState<string | null>(null);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [filterBrand, setFilterBrand] = useState('');
  const [filterSource, setFilterSource] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [showFilters, setShowFilters] = useState(false);
  const [total, setTotal] = useState(0);
  const [matchingProducts, setMatchingProducts] = useState(false);
  const [matchProgress, setMatchProgress] = useState<{ message: string; percentage: number } | null>(null);
  const [matchResults, setMatchResults] = useState<MatchResult[]>([]);
  const [showMatchModal, setShowMatchModal] = useState(false);
  const [processingMatchId, setProcessingMatchId] = useState<string | null>(null);
  const [manualMatchMode, setManualMatchMode] = useState(false);
  const [manualMatchA, setManualMatchA] = useState('');
  const [manualMatchB, setManualMatchB] = useState('');

  const fetchProducts = useCallback(async () => {
    try {
      setLoading(true);
      let url = '/api/products?sort=' + sortBy + '&order=desc';
      if (filterBrand) url += '&brand=' + encodeURIComponent(filterBrand);
      if (filterSource) url += '&source=' + encodeURIComponent(filterSource);
      const res = await fetch(url);
      const data = await res?.json?.();
      setProducts(data?.products ?? []);
      setTotal(data?.total ?? 0);
    } catch (err: any) {
      console.error('Fetch products error:', err);
      toast.error('Failed to load products');
    } finally {
      setLoading(false);
    }
  }, [sortBy, filterBrand, filterSource]);

  const searchProducts = useCallback(async () => {
    if (!searchQuery?.trim?.()) {
      fetchProducts();
      return;
    }
    try {
      setLoading(true);
      const res = await fetch('/api/products/search?q=' + encodeURIComponent(searchQuery));
      const data = await res?.json?.();
      setProducts((data ?? [])?.map?.((p: any) => ({ ...p, reviewCount: 0, sourceCounts: {}, sentimentCounts: { positive: 0, negative: 0, neutral: 0 } })));
      setTotal(data?.length ?? 0);
    } catch (err: any) {
      console.error('Search error:', err);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, fetchProducts]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (searchQuery) searchProducts();
      else fetchProducts();
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchQuery, searchProducts, fetchProducts]);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this product and all its reviews?')) return;
    try {
      await fetch(`/api/products/${id}`, { method: 'DELETE' });
      toast.success('Product deleted');
      fetchProducts();
    } catch (err: any) {
      toast.error('Failed to delete');
    }
  };

  const handleScrape = async (id: string) => {
    setScrapingId(id);
    try {
      const res = await fetch(`/api/products/${id}/scrape`, { method: 'POST' });
      const data = await res?.json?.();
      if (data?.success) {
        if (data?.newReviews > 0) {
          toast.success(data?.message ?? 'Scraping complete', { duration: 5000 });
        } else {
          toast(data?.message ?? 'No reviews found', { duration: 7000, icon: '⚠️' });
        }
      } else {
        toast.error(data?.error ?? 'Scraping failed', { duration: 5000 });
      }
      fetchProducts();
    } catch (err: any) {
      toast.error('Scraping failed');
    } finally {
      setScrapingId(null);
    }
  };

  const handleAnalyze = async (id: string) => {
    setAnalyzingId(id);
    try {
      const res = await fetch(`/api/products/${id}/analyze`, { method: 'POST' });
      if (!res?.ok) {
        const errData = await res?.json?.();
        toast.error(errData?.error ?? 'Analysis failed');
        setAnalyzingId(null);
        return;
      }
      const reader = res?.body?.getReader();
      const decoder = new TextDecoder();
      let partialRead = '';
      while (true) {
        const { done, value } = await reader!.read();
        if (done) break;
        partialRead += decoder.decode(value, { stream: true });
        let lines = partialRead.split('\n');
        partialRead = lines?.pop?.() ?? '';
        for (const line of (lines ?? [])) {
          if (line?.startsWith?.('data: ')) {
            const data = line?.slice?.(6) ?? '';
            try {
              const parsed = JSON.parse(data);
              if (parsed?.status === 'completed') {
                toast.success(`Analysis complete! ${parsed?.result?.updatedCount ?? 0} reviews analyzed`);
                fetchProducts();
              } else if (parsed?.status === 'error') {
                toast.error(parsed?.message ?? 'Analysis failed');
              }
            } catch (e: any) { /* skip */ }
          }
        }
      }
    } catch (err: any) {
      toast.error('Analysis failed: ' + (err?.message ?? ''));
    } finally {
      setAnalyzingId(null);
    }
  };

  const handleMatchProducts = async () => {
    setMatchingProducts(true);
    setMatchProgress({ message: 'Starting AI matching...', percentage: 0 });
    setMatchResults([]);
    try {
      const res = await fetch('/api/products/match', { method: 'POST' });
      if (!res?.ok) {
        const errData = await res?.json?.();
        toast.error(errData?.error ?? 'Matching failed');
        setMatchingProducts(false);
        setMatchProgress(null);
        return;
      }
      const reader = res?.body?.getReader();
      const decoder = new TextDecoder();
      let partialRead = '';
      while (true) {
        const { done, value } = await reader!.read();
        if (done) break;
        partialRead += decoder.decode(value, { stream: true });
        let lines = partialRead.split('\n');
        partialRead = lines?.pop?.() ?? '';
        for (const line of (lines ?? [])) {
          if (line?.startsWith?.('data: ')) {
            try {
              const parsed = JSON.parse(line?.slice?.(6) ?? '');
              if (parsed?.status === 'progress') {
                setMatchProgress({ message: parsed?.message ?? '', percentage: parsed?.percentage ?? 0 });
              } else if (parsed?.status === 'completed') {
                const matches = parsed?.result?.matches ?? [];
                setMatchResults(matches);
                setShowMatchModal(true);
                setMatchProgress(null);
                if (matches.length === 0) {
                  toast('No matches found between your products', { icon: 'ℹ️' });
                } else {
                  toast.success(`Found ${matches.length} potential match${matches.length > 1 ? 'es' : ''}!`);
                }
              } else if (parsed?.status === 'error') {
                toast.error(parsed?.message ?? 'Matching failed');
                setMatchProgress(null);
              }
            } catch (e: any) { /* skip */ }
          }
        }
      }
    } catch (err: any) {
      toast.error('Matching failed');
      setMatchProgress(null);
    } finally {
      setMatchingProducts(false);
    }
  };

  const handleMatchAction = async (matchId: string, action: 'approve' | 'reject') => {
    setProcessingMatchId(matchId);
    try {
      const res = await fetch(`/api/products/match/${matchId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (res?.ok) {
        setMatchResults(prev => prev.filter(m => m.id !== matchId));
        toast.success(action === 'approve' ? 'Match approved!' : 'Match rejected');
        if (action === 'approve') fetchProducts();
      } else {
        toast.error(`Failed to ${action} match`);
      }
    } catch {
      toast.error(`Failed to ${action} match`);
    } finally {
      setProcessingMatchId(null);
    }
  };

  const handleManualMatch = async () => {
    if (!manualMatchA || !manualMatchB || manualMatchA === manualMatchB) {
      toast.error('Select two different products');
      return;
    }
    setProcessingMatchId('manual');
    try {
      const res = await fetch('/api/products/match', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productAId: manualMatchA, productBId: manualMatchB }),
      });
      if (res?.ok) {
        toast.success('Products linked!');
        setManualMatchA('');
        setManualMatchB('');
        setManualMatchMode(false);
        fetchProducts();
      } else {
        const err = await res?.json?.();
        toast.error(err?.error ?? 'Failed to link');
      }
    } catch {
      toast.error('Failed to link products');
    } finally {
      setProcessingMatchId(null);
    }
  };

  const brands = [...new Set((products ?? [])?.map?.((p: any) => p?.brand)?.filter?.(Boolean) ?? [])];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Package className="text-sky-500" size={28} />
            Products
          </h1>
          <p className="text-sm text-gray-500 mt-1">Manage and analyze CPG product reviews across retailers</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleMatchProducts}
            disabled={matchingProducts || (total ?? 0) < 2}
            className="px-4 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-medium hover:bg-purple-700 transition-all disabled:opacity-50 flex items-center gap-2 shadow-sm"
          >
            {matchingProducts ? <Loader2 size={16} className="animate-spin" /> : <Brain size={16} />}
            Match Products
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2.5 bg-sky-500 text-white rounded-xl text-sm font-medium hover:bg-sky-600 transition-all flex items-center gap-2 shadow-sm"
          >
            <Plus size={16} />
            Add Product
          </button>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search products by name, brand, or UPC..."
              value={searchQuery}
              onChange={(e: any) => setSearchQuery(e?.target?.value ?? '')}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-400"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-4 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2 transition-all border ${
              showFilters ? 'bg-sky-50 border-sky-200 text-sky-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Filter size={16} />
            Filters
            <ChevronDown size={14} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </button>
        </div>

        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="flex flex-wrap gap-3 pt-2 border-t border-gray-100">
                <select
                  value={filterBrand}
                  onChange={(e: any) => setFilterBrand(e?.target?.value ?? '')}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
                >
                  <option value="">All Brands</option>
                  {brands?.map?.((b: any) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
                <select
                  value={filterSource}
                  onChange={(e: any) => setFilterSource(e?.target?.value ?? '')}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
                >
                  <option value="">All Sources</option>
                  <option value="amazon">Amazon</option>
                  <option value="walmart">Walmart</option>
                  <option value="target">Target</option>
                  <option value="google_shopping">Google Shopping</option>
                </select>
                <select
                  value={sortBy}
                  onChange={(e: any) => setSortBy(e?.target?.value ?? 'createdAt')}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
                >
                  <option value="createdAt">Date Added</option>
                  <option value="name">Name</option>
                  <option value="brand">Brand</option>
                </select>
                {(filterBrand || filterSource) && (
                  <button
                    onClick={() => { setFilterBrand(''); setFilterSource(''); }}
                    className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg flex items-center gap-1"
                  >
                    <X size={14} /> Clear
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-4 text-sm text-gray-500">
        <span className="font-medium text-gray-700">{total ?? 0} product{(total ?? 0) !== 1 ? 's' : ''}</span>
        {filterBrand && <span className="px-2 py-0.5 bg-sky-50 text-sky-600 rounded-full text-xs">Brand: {filterBrand}</span>}
        {filterSource && <span className="px-2 py-0.5 bg-sky-50 text-sky-600 rounded-full text-xs">Source: {SOURCE_LABELS[filterSource] ?? filterSource}</span>}
      </div>

      {/* Products Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={32} className="animate-spin text-sky-500" />
        </div>
      ) : (products?.length ?? 0) === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl shadow-sm p-12 text-center"
        >
          <ShoppingCart size={48} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-semibold text-gray-700">No products yet</h3>
          <p className="text-gray-500 mt-1 mb-4">Add your first product by pasting a URL from Amazon, Walmart, Target, or Google Shopping</p>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-6 py-2.5 bg-sky-500 text-white rounded-xl text-sm font-medium hover:bg-sky-600"
          >
            <Plus size={16} className="inline mr-1" /> Add Product
          </button>
        </motion.div>
      ) : (
        <div className="grid gap-4">
          {(products ?? [])?.map?.((product: Product, index: number) => (
            <motion.div
              key={product?.id ?? index}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="bg-white rounded-2xl shadow-sm hover:shadow-md transition-all p-5 group cursor-pointer"
              onClick={() => router.push(`/products/${product?.id}`)}
            >
              <div className="flex flex-col sm:flex-row gap-4">
                {/* Image */}
                <div className="w-full sm:w-20 h-20 bg-gray-100 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center">
                  {product?.imageUrl ? (
                    <img src={product.imageUrl} alt={product?.name ?? 'Product'} className="w-full h-full object-cover" />
                  ) : (
                    <Package size={24} className="text-gray-300" />
                  )}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-gray-900 truncate group-hover:text-sky-600 transition-colors">{product?.name ?? 'Unnamed Product'}</h3>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        {product?.brand && <span className="text-sm text-gray-600 font-medium">{product.brand}</span>}
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${SOURCE_COLORS[product?.source ?? 'unknown'] ?? SOURCE_COLORS.unknown}`}>
                          {SOURCE_LABELS[product?.source ?? 'unknown'] ?? product?.source}
                        </span>
                        {(product?.price ?? 0) > 0 && (
                          <span className="text-sm text-gray-500">${product?.price?.toFixed?.(2)}</span>
                        )}
                        {product?.size && <span className="text-xs text-gray-400">{product.size}</span>}
                      </div>
                    </div>
                  </div>

                  {/* Review Stats */}
                  <div className="flex flex-wrap items-center gap-3 mt-3">
                    <span className="flex items-center gap-1 text-sm text-gray-500">
                      <MessageSquare size={14} />
                      {product?.reviewCount ?? 0} reviews
                    </span>
                    {(product?.sentimentCounts?.positive ?? 0) > 0 && (
                      <span className="text-xs px-2 py-0.5 bg-green-50 text-green-600 rounded-full">
                        +{product.sentimentCounts.positive}
                      </span>
                    )}
                    {(product?.sentimentCounts?.negative ?? 0) > 0 && (
                      <span className="text-xs px-2 py-0.5 bg-red-50 text-red-600 rounded-full">
                        -{product.sentimentCounts.negative}
                      </span>
                    )}
                    {(product?.sentimentCounts?.neutral ?? 0) > 0 && (
                      <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">
                        ~{product.sentimentCounts.neutral}
                      </span>
                    )}
                    {Object.entries(product?.sourceCounts ?? {})?.map?.(([src, count]: [string, any]) => (
                      <span key={src} className="text-xs text-gray-400">
                        {SOURCE_LABELS[src] ?? src}: {count}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => handleScrape(product?.id ?? '')}
                    disabled={scrapingId === product?.id}
                    className="p-2 rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50 transition-all disabled:opacity-50"
                    title="Scrape Reviews"
                  >
                    {scrapingId === product?.id ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                  </button>
                  <button
                    onClick={() => handleAnalyze(product?.id ?? '')}
                    disabled={analyzingId === product?.id}
                    className="p-2 rounded-lg text-gray-400 hover:text-purple-600 hover:bg-purple-50 transition-all disabled:opacity-50"
                    title="AI Analyze"
                  >
                    {analyzingId === product?.id ? <Loader2 size={16} className="animate-spin" /> : <Brain size={16} />}
                  </button>
                  <button
                    onClick={() => setEditProduct(product)}
                    className="p-2 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition-all"
                    title="Edit"
                  >
                    <Edit3 size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(product?.id ?? '')}
                    className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-all"
                    title="Delete"
                  >
                    <Trash2 size={16} />
                  </button>
                  <ChevronRight size={16} className="text-gray-300 group-hover:text-sky-400 transition-colors ml-1" />
                </div>
              </div>
            </motion.div>
          )) ?? []}
        </div>
      )}

      {/* Add/Edit Modal */}
      <AnimatePresence>
        {(showAddModal || editProduct) && (
          <ProductModal
            product={editProduct}
            onClose={() => { setShowAddModal(false); setEditProduct(null); }}
            onSaved={() => { setShowAddModal(false); setEditProduct(null); fetchProducts(); }}
          />
        )}
      </AnimatePresence>

      {/* Reviews Panel */}
      <AnimatePresence>
        {selectedProduct && (
          <ReviewsPanel
            productId={selectedProduct}
            onClose={() => setSelectedProduct(null)}
          />
        )}
      </AnimatePresence>

      {/* Match Progress Overlay */}
      <AnimatePresence>
        {matchProgress && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 right-6 z-50 bg-white rounded-2xl shadow-xl border border-purple-100 p-5 w-80"
          >
            <div className="flex items-center gap-2 mb-3">
              <Loader2 size={18} className="animate-spin text-purple-500" />
              <span className="text-sm font-medium text-gray-700">Matching Products</span>
            </div>
            <p className="text-xs text-gray-500 mb-2">{matchProgress.message}</p>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div
                className="bg-purple-500 h-2 rounded-full transition-all duration-500"
                style={{ width: `${matchProgress.percentage}%` }}
              />
            </div>
            <span className="text-xs text-gray-400 mt-1 block text-right">{matchProgress.percentage}%</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Match Review Modal */}
      <AnimatePresence>
        {showMatchModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
            onClick={() => { if (matchResults.length === 0) { setShowMatchModal(false); setManualMatchMode(false); } }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="p-5 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
                <div>
                  <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    <Brain className="text-purple-500" size={22} />
                    Product Matches
                  </h2>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {matchResults.length > 0
                      ? `${matchResults.length} match${matchResults.length > 1 ? 'es' : ''} to review`
                      : 'No pending matches'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setManualMatchMode(!manualMatchMode)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg flex items-center gap-1.5 transition-all ${
                      manualMatchMode ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    <Link2 size={14} />
                    Manual Link
                  </button>
                  <button
                    onClick={() => { setShowMatchModal(false); setManualMatchMode(false); }}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Manual Match Section */}
              <AnimatePresence>
                {manualMatchMode && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden border-b border-gray-100"
                  >
                    <div className="p-4 bg-purple-50/50 space-y-3">
                      <p className="text-xs text-gray-600 font-medium">Link two products manually:</p>
                      <div className="flex gap-2 items-end">
                        <div className="flex-1">
                          <label className="text-xs text-gray-500 mb-1 block">Product A</label>
                          <select
                            value={manualMatchA}
                            onChange={(e) => setManualMatchA(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 bg-white"
                          >
                            <option value="">Select...</option>
                            {products.map(p => (
                              <option key={p.id} value={p.id} disabled={p.id === manualMatchB}>
                                {p.name} ({SOURCE_LABELS[p.source] ?? p.source})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="flex-1">
                          <label className="text-xs text-gray-500 mb-1 block">Product B</label>
                          <select
                            value={manualMatchB}
                            onChange={(e) => setManualMatchB(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 bg-white"
                          >
                            <option value="">Select...</option>
                            {products.map(p => (
                              <option key={p.id} value={p.id} disabled={p.id === manualMatchA}>
                                {p.name} ({SOURCE_LABELS[p.source] ?? p.source})
                              </option>
                            ))}
                          </select>
                        </div>
                        <button
                          onClick={handleManualMatch}
                          disabled={!manualMatchA || !manualMatchB || processingMatchId === 'manual'}
                          className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 flex items-center gap-1.5 flex-shrink-0"
                        >
                          {processingMatchId === 'manual' ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
                          Link
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Match List */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {matchResults.length === 0 ? (
                  <div className="text-center py-10 text-gray-400">
                    <Check size={32} className="mx-auto mb-2 text-green-400" />
                    <p className="text-sm font-medium">All matches reviewed!</p>
                    <p className="text-xs mt-1">Use Manual Link to connect products yourself.</p>
                  </div>
                ) : (
                  matchResults.map((match) => {
                    const pA = match.productA;
                    const pB = match.productB;
                    const typeColor = match.matchType === 'exact'
                      ? 'bg-green-100 text-green-700'
                      : match.matchType === 'variant'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-blue-100 text-blue-700';
                    return (
                      <motion.div
                        key={match.id}
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -50 }}
                        className="border border-gray-100 rounded-xl p-4 hover:border-purple-200 transition-colors"
                      >
                        {/* Match Header */}
                        <div className="flex items-center gap-2 mb-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${typeColor}`}>
                            {match.matchType}
                          </span>
                          <span className="text-xs text-gray-400">
                            {Math.round((match.confidence ?? 0) * 100)}% confidence
                          </span>
                          {match.isVariant && (
                            <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">
                              Size Variant
                            </span>
                          )}
                          {match.existing && (
                            <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full text-xs">
                              Existing
                            </span>
                          )}
                        </div>

                        {/* Product Pair */}
                        <div className="flex items-center gap-3">
                          {/* Product A */}
                          <div className="flex-1 bg-gray-50 rounded-lg p-3 min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="w-10 h-10 bg-gray-200 rounded-lg flex-shrink-0 overflow-hidden flex items-center justify-center">
                                {pA?.imageUrl ? (
                                  <img src={pA.imageUrl} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <Package size={16} className="text-gray-400" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-800 truncate">{pA?.name ?? 'Unknown'}</p>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${SOURCE_COLORS[pA?.source ?? ''] ?? 'bg-gray-100 text-gray-500'}`}>
                                    {SOURCE_LABELS[pA?.source ?? ''] ?? pA?.source}
                                  </span>
                                  {pA?.size && <span className="text-[10px] text-gray-400">{pA.size}</span>}
                                  {(pA?.price ?? 0) > 0 && <span className="text-[10px] text-gray-400">${pA?.price?.toFixed?.(2)}</span>}
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="flex-shrink-0 text-gray-300">↔</div>

                          {/* Product B */}
                          <div className="flex-1 bg-gray-50 rounded-lg p-3 min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="w-10 h-10 bg-gray-200 rounded-lg flex-shrink-0 overflow-hidden flex items-center justify-center">
                                {pB?.imageUrl ? (
                                  <img src={pB.imageUrl} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <Package size={16} className="text-gray-400" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-800 truncate">{pB?.name ?? 'Unknown'}</p>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${SOURCE_COLORS[pB?.source ?? ''] ?? 'bg-gray-100 text-gray-500'}`}>
                                    {SOURCE_LABELS[pB?.source ?? ''] ?? pB?.source}
                                  </span>
                                  {pB?.size && <span className="text-[10px] text-gray-400">{pB.size}</span>}
                                  {(pB?.price ?? 0) > 0 && <span className="text-[10px] text-gray-400">${pB?.price?.toFixed?.(2)}</span>}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Reason */}
                        {match.reason && (
                          <p className="text-xs text-gray-500 mt-2 italic">&ldquo;{match.reason}&rdquo;</p>
                        )}

                        {/* Actions */}
                        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                          <button
                            onClick={() => handleMatchAction(match.id, 'approve')}
                            disabled={processingMatchId === match.id}
                            className="flex-1 px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-1.5 transition-colors"
                          >
                            {processingMatchId === match.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                            Approve
                          </button>
                          <button
                            onClick={() => handleMatchAction(match.id, 'reject')}
                            disabled={processingMatchId === match.id}
                            className="flex-1 px-3 py-2 bg-white text-red-600 border border-red-200 rounded-lg text-sm font-medium hover:bg-red-50 disabled:opacity-50 flex items-center justify-center gap-1.5 transition-colors"
                          >
                            <XCircle size={14} />
                            Reject
                          </button>
                        </div>
                      </motion.div>
                    );
                  })
                )}
              </div>

              {/* Modal Footer */}
              {matchResults.length > 0 && (
                <div className="p-4 border-t border-gray-100 flex-shrink-0 flex items-center justify-between">
                  <p className="text-xs text-gray-400">{matchResults.length} remaining</p>
                  <button
                    onClick={() => { setShowMatchModal(false); setManualMatchMode(false); }}
                    className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium"
                  >
                    Review Later
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

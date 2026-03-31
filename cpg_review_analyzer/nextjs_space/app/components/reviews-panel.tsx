'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Star, MessageSquare, Plus, Loader2, ThumbsUp, ThumbsDown, Minus } from 'lucide-react';
import toast from 'react-hot-toast';

interface ReviewsPanelProps {
  productId: string;
  onClose: () => void;
}

const SENTIMENT_ICONS: Record<string, any> = {
  positive: ThumbsUp,
  negative: ThumbsDown,
  neutral: Minus,
};

const SENTIMENT_COLORS: Record<string, string> = {
  positive: 'text-green-600 bg-green-50',
  negative: 'text-red-600 bg-red-50',
  neutral: 'text-gray-500 bg-gray-100',
  pending: 'text-yellow-600 bg-yellow-50',
};

export default function ReviewsPanel({ productId, onClose }: ReviewsPanelProps) {
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newReview, setNewReview] = useState({ reviewText: '', rating: '5', source: 'manual', reviewerName: '' });
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    fetchReviews();
  }, [productId]);

  const fetchReviews = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/products/${productId}/reviews`);
      const data = await res?.json?.();
      setReviews(data ?? []);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddReview = async () => {
    if (!newReview?.reviewText?.trim?.()) {
      toast.error('Review text is required');
      return;
    }
    setAdding(true);
    try {
      const res = await fetch(`/api/products/${productId}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newReview),
      });
      if (res?.ok) {
        toast.success('Review added');
        setNewReview({ reviewText: '', rating: '5', source: 'manual', reviewerName: '' });
        setShowAdd(false);
        fetchReviews();
      }
    } catch (err: any) {
      toast.error('Failed to add review');
    } finally {
      setAdding(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/40 flex justify-end"
      onClick={onClose}
    >
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 25 }}
        onClick={(e: any) => e?.stopPropagation?.()}
        className="bg-white w-full max-w-md h-full overflow-y-auto shadow-xl"
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <MessageSquare size={20} className="text-sky-500" />
              Reviews ({reviews?.length ?? 0})
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAdd(!showAdd)}
                className="p-2 rounded-lg bg-sky-50 text-sky-600 hover:bg-sky-100"
              >
                <Plus size={16} />
              </button>
              <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100">
                <X size={18} />
              </button>
            </div>
          </div>

          {showAdd && (
            <div className="bg-gray-50 rounded-xl p-4 mb-4 space-y-3">
              <textarea
                value={newReview?.reviewText ?? ''}
                onChange={(e: any) => setNewReview({ ...(newReview ?? {}), reviewText: e?.target?.value ?? '' })}
                placeholder="Write review text..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
              />
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newReview?.reviewerName ?? ''}
                  onChange={(e: any) => setNewReview({ ...(newReview ?? {}), reviewerName: e?.target?.value ?? '' })}
                  placeholder="Reviewer name"
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
                />
                <select
                  value={newReview?.rating ?? '5'}
                  onChange={(e: any) => setNewReview({ ...(newReview ?? {}), rating: e?.target?.value ?? '5' })}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
                >
                  {[5, 4, 3, 2, 1]?.map?.((r: number) => (
                    <option key={r} value={r}>{r} star{r !== 1 ? 's' : ''}</option>
                  ))}
                </select>
              </div>
              <select
                value={newReview?.source ?? 'manual'}
                onChange={(e: any) => setNewReview({ ...(newReview ?? {}), source: e?.target?.value ?? 'manual' })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              >
                <option value="manual">Manual</option>
                <option value="amazon">Amazon</option>
                <option value="walmart">Walmart</option>
                <option value="target">Target</option>
                <option value="google_shopping">Google Shopping</option>
              </select>
              <button
                onClick={handleAddReview}
                disabled={adding}
                className="w-full py-2 bg-sky-500 text-white rounded-lg text-sm font-medium hover:bg-sky-600 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {adding && <Loader2 size={14} className="animate-spin" />}
                Add Review
              </button>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin text-sky-500" />
            </div>
          ) : (reviews?.length ?? 0) === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <MessageSquare size={32} className="mx-auto mb-2" />
              <p>No reviews yet</p>
              <p className="text-xs mt-1">Scrape or add reviews manually</p>
            </div>
          ) : (
            <div className="space-y-3">
              {(reviews ?? [])?.map?.((review: any) => {
                const SentIcon = SENTIMENT_ICONS[review?.sentiment ?? ''] ?? Minus;
                return (
                  <div key={review?.id} className="bg-gray-50 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-700">
                          {review?.reviewerName ?? 'Anonymous'}
                        </span>
                        {(review?.rating ?? 0) > 0 && (
                          <span className="flex items-center gap-0.5 text-amber-500">
                            <Star size={12} fill="currentColor" />
                            <span className="text-xs">{review?.rating}</span>
                          </span>
                        )}
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${SENTIMENT_COLORS[review?.sentiment ?? 'pending'] ?? SENTIMENT_COLORS.pending}`}>
                        <SentIcon size={10} className="inline mr-0.5" />
                        {review?.sentiment ?? 'pending'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 leading-relaxed">
                      {review?.reviewText?.substring?.(0, 300) ?? ''}
                      {(review?.reviewText?.length ?? 0) > 300 ? '...' : ''}
                    </p>
                    {review?.aiAnalysis && (
                      <p className="text-xs text-purple-600 mt-2 bg-purple-50 px-2 py-1 rounded">
                        AI: {review.aiAnalysis}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
                      <span>{review?.source ?? 'unknown'}</span>
                      {review?.sentimentScore != null && review?.sentimentScore > 0 && (
                        <span>Confidence: {((review.sentimentScore ?? 0) * 100)?.toFixed?.(0)}%</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

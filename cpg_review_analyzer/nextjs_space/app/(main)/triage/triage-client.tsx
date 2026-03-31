'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle, Check, X, Loader2, Package, ArrowRight, RefreshCw, Inbox
} from 'lucide-react';
import toast from 'react-hot-toast';

interface TriageItem {
  id: string;
  productId: string;
  reason: string;
  suggestedMatchId: string | null;
  confidence: number;
  status: string;
  createdAt: string;
  product: {
    id: string;
    name: string;
    brand: string;
    source: string;
    imageUrl: string | null;
    price: number | null;
  };
  suggestedProduct: {
    id: string;
    name: string;
    brand: string;
    source: string;
    imageUrl: string | null;
    price: number | null;
  } | null;
}

export default function TriageClient() {
  const [items, setItems] = useState<TriageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');
  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/triage?status=${filter}`);
      const data = await res?.json?.();
      setItems(data ?? []);
    } catch (err: any) {
      console.error(err);
      toast.error('Failed to load triage items');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleAction = async (id: string, action: 'approve' | 'reject') => {
    setProcessingId(id);
    try {
      const res = await fetch(`/api/triage/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (res?.ok) {
        toast.success(action === 'approve' ? 'Match approved' : 'Match rejected');
        fetchItems();
      } else {
        toast.error('Action failed');
      }
    } catch (err: any) {
      toast.error('Action failed');
    } finally {
      setProcessingId(null);
    }
  };

  const getConfidenceColor = (conf: number) => {
    if (conf >= 0.7) return 'text-yellow-600 bg-yellow-50';
    if (conf >= 0.5) return 'text-orange-600 bg-orange-50';
    return 'text-red-600 bg-red-50';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <AlertTriangle className="text-amber-500" size={28} />
            Triage
          </h1>
          <p className="text-sm text-gray-500 mt-1">Review and resolve uncertain AI product matches</p>
        </div>
        <button
          onClick={fetchItems}
          className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 flex items-center gap-2"
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {(['pending', 'approved', 'rejected', 'all'] as const)?.map?.((s: string) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              filter === s ? 'bg-amber-100 text-amber-700' : 'bg-white text-gray-500 hover:bg-gray-50 border border-gray-200'
            }`}
          >
            {s?.charAt?.(0)?.toUpperCase?.() ?? ''}{s?.slice?.(1) ?? ''}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={32} className="animate-spin text-amber-500" />
        </div>
      ) : (items?.length ?? 0) === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl shadow-sm p-12 text-center"
        >
          <Inbox size={48} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-semibold text-gray-700">No triage items</h3>
          <p className="text-gray-500 mt-1">All product matches have been resolved or none are pending</p>
        </motion.div>
      ) : (
        <div className="space-y-4">
          <AnimatePresence mode="popLayout">
            {(items ?? [])?.map?.((item: TriageItem, idx: number) => (
              <motion.div
                key={item?.id ?? idx}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -100 }}
                transition={{ delay: idx * 0.05 }}
                className="bg-white rounded-2xl shadow-sm p-5"
              >
                <div className="flex items-center gap-2 mb-4">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${getConfidenceColor(item?.confidence ?? 0)}`}>
                    {((item?.confidence ?? 0) * 100)?.toFixed?.(0)}% confidence
                  </span>
                  <span className="text-xs text-gray-400">{item?.reason ?? ''}</span>
                  {item?.status !== 'pending' && (
                    <span className={`ml-auto px-2.5 py-1 rounded-full text-xs font-medium ${
                      item?.status === 'approved' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'
                    }`}>
                      {item?.status}
                    </span>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-4">
                  {/* Product A */}
                  <div className="flex-1 bg-gray-50 rounded-xl p-4 w-full">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-gray-200 rounded-lg flex items-center justify-center overflow-hidden">
                        {item?.product?.imageUrl ? (
                          <img src={item.product.imageUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <Package size={18} className="text-gray-400" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm text-gray-900 truncate">{item?.product?.name ?? 'Unknown'}</p>
                        <p className="text-xs text-gray-500">{item?.product?.brand ?? ''} · {item?.product?.source ?? ''}</p>
                        {(item?.product?.price ?? 0) > 0 && (
                          <p className="text-xs text-gray-400">${item?.product?.price?.toFixed?.(2)}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <ArrowRight size={20} className="text-gray-300 flex-shrink-0" />

                  {/* Product B */}
                  <div className="flex-1 bg-gray-50 rounded-xl p-4 w-full">
                    {item?.suggestedProduct ? (
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-gray-200 rounded-lg flex items-center justify-center overflow-hidden">
                          {item?.suggestedProduct?.imageUrl ? (
                            <img src={item.suggestedProduct.imageUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <Package size={18} className="text-gray-400" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm text-gray-900 truncate">{item?.suggestedProduct?.name ?? 'Unknown'}</p>
                          <p className="text-xs text-gray-500">{item?.suggestedProduct?.brand ?? ''} · {item?.suggestedProduct?.source ?? ''}</p>
                          {(item?.suggestedProduct?.price ?? 0) > 0 && (
                            <p className="text-xs text-gray-400">${item?.suggestedProduct?.price?.toFixed?.(2)}</p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400 text-center">No suggested match</p>
                    )}
                  </div>
                </div>

                {item?.status === 'pending' && (
                  <div className="flex justify-end gap-2 mt-4">
                    <button
                      onClick={() => handleAction(item?.id ?? '', 'reject')}
                      disabled={processingId === item?.id}
                      className="px-4 py-2 border border-red-200 text-red-600 rounded-xl text-sm font-medium hover:bg-red-50 flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {processingId === item?.id ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                      Reject
                    </button>
                    <button
                      onClick={() => handleAction(item?.id ?? '', 'approve')}
                      disabled={processingId === item?.id}
                      className="px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {processingId === item?.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                      Approve Match
                    </button>
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

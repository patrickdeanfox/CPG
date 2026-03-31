'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Link as LinkIcon, Loader2, Package } from 'lucide-react';
import toast from 'react-hot-toast';

interface ProductModalProps {
  product?: any;
  onClose: () => void;
  onSaved: () => void;
}

export default function ProductModal({ product, onClose, onSaved }: ProductModalProps) {
  const isEdit = !!product;
  const [url, setUrl] = useState(product?.sourceUrl ?? '');
  const [name, setName] = useState(product?.name ?? '');
  const [brand, setBrand] = useState(product?.brand ?? '');
  const [upc, setUpc] = useState(product?.upc ?? '');
  const [price, setPrice] = useState(product?.price?.toString?.() ?? '');
  const [size, setSize] = useState(product?.size ?? '');
  const [imageUrl, setImageUrl] = useState(product?.imageUrl ?? '');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'url' | 'manual'>(isEdit ? 'manual' : 'url');

  const handleSubmit = async () => {
    if (mode === 'url' && !url?.trim?.()) {
      toast.error('Please enter a product URL');
      return;
    }
    if (mode === 'manual' && !name?.trim?.()) {
      toast.error('Please enter a product name');
      return;
    }

    setLoading(true);
    try {
      const payload: any = { name, brand, upc, price, size, imageUrl };
      if (mode === 'url') payload.url = url;

      let res;
      if (isEdit) {
        res = await fetch(`/api/products/${product?.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch('/api/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      const data = await res?.json?.();
      if (res?.ok) {
        toast.success(isEdit ? 'Product updated!' : 'Product added!');
        onSaved?.();
      } else {
        toast.error(data?.error ?? 'Operation failed');
      }
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e: any) => e?.stopPropagation?.()}
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Package size={20} className="text-sky-500" />
              {isEdit ? 'Edit Product' : 'Add Product'}
            </h2>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100">
              <X size={18} />
            </button>
          </div>

          {!isEdit && (
            <div className="flex gap-2 mb-5">
              <button
                onClick={() => setMode('url')}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                  mode === 'url' ? 'bg-sky-100 text-sky-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-150'
                }`}
              >
                <LinkIcon size={14} className="inline mr-1" /> From URL
              </button>
              <button
                onClick={() => setMode('manual')}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                  mode === 'manual' ? 'bg-sky-100 text-sky-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-150'
                }`}
              >
                <Package size={14} className="inline mr-1" /> Manual
              </button>
            </div>
          )}

          <div className="space-y-4">
            {mode === 'url' && !isEdit && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Product URL</label>
                <input
                  type="url"
                  value={url}
                  onChange={(e: any) => setUrl(e?.target?.value ?? '')}
                  placeholder="https://www.amazon.com/dp/... or https://a.co/d/..."
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
                />
                <p className="text-xs text-gray-400 mt-1">Supports Amazon, Walmart, Target, Google Shopping — shortened URLs (a.co, amzn.to) auto-resolved</p>
              </div>
            )}

            {(mode === 'manual' || isEdit) && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e: any) => setName(e?.target?.value ?? '')}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Brand</label>
                    <input
                      type="text"
                      value={brand}
                      onChange={(e: any) => setBrand(e?.target?.value ?? '')}
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">UPC/Barcode</label>
                    <input
                      type="text"
                      value={upc}
                      onChange={(e: any) => setUpc(e?.target?.value ?? '')}
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Price</label>
                    <input
                      type="number"
                      step="0.01"
                      value={price}
                      onChange={(e: any) => setPrice(e?.target?.value ?? '')}
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Size</label>
                    <input
                      type="text"
                      value={size}
                      onChange={(e: any) => setSize(e?.target?.value ?? '')}
                      placeholder="e.g. 12 oz"
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Image URL</label>
                  <input
                    type="url"
                    value={imageUrl}
                    onChange={(e: any) => setImageUrl(e?.target?.value ?? '')}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
                  />
                </div>
              </>
            )}
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <button
              onClick={onClose}
              className="px-5 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="px-5 py-2.5 bg-sky-500 text-white rounded-xl text-sm font-medium hover:bg-sky-600 disabled:opacity-50 flex items-center gap-2"
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              {loading ? (mode === 'url' ? 'Importing...' : 'Saving...') : (isEdit ? 'Save Changes' : 'Add Product')}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

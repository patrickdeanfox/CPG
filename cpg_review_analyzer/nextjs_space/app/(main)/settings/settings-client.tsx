'use client';

import { useState, useEffect } from 'react';
import { Settings, Key, Loader2, CheckCircle, XCircle, Save, Zap, Shield, Globe } from 'lucide-react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';

export default function SettingsClient() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const [confidenceThreshold, setConfidenceThreshold] = useState('80');
  const [defaultSource, setDefaultSource] = useState('amazon');
  const [scraperApiKey, setScraperApiKey] = useState('');

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/settings');
      const data = await res?.json?.();
      setSettings(data ?? {});
      if (data?.confidence_threshold) setConfidenceThreshold(data.confidence_threshold);
      if (data?.default_source) setDefaultSource(data.default_source);
      if (data?.scraper_api_key) setScraperApiKey(data.scraper_api_key);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confidence_threshold: confidenceThreshold,
          default_source: defaultSource,
          scraper_api_key: scraperApiKey,
        }),
      });
      if (res?.ok) {
        toast.success('Settings saved!');
      } else {
        toast.error('Failed to save settings');
      }
    } catch (err: any) {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleTestApi = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/settings/test', { method: 'POST' });
      const data = await res?.json?.();
      setTestResult({
        success: data?.success ?? false,
        message: data?.success ? (data?.message ?? 'Connected') : (data?.error ?? 'Failed'),
      });
      if (data?.success) {
        toast.success('API connection successful!');
      } else {
        toast.error(data?.error ?? 'Test failed');
      }
    } catch (err: any) {
      setTestResult({ success: false, message: err?.message ?? 'Connection failed' });
      toast.error('Connection test failed');
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-sky-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Settings className="text-sky-500" size={28} />
          Settings
        </h1>
        <p className="text-sm text-gray-500 mt-1">Configure API keys and application preferences</p>
      </div>

      {/* API Key Section */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl shadow-sm p-6"
      >
        <div className="flex items-center gap-2 mb-4">
          <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center">
            <Key size={20} className="text-purple-500" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">AI API Connection</h3>
            <p className="text-xs text-gray-500">Powered by Abacus.AI LLM API for sentiment analysis and product matching</p>
          </div>
        </div>

        <div className="bg-gray-50 rounded-xl p-4 mb-4">
          <div className="flex items-center gap-2 text-sm">
            <Shield size={14} className="text-green-500" />
            <span className="text-gray-600">API key is securely configured via environment variables</span>
          </div>
        </div>

        <button
          onClick={handleTestApi}
          disabled={testing}
          className="px-5 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-medium hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2"
        >
          {testing ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
          Test Connection
        </button>

        {testResult && (
          <div className={`mt-3 p-3 rounded-xl text-sm flex items-center gap-2 ${
            testResult?.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}>
            {testResult?.success ? <CheckCircle size={16} /> : <XCircle size={16} />}
            {testResult?.message ?? ''}
          </div>
        )}
      </motion.div>

      {/* ScraperAPI Section */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="bg-white rounded-2xl shadow-sm p-6"
      >
        <div className="flex items-center gap-2 mb-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
            <Globe size={20} className="text-emerald-500" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">ScraperAPI (Optional)</h3>
            <p className="text-xs text-gray-500">Proxy service for reliable review scraping — bypasses anti-bot protections</p>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ScraperAPI Key
            </label>
            <input
              type="password"
              value={scraperApiKey}
              onChange={(e: any) => setScraperApiKey(e?.target?.value ?? '')}
              placeholder="Enter your ScraperAPI key (optional)"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
            />
          </div>
          <div className="bg-emerald-50 rounded-xl p-3">
            <p className="text-xs text-emerald-700">
              <strong>Free tier:</strong> 5,000 requests/month. Sign up at{' '}
              <a
                href="https://www.scraperapi.com/?fp_ref=deepagent"
                target="_blank"
                rel="noopener noreferrer"
                className="underline font-medium"
              >
                scraperapi.com
              </a>
              . When configured, ScraperAPI is used as a fallback if direct scraping fails due to anti-bot protections.
            </p>
          </div>
        </div>
      </motion.div>

      {/* App Config */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-white rounded-2xl shadow-sm p-6"
      >
        <h3 className="font-semibold text-gray-900 mb-4">Application Configuration</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Confidence Threshold for Auto-Approval (%)
            </label>
            <input
              type="number"
              min="0"
              max="100"
              value={confidenceThreshold}
              onChange={(e: any) => setConfidenceThreshold(e?.target?.value ?? '80')}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
            />
            <p className="text-xs text-gray-400 mt-1">Matches below this threshold will go to triage for review</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Default Review Source
            </label>
            <select
              value={defaultSource}
              onChange={(e: any) => setDefaultSource(e?.target?.value ?? 'amazon')}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
            >
              <option value="amazon">Amazon</option>
              <option value="walmart">Walmart</option>
              <option value="target">Target</option>
              <option value="google_shopping">Google Shopping</option>
            </select>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2.5 bg-sky-500 text-white rounded-xl text-sm font-medium hover:bg-sky-600 disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Save Settings
          </button>
        </div>
      </motion.div>

      {/* Info section */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-sky-50 rounded-2xl p-6"
      >
        <h3 className="font-semibold text-sky-800 mb-2">How it works</h3>
        <ul className="text-sm text-sky-700 space-y-2">
          <li className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-sky-200 flex items-center justify-center text-xs font-bold text-sky-700 flex-shrink-0 mt-0.5">1</span>
            Add products by pasting URLs from Amazon, Walmart, Target, or Google Shopping
          </li>
          <li className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-sky-200 flex items-center justify-center text-xs font-bold text-sky-700 flex-shrink-0 mt-0.5">2</span>
            Trigger review scraping to collect product reviews from retailer pages
          </li>
          <li className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-sky-200 flex items-center justify-center text-xs font-bold text-sky-700 flex-shrink-0 mt-0.5">3</span>
            Run AI analysis to determine sentiment and match similar products
          </li>
          <li className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-sky-200 flex items-center justify-center text-xs font-bold text-sky-700 flex-shrink-0 mt-0.5">4</span>
            Review uncertain matches in Triage and view insights in Analytics
          </li>
        </ul>
      </motion.div>
    </div>
  );
}

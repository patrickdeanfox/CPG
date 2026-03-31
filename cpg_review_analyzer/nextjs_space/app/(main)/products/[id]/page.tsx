export const dynamic = 'force-dynamic';

import ProductDetailClient from './product-detail-client';

export default function ProductDetailPage({ params }: { params: { id: string } }) {
  return <ProductDetailClient productId={params.id} />;
}

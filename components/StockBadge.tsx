'use client';

import { Badge } from '@/components/ui/badge';

interface StockBadgeProps {
  available: number;
  total: number;
  showNumbers?: boolean;
}

export function StockBadge({ available, total, showNumbers = true }: StockBadgeProps) {
  if (available === 0) {
    return (
      <Badge variant="danger">
        {showNumbers ? 'Out of Stock' : 'Out of Stock'}
      </Badge>
    );
  }

  if (available <= 3) {
    return (
      <Badge variant="warning">
        {showNumbers ? `${available} left` : 'Low Stock'}
      </Badge>
    );
  }

  if (available <= 10) {
    return (
      <Badge variant="warning">
        {showNumbers ? `${available} in stock` : 'Limited'}
      </Badge>
    );
  }

  return (
    <Badge variant="success">
      {showNumbers ? `${available} in stock` : 'In Stock'}
    </Badge>
  );
}

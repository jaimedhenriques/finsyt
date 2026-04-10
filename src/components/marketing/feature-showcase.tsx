'use client';

import { useState } from 'react';
import { Monitor, Smartphone, Tablet, ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FeatureShowcaseProps {
  title: string;
  description: string;
  imageUrl?: string;
}

export function FeatureShowcase({ title, description, imageUrl }: FeatureShowcaseProps) {
  const [device, setDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');

  const deviceWidths = {
    desktop: 'w-full',
    tablet: 'w-3/4',
    mobile: 'w-1/3',
  };

  const deviceIcons = {
    desktop: Monitor,
    tablet: Tablet,
    mobile: Smartphone,
  };

  return (
    <div className="rounded-2xl border bg-gradient-to-br from-card to-muted/30 p-6 shadow-lg">
      {/* Device Selector */}
      <div className="flex items-center justify-center gap-2 mb-6">
        {(['desktop', 'tablet', 'mobile'] as const).map((d) => {
          const Icon = deviceIcons[d];
          return (
            <button
              key={d}
              onClick={() => setDevice(d)}
              className={cn(
                'p-2 rounded-lg transition-all',
                device === d
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
              aria-label={`View ${d} version`}
            >
              <Icon className="w-4 h-4" />
            </button>
          );
        })}
      </div>

      {/* Screenshot Placeholder */}
      <div className="flex justify-center">
        <div
          className={cn(
            'transition-all duration-300 ease-out',
            deviceWidths[device]
          )}
        >
          <div className="rounded-xl border bg-background shadow-inner overflow-hidden">
            {/* Browser Chrome */}
            <div className="bg-muted/50 px-3 py-2 border-b flex items-center gap-2">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
                <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
              </div>
              <div className="flex-1">
                <div className="mx-auto w-1/2 h-4 rounded bg-muted" />
              </div>
            </div>

            {/* Screenshot Content */}
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={`${title} screenshot`}
                className="w-full h-auto"
              />
            ) : (
              <div className="aspect-video bg-gradient-to-br from-muted/50 to-muted flex flex-col items-center justify-center p-8 text-center">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                  <ImageIcon className="w-8 h-8 text-primary/60" />
                </div>
                <p className="text-sm font-medium text-muted-foreground mb-1">
                  {title}
                </p>
                <p className="text-xs text-muted-foreground/60 max-w-[200px]">
                  Screenshot placeholder - Add your feature screenshot here
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Feature Label */}
      <div className="mt-6 text-center">
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

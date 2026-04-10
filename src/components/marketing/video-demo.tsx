'use client';

import { useState } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface VideoDemoProps {
  videoUrl?: string;
  thumbnailUrl?: string;
  title?: string;
  duration?: string;
}

export function VideoDemo({
  videoUrl,
  thumbnailUrl,
  title = 'See Finsyt in Action',
  duration = '2:30',
}: VideoDemoProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  const handlePlay = () => {
    setIsPlaying(true);
    // In a real implementation, this would start the video
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-2xl md:text-3xl font-bold mb-2">{title}</h2>
        <p className="text-muted-foreground">
          Watch how Finsyt transforms financial research in minutes
        </p>
      </div>

      <div className="relative group rounded-2xl overflow-hidden border shadow-2xl bg-black">
        {/* Video Player / Placeholder */}
        {videoUrl ? (
          <video
            src={videoUrl}
            poster={thumbnailUrl}
            className="w-full aspect-video"
            controls={isPlaying}
            muted={isMuted}
          />
        ) : (
          <div className="relative aspect-video bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
            {/* Animated Background Pattern */}
            <div className="absolute inset-0 opacity-30">
              <div className="absolute inset-0 bg-grid-white/10" />
              <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-primary/20 rounded-full blur-3xl animate-pulse" />
              <div className="absolute bottom-1/4 right-1/4 w-48 h-48 bg-primary/30 rounded-full blur-3xl animate-pulse delay-1000" />
            </div>

            {/* Finsyt Logo/Preview */}
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
              <div className="relative">
                {/* Play Button */}
                <button
                  onClick={handlePlay}
                  className="group/play relative w-20 h-20 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center transition-all hover:scale-110 hover:bg-white/20"
                >
                  <div className="absolute inset-0 rounded-full bg-primary/50 blur-xl opacity-0 group-hover/play:opacity-100 transition-opacity" />
                  <Play className="w-8 h-8 text-white ml-1 relative z-10" />
                </button>

                {/* Ripple Animation */}
                <div className="absolute inset-0 rounded-full border-2 border-white/30 animate-ping" />
              </div>

              <p className="mt-6 text-lg font-medium">Watch Product Demo</p>
              <div className="flex items-center gap-2 mt-2 text-sm text-white/60">
                <Clock className="w-4 h-4" />
                <span>{duration}</span>
              </div>
            </div>

            {/* Placeholder Elements - Simulate UI */}
            <div className="absolute bottom-0 left-0 right-0 p-6">
              <div className="flex items-center gap-4">
                <div className="flex-1 h-1 bg-white/20 rounded-full overflow-hidden">
                  <div className="h-full w-0 bg-primary rounded-full" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Video Controls Overlay (when playing) */}
        {isPlaying && !videoUrl && (
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:text-white hover:bg-white/20"
                onClick={() => setIsPlaying(false)}
              >
                <Pause className="w-5 h-5" />
              </Button>

              {/* Progress Bar */}
              <div className="flex-1 h-1 bg-white/20 rounded-full overflow-hidden cursor-pointer">
                <div className="h-full w-1/3 bg-primary rounded-full" />
              </div>

              <span className="text-white text-sm">0:45 / {duration}</span>

              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:text-white hover:bg-white/20"
                onClick={() => setIsMuted(!isMuted)}
              >
                {isMuted ? (
                  <VolumeX className="w-5 h-5" />
                ) : (
                  <Volume2 className="w-5 h-5" />
                )}
              </Button>

              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:text-white hover:bg-white/20"
              >
                <Maximize className="w-5 h-5" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Video Features */}
      <div className="mt-8 grid grid-cols-3 gap-4 text-center">
        {[
          { label: 'Natural Language Queries', time: '0:00' },
          { label: 'Real-Time Analysis', time: '0:55' },
          { label: 'Export & Reports', time: '1:45' },
        ].map((chapter) => (
          <button
            key={chapter.label}
            className="p-4 rounded-xl border bg-card hover:bg-muted/50 transition-colors text-left"
          >
            <p className="text-sm font-medium">{chapter.label}</p>
            <p className="text-xs text-muted-foreground mt-1">Jump to {chapter.time}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

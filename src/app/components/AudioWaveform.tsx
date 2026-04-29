import { useEffect, useRef } from 'react';

interface AudioWaveformProps {
  audioBuffer: AudioBuffer | null;
  isPlaying: boolean;
  currentTime?: number;
}

export function AudioWaveform({ audioBuffer, isPlaying, currentTime = 0 }: AudioWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>();

  useEffect(() => {
    if (!audioBuffer || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    
    // Ensure valid dimensions
    if (rect.width === 0 || rect.height === 0) return;
    
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    // Get audio data
    const rawData = audioBuffer.getChannelData(0);
    const samples = Math.floor(rect.width);
    const blockSize = Math.floor(rawData.length / samples);
    const filteredData = [];

    for (let i = 0; i < samples; i++) {
      const blockStart = blockSize * i;
      let sum = 0;
      for (let j = 0; j < blockSize; j++) {
        sum += Math.abs(rawData[blockStart + j] || 0);
      }
      filteredData.push(sum / blockSize);
    }

    // Normalize data
    const maxValue = Math.max(...filteredData);
    const multiplier = maxValue > 0 ? Math.pow(maxValue, -1) : 1;
    const normalizedData = filteredData.map(n => n * multiplier);

    // Draw waveform
    const draw = () => {
      ctx.clearRect(0, 0, rect.width, rect.height);
      
      // Background gradient
      const gradient = ctx.createLinearGradient(0, 0, 0, rect.height);
      gradient.addColorStop(0, 'rgba(192, 192, 192, 0.1)');
      gradient.addColorStop(0.5, 'rgba(128, 128, 128, 0.2)');
      gradient.addColorStop(1, 'rgba(192, 192, 192, 0.1)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, rect.width, rect.height);

      // Draw waveform bars
      const barWidth = rect.width / normalizedData.length;
      const barGap = barWidth * 0.2;
      const actualBarWidth = barWidth - barGap;

      normalizedData.forEach((value, index) => {
        const barHeight = value * rect.height * 0.8;
        const x = index * barWidth;
        const y = (rect.height - barHeight) / 2;

        // Ensure all values are finite
        if (!isFinite(barHeight) || !isFinite(x) || !isFinite(y) || barHeight <= 0) {
          return;
        }

        // Create gradient for each bar
        const barGradient = ctx.createLinearGradient(x, y, x, y + barHeight);
        
        // Check if this bar is in the "played" region
        const playProgress = currentTime / audioBuffer.duration;
        const barProgress = index / normalizedData.length;
        
        if (barProgress <= playProgress) {
          // Played portion - white/silver glow
          barGradient.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
          barGradient.addColorStop(0.5, 'rgba(192, 192, 192, 0.8)');
          barGradient.addColorStop(1, 'rgba(255, 255, 255, 0.9)');
          
          // Add glow effect
          ctx.shadowBlur = 10;
          ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
        } else {
          // Unplayed portion - dark gray
          barGradient.addColorStop(0, 'rgba(128, 128, 128, 0.6)');
          barGradient.addColorStop(0.5, 'rgba(96, 96, 96, 0.5)');
          barGradient.addColorStop(1, 'rgba(128, 128, 128, 0.6)');
          
          ctx.shadowBlur = 0;
        }

        ctx.fillStyle = barGradient;
        ctx.fillRect(x + barGap / 2, y, actualBarWidth, barHeight);
      });

      // Draw playhead
      if (currentTime > 0 && currentTime <= audioBuffer.duration) {
        const playheadX = (currentTime / audioBuffer.duration) * rect.width;
        ctx.shadowBlur = 15;
        ctx.shadowColor = 'rgba(255, 255, 255, 0.9)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(playheadX, 0);
        ctx.lineTo(playheadX, rect.height);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    };

    draw();

    // Animation loop for playback
    const animate = () => {
      if (isPlaying) {
        draw();
        animationFrameRef.current = requestAnimationFrame(animate);
      }
    };

    if (isPlaying) {
      animate();
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [audioBuffer, isPlaying, currentTime]);

  return (
    <div className="relative w-full h-32 rounded-lg overflow-hidden border-2 border-gray-600 bg-black/60">
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ display: 'block' }}
      />
      {!audioBuffer && (
        <div 
          className="absolute inset-0 flex items-center justify-center text-gray-500 text-sm"
          style={{ fontFamily: 'Times New Roman', fontStyle: 'italic' }}
        >
          Upload audio to see waveform
        </div>
      )}
    </div>
  );
}
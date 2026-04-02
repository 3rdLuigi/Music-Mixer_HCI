import { useEffect, useRef, useState } from 'react';
import { Upload, Play, Pause, Download } from 'lucide-react';
import { Button } from './ui/button';
import { GestureData } from './GestureTracker';
import { AudioWaveform } from './AudioWaveform';

interface AudioMixerProps {
  gestureData: GestureData;
}

export function AudioMixer({ gestureData }: AudioMixerProps) {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.7);
  const [pitch, setPitch] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [filterFreq, setFilterFreq] = useState(1000);
  const [hasEcho, setHasEcho] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [startTime, setStartTime] = useState(0);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const filterNodeRef = useRef<BiquadFilterNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const delayNodeRef = useRef<DelayNode | null>(null);
  const delayGainRef = useRef<GainNode | null>(null);
  const convolverRef = useRef<ConvolverNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  // Initialize audio context
  useEffect(() => {
    audioContextRef.current = new AudioContext();
    gainNodeRef.current = audioContextRef.current.createGain();
    filterNodeRef.current = audioContextRef.current.createBiquadFilter();
    analyserRef.current = audioContextRef.current.createAnalyser();
    delayNodeRef.current = audioContextRef.current.createDelay(5.0);
    delayGainRef.current = audioContextRef.current.createGain();
    convolverRef.current = audioContextRef.current.createConvolver();

    filterNodeRef.current.type = 'lowpass';
    filterNodeRef.current.frequency.value = 1000;
    filterNodeRef.current.Q.value = 1;

    delayNodeRef.current.delayTime.value = 0.3;
    delayGainRef.current.gain.value = 0;

    gainNodeRef.current.gain.value = 0.7;

    // Create impulse response for reverb
    const impulseLength = audioContextRef.current.sampleRate * 2;
    const impulse = audioContextRef.current.createBuffer(2, impulseLength, audioContextRef.current.sampleRate);
    const impulseL = impulse.getChannelData(0);
    const impulseR = impulse.getChannelData(1);
    
    for (let i = 0; i < impulseLength; i++) {
      impulseL[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / impulseLength, 2);
      impulseR[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / impulseLength, 2);
    }
    convolverRef.current.buffer = impulse;

    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  // Handle gesture-based controls
  useEffect(() => {
    const hand = gestureData.rightHand || gestureData.leftHand;
    if (!hand) return;

    // Pinch distance → Volume
    const normalizedPinch = Math.max(0, Math.min(1, hand.pinchDistance / 0.3));
    const newVolume = normalizedPinch;
    setVolume(newVolume);
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = newVolume;
    }

    // Hand Y position → Pitch shift (vertical position)
    const pitchShift = (hand.position.y - 0.5) * 24; // ±12 semitones
    setPitch(pitchShift);
    
    // Hand X position → Playback speed (horizontal movement)
    const speed = 0.5 + hand.position.x * 1.5; // 0.5x to 2x
    setPlaybackSpeed(speed);

    // Hand rotation → Audio Filter
    const normalizedRotation = ((hand.rotation + 180) % 360) / 360;
    const newFilterFreq = 100 + normalizedRotation * 10000;
    setFilterFreq(newFilterFreq);
    if (filterNodeRef.current) {
      filterNodeRef.current.frequency.value = newFilterFreq;
    }

    // Fist gesture → Play/Pause
    if (hand.isFist && !isPlaying && audioBufferRef.current) {
      handlePlayback();
    } else if (!hand.isFist && isPlaying) {
      // Can optionally pause on open hand
    }

  }, [gestureData]);

  // Two hands → Echo/Reverb
  useEffect(() => {
    const shouldHaveEcho = gestureData.bothHandsPresent;
    setHasEcho(shouldHaveEcho);
    
    if (delayGainRef.current) {
      delayGainRef.current.gain.value = shouldHaveEcho ? 0.4 : 0;
    }
  }, [gestureData.bothHandsPresent]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && audioContextRef.current) {
      setAudioFile(file);
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
      audioBufferRef.current = audioBuffer;
    }
  };

  const handlePlayback = () => {
    if (!audioBufferRef.current || !audioContextRef.current) return;

    if (isPlaying && sourceNodeRef.current) {
      sourceNodeRef.current.stop();
      setIsPlaying(false);
      return;
    }

    const source = audioContextRef.current.createBufferSource();
    source.buffer = audioBufferRef.current;
    
    // Apply playback speed
    source.playbackRate.value = playbackSpeed;
    
    // Connect audio graph
    source.connect(filterNodeRef.current!);
    filterNodeRef.current!.connect(gainNodeRef.current!);
    
    // Echo/reverb routing
    gainNodeRef.current!.connect(delayNodeRef.current!);
    delayNodeRef.current!.connect(delayGainRef.current!);
    delayGainRef.current!.connect(gainNodeRef.current!); // Feedback loop
    
    gainNodeRef.current!.connect(convolverRef.current!);
    convolverRef.current!.connect(analyserRef.current!);
    
    gainNodeRef.current!.connect(analyserRef.current!);
    analyserRef.current!.connect(audioContextRef.current.destination);
    
    source.onended = () => setIsPlaying(false);
    source.start();
    sourceNodeRef.current = source;
    setIsPlaying(true);
    setStartTime(audioContextRef.current.currentTime);
  };

  const togglePlayback = () => {
    handlePlayback();
  };

  // Update current time for waveform
  useEffect(() => {
    let animationFrameId: number;
    const updateTime = () => {
      if (isPlaying && audioContextRef.current) {
        const elapsed = audioContextRef.current.currentTime - startTime;
        setCurrentTime(elapsed);
        animationFrameId = requestAnimationFrame(updateTime);
      }
    };
    if (isPlaying) {
      animationFrameId = requestAnimationFrame(updateTime);
    }
    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [isPlaying, startTime]);

  const handleDownload = async () => {
    if (!audioBufferRef.current || !audioContextRef.current) return;

    // Create offline context for rendering
    const offlineCtx = new OfflineAudioContext(
      audioBufferRef.current.numberOfChannels,
      audioBufferRef.current.length,
      audioBufferRef.current.sampleRate
    );

    const source = offlineCtx.createBufferSource();
    source.buffer = audioBufferRef.current;

    // Recreate the audio processing chain
    const gain = offlineCtx.createGain();
    const filter = offlineCtx.createBiquadFilter();
    const delay = offlineCtx.createDelay(5.0);
    const delayGain = offlineCtx.createGain();
    const convolver = offlineCtx.createConvolver();

    // Apply current settings
    gain.gain.value = volume;
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    filter.Q.value = 1;
    delay.delayTime.value = 0.3;
    delayGain.gain.value = hasEcho ? 0.4 : 0;
    source.playbackRate.value = playbackSpeed;

    // Create impulse for reverb
    const impulseLength = offlineCtx.sampleRate * 2;
    const impulse = offlineCtx.createBuffer(2, impulseLength, offlineCtx.sampleRate);
    const impulseL = impulse.getChannelData(0);
    const impulseR = impulse.getChannelData(1);
    for (let i = 0; i < impulseLength; i++) {
      impulseL[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / impulseLength, 2);
      impulseR[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / impulseLength, 2);
    }
    convolver.buffer = impulse;

    // Connect chain
    source.connect(filter);
    filter.connect(gain);
    gain.connect(delay);
    delay.connect(delayGain);
    delayGain.connect(gain);
    gain.connect(convolver);
    convolver.connect(offlineCtx.destination);
    gain.connect(offlineCtx.destination);

    source.start();

    // Render audio
    const renderedBuffer = await offlineCtx.startRendering();

    // Convert to WAV
    const wav = audioBufferToWav(renderedBuffer);
    const blob = new Blob([wav], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);

    // Download
    const a = document.createElement('a');
    a.href = url;
    a.download = `edited-${audioFile?.name || 'audio'}.wav`;
    a.click();

    URL.revokeObjectURL(url);
  };

  // Helper function to convert AudioBuffer to WAV
  const audioBufferToWav = (buffer: AudioBuffer): ArrayBuffer => {
    const length = buffer.length * buffer.numberOfChannels * 2 + 44;
    const arrayBuffer = new ArrayBuffer(length);
    const view = new DataView(arrayBuffer);
    const channels = [];
    let offset = 0;
    let pos = 0;

    // Write WAV header
    const setUint16 = (data: number) => {
      view.setUint16(pos, data, true);
      pos += 2;
    };
    const setUint32 = (data: number) => {
      view.setUint32(pos, data, true);
      pos += 4;
    };

    // RIFF identifier
    setUint32(0x46464952);
    // file length
    setUint32(length - 8);
    // RIFF type
    setUint32(0x45564157);
    // format chunk identifier
    setUint32(0x20746d66);
    // format chunk length
    setUint32(16);
    // sample format (raw)
    setUint16(1);
    // channel count
    setUint16(buffer.numberOfChannels);
    // sample rate
    setUint32(buffer.sampleRate);
    // byte rate
    setUint32(buffer.sampleRate * 2 * buffer.numberOfChannels);
    // block align
    setUint16(buffer.numberOfChannels * 2);
    // bits per sample
    setUint16(16);
    // data chunk identifier
    setUint32(0x61746164);
    // data chunk length
    setUint32(length - pos - 4);

    // Write interleaved data
    for (let i = 0; i < buffer.numberOfChannels; i++) {
      channels.push(buffer.getChannelData(i));
    }

    while (pos < length) {
      for (let i = 0; i < buffer.numberOfChannels; i++) {
        const sample = Math.max(-1, Math.min(1, channels[i][offset]));
        view.setInt16(pos, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        pos += 2;
      }
      offset++;
    }

    return arrayBuffer;
  };

  return (
    <div className="w-full space-y-4">
      <div className="relative">
        <input
          type="file"
          accept="audio/*"
          onChange={handleFileUpload}
          className="hidden"
          id="audio-upload"
        />
        <label htmlFor="audio-upload">
          <Button
            asChild
            className="w-full bg-gradient-to-r from-gray-800 to-gray-900 hover:from-gray-700 hover:to-gray-800 border-2 border-gray-500 text-gray-200"
            style={{
              boxShadow: '0 0 20px rgba(192, 192, 192, 0.2)',
              fontFamily: 'Times New Roman',
              fontStyle: 'italic',
            }}
          >
            <div className="cursor-pointer flex items-center gap-2 justify-center">
              <Upload className="w-5 h-5" />
              {audioFile ? audioFile.name : 'Upload Audio File'}
            </div>
          </Button>
        </label>
      </div>

      {audioFile && (
        <Button
          onClick={togglePlayback}
          className="w-full bg-gradient-to-r from-gray-700 to-gray-900 hover:from-gray-600 hover:to-gray-800 border-2 border-gray-400 text-white"
          style={{
            boxShadow: '0 0 20px rgba(255, 255, 255, 0.3)',
            fontFamily: 'Times New Roman',
            fontStyle: 'italic',
          }}
        >
          {isPlaying ? (
            <>
              <Pause className="w-5 h-5 mr-2" />
              Pause
            </>
          ) : (
            <>
              <Play className="w-5 h-5 mr-2" />
              Play
            </>
          )}
        </Button>
      )}

      {/* Audio Waveform Visualization */}
      <AudioWaveform 
        audioBuffer={audioBufferRef.current} 
        isPlaying={isPlaying}
        currentTime={currentTime}
      />

      {/* Download Button */}
      {audioFile && (
        <Button
          onClick={handleDownload}
          className="w-full bg-gradient-to-r from-gray-900 to-black hover:from-gray-800 hover:to-gray-900 border-2 border-gray-500 text-gray-200"
          style={{
            boxShadow: '0 0 20px rgba(192, 192, 192, 0.3)',
            fontFamily: 'Times New Roman',
            fontStyle: 'italic',
          }}
        >
          <Download className="w-5 h-5 mr-2" />
          Download Edited Audio
        </Button>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 rounded-lg bg-black border-2 border-gray-600">
          <div className="text-xs text-gray-400 mb-1" style={{ fontFamily: 'Times New Roman', fontStyle: 'italic' }}>
            Volume (Pinch)
          </div>
          <div className="text-xl font-bold text-gray-200" style={{ fontFamily: 'Times New Roman', fontStyle: 'italic' }}>
            {Math.round(volume * 100)}%
          </div>
        </div>

        <div className="p-3 rounded-lg bg-black border-2 border-gray-600">
          <div className="text-xs text-gray-400 mb-1" style={{ fontFamily: 'Times New Roman', fontStyle: 'italic' }}>
            Pitch Shift (Y-Pos)
          </div>
          <div className="text-xl font-bold text-gray-200" style={{ fontFamily: 'Times New Roman', fontStyle: 'italic' }}>
            {pitch.toFixed(1)}
          </div>
        </div>

        <div className="p-3 rounded-lg bg-black border-2 border-gray-600">
          <div className="text-xs text-gray-400 mb-1" style={{ fontFamily: 'Times New Roman', fontStyle: 'italic' }}>
            Speed (X-Pos)
          </div>
          <div className="text-xl font-bold text-gray-200" style={{ fontFamily: 'Times New Roman', fontStyle: 'italic' }}>
            {playbackSpeed.toFixed(2)}x
          </div>
        </div>

        <div className="p-3 rounded-lg bg-black border-2 border-gray-600">
          <div className="text-xs text-gray-400 mb-1" style={{ fontFamily: 'Times New Roman', fontStyle: 'italic' }}>
            Filter (Rotation)
          </div>
          <div className="text-xl font-bold text-gray-200" style={{ fontFamily: 'Times New Roman', fontStyle: 'italic' }}>
            {Math.round(filterFreq)}Hz
          </div>
        </div>
      </div>

      <div className="p-3 rounded-lg bg-black border-2 border-gray-600">
        <div className="text-xs text-gray-400 mb-1" style={{ fontFamily: 'Times New Roman', fontStyle: 'italic' }}>
          Echo/Reverb (Two Hands)
        </div>
        <div className="text-xl font-bold text-gray-200" style={{ fontFamily: 'Times New Roman', fontStyle: 'italic' }}>
          {hasEcho ? 'Active' : 'Inactive'}
        </div>
      </div>

      {/* Hand Status Indicators */}
      <div className="grid grid-cols-3 gap-3 mt-4">
        <div
          className={`p-3 rounded-lg border-2 transition-all ${
            gestureData.leftHand
              ? 'bg-gray-800/80 border-gray-500'
              : 'bg-black/60 border-gray-700'
          }`}
        >
          <div className="text-sm text-gray-400" style={{ fontFamily: 'Times New Roman', fontStyle: 'italic' }}>
            Left Hand
          </div>
          <div className="text-xs text-gray-500" style={{ fontFamily: 'Times New Roman', fontStyle: 'italic' }}>
            {gestureData.leftHand ? '✓' : '✗'}
          </div>
        </div>
        <div
          className={`p-3 rounded-lg border-2 transition-all ${
            gestureData.rightHand
              ? 'bg-gray-800/80 border-gray-500'
              : 'bg-black/60 border-gray-700'
          }`}
        >
          <div className="text-sm text-gray-400" style={{ fontFamily: 'Times New Roman', fontStyle: 'italic' }}>
            Right Hand
          </div>
          <div className="text-xs text-gray-500" style={{ fontFamily: 'Times New Roman', fontStyle: 'italic' }}>
            {gestureData.rightHand ? '✓' : '✗'}
          </div>
        </div>
        <div
          className={`p-3 rounded-lg border-2 transition-all ${
            gestureData.bothHandsPresent
              ? 'bg-gray-700/80 border-gray-400'
              : 'bg-black/60 border-gray-700'
          }`}
        >
          <div className="text-sm text-gray-400" style={{ fontFamily: 'Times New Roman', fontStyle: 'italic' }}>
            Both Hands
          </div>
          <div className="text-xs text-gray-500" style={{ fontFamily: 'Times New Roman', fontStyle: 'italic' }}>
            {gestureData.bothHandsPresent ? '✓ Echo ON' : '✗'}
          </div>
        </div>
      </div>
    </div>
  );
}
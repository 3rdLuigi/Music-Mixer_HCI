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
  const isPlayingRef = useRef(false); // TRACK PLAYBACK STATE
  const wasPointerHandRef = useRef(false); // Pointer finger state
  const wasFistHandRef = useRef(false); // Fist state
  const lastActionTimeRef = useRef(0); // For cooldown management
  const pausedTimeRef = useRef(0); // To track pause time for resuming
  // FOR PLAYBACK VISUALS
  const playbackSpeedRef = useRef(1.0);
  const lastFrameTimeRef = useRef(0);
  

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
      const decay = Math.pow(1-i / impulseLength, 2);
      impulseL[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / impulseLength, 2) * decay * 0.05;
      impulseR[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / impulseLength, 2) * decay * 0.05;
    }
    convolverRef.current.buffer = impulse;

    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

// Handle gesture-based controls
  // for Echo/Reverb toggle but ALSO to prevent one hand controlling several 
  // parameters simultaneously if both hands are up
  useEffect(() => {
    if (!audioContextRef.current) return;

    // checks if 
    const getActiveHand = (condition: (hand: NonNullable<GestureData['leftHand']>) => boolean) => {
      if (gestureData.rightHand && condition(gestureData.rightHand)) return gestureData.rightHand;
      if (gestureData.leftHand && condition(gestureData.leftHand)) return gestureData.leftHand;
      return null;
    };

    // checks if both hands are present
    const usedHandsThisFrame = new Set<string>();
    const getExclusiveHand = (condition: (hand: NonNullable<GestureData['leftHand']>) => boolean) => {
      // check conditions of right hand and if being used
      if (gestureData.rightHand && !usedHandsThisFrame.has('right') && condition(gestureData.rightHand)) {
        usedHandsThisFrame.add('right');
        return gestureData.rightHand;
      }
      // check if leftr hand being used
      if (gestureData.leftHand && !usedHandsThisFrame.has('left') && condition(gestureData.leftHand)) {
        usedHandsThisFrame.add('left');
        return gestureData.leftHand;
      }
      return null;
    };

    // play and pause logic
    const pointerHand = getActiveHand(h => h.isPointerUp);
    const fistHand = getActiveHand(h => h.isFist);

    const isPointerJustUp = pointerHand && !wasPointerHandRef.current;
    const isFistJustClosed = fistHand && !wasFistHandRef.current;

    wasPointerHandRef.current = !!pointerHand;
    wasFistHandRef.current = !!fistHand;

    const now = Date.now();
    const cooldown = 500; 

    const isSafelyInFrame = (hand: NonNullable<GestureData['leftHand']>) => {
      const margin = 0.05; 
      return ( 
        hand.position.x > margin && 
        hand.position.x < (1 - margin) && 
        hand.position.y > margin && 
        hand.position.y < (1 - margin)
      );
    };

    if(now - lastActionTimeRef.current > cooldown) { 
      // PLAY 
      if (isPointerJustUp && !isPlayingRef.current && audioBufferRef.current) {
        if (pointerHand && isSafelyInFrame(pointerHand)) { 
          if (audioContextRef.current.state === 'suspended') { 
            audioContextRef.current.resume();
          }
          playAudio();
          lastActionTimeRef.current = now + 1500; 
        }
      }
      else if (isFistJustClosed && !isPointerJustUp) { 
        // PAUSE
        if (fistHand && isSafelyInFrame(fistHand) && isPlayingRef.current) { 
          stopAudio();
          lastActionTimeRef.current = now + 1500;
      
        } else if (audioBufferRef.current && !isPlayingRef.current) { 
          // RESTART
          pausedTimeRef.current = 0;
          setCurrentTime(0);
          lastActionTimeRef.current = now + 1500;
        }
       }
    }

    // mixing logic allows each hand to only control one mixing parameter at a time

    // pinch for volume (prio 1)
    const pinchingHand = getExclusiveHand(h => h.isPinching);
    if (pinchingHand) {
      const newVolume = Math.max(0, Math.min(1, 1.0 - pinchingHand.position.y));
      setVolume(newVolume);
      if (gainNodeRef.current) {
        gainNodeRef.current.gain.setTargetAtTime(newVolume, audioContextRef.current.currentTime, 0.1);
      }
    }

    // pointer finger for playback speed (prio 2)
    const speedHand = getExclusiveHand(h => h.isPointerUp);
    if (speedHand) {
      const speed = 0.5 + (speedHand.position.x * 1.5); 
      setPlaybackSpeed(speed);

      // adjust visual speed
      playbackSpeedRef.current = speed;

      // adjust audio speed
      if (sourceNodeRef.current) {
        sourceNodeRef.current.playbackRate.setTargetAtTime(speed, audioContextRef.current.currentTime, 0.1);
      }
    }

    // pitch shift for peach sign ( prio 3)
    const peaceHand = getExclusiveHand(h => h.isPeaceSign);
    if (peaceHand) {
      const pitchShift = ((1.0 - peaceHand.position.y) - 0.5) * 24; 
      setPitch(pitchShift);

      // shift pitch 
      if (sourceNodeRef.current && audioContextRef.current) { 
        sourceNodeRef.current.detune.setTargetAtTime(pitchShift * 100, audioContextRef.current.currentTime, 0.1);
      }
    }

    // Thumbs up & rotate for filter (prio 4)
    const thumbHand = getExclusiveHand(h => h.isThumbUp);
    if (thumbHand) {
      // prevent NaN and out of bounds rotations...
      const clampedRotation = Math.max(0, Math.min(360, Math.abs(thumbHand.rotation)));
      const rotationRatio = clampedRotation / 360;
      const newFilterFreq = 100 + (rotationRatio * 9900);
      setFilterFreq(newFilterFreq);

      if (filterNodeRef.current) {
        filterNodeRef.current.frequency.setTargetAtTime(newFilterFreq, audioContextRef.current.currentTime, 0.1);
      }
    }

  }, [gestureData, isPlaying]);

  // Two hands → Echo/Reverb
  useEffect(() => {

    const shouldHaveEcho = gestureData.bothHandsPresent;
    setHasEcho(shouldHaveEcho);
    
    if (delayGainRef.current) {
      delayGainRef.current.gain.setTargetAtTime( 
        // prevent jarring effect from sudden echo
        shouldHaveEcho ? 0.8 : 0, 
        audioContextRef.current.currentTime,
        0.1
      );

    }
  }, [gestureData.bothHandsPresent]);


  // SECTION OF CODE FOR FILE UPLOAD
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && audioContextRef.current) {

      // Stop current playback if any !!!
      if(sourceNodeRef.current) { 
        sourceNodeRef.current.onended = null;
        try { 
          sourceNodeRef.current.stop();
        } catch (e) { 
          // do nothing
        }
      }

      setIsPlaying(false);
      isPlayingRef.current = false;
      setCurrentTime(0);
      pausedTimeRef.current = 0;

      setAudioFile(file);
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
      audioBufferRef.current = audioBuffer;
    }
  };

  // SECTION OF CODE FOR PLAYBACK CONTROL

  const stopAudio = () => { 
    if (sourceNodeRef.current) { 
      sourceNodeRef.current.onended = null;
      try { 
        sourceNodeRef.current.stop(); 
      }
      catch (e) {
        
      }
    }

    // SAVE TIME OF PAUSE 
    if (isPlayingRef.current) { 
      pausedTimeRef.current = currentTime;
    }

    setIsPlaying(false);
    isPlayingRef.current = false;


  };

  const playAudio = () => {

    // prevent multiple audios
    if (!audioBufferRef.current || !audioContextRef.current) return;
    if (isPlayingRef.current) return;

    if (audioContextRef.current.state === 'suspended') { 
      audioContextRef.current.resume();
    }

    stopAudio(); 

    const source = audioContextRef.current.createBufferSource();
    source.buffer = audioBufferRef.current;
    source.playbackRate.value = playbackSpeed; 


    // Connect audio graph
    source.connect(filterNodeRef.current!);
    filterNodeRef.current!.connect(gainNodeRef.current!);
    gainNodeRef.current!.connect(delayNodeRef.current!);
    delayNodeRef.current!.connect(delayGainRef.current!);
    delayGainRef.current!.connect(gainNodeRef.current!); 
    gainNodeRef.current!.connect(convolverRef.current!);
    convolverRef.current!.connect(analyserRef.current!);
    gainNodeRef.current!.connect(analyserRef.current!);
    analyserRef.current!.connect(audioContextRef.current.destination);

    // TRACK NATURALLY FINISHES
    source.onended = () => { 
      setIsPlaying(false); 
      isPlayingRef.current = false;
      pausedTimeRef.current = 0; 
      setCurrentTime(0);
    };

    // calculate offset
    let offset = pausedTimeRef.current % audioBufferRef.current.duration;
    if (isNaN(offset)) offset = 0;

    // resume from offset
    source.start(0, offset);
    sourceNodeRef.current = source;

    //unpause
    setIsPlaying(true);
    isPlayingRef.current = true;

    // sync visuals 
    // setStartTime(audioContextRef.current.currentTime - offset);
    setCurrentTime(offset);
  };

  const togglePlayback = () => { 
    if (isPlayingRef.current) stopAudio(); 
    else playAudio();
  }


  // const handlePlayback = () => {
  //   if (!audioBufferRef.current || !audioContextRef.current) return;

  //   // PAUSE AUDIO
  //   if (isPlayingRef.current && sourceNodeRef.current) {
  //     try { 
  //       sourceNodeRef.current.onended = null;
  //       sourceNodeRef.current.stop();
  //     } catch (e) { 

  //     }
  //     setIsPlaying(false);
  //     isPlayingRef.current = false;
  //     return;
  //   }

  //   // stop any extra audio playing 
  //   if (sourceNodeRef.current) { 
  //     sourceNodeRef.current.onended = null;

  //     try { 
  //       sourceNodeRef.current.stop();
  //     }
  //     catch (e) {

  //     }

  //   }

  //   const source = audioContextRef.current.createBufferSource();
  //   source.buffer = audioBufferRef.current;
    
  //   // Apply playback speed
  //   source.playbackRate.value = playbackSpeed;
    
  //   // Connect audio graph
  //   source.connect(filterNodeRef.current!);
  //   filterNodeRef.current!.connect(gainNodeRef.current!);
    
  //   // Echo/reverb routing
  //   gainNodeRef.current!.connect(delayNodeRef.current!);
  //   delayNodeRef.current!.connect(delayGainRef.current!);
  //   delayGainRef.current!.connect(gainNodeRef.current!); // Feedback loop
    
  //   gainNodeRef.current!.connect(convolverRef.current!);
  //   convolverRef.current!.connect(analyserRef.current!);
    
  //   gainNodeRef.current!.connect(analyserRef.current!);
  //   analyserRef.current!.connect(audioContextRef.current.destination);
    
  //   // if track naturally ends
  //   source.onended = () => { 
  //     setIsPlaying(false);
  //     isPlayingRef.current = false;
  //   };

  //   source.start();
  //   sourceNodeRef.current = source;

  //   // lock
  //   setIsPlaying(true);
  //   isPlayingRef.current = true;
  //   setStartTime(audioContextRef.current.currentTime);
  // };


  // const togglePlayback = () => {
  //   handlePlayback();
  // };

  // Update current time for waveform

  useEffect(() => { 

    let animationFrameId: number; 

    const updateTime = () => { 
      if (isPlaying && audioContextRef.current) {
        const timeNow = audioContextRef.current.currentTime;

        // calculate time passed since last frame
        const delta = timeNow - lastFrameTimeRef.current;
        lastFrameTimeRef.current = timeNow;

        // update current time with delta, accounting for playback speed
        setCurrentTime(prevTime => prevTime + (delta * playbackSpeedRef.current));
        animationFrameId = requestAnimationFrame(updateTime);
      }
    };

    if (isPlaying) { 
      // sync last frame to play
      if (audioContextRef.current) {
        lastFrameTimeRef.current = audioContextRef.current.currentTime;
      }
      animationFrameId = requestAnimationFrame(updateTime);
    }

    return () => { 
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };

  }, [isPlaying]);

  // useEffect(() => {
  //   let animationFrameId: number;
  //   const updateTime = () => {
  //     if (isPlaying && audioContextRef.current) {
  //       const elapsed = audioContextRef.current.currentTime - startTime;
  //       setCurrentTime(elapsed);
  //       animationFrameId = requestAnimationFrame(updateTime);
  //     }
  //   };
  //   if (isPlaying) {
  //     animationFrameId = requestAnimationFrame(updateTime);
  //   }
  //   return () => {
  //     if (animationFrameId) {
  //       cancelAnimationFrame(animationFrameId);
  //     }
  //   };
  // }, [isPlaying, startTime]);

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
          {/* // indicates both hands are present */}
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
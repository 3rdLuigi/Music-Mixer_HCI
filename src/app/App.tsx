import { useState } from 'react';
import { motion } from 'motion/react';
import { GestureTracker, GestureData } from './components/GestureTracker';
import { AudioMixer } from './components/AudioMixer';
import { SilverBackground, MetallicGrid } from './components/Y2KBackground';
import { Hand, Info, Volume2, MoveVertical, MoveHorizontal, RotateCw, Users, Play, Pause, X, ChevronDown, ChevronUp } from 'lucide-react';
import backgroundImg from '@/assets/192d1fe5335c4b0af3f1ea194624a6e0de40fed3.png';

export default function App() {
  const [gestureData, setGestureData] = useState<GestureData>({
    leftHand: null,
    rightHand: null,
    bothHandsPresent: false,
  });
  const [isTracking, setIsTracking] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="min-h-screen bg-black text-white overflow-hidden relative">
      {/* Background Image */}
      <div 
        className="fixed inset-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: `url(${backgroundImg})`,
          opacity: 1,
        }}
      />
      
      <SilverBackground />
      <MetallicGrid />

      {/* Chrome/Silver gradient overlay */}
      <div 
        className="fixed inset-0 pointer-events-none opacity-5"
        style={{
          background: 'radial-gradient(circle at 50% 50%, rgba(192, 192, 192, 0.3), transparent 70%)',
        }}
      />

      {/* Header */}
      <motion.header
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ type: 'spring', stiffness: 100 }}
        className="relative z-10 p-8"
      >
        <div className="text-center">
          <h1
            className="text-7xl md:text-9xl mb-2"
            style={{
              fontFamily: 'Times New Roman, serif',
              fontStyle: 'italic',
              color: '#ffffff',
              textShadow: '0 0 40px rgba(255, 255, 255, 0.6), 0 2px 4px rgba(0, 0, 0, 0.8)',
              letterSpacing: '0.02em',
            }}
          >
            Gesture-Controlled
          </h1>
          <h2
            className="text-5xl md:text-7xl"
            style={{
              fontFamily: 'Times New Roman, serif',
              fontStyle: 'italic',
              color: '#ffffff',
              textShadow: '0 0 30px rgba(255, 255, 255, 0.5), 0 2px 4px rgba(0, 0, 0, 0.8)',
              letterSpacing: '0.02em',
            }}
          >
            Audio Mixing
          </h2>
        </div>
      </motion.header>

      <div className="relative z-10 max-w-7xl mx-auto px-4 pb-8">
        {/* Info Panel */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 rounded-lg bg-black/80 border-2 border-gray-600 backdrop-blur-sm overflow-hidden"
          style={{
            boxShadow: '0 0 20px rgba(192, 192, 192, 0.2)',
          }}
        >
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full p-4 flex items-center justify-between hover:bg-gray-900/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Info className="w-6 h-6 text-gray-400" />
              <h3 className="font-bold text-gray-300" style={{ fontFamily: 'Times New Roman', fontStyle: 'italic' }}>
                Gesture Controls
              </h3>
            </div>
            {isExpanded ? (
              <ChevronUp className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            )}
          </button>

          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="px-4 pb-4"
            >
              <ul className="text-sm space-y-2 text-gray-400 pl-9" style={{ fontFamily: 'Arial, sans-serif' }}>
                <li className="flex items-center gap-2">
                  <Volume2 className="w-4 h-4" /> <strong>Pinch (thumb-index)</strong> → Volume control
                </li>
                <li className="flex items-center gap-2">
                  <MoveVertical className="w-4 h-4" /> <strong>Hand position (vertical)</strong> → Pitch shift
                </li>
                <li className="flex items-center gap-2">
                  <MoveHorizontal className="w-4 h-4" /> <strong>Horizontal movement</strong> → Playback speed
                </li>
                <li className="flex items-center gap-2">
                  <RotateCw className="w-4 h-4" /> <strong>Hand rotation</strong> → Audio filters
                </li>
                <li className="flex items-center gap-2">
                  <Users className="w-4 h-4" /> <strong>Two hands</strong> → Echo/reverb effects
                </li>
                <li className="flex items-center gap-2">
                  <Play className="w-4 h-4" /> <strong>Closed fist</strong> → Play | <Pause className="w-4 h-4 inline" /> <strong>Open hand</strong> → Pause
                </li>
              </ul>
            </motion.div>
          )}
        </motion.div>

        {/* Main Content Grid */}
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Left Column - Gesture Tracker */}
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-2xl flex items-center gap-2" style={{ fontFamily: 'Times New Roman', fontStyle: 'italic', color: '#c0c0c0' }}>
                <Hand className="w-6 h-6" />
                Gesture Tracking
              </h3>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setIsTracking(!isTracking)}
                className={`px-6 py-2 rounded-lg transition-all border-2 ${
                  isTracking
                    ? 'bg-gray-700 border-gray-500 text-gray-300'
                    : 'bg-gray-800 border-gray-400 text-white'
                }`}
                style={{
                  boxShadow: isTracking
                    ? '0 0 15px rgba(128, 128, 128, 0.4)'
                    : '0 0 20px rgba(192, 192, 192, 0.5)',
                  fontFamily: 'Times New Roman',
                  fontStyle: 'italic',
                }}
              >
                {isTracking ? 'Stop Tracking' : 'Start Tracking'}
              </motion.button>
            </div>

            <GestureTracker onGestureUpdate={setGestureData} isActive={isTracking} />
          </motion.div>

          {/* Right Column - Audio Mixer */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
          >
            <h3 className="text-2xl mb-4" style={{ fontFamily: 'Times New Roman', fontStyle: 'italic', color: '#c0c0c0' }}>
              Audio Controls
            </h3>
            <AudioMixer gestureData={gestureData} />
          </motion.div>
        </div>
      </div>

      {/* Footer */}
      <footer className="relative z-10 text-center py-8 text-gray-600 text-sm" style={{ fontFamily: 'Times New Roman', fontStyle: 'italic' }}>
        <p>Luis Garibay • Alesia Williams • Liz Ramos • Reykjavik Salvador • Arashdeep Banger</p>
      </footer>
    </div>
  );
}
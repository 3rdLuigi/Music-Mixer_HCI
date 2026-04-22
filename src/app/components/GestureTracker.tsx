import { useEffect, useRef, useState } from 'react';
import { Hands, Results } from '@mediapipe/hands';
import { Camera } from '@mediapipe/camera_utils';

// Import your logic from the lib folder!
import { calculateRotation, getHandState } from '../lib/Interactions';

export interface GestureData {
  leftHand: {
    position: { x: number; y: number };
    rotation: number;
    isFist: boolean;
    isOpen: boolean;
    isPointerUp: boolean;
    isPinching: boolean;
    isPeaceSign: boolean;
    isThumbUp: boolean;
  } | null;
  rightHand: {
    position: { x: number; y: number };
    rotation: number;
    isFist: boolean;
    isOpen: boolean;
    isPointerUp: boolean;
    isPinching: boolean;
    isPeaceSign: boolean;
    isThumbUp: boolean;
  } | null;
  bothHandsPresent: boolean;
}

interface GestureTrackerProps {
  onGestureUpdate: (data: GestureData) => void;
  isActive: boolean;
}

export function GestureTracker({ onGestureUpdate, isActive }: GestureTrackerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const handsRef = useRef<Hands | null>(null);
  const cameraRef = useRef<Camera | null>(null);

  useEffect(() => {
    if (!isActive || !videoRef.current || !canvasRef.current) return;

    const hands = new Hands({
      locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
      },
    });

    hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1, 
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
      selfieMode: true,
    });

    hands.onResults((results: Results) => {
      if (!canvasRef.current) return;
      const canvasCtx = canvasRef.current.getContext('2d');
      if (!canvasCtx) return;

      canvasCtx.save();
      canvasCtx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      canvasCtx.drawImage(results.image, 0, 0, canvasRef.current.width, canvasRef.current.height);

      const gestureData: GestureData = {
        leftHand: null,
        rightHand: null,
        bothHandsPresent: false,
      };

      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        gestureData.bothHandsPresent = results.multiHandLandmarks.length === 2;

        for (let i = 0; i < results.multiHandLandmarks.length; i++) {
          const landmarks = results.multiHandLandmarks[i];
          const handedness = results.multiHandedness[i].label;

          // Draw skeleton
          canvasCtx.strokeStyle = handedness === 'Left' ? '#c0c0c0' : '#ffffff';
          canvasCtx.lineWidth = 2;
          canvasCtx.shadowBlur = 10;
          canvasCtx.shadowColor = '#ffffff';

          const connections = [
            [0, 1], [1, 2], [2, 3], [3, 4],
            [0, 5], [5, 6], [6, 7], [7, 8],
            [5, 9], [9, 10], [10, 11], [11, 12],
            [9, 13], [13, 14], [14, 15], [15, 16],
            [13, 17], [17, 18], [18, 19], [19, 20],
            [0, 17],
          ];

          canvasCtx.beginPath();
          connections.forEach(([start, end]) => {
            const startLandmark = landmarks[start];
            const endLandmark = landmarks[end];
            canvasCtx.moveTo(startLandmark.x * canvasRef.current!.width, startLandmark.y * canvasRef.current!.height);
            canvasCtx.lineTo(endLandmark.x * canvasRef.current!.width, endLandmark.y * canvasRef.current!.height);
          });
          canvasCtx.stroke();

          // Draw nodes
          landmarks.forEach((landmark, idx) => {
            canvasCtx.fillStyle = '#ffffff';
            canvasCtx.shadowBlur = 8;
            canvasCtx.beginPath();
            canvasCtx.arc(
              landmark.x * canvasRef.current!.width,
              landmark.y * canvasRef.current!.height,
              idx === 4 || idx === 8 ? 6 : 4,
              0,
              2 * Math.PI
            );
            canvasCtx.fill();
          });

          // Compute gesture mappings using your imported functions!
          const palmLandmark = landmarks[9];
          const handState = getHandState(landmarks);

          const handData = {
            position: { x: palmLandmark.x, y: palmLandmark.y },
            rotation: calculateRotation(landmarks),
            isFist: handState.isFist,
            isOpen: handState.isOpen,
            isPointerUp: handState.isPointerUp,
            isPinching: handState.isPinching,
            isPeaceSign: handState.isPeaceSign,
            isThumbUp: handState.isThumbUp,
          };

          if (handedness === 'Left') {
            gestureData.leftHand = handData;
          } else {
            gestureData.rightHand = handData;
          }
        }
      }

      canvasCtx.restore();
      onGestureUpdate(gestureData);
    });

    handsRef.current = hands;

    const startCamera = async () => {
      try {
        if (!videoRef.current) return;
        
        const camera = new Camera(videoRef.current, {
          onFrame: async () => {
            if (videoRef.current && handsRef.current) {
              await handsRef.current.send({ image: videoRef.current });
            }
          },
          width: 640,
          height: 480,
        });
        
        await camera.start();
        cameraRef.current = camera;
        setIsTracking(true);
      } catch (err) {
        setError('Failed to access camera. Please grant camera permissions.');
        console.error(err);
      }
    };

    startCamera();

    return () => {
      setIsTracking(false);
      if (cameraRef.current) {
        cameraRef.current.stop();
      }
      if (handsRef.current) {
        handsRef.current.close();
      }
    };
  }, [isActive, onGestureUpdate]);

  return (
    <div className="relative w-full h-full">
      <video ref={videoRef} className="hidden" playsInline />
      <canvas
        ref={canvasRef}
        width={640}
        height={480}
        className="w-full h-full object-cover rounded-lg border-2 border-gray-500"
        style={{
          boxShadow: '0 0 30px rgba(192, 192, 192, 0.3)',
          background: '#000000',
        }}
      />
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/90 rounded-lg">
          <p className="text-gray-400 text-center px-4" style={{ fontFamily: 'Times New Roman', fontStyle: 'italic' }}>
            {error}
          </p>
        </div>
      )}
      {!isTracking && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/90 rounded-lg">
          <p className="text-gray-400 text-center px-4" style={{ fontFamily: 'Times New Roman', fontStyle: 'italic' }}>
            Initializing camera...
          </p>
        </div>
      )}
    </div>
  );
}
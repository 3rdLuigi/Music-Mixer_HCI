const getDistance3D = (p1: any, p2: any) => {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  const dz = (p1.z || 0) - (p2.z || 0); 
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
};

export const calculatePinchDistance = (landmarks: any[]) => {
  const thumbTip = landmarks[4];
  const indexTip = landmarks[8];
  const wrist = landmarks[0];
  const indexBase = landmarks[5];

  const pinchDist = getDistance3D(thumbTip, indexTip);
  const handSize = getDistance3D(wrist, indexBase); 

  return pinchDist / handSize; 
};

export const calculateRotation = (landmarks: any[]) => {
  const wrist = landmarks[0];
  const middleBase = landmarks[9];
  
  const angleRad = Math.atan2(middleBase.y - wrist.y, middleBase.x - wrist.x);
  
  let angleDeg = angleRad * (180 / Math.PI);
  if (angleDeg < 0) {
    angleDeg += 360;
  }
  return angleDeg;
};

// Expanded to detect Fist, Open, Pointer Up, and Pinching
export const getHandState = (landmarks: any[]) => {
  const wrist = landmarks[0];
  
  // Finger Tip and Base indices: [Index, Middle, Ring, Pinky]
  const fingerTips = [8, 12, 16, 20]; 
  const fingerBases = [5, 9, 13, 17]; 
  
  const fingerExtended = fingerTips.map((tipIdx, i) => {
    const tipDist = getDistance3D(landmarks[tipIdx], wrist);
    const baseDist = getDistance3D(landmarks[fingerBases[i]], wrist);
    return tipDist > baseDist; // True if extended, False if curled
  });

  const thumbTipDist = getDistance3D(landmarks[4], landmarks[17]);
  const thumbOpenDist = getDistance3D(landmarks[4], landmarks[5]);
  const isThumbClosed = thumbTipDist < thumbOpenDist;

  const closedCount = fingerExtended.filter(isExt => !isExt).length;

  // Is it Fist
  const isFist = closedCount >= 3 && isThumbClosed;
  
  // Is hand open
  const isOpen = closedCount === 0;

  // Is pointer finger up
  const isPointerUp = fingerExtended[0] === true && 
                      fingerExtended[1] === false && 
                      fingerExtended[2] === false && 
                      fingerExtended[3] === false;

  const isPeaceSign = fingerExtended[0] === true && 
                      fingerExtended[1] === true && 
                      fingerExtended[2] === false && 
                      fingerExtended[3] === false;

  // Is thumb up
  const isThumbUp = closedCount === 4 && !isThumbClosed;

  // Is it Pinching
  const pinchRatio = calculatePinchDistance(landmarks);
  const isPinching = pinchRatio < 0.25;

  return { isFist, isOpen, isPointerUp, isPinching, pinchRatio, isPeaceSign, isThumbUp };
};
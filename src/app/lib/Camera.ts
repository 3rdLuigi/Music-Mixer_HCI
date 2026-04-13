// something something this file starts the camera or whatever something something

// global variables
const CAM_WIDTH = 1280;
const CAM_HEIGHT = 720;

export let isMediaPipeReady = false;

export const setMediaPipeReady = (status: boolean) => { 
    isMediaPipeReady = status; 
    console.log(`System: MediaPipe Ready?: ${isMediaPipeReady}`);
}

// start cam
export const startCamera = async (videoElement: HTMLVideoElement) => {
    try {

        // get camera access
        const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: CAM_WIDTH, height: CAM_HEIGHT, facingMode: "user"},
        });

        // set vid source
        videoElement.srcObject = stream;

        // let vid load
        return new Promise((resolve) => {
            videoElement.onloadedmetadata = () => {
                videoElement.play();
                videoElement.onloadeddata = () => { 
                    console.log("Camera: Video Loaded");
                    resolve(true);
                };
            };
        });

    
    // handle error
    } catch (err) { 
    console.error("Camera access denied", err);
    }
};
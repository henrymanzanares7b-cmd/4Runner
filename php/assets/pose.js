// Detección del cuerpo con MediaPipe (puntos + silueta). Se carga como módulo.
const MP_VERSION = "0.10.14";
const MP_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`;
const MP_MODEL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
let landmarkerPromise = null;

const getLandmarker = () => {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const vision = await import(`${MP_BASE}/vision_bundle.mjs`);
      const fileset = await vision.FilesetResolver.forVisionTasks(`${MP_BASE}/wasm`);
      const create = (delegate) => vision.PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MP_MODEL, delegate },
        runningMode: "IMAGE",
        numPoses: 1,
        outputSegmentationMasks: true
      });
      try { return await create("GPU"); } catch (e) { return await create("CPU"); }
    })().catch((err) => { landmarkerPromise = null; throw err; });
  }
  return landmarkerPromise;
};

window.PoseAPI = {
  preload: () => getLandmarker().catch(() => null),
  detect: async (imageElement) => {
    const landmarker = await getLandmarker();
    const result = landmarker.detect(imageElement);
    const landmarks = (result && result.landmarks && result.landmarks[0]) || null;
    let mask = null;
    const m = result && result.segmentationMasks && result.segmentationMasks[0];
    if (m) {
      const f = m.getAsFloat32Array();
      const data = new Uint8Array(f.length);
      for (let i = 0; i < f.length; i++) data[i] = f[i] > 0.5 ? 1 : 0;
      mask = { w: m.width, h: m.height, data };
    }
    if (result && typeof result.close === 'function') result.close();
    return { landmarks, mask };
  }
};
window.dispatchEvent(new Event('pose-listo'));

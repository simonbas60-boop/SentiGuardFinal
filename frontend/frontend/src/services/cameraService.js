import api, { API_BASE_URL } from "./api";

export async function startCamera(mode = "behavior") {
  const response = await api.post("/camera/start", { mode });
  return response.data;
}

export async function setCameraMode(mode) {
  const response = await api.post("/camera/mode", { mode });
  return response.data;
}

export async function stopCamera() {
  const response = await api.post("/camera/stop");
  return response.data;
}

export async function getCameraStatus() {
  const response = await api.get("/camera/status");
  return response.data;
}

export function getCameraStreamUrl(cacheKey = Date.now()) {
  return `${API_BASE_URL}/camera/video?v=${cacheKey}`;
}

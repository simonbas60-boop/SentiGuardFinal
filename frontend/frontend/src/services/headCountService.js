import api, { API_BASE_URL } from "./api";

export async function uploadHeadCountVideo(videoFile, onProgress) {
  const formData = new FormData();
  formData.append("video", videoFile);

  const response = await api.post("/head-count/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 0,
    onUploadProgress: (event) => {
      if (!event.total || !onProgress) return;
      onProgress(Math.round((event.loaded / event.total) * 100));
    },
  });
  return response.data;
}

export function getHeadCountStreamUrl(sessionId, cacheKey = Date.now()) {
  return `${API_BASE_URL}/head-count/stream/${sessionId}?v=${cacheKey}`;
}

export async function getHeadCountStatus(sessionId) {
  const response = await api.get(`/head-count/status/${sessionId}`);
  return response.data;
}

export async function stopHeadCountAnalysis(sessionId) {
  const response = await api.post(`/head-count/stop/${sessionId}`);
  return response.data;
}

export async function deleteHeadCountSession(sessionId) {
  const response = await api.delete(`/head-count/${sessionId}`);
  return response.data;
}

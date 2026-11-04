import api, { API_BASE_URL } from "./api";

export async function uploadAnalysisVideo(file, onProgress) {
  const formData = new FormData();
  formData.append("video", file);

  const response = await api.post("/video-analysis/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 0,
    onUploadProgress: (event) => {
      if (!event.total || !onProgress) return;
      onProgress(Math.round((event.loaded * 100) / event.total));
    },
  });

  return response.data;
}

export async function getAnalysisStatus(sessionId) {
  const response = await api.get(`/video-analysis/status/${sessionId}`);
  return response.data;
}

export async function stopAnalysis(sessionId) {
  const response = await api.post(`/video-analysis/stop/${sessionId}`);
  return response.data;
}

export async function deleteAnalysisSession(sessionId) {
  const response = await api.delete(`/video-analysis/${sessionId}`);
  return response.data;
}

export function getAnalysisStreamUrl(sessionId, cacheKey = Date.now()) {
  return `${API_BASE_URL}/video-analysis/stream/${sessionId}?v=${cacheKey}`;
}
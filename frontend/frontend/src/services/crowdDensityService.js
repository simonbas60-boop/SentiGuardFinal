import api, { API_BASE_URL } from "./api";

export async function uploadCrowdDensityVideo(videoFile) {
  const formData = new FormData();
  formData.append("video", videoFile);

  const response = await api.post(
    "/crowd-density/upload",
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
      timeout: 120000,
    },
  );

  return response.data;
}

export function getCrowdDensityStreamUrl(sessionId) {
  return `${API_BASE_URL}/crowd-density/stream/${sessionId}`;
}

export async function getCrowdDensityStatus(sessionId) {
  const response = await api.get(
    `/crowd-density/status/${sessionId}`,
  );

  return response.data;
}

export async function stopCrowdDensityAnalysis(sessionId) {
  const response = await api.post(
    `/crowd-density/stop/${sessionId}`,
  );

  return response.data;
}

export async function deleteCrowdDensitySession(sessionId) {
  const response = await api.delete(
    `/crowd-density/${sessionId}`,
  );

  return response.data;
}
import api from "./api";

export async function getAnalytics() {
  const response = await api.get("/analytics/summary");
  return response.data;
}
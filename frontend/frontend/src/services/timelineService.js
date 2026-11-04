import api from "./api";

export async function getTimeline() {
  const response = await api.get("/timeline/");
  return response.data;
}
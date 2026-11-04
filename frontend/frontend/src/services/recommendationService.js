import api from "./api";

export async function getRecommendation() {
  const response = await api.get("/recommendation/");
  return response.data;
}
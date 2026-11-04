import api from "./api";

export async function getSnapshots() {
  const response = await api.get("/snapshots/");
  return response.data;
}

export async function deleteSnapshot(filename) {
  const response = await api.delete(`/snapshots/${filename}`);
  return response.data;
}
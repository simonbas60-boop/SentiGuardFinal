import api from "./api";

export async function getEmergencyStatus() {
  const response = await api.get("/emergency/status");

  return response.data;
}

export async function activateEmergency(message) {
  const response = await api.post("/emergency/admin/activate", {
    message,
  });

  return response.data;
}

export async function clearEmergency(message) {
  const response = await api.post("/emergency/admin/clear", {
    message,
  });

  return response.data;
}

export const dashboardData = {
  stats: [
    { id: 1, title: "Crowd Count", value: 218 },
    { id: 2, title: "Density", value: "86%" },
    { id: 3, title: "Panic Level", value: "78%" },
    { id: 4, title: "Risk Level", value: "HIGH" },
  ],

  cameras: [
    { id: 1, name: "Camera 01", status: "Online" },
    { id: 2, name: "Camera 02", status: "Online" },
    { id: 3, name: "Camera 03", status: "Maintenance" },
    { id: 4, name: "Camera 04", status: "Offline" },
  ],

  alerts: [
    {
      id: 1,
      title: "High Crowd Density",
      time: "10:34 AM",
    },
    {
      id: 2,
      title: "Panic Level Increased",
      time: "10:36 AM",
    },
    {
      id: 3,
      title: "System Normal",
      time: "10:40 AM",
    },
  ],
};
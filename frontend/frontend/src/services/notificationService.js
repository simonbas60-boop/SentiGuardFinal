export async function showNotification(message) {
  if (!("Notification" in window)) {
    return;
  }

  if (Notification.permission === "default") {
    await Notification.requestPermission();
  }

  if (Notification.permission === "granted") {
    new Notification("SentiGuard Alert", {
      body: message,
      icon: "/vite.svg"
    });
  }
}
import api from "./api";

const densityAlarm = new Audio("/alarm.mp3");
densityAlarm.loop = true;
densityAlarm.preload = "auto";
densityAlarm.volume = 1.0;

const alertTone = new Audio("/alarm.mp3");
alertTone.loop = false;
alertTone.preload = "auto";
alertTone.volume = 1.0;

let audioUnlocked = false;

async function primeAudio(audio) {
  const previousVolume = audio.volume;
  const previousLoop = audio.loop;

  try {
    audio.volume = 0;
    audio.loop = false;
    audio.currentTime = 0;

    await audio.play();

    audio.pause();
    audio.currentTime = 0;

    audio.volume = previousVolume;
    audio.loop = previousLoop;
    return true;
  } catch (error) {
    audio.volume = previousVolume;
    audio.loop = previousLoop;
    console.debug("Alarm audio could not be unlocked:", error);
    return false;
  }
}

/**
 * Call this from a button click before analysis starts.
 * It makes later alert sounds more reliable in Chrome/Edge.
 */
export async function unlockAlarm() {
  if (audioUnlocked) {
    return true;
  }

  const densityReady = await primeAudio(densityAlarm);
  const alertReady = await primeAudio(alertTone);

  audioUnlocked = densityReady || alertReady;

  return audioUnlocked;
}

/**
 * Looping alarm used by Crowd Density Detection.
 */
export async function playAlarm() {
  try {
    if (!densityAlarm.paused) {
      return true;
    }

    densityAlarm.currentTime = 0;
    await densityAlarm.play();

    audioUnlocked = true;
    return true;
  } catch (error) {
    console.debug(
      "Looping alarm playback requires browser interaction:",
      error,
    );
    return false;
  }
}

export function stopAlarm() {
  try {
    densityAlarm.pause();
    densityAlarm.currentTime = 0;
  } catch (error) {
    console.debug("Could not stop looping alarm:", error);
  }
}

/**
 * One complete warning sound for Behavior Analysis alert events:
 * - Running
 * - Possible Fight
 * - Crowd Limit
 */
export async function playAlertOnce() {
  try {
    alertTone.pause();
    alertTone.currentTime = 0;
    await alertTone.play();

    audioUnlocked = true;
    return true;
  } catch (error) {
    console.debug("Alert sound playback requires browser interaction:", error);
    return false;
  }
}

export function stopAlertSound() {
  try {
    alertTone.pause();
    alertTone.currentTime = 0;
  } catch (error) {
    console.debug("Could not stop alert sound:", error);
  }
}

export async function getAlerts() {
  const response = await api.get("/alerts");
  return response.data;
}

export async function deleteAlert(filename) {
  const response = await api.delete(`/alerts/delete/${filename}`);
  return response.data;
}

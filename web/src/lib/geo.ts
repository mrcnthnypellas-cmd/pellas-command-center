export function getPosition(timeoutMs = 8000): Promise<GeolocationPosition | null> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) {
      resolve(null);
      return;
    }
    const timer = setTimeout(() => resolve(null), timeoutMs);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        resolve(pos);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 }
    );
  });
}

export const CLOCK_ERROR_MESSAGES: Record<string, string> = {
  no_profile: "Your account could not be found. Please contact your administrator.",
  account_inactive: "Your account is inactive. Please contact your administrator.",
  location_required: "Location access is required to clock in at this workplace. Please allow location access and try again.",
  outside_workplace_radius: "Time In is not allowed outside the authorized workplace.",
  duplicate_time_in: "You have already timed in today. Please time out before timing in again.",
  duplicate_time_out: "You have already timed out today.",
  no_time_in: "You must time in before you can time out.",
};

export function friendlyClockError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  for (const key of Object.keys(CLOCK_ERROR_MESSAGES)) {
    if (msg.includes(key)) return CLOCK_ERROR_MESSAGES[key];
  }
  return "Something went wrong. Please check your connection and try again.";
}

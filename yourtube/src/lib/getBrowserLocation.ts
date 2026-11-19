
export type BrowserLocation = {
  city: string;
  state: string;
  country: string;
  latitude: number;
  longitude: number;
};

export const getBrowserLocation = (): Promise<BrowserLocation | null> =>
  new Promise((resolve) => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      console.warn("Geolocation is not supported by this browser.");
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;

        try {
          const response = await fetch(
            `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`
          );

          if (!response.ok) {
            throw new Error("Reverse geocoding request failed");
          }

          const data = await response.json();

          resolve({
            city: data.city || data.locality || "Unknown",
            state: data.principalSubdivision || "Unknown",
            country: data.countryName || "Unknown",
            latitude,
            longitude
          });
        } catch (error) {
          console.error("Location lookup failed:", error);
          resolve({
            city: "Unknown",
            state: "Unknown",
            country: "Unknown",
            latitude,
            longitude
          });
        }
      },
      (error) => {
        console.error("Geolocation error:", {
          code: error.code,
          message: error.message
        });
        resolve(null);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      }
    );
  });

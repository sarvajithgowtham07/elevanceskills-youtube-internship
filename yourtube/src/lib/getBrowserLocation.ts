export type BrowserLocation = {
  city: string;
  state: string;
  country: string;
  latitude: number;
  longitude: number;
};

export const getBrowserLocation = (): Promise<BrowserLocation | null> =>
  new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
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
          const data = await response.json();

          resolve({
            city: data.city || data.locality || "Unknown",
            state: data.principalSubdivision || "Unknown",
            country: data.countryName || "Unknown",
            latitude,
            longitude,
          });
        } catch (error) {
          resolve(null);
        }
      },
      () => resolve(null),
      { timeout: 8000, maximumAge: 600000 }
    );
  });
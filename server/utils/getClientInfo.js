export const getClientIp = (req) => {
  const forwarded = req.headers["x-forwarded-for"];
  const ip = forwarded ? forwarded.split(",")[0] : req.ip || "";
  return ip.trim().replace("::ffff:", "");
};

export const getLocation = async (ip) => {
  try {
    const r = await fetch(`http://ip-api.com/json/${ip}`);
    const d = await r.json();
    if (d.status !== "success") return { city: "Unknown", region: "Unknown", country: "Unknown" };
    return { city: d.city, region: d.regionName, country: d.country };
  } catch (e) {
    return { city: "Unknown", region: "Unknown", country: "Unknown" };
  }
};
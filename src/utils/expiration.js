const setTime = (date, hours, minutes) => {
  const d = new Date(date);
  d.setHours(hours, minutes, 0, 0);
  return d;
};

export const getExpiration = (timing) => {
  const now = new Date();

  if (timing === "Ce soir") {
    return setTime(now, 22, 0);
  }

  const currentDay = now.getDay();
  const toSunday = (7 - currentDay) % 7;
  const sunday = new Date(now);
  sunday.setDate(now.getDate() + toSunday);
  return setTime(sunday, 20, 0);
};

export const isExpired = (expiresAt) => {
  if (!expiresAt) {
    return true;
  }
  const now = new Date();
  const limit = new Date(expiresAt);
  return now >= limit;
};


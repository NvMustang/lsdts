const safeEncode = (text) => {
  return btoa(unescape(encodeURIComponent(text)));
};

const safeDecode = (text) => {
  try {
    return decodeURIComponent(escape(atob(text)));
  } catch (err) {
    return "";
  }
};

export const encodeToken = (payload) => {
  const raw = JSON.stringify(payload);
  return safeEncode(raw);
};

export const decodeToken = (token) => {
  try {
    const decoded = safeDecode(token);
    return JSON.parse(decoded);
  } catch (err) {
    return null;
  }
};


function getInt32Bytes(x) {
  return [x, x << 8, x << 16, x << 24].map((z) => z >>> 24);
}

export { getInt32Bytes };

function getInt32ToBytes(x) {
  return [x, x << 8, x << 16, x << 24].map((z) => z >>> 24);
}

function getInt32FromBytes(bytes) {
  return [bytes[0] << 24, bytes[1] << 16, bytes[2] << 8, bytes[3]].reduce(
    (x, y) => x + y,
    0
  );
}

function getInt24ToBytes(x) {
  return [x, x << 8, x << 16].map((z) => z >>> 16);
}

export { getInt32ToBytes, getInt32FromBytes, getInt24ToBytes };

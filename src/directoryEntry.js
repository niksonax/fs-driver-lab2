import { getInt32FromBytes, getInt32ToBytes } from '../helpers/helpers.js';

class DirectoryEntry {
  constructor(name, fileDescriptorId) {
    this.name = name;
    this.fileDescriptorId = fileDescriptorId;
  }

  fromBytes(bytes) {
    this.name = bytes.subarray(0, bytes.indexOf(0)).toString();
    this.fileDescriptorId = getInt32FromBytes(bytes.subarray(28, 32));
  }

  toBytes() {
    const buffer = Buffer.alloc(32);
    const nameBytes = Buffer.from(this.name, 'utf8');
    const fileDescriptorIdBytes = getInt32ToBytes(this.fileDescriptorId);

    const bufferArr = Array.from(buffer);
    bufferArr.splice(0, Math.min(28, nameBytes.length), ...nameBytes);
    bufferArr.splice(28, 4, ...fileDescriptorIdBytes);

    return Buffer.from(bufferArr);
  }
}

export default DirectoryEntry;

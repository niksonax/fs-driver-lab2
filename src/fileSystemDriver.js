// BitMap         | 252
// N              | 4
// FileDescriptors | 8 * N

// == File Descriptor == (8 bytes)
// type           | 1 byte
// size           | 3 bytes 16,777,216
// hardLinks      | 1 byte
// blockAddress1  | 1 byte
// blockAddress2  | 1 byte
// blockMapAddress| 1 byte

import { BLOCK_SIZE } from '../constants/constants.js';
import { getInt32Bytes } from '../helpers/helpers.js';
import FileDescriptor, { TYPES } from './fileDescriptor.js';

class FileSystemDriver {
  constructor(blockDevice) {
    this.blockDevice = blockDevice;
  }

  mkfs(n) {
    const usedMemory = 252 + 4 + 8 * n;
    const usedBlocks = Math.ceil(usedMemory / BLOCK_SIZE);

    const buffer = Buffer.alloc(usedBlocks * BLOCK_SIZE);

    let mask = 1 << 7;

    for (let i = 0; i < usedBlocks; i++) {
      buffer[Math.floor(i / 8)] = buffer[Math.floor(i / 8)] & mask;
      mask >>= 1;
      if (mask == 0) {
        mask = 1 << 7;
      }
    }

    const bytesN = getInt32Bytes(n);

    buffer[252] = bytesN[0];
    buffer[253] = bytesN[1];
    buffer[254] = bytesN[2];
    buffer[255] = bytesN[3];

    // Initialize root directory
    buffer[256] = TYPES.DIRECTORY;
    buffer[257] = 0;
    buffer[258] = 0;
    buffer[259] = 0;
    buffer[260] = 1;
    buffer[261] = 0;
    buffer[262] = 0;
    buffer[263] = 0;

    for (let i = 256 + 8; i < buffer.length; i++) {
      buffer[i] = -1;
    }

    for (let i = 0; i < usedBlocks; i++) {
      this.blockDevice.write(
        i,
        buffer.subarray(i * BLOCK_SIZE, (i + 1) * BLOCK_SIZE)
      );
    }
  }

  mount() {}

  unmount() {}

  fstat(id) {}

  ls() {}

  create(name) {
    const dir = root();
  }

  open() {}

  close(fd) {}

  read(fd, offset, size) {}

  write(fd, offset, size, data) {}

  link(name1, name2) {}

  unlink(name) {}

  truncate(name, size) {}

  getDescriptor() {}

  getDirectoryPath() {}

  getFileName() {}

  getDescriptor(fileDescriptorId) {
    const fileDescriptorAddress = fileDescriptorId * 8 + 256;
    const fileDescriptorBlockId = Math.floor(
      fileDescriptorAddress / BLOCK_SIZE
    );
    const fileDescriptorOffset = fileDescriptorAddress % BLOCK_SIZE;

    const fileDescriptorData = this.blockDevice
      .read(fileDescriptorBlockId)
      .subarray(fileDescriptorOffset, fileDescriptorOffset + 8);

    const fileDescriptor = new FileDescriptor(0, TYPES.UNUSED, 0, 0, 0, 0);

    fileDescriptor.fromBytes(fileDescriptorData);

    return fileDescriptor;
  }

  root() {
    return this.getDescriptor(0);
  }

  getFreeBlockId() {
    const buffer = this.blockDevice.read(0).subarray(0, 252);

    let mask = 1 << 7;

    for (let i = 0; i < buffer.length * 8; i++) {
      if (buffer[Math.floor(i / 8)] | mask) {
        return i;
      }
      mask >>= 1;
      if (mask == 0) {
        mask = 1 << 7;
      }
    }
  }

  setBlockUsed(blockId) {
    const byteId = Math.floor(blockId / 8);
    const indexInByte = blockId % 8;

    const buffer = this.blockDevice.read(0);

    let mask = 1 << (7 - indexInByte);

    buffer[byteId] = buffer[byteId] | mask;

    this.blockDevice.write(0, buffer);
  }

  setBlockUnused(blockId) {
    const byteId = Math.floor(blockId / 8);
    const indexInByte = blockId % 8;

    const buffer = this.blockDevice.read(0);

    let mask = 1 << (7 - indexInByte);

    buffer[byteId] = buffer[byteId] & ~mask;

    this.blockDevice.write(0, buffer);
  }
}

export default FileSystemDriver;

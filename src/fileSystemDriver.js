// BitMap          | 252
// N               | 4
// FileDescriptors | 8 * N

// == File Descriptor == (8 bytes)
// type           | 1 byte
// size           | 3 bytes 16,777,216
// hardLinks      | 1 byte
// blockAddress1  | 1 byte
// blockAddress2  | 1 byte
// blockMapAddress| 1 byte

import { BLOCK_SIZE } from '../constants/constants.js';
import { getInt32FromBytes, getInt32ToBytes } from '../helpers/helpers.js';
import DirectoryEntry from './directoryEntry.js';
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
      buffer[Math.floor(i / 8)] = buffer[Math.floor(i / 8)] | mask;
      mask >>= 1;
      if (mask == 0) {
        mask = 1 << 7;
      }
    }

    const bytesN = getInt32ToBytes(n);

    console.log(bytesN);

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
    console.log(this.blockDevice.read(0).subarray(250));
  }

  mount() {}

  unmount() {}

  fstat(id) {}

  ls(directory) {
    const blocks = this.blocks(directory);

    const dirEntries = [];

    for (let block = blocks.next(); !block.done; block = block.next()) {
      const blockData = this.blockDevice.read(block.value);

      for (let i = 0; i < BLOCK_SIZE / 32; i++) {
        const dirEntry = new DirectoryEntry();
        const dirEntryBytes = blockData.subarray(i * 32, (i + 1) * 32);

        if (dirEntryBytes.filter((byte) => byte !== 0).length === 0)
          return dirEntries;

        dirEntry.fromBytes(dirEntryBytes);
        dirEntries.push(dirEntry);
      }
    }

    return dirEntries;
  }

  create(name) {
    const directory = this.root();
    const dirEntries = this.ls(directory);

    const nameExists =
      dirEntries.filter((dirEntry) => dirEntry.name === name).length !== 0;

    if (nameExists) {
      throw new Error('Directory with this name already exists!');
    }

    const fileDescriptorId = this.getUnusedFileDescriptorId();
    const fileDescriptor = this.getDescriptor(fileDescriptorId);

    fileDescriptor.fileSize = 0;
    fileDescriptor.fileType = TYPES.REGULAR;
    fileDescriptor.hardLinksCount = 0;

    this.updateDescriptor(fileDescriptorId, fileDescriptor);

    this.addLink(0, fileDescriptorId, name);
  }

  open() {}

  close(fd) {}

  read(fd, offset, size) {}

  write(fd, offset, size, data) {}

  link(name1, name2) {}

  unlink(name) {}

  truncate(name, size) {}

  getDirectoryPath() {}

  getFileName() {}

  updateDescriptor(fileDescriptorId, fileDescriptor) {
    const fileDescriptorAddress = fileDescriptorId * 8 + 256;
    const fileDescriptorBlockId = Math.floor(
      fileDescriptorAddress / BLOCK_SIZE
    );
    const fileDescriptorOffset = fileDescriptorAddress % BLOCK_SIZE;

    let blockData = this.blockDevice.read(fileDescriptorBlockId);
    const fileDescriptorData = fileDescriptor.toBytes();

    const blockDataArr = Array.from(blockData);
    blockDataArr.splice(fileDescriptorOffset, 8, ...fileDescriptorData);
    blockData = Buffer.from(blockDataArr);

    this.blockDevice.write(fileDescriptorBlockId, blockData);
  }

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

  getUnusedFileDescriptorId() {
    const n = getInt32FromBytes(this.blockDevice.read(0).subarray(252));

    let blockId = 1;
    let fileDescriptorId = -1;

    while (true) {
      const blockData = this.blockDevice.read(blockId);

      for (let i = 0; i < BLOCK_SIZE / 8; i++) {
        fileDescriptorId++;

        if (fileDescriptorId >= n) {
          throw new Error('Not found unused file descriptor.');
        }

        const fileDescriptor = new FileDescriptor(0, 0, 0, 0, 0, 0);
        fileDescriptor.fromBytes(blockData.subarray(i * 8, (i + 1) * 8));

        if (fileDescriptor.fileType === TYPES.UNUSED) {
          return fileDescriptorId;
        }
      }

      blockId++;
    }
  }

  root() {
    return this.getDescriptor(0);
  }

  *blocks(fileDescriptor) {
    if (fileDescriptor.blockAddress1 === 0) return;
    yield fileDescriptor.blockAddress1;
    if (fileDescriptor.blockAddress2 === 0) return;
    yield fileDescriptor.blockAddress2;

    let blockMapAddress = fileDescriptor.blockMapAddress;

    while (blockMapAddress) {
      const blockMap = this.blockDevice.read(blockMapAddress);

      for (let i = 0; i < blockMap.length - 1; i++) {
        if (blockMap[i] === 0) return;

        yield blockMap[i];
      }

      blockMapAddress = blockMap[blockMap.length - 1];
    }
  }

  getFreeBlockId() {
    const buffer = this.blockDevice.read(0).subarray(0, 252);

    let mask = 1 << 7;

    for (let i = 0; i < buffer.length * 8; i++) {
      if (!(buffer[Math.floor(i / 8)] & mask)) {
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

  addLink(directoryDescriptorId, fileDescriptorId, fileName) {
    const directory = this.getDescriptor(directoryDescriptorId);
    const dirEntries = this.ls(directory);

    const nameExists =
      dirEntries.filter((dirEntry) => dirEntry.name === fileName).length !== 0;
    if (nameExists) {
      throw new Error('Directory with this name already exists!');
    }

    const dirEntry = new DirectoryEntry(fileName, fileDescriptorId);

    if (directory.blockAddress1 === 0) {
      directory.blockAddress1 = this.getFreeBlockId();
      directory.fileSize += 32;

      let blockData = Buffer.alloc(BLOCK_SIZE);

      const blockDataArr = Array.from(blockData);
      blockDataArr.splice(0, 8, ...dirEntry.toBytes());
      blockData = Buffer.from(blockDataArr);

      this.blockDevice.write(directory.blockAddress1, blockData);

      this.updateDescriptor(directoryDescriptorId, directory);
    }

    // more logic...
  }
}

export default FileSystemDriver;

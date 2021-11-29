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

import {
  BLOCKS_IN_BLOCK_MAP,
  BLOCK_SIZE,
  DIR_ENTRIES_IN_BLOCK,
  ZERO_BLOCK_ADDRESS,
} from '../constants/constants.js';
import { getInt32FromBytes, getInt32ToBytes } from '../helpers/helpers.js';
import DirectoryEntry from './directoryEntry.js';
import FileDescriptor, { TYPES } from './fileDescriptor.js';

class FileSystemDriver {
  constructor(blockDevice) {
    this.blockDevice = blockDevice;
    this.openFiles = {}; // key - numericFileDescriptor, value - fileDescriptorId
    this.numericFileDescriptor = 0; // numericFileDescriptor for last opened file
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

  ls(directory) {
    const dirEntries = [];

    const blocks = this.blocks(directory);

    for (let blockAddress of blocks) {
      const blockData = this.blockDevice.read(blockAddress);

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

  open(fileName) {
    const fileDescriptorId = this.lookup(fileName);
    const numericFileDescriptor = this.numericFileDescriptor++;
    this.openFiles[numericFileDescriptor] = fileDescriptorId;

    return numericFileDescriptor;
  }

  close(numericFileDescriptor) {
    delete this.openFiles[numericFileDescriptor];
  }

  read(numericFileDescriptor, offset, size) {
    const fileDescriptorId = this.openFiles[numericFileDescriptor];
    const fileDescriptor = this.getDescriptor(fileDescriptorId);

    const startBlockIndex = Math.floor(offset / BLOCK_SIZE);
    const endBlockIndex = Math.floor((offset + size) / BLOCK_SIZE);

    const blocks = this.blocks(
      fileDescriptor,
      startBlockIndex,
      endBlockIndex + 1
    );

    const buffer = Buffer.alloc(
      (endBlockIndex - startBlockIndex + 1) * BLOCK_SIZE
    );

    let writtenBytes = 0;

    for (let blockAddress of blocks) {
      let block =
        blockAddress === ZERO_BLOCK_ADDRESS
          ? Buffer.alloc(BLOCK_SIZE)
          : this.blockDevice.read(blockAddress);

      buffer.set(block, writtenBytes);

      writtenBytes += block.length;
    }

    const extraFirstBytes = offset % BLOCK_SIZE;
    const extraLastBytes = BLOCK_SIZE - ((offset + size) % BLOCK_SIZE);

    return buffer.subarray(extraFirstBytes, buffer.length - extraLastBytes);
  }

  write(numericFileDescriptor, offset, data) {
    const fileDescriptorId = this.openFiles[numericFileDescriptor];
    const fileDescriptor = this.getDescriptor(fileDescriptorId);

    const startBlockIndex = Math.floor(offset / BLOCK_SIZE);
    let startBlockOffset = offset % BLOCK_SIZE;

    const blocks = this.blocks(fileDescriptor, startBlockIndex);
    const blockMaps = [...this.blockMaps(fileDescriptor)];

    let writtenBytes = 0;
    let blockIndex = startBlockIndex;

    for (let blockAddress of blocks) {
      if (blockAddress === ZERO_BLOCK_ADDRESS) {
        const freeBlockId = this.getFreeBlockId();
        this.cleanBlock(freeBlockId);
        this.setBlockUsed(freeBlockId);

        blockAddress = freeBlockId;

        if (blockIndex === 0) {
          fileDescriptor.blockAddress1 = freeBlockId;
          this.updateDescriptor(fileDescriptorId, fileDescriptor);
        } else if (blockIndex === 1) {
          fileDescriptor.blockAddress2 = freeBlockId;
          this.updateDescriptor(fileDescriptorId, fileDescriptor);
        } else {
          const blockMapIndex = Math.floor(
            (blockIndex - 2) / BLOCKS_IN_BLOCK_MAP
          );
          const blockMapAddress = blockMaps[blockMapIndex];

          const blockMap = this.blockDevice.read(blockMapAddress);
          blockMap.writeInt8(
            freeBlockId,
            (blockIndex - 2) % BLOCKS_IN_BLOCK_MAP
          );

          this.blockDevice.write(blockMapAddress, blockMap);
        }
      }
      const blockData = this.blockDevice.read(blockAddress);
      blockData.set(
        data.subarray(writtenBytes, writtenBytes + BLOCK_SIZE),
        startBlockOffset
      );

      startBlockOffset = 0;
      writtenBytes += BLOCK_SIZE;

      blockIndex++;

      this.blockDevice.write(blockAddress, blockData);

      if (writtenBytes >= (offset % BLOCK_SIZE) + data.length) {
        break;
      }
    }
  }

  link(fileName1, fileName2) {
    const fileDescriptorId = this.lookup(fileName1);
    this.addLink(0, fileDescriptorId, fileName2); // root directory (id = 0)
  }

  unlink(fileName) {
    const directoryDescriptorId = 0; // root directory (id = 0)
    const directory = this.root();

    const dirEntries = this.ls(directory);
    const dirEntryIndex = dirEntries.findIndex(
      (dirEntry) => dirEntry.name === fileName
    );
    const dirEntry = dirEntries.find((dirEntry) => dirEntry.name == fileName);

    dirEntries.splice(dirEntryIndex, 1);

    const dirEntryBlockId = Math.floor(dirEntryIndex / 8);
    const dirBlocks = this.blocks(directory, dirEntryBlockId);

    let updatedBlocksCount = 0;

    for (let blockAddress of dirBlocks) {
      const buffer = Buffer.alloc(BLOCK_SIZE);

      for (
        let i = 0;
        i < Math.min(8, dirEntries.length - updatedBlocksCount * 8);
        i++
      ) {
        buffer.set(dirEntries[updatedBlocksCount * 8 + i].toBytes(), i * 32);
      }

      this.blockDevice.write(blockAddress, buffer);

      updatedBlocksCount++;
    }

    // Removing last block map
    const lastBlockIndex = Math.floor(
      (dirEntries.length - 2) / DIR_ENTRIES_IN_BLOCK
    );
    const needToRemoveLastBlockMap = !(lastBlockIndex % BLOCKS_IN_BLOCK_MAP);

    if (needToRemoveLastBlockMap) {
      const blockIndex = Math.floor((dirEntryIndex - 2) / DIR_ENTRIES_IN_BLOCK);
      const blockMapIndex = Math.floor(blockIndex / BLOCKS_IN_BLOCK_MAP);

      if (blockMapIndex === 0) {
        this.freeBlockMap(directory.blockMapAddress);
        directory.blockMapAddress = 0;
        this.updateDescriptor(directoryDescriptorId, directory);
      } else {
        const blockMaps = this.blockMaps(directory, blockMapIndex - 1);
        const prevBlockMapAddress = blockMaps.next().value;
        const blockMapAddress = blockMaps.next().value;

        this.freeBlockMap(blockMapAddress, prevBlockMapAddress);
      }
    } else if ((dirEntries.length - 2) % BLOCKS_IN_BLOCK_MAP === 0) {
      // Removing last block
      const blockIndex = Math.floor(
        (dirEntries.length - 2) / BLOCKS_IN_BLOCK_MAP
      );
      const blockMapIndex = Math.floor(blockIndex / BLOCKS_IN_BLOCK_MAP);
      const blockIndexInBlockMap = blockIndex % BLOCKS_IN_BLOCK_MAP;

      const buffer = this.blockDevice.read(blockMapIndex);
      this.setBlockUnused(buffer[blockIndexInBlockMap]);
      const arr = Array.from(buffer);
      arr.splice(blockIndexInBlockMap, 1);
      arr.push(arr[arr.length - 1]); // link on the next block map
      arr[arr.length - 2] = 0;

      this.blockDevice.write(blockMapIndex, Buffer.from(arr));
    } else if (dirEntries.length === DIR_ENTRIES_IN_BLOCK) {
      this.setBlockUnused(directory.blockAddress2);
      directory.blockAddress2 = 0;
    } else if (dirEntries.length === 0) {
      this.setBlockUnused(directory.blockAddress1);
      directory.blockAddress1 = 0;
    }

    directory.fileSize -= 32;
    this.updateDescriptor(directoryDescriptorId, directory);

    const fileDescriptor = this.getDescriptor(dirEntry.fileDescriptorId);
    fileDescriptor.hardLinksCount -= 1;

    if (fileDescriptor.hardLinksCount === 0) {
      fileDescriptor.fileType = TYPES.UNUSED;
    }

    this.updateDescriptor(dirEntry.fileDescriptorId, fileDescriptor);
  }

  truncate(fileName, fileSize) {
    const fileDescriptorId = this.lookup(fileName);
    const fileDescriptor = this.getDescriptor(fileDescriptorId);

    let blockCount = Math.ceil(fileDescriptor.fileSize / BLOCK_SIZE);
    const needBlockCount = Math.ceil(fileSize / BLOCK_SIZE);

    if (blockCount === needBlockCount) {
      fileDescriptor.fileSize = fileSize;
      this.updateDescriptor(fileDescriptorId, fileDescriptor);

      return;
    } else if (blockCount < needBlockCount) {
      if (blockCount === 0) {
        fileDescriptor.blockAddress1 = ZERO_BLOCK_ADDRESS;
        blockCount++;
        if (blockCount == needBlockCount) {
          fileDescriptor.fileSize = fileSize;
          this.updateDescriptor(fileDescriptorId, fileDescriptor);

          return;
        }
      }

      if (blockCount === 1) {
        fileDescriptor.blockAddress2 = ZERO_BLOCK_ADDRESS;
        blockCount++;
        if (blockCount == needBlockCount) {
          fileDescriptor.fileSize = fileSize;
          this.updateDescriptor(fileDescriptorId, fileDescriptor);

          return;
        }
      }

      if (fileDescriptor.blockMapAddress === 0) {
        fileDescriptor.blockMapAddress = this.getFreeBlockId();
        this.cleanBlock(fileDescriptor.blockMapAddress);
      }

      // If last block map is full
      if (blockCount % BLOCKS_IN_BLOCK_MAP === 0) {
        // Creating next block map
        const lastBlockMapIndex = blockCount / BLOCKS_IN_BLOCK_MAP - 1;
        const blockMaps = this.blockMaps(fileDescriptor, lastBlockMapIndex);
        const lastBlockMapAddress = blockMaps.next().value;
        const blockMap = this.blockDevice.read(lastBlockMapAddress);

        const newBlockMapAddress = this.getFreeBlockId();
        this.cleanBlock(newBlockMapAddress);
        blockMap[blockMap.length - 1] = newBlockMapAddress;

        this.blockDevice.write(lastBlockMapAddress, blockMap);
      }

      const lastBlockMapIndex = Math.ceil(blockCount / BLOCKS_IN_BLOCK_MAP);
      const blockMaps = this.blockMaps(fileDescriptor, lastBlockMapIndex);

      for (let blockMapAddress of blockMaps) {
        const blockMap = this.blockDevice.read(blockMapAddress);

        while (blockCount < needBlockCount) {
          blockMap[blockCount % BLOCKS_IN_BLOCK_MAP] = ZERO_BLOCK_ADDRESS;
          blockCount++;

          // If we reach the end of previous block map
          if (
            blockCount % BLOCKS_IN_BLOCK_MAP === 0 &&
            blockCount < needBlockCount
          ) {
            // Creating next block map
            const newBlockMapAddress = this.getFreeBlockId();
            this.cleanBlock(newBlockMapAddress);
            blockMap[blockMap.length - 1] = newBlockMapAddress;
            break;
          }
        }

        this.blockDevice.write(blockMapAddress, blockMap);
      }

      fileDescriptor.fileSize = fileSize;
      this.updateDescriptor(fileDescriptorId, fileDescriptor);
    } else if (blockCount > needBlockCount) {
      // TODO: decrease file size

      fileDescriptor.fileSize = fileSize;
      this.updateDescriptor(fileDescriptorId, fileDescriptor);
    }
  }

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

  lookup(fileName) {
    const dirEntries = this.ls(this.root());

    for (let dirEntry of dirEntries) {
      if (dirEntry.name === fileName) {
        return dirEntry.fileDescriptorId;
      }
    }

    throw new Error('File not found');
  }

  *blocks(fileDescriptor, startIndex = 0, endIndex = Infinity) {
    let index = 0;

    if (startIndex >= endIndex) {
      throw new Error('End index must be bigger than start index.');
    }

    if (fileDescriptor.blockAddress1 === 0) return;
    if (index >= startIndex) {
      yield fileDescriptor.blockAddress1;
    }
    index++;
    if (index >= endIndex) return;

    if (fileDescriptor.blockAddress2 === 0) return;
    if (index >= startIndex) {
      yield fileDescriptor.blockAddress2;
    }
    index++;
    if (index >= endIndex) return;

    let blockMapAddress = fileDescriptor.blockMapAddress;

    while (blockMapAddress) {
      const blockMap = this.blockDevice.read(blockMapAddress);

      for (let i = 0; i < blockMap.length - 1; i++) {
        if (blockMap[i] === 0) return;

        if (index >= startIndex) {
          yield blockMap[i];
        }
        index++;
        if (index >= endIndex) return;
      }

      blockMapAddress = blockMap[blockMap.length - 1];
    }
  }

  *blockMaps(fileDescriptor, startIndex = 0) {
    let blockMapAddress = fileDescriptor.blockMapAddress;
    let index = 0;

    while (blockMapAddress) {
      if (index >= startIndex) {
        yield blockMapAddress;
      }

      const blockMap = this.blockDevice.read(blockMapAddress);

      blockMapAddress = blockMap[blockMap.length - 1];

      index++;
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

  cleanBlock(blockId) {
    const cleanBlock = Buffer.alloc(BLOCK_SIZE);
    this.blockDevice.write(blockId, cleanBlock);
  }

  freeBlockMap(blockMapAddress, prevBlockMapAddress) {
    const blockMap = this.blockDevice.read(blockMapAddress);

    for (let blockAddress of blockMap) {
      if (blockAddress === 0) break;

      this.setBlockUnused(blockAddress);
    }

    if (prevBlockMapAddress) {
      const prevBlockMap = this.blockDevice.read(prevBlockMapAddress);

      prevBlockMap[prevBlockMap.length - 1] = 0;

      this.blockDevice.write(prevBlockMapAddress, prevBlockMap);
    }
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

    // more logic...
    const dirEntriesCount = directory.fileSize / 32;
    const dirEntryAddressInBlock = dirEntriesCount % 8;

    // need to create new block for a directory
    if (dirEntryAddressInBlock === 0) {
      const freeBlockId = this.getFreeBlockId();
      this.cleanBlock(freeBlockId);
      this.setBlockUsed(freeBlockId);

      if (directory.blockAddress1 === 0) {
        directory.blockAddress1 = freeBlockId;
        this.updateDescriptor(directoryDescriptorId, directory);
      } else if (directory.blockAddress2 === 0) {
        directory.blockAddress2 = freeBlockId;
        this.updateDescriptor(directoryDescriptorId, directory);
      } else if (directory.blockMapAddress === 0) {
        directory.blockMapAddress = this.getFreeBlockId();
        this.setBlockUsed(directory.blockMapAddress);
        this.updateDescriptor(directoryDescriptorId, directory);
        this.cleanBlock(directory.blockMapAddress);

        let blockData = Buffer.alloc(BLOCK_SIZE);

        blockData = Buffer.alloc(BLOCK_SIZE);
        blockData[0] = freeBlockId;

        this.blockDevice.write(directory.blockMapAddress, blockData);
      } else {
        const blocksInDirCount = Math.ceil(dirEntriesCount / 8); // 8 - blocks in dir
        const blockMapsCount = Math.ceil((blocksInDirCount - 2) / 255);
        const blocksInLastBlockMap = (blocksInDirCount - 2) % 255;

        let dirMaps = [...this.blockMaps(directory)];
        let blockMapAddress = dirMaps[dirMaps.length - 1];

        // Creating new block map
        if (blocksInLastBlockMap === 0) {
          const freeBlockMapId = this.getFreeBlockId();
          this.cleanBlock(freeBlockMapId);
          this.setBlockUsed(freeBlockMapId);

          const blockMapData = this.blockDevice.read(blockMapAddress);
          blockMapData[blockMapData.length - 1] = freeBlockMapId;

          let blockData = Buffer.alloc(BLOCK_SIZE);
          blockData[0] = freeBlockId;

          this.blockDevice.write(blockMapAddress, blockData);
        } else {
          let blockMapData = this.blockDevice.read(blockMapAddress);
          blockMapData.writeInt8(freeBlockId, blocksInLastBlockMap);

          this.blockDevice.write(blockMapAddress, blockMapData);
        }
      }
    }

    directory.fileSize += 32;

    let dirBlocks = [...this.blocks(directory)];
    let blockAddress = dirBlocks[dirBlocks.length - 1];
    let blockData = this.blockDevice.read(blockAddress);

    const blockDataArr = Array.from(blockData);
    blockDataArr.splice(dirEntryAddressInBlock * 32, 32, ...dirEntry.toBytes());
    blockData = Buffer.from(blockDataArr);

    this.blockDevice.write(blockAddress, blockData);

    this.updateDescriptor(directoryDescriptorId, directory);

    const fileDescriptor = this.getDescriptor(fileDescriptorId);
    fileDescriptor.hardLinksCount++;
    this.updateDescriptor(fileDescriptorId, fileDescriptor);
  }
}

export default FileSystemDriver;

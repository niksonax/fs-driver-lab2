import fs from 'fs';
import { BLOCK_SIZE } from '../constants/constants.js';

class BlockDevice {
  constructor(filePath) {
    this.filePath = filePath;
  }

  read(blockId) {
    const buffer = Buffer.alloc(BLOCK_SIZE);
    const file = fs.openSync(this.filePath, 'r');

    fs.readSync(file, buffer, {
      position: BLOCK_SIZE * blockId,
    });

    fs.close(file);

    return buffer;
  }

  write(blockId, blockData) {
    const file = fs.openSync(this.filePath, 'w');

    fs.writeSync(file, blockData, -1, -1, BLOCK_SIZE * blockId);

    fs.close(file);
  }
}

export default BlockDevice;

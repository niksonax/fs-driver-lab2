import fs from 'fs';
import { BLOCK_SIZE, DEVICE_SIZE } from '../constants/constants.js';

class BlockDevice {
  constructor(filePath) {
    const fileExists = fs.existsSync(filePath);

    if (!fileExists) {
      const file = fs.openSync(filePath, 'w');

      fs.writeSync(file, Buffer.alloc(DEVICE_SIZE));

      fs.closeSync(file);
    }

    this.filePath = filePath;
  }

  read(blockId) {
    const buffer = Buffer.alloc(BLOCK_SIZE);
    const file = fs.openSync(this.filePath, 'r');

    fs.readSync(file, buffer, {
      position: BLOCK_SIZE * blockId,
    });

    fs.closeSync(file);

    return buffer;
  }

  write(blockId, blockData) {
    const file = fs.openSync(this.filePath, 'r+');

    fs.writeSync(file, blockData, null, null, BLOCK_SIZE * blockId);

    fs.closeSync(file);
  }
}

export default BlockDevice;

import BlockDevice from './src/blockDevice.js';
import FileDescriptor from './src/fileDescriptor.js';
import FileSystemDriver from './src/fileSystemDriver.js';

const blockDevice = new BlockDevice('test.txt');
const fsDriver = new FileSystemDriver(blockDevice);

fsDriver.mkfs(10);
console.log(fsDriver.ls(fsDriver.root()));
fsDriver.create('abc');
console.log(fsDriver.ls(fsDriver.root()));

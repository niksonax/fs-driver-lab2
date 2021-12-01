import BlockDevice from './src/blockDevice.js';
import FileSystemDriver from './src/fileSystemDriver.js';

const blockDevice = new BlockDevice('test.txt');
const driver = new FileSystemDriver(blockDevice);

driver.mkfs(100);

const fileName = 'test';
const fileSize = 30;
driver.create(fileName);

driver.truncate(fileName, fileSize);
const numericFileDescriptor = driver.open(fileName);

const data = driver.read(numericFileDescriptor, 0, fileSize);

// All further tests are in __tests__ folder

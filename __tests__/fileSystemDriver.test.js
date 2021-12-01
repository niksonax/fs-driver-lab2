import FileSystemDriver from '../src/fileSystemDriver.js';
import BlockDevice from '../src/blockDevice.js';

describe('FileSystemDriver', () => {
  let driver;

  beforeEach(() => {
    let device = new BlockDevice('blockDevice.txt');
    driver = new FileSystemDriver(device);
    driver.mkfs(500);
  });

  test('should empty root directory after formatting', () => {
    const root = driver.root();
    driver.create('test');
    driver.mkfs(10);
    const dirEntries = driver.ls(root);

    expect(dirEntries.length).toBe(0);
  });

  test('should be able to create one file in root directory', () => {
    const fileName = 'test';

    driver.create(fileName);
    const dirEntries = driver.ls(driver.root());

    const fileDescriptor = driver.getDescriptor(dirEntries[0].fileDescriptorId);
    expect(dirEntries.length).toBe(1);
    expect(dirEntries[0].name).toBe(fileName);
    expect(fileDescriptor.hardLinksCount).toBe(1);
  });

  test('should be able to create few files in root directory', () => {
    const fileNames = new Set(['test1', 'test2', 'test3']);

    fileNames.forEach((fileName) => {
      driver.create(fileName);
    });
    const dirEntries = driver.ls(driver.root());

    expect(dirEntries.length).toBe(fileNames.size);
    expect(new Set(dirEntries.map((e) => e.name))).toEqual(fileNames);
  });

  test('should be able to create many files in root directory', () => {
    const fileNames = new Set();
    for (let i = 0; i < 50; i++) {
      // 300
      fileNames.add(`test${i}`);
    }

    fileNames.forEach((fileName) => {
      driver.create(fileName);
    });
    const dirEntries = driver.ls(driver.root());

    expect(dirEntries.length).toBe(fileNames.size);
    expect(new Set(dirEntries.map((e) => e.name))).toEqual(fileNames);
  });

  test('should create file hard link', () => {
    const fileName1 = 'test1';
    const fileName2 = 'test2';

    driver.create(fileName1);
    driver.link(fileName1, fileName2);
    const dirEntries = driver.ls(driver.root());

    const fileDescriptor = driver.getDescriptor(dirEntries[0].fileDescriptorId);
    expect(new Set(dirEntries.map((e) => e.name))).toEqual(
      new Set([fileName1, fileName2])
    );
    expect(dirEntries[0].fileDescriptorId).toEqual(
      dirEntries[1].fileDescriptorId
    );
    expect(fileDescriptor.hardLinksCount).toBe(2);
  });

  test('should remove file when hard link is 0', () => {
    const fileName = 'test';

    driver.create(fileName);
    driver.unlink(fileName);
    const dirEntries = driver.ls(driver.root());

    expect(dirEntries.length).toEqual(0);
  });

  test('should reduce hard link count when unlinking', () => {
    const fileName1 = 'test1';
    const fileName2 = 'test2';
    driver.create(fileName1);
    const fileDescriptorId = driver.lookup(fileName1);

    driver.link(fileName1, fileName2);
    driver.unlink(fileName1);

    const dirEntries = driver.ls(driver.root());

    const fileDescriptor = driver.getDescriptor(fileDescriptorId);
    expect(fileDescriptor.hardLinksCount).toBe(1);
    expect(dirEntries.length).toBe(1);
  });

  test('should be able to increase file size (simple truncate)', () => {
    const fileName = 'test';
    const fileSize = 300;
    driver.create(fileName);

    driver.truncate(fileName, fileSize);

    const fileDescriptor = driver.getDescriptor(driver.lookup(fileName));
    expect(fileDescriptor.fileSize).toBe(fileSize);
  });

  test('should null all unused bytes after decreasing size', () => {
    const fileName = 'test';
    const fileSize = 30;
    const newFileSize = 20;
    driver.create(fileName);

    driver.truncate(fileName, fileSize);
    const numericFileDescriptor = driver.open(fileName);
    driver.write(numericFileDescriptor, 0, Buffer.alloc(fileSize, 1));
    driver.truncate(fileName, newFileSize);

    driver.truncate(fileName, fileSize);
    const data = driver.read(numericFileDescriptor, 0, fileSize);
    const expectedData = Buffer.alloc(fileSize);
    for (let i = 0; i < newFileSize; i++) {
      expectedData[i] = 1;
    }

    expect(data).toEqual(expectedData);
  });

  test('should set new bytes in 0 after increasing file size', () => {
    const fileName = 'test';
    const fileSize = 300;
    driver.create(fileName);
    driver.truncate(fileName, fileSize);

    const numericFileDescriptor = driver.open(fileName);
    const data = driver.read(numericFileDescriptor, 0, fileSize);

    expect(data.length).toBe(fileSize);
    expect(data).toEqual(Buffer.alloc(fileSize));
  });

  test('should be able to do simple write operation', () => {
    const fileName = 'test';
    const fileSize = 300;
    const testArr = [1, 2, 3, 4, 5];
    driver.create(fileName);
    driver.truncate(fileName, fileSize);

    const numericFileDescriptor = driver.open(fileName);
    driver.write(numericFileDescriptor, 10, Buffer.from(testArr));
    const data = driver.read(numericFileDescriptor, 0, fileSize);

    const expectedData = Buffer.alloc(fileSize);
    expectedData.set(testArr, 10);
    expect(data).toEqual(expectedData);
  });
});

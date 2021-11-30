import DirectoryEntry from '../src/directoryEntry.js';

describe('DirectoryEntry', () => {
  test('should be able to convert to bytes', () => {
    const name = 'test name';
    const fileDescriptorId = 2;
    const dirEntry = new DirectoryEntry(name, fileDescriptorId);

    const expectedBytes = Buffer.alloc(32);
    expectedBytes.write(name, 0, 'utf8');
    expectedBytes.writeInt32BE(fileDescriptorId, 28);

    const bytes = dirEntry.toBytes();

    expect(bytes).toEqual(expectedBytes);
  });

  test('should  be able to convert from bytes', () => {
    const name = 'test name';
    const fileDescriptorId = 2;
    const bytes = Buffer.alloc(32);
    bytes.write(name, 0, 'utf8');
    bytes.writeInt32BE(fileDescriptorId, 28);

    const expectedDirEntry = new DirectoryEntry(name, fileDescriptorId);

    const dirEntry = new DirectoryEntry(null, null);
    dirEntry.fromBytes(bytes);

    expect(dirEntry).toEqual(expectedDirEntry);
  });
});

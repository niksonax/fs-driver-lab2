import { getInt24ToBytes } from '../helpers/helpers';
import FileDescriptor, { TYPES } from '../src/fileDescriptor.js';

describe('FileDescriptor', () => {
  test('should  be able to convert to bytes', () => {
    const fileSize = 1234;
    const fileType = TYPES.REGULAR;
    const hardLinksCount = 5;
    const blockAddress1 = 5;
    const blockAddress2 = 35;
    const blockMapAddress = 120;
    const fileDescriptor = new FileDescriptor(
      fileSize,
      fileType,
      hardLinksCount,
      blockAddress1,
      blockAddress2,
      blockMapAddress
    );

    const expectedBytes = Buffer.alloc(8);
    expectedBytes.writeInt8(fileType);
    expectedBytes.set(getInt24ToBytes(fileSize), 1);
    expectedBytes.writeInt8(hardLinksCount, 4);
    expectedBytes.writeInt8(blockAddress1, 5);
    expectedBytes.writeInt8(blockAddress2, 6);
    expectedBytes.writeInt8(blockMapAddress, 7);

    const bytes = fileDescriptor.toBytes();

    expect(bytes).toEqual(expectedBytes);
  });

  test('should be able to convert from bytes', () => {
    const expectedFileSize = 1234;
    const expectedFileType = TYPES.REGULAR;
    const expectedHardLinksCount = 5;
    const expectedBlockAddress1 = 5;
    const expectedBlockAddress2 = 35;
    const expectedBlockMapAddress = 120;

    const bytes = Buffer.alloc(8);
    bytes.writeInt8(expectedFileType);
    bytes.set(getInt24ToBytes(expectedFileSize), 1);
    bytes.writeInt8(expectedHardLinksCount, 4);
    bytes.writeInt8(expectedBlockAddress1, 5);
    bytes.writeInt8(expectedBlockAddress2, 6);
    bytes.writeInt8(expectedBlockMapAddress, 7);

    const fileDescriptor = new FileDescriptor();
    fileDescriptor.fromBytes(bytes);

    expect(fileDescriptor.fileSize).toEqual(expectedFileSize);
    expect(fileDescriptor.fileType).toEqual(expectedFileType);
    expect(fileDescriptor.hardLinksCount).toEqual(expectedHardLinksCount);
    expect(fileDescriptor.blockAddress1).toEqual(expectedBlockAddress1);
    expect(fileDescriptor.blockAddress2).toEqual(expectedBlockAddress2);
    expect(fileDescriptor.blockMapAddress).toEqual(expectedBlockMapAddress);
  });
});

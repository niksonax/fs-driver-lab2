class FileDescriptor {
  constructor(
    fileSize,
    fileType,
    hardLinksCount,
    blockAddress1,
    blockAddress2,
    blockMapAddress
  ) {
    this.fileSize = fileSize;
    this.fileType = fileType;
    this.hardLinksCount = hardLinksCount;
    this.blockAddress1 = blockAddress1;
    this.blockAddress2 = blockAddress2;
    this.blockMapAddress = blockMapAddress;
  }

  fromBytes(bytes) {
    switch (bytes[0]) {
      case TYPES.REGULAR:
        this.fileType = TYPES.REGULAR;
        break;
      case TYPES.DIRECTORY:
        this.fileType = TYPES.DIRECTORY;
        break;
      case TYPES.UNUSED:
        this.fileType = TYPES.UNUSED;
        break;
      default:
        break;
    }
    // this.fileType = bytes[0]

    const size = (bytes[1] << (16 + bytes[2])) << (8 + bytes[3]);
    this.fileSize = size;

    this.hardLinksCount = bytes[4];

    this.blockAddress1 = bytes[5];
    this.blockAddress2 = bytes[6];
    this.blockMapAddress = bytes[7];
  }
}

const TYPES = {
  REGULAR: 0,
  DIRECTORY: 1,
  UNUSED: -1,
};

export default FileDescriptor;
export { TYPES };

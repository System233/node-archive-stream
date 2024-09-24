<!--
 Copyright (c) 2024 System233

 This software is released under the MIT License.
 https://opensource.org/licenses/MIT
-->

# node-archive-stream

Unix ar archives stream for Node.js

## Example

- ReadStream

```ts
export interface IArchiveEntry {
  name: string;
  mtime: number;
  ownerId: number;
  groupId: number;
  mode: string;
  size: number;
  content: Buffer;
}
import { createReadStream } from "fs";
import { createArchiveStream } from "../lib";

const archiveStream = createArchiveStream();
const rs = createReadStream("test.deb");
rs.pipe(archiveStream);

archiveStream.on("data", (x: IArchiveEntry) => console.log(x));
```

- WriteStream

```ts
export interface WriteArchiveEntry
  extends Omit<IArchiveEntry, "content" | "size"> {
  size?: number; //10
  content: Buffer | ArrayBufferLike | Readable;
}
import { createWriteStream } from "fs";
import { createUnArchiveStream, WriteArchiveEntry } from "../lib";

const unArchiveStream = createUnArchiveStream();
const ws = createWriteStream("test.deb");
unArchiveStream.pipe(ws);

unArchiveStream.write({
  name: "test.log",
  mtime: 0,
  ownerId: 0,
  groupId: 0,
  mode: "644",
  content: Buffer.from("test\n"),
} as WriteArchiveEntry);
```

- Handle

```ts
import { Archive } from "../lib";
const archive = await Archive.open("tests/example.deb", {
  //   noEndCheck: true,
});
console.log(archive.entries);
/**  @type {ArchiveEntry};*/
const data = archive.entries.find((item) => item.name == "control.tar.zst");
console.log(await archive.read(data!));
```

## Reference:

[Ar\_(Unix) - Wikipedia](<https://en.wikipedia.org/wiki/Ar_(Unix)>)

## LICENSE

[MIT LICENSE](./LICENSE)

// Copyright (c) 2024 System233
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import { createWriteStream } from "fs";
import { createUnArchiveStream, WriteArchiveEntry } from "../lib/index.js";

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
